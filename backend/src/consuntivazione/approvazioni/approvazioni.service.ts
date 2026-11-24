import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import mongoose, { type Connection, type Model } from 'mongoose';
import type { UtenteAutenticato } from '../../auth/decoratori.js';
import { Utente } from '../../auth/utente.schema.js';
import { Attivita, Progetto } from '../../comuni/schemi/progetto.schema.js';
import { Risorsa } from '../../comuni/schemi/risorsa.schema.js';
import { corpo, data as leggiData, objectId, testo } from '../../comuni/validazione.js';
import { AuditService } from '../../infrastruttura/audit.service.js';
import { PermessiService } from '../../permessi/permessi.service.js';
import {
  type AzioneApprovazione,
  ePMSenior,
  motivoNegatoApprovazione,
  profiloDiApprovazione,
  type ProgettoPerPermessi,
} from '../../permessi/regole.js';
import { Consuntivo, type RigaConsuntivo, type StatoRiga } from '../consuntivi/consuntivo.schema.js';
import { giorniTra, meseDi, testoData } from '../consuntivi/regole-giornata.js';
import { PeriodiService } from '../periodi/periodi.service.js';
import { TipologiaCosto } from '../tipologie/tipologia-costo.schema.js';

type Id = mongoose.Types.ObjectId;
type ProgettoApp = ProgettoPerPermessi & { _id: Id; codice: string; titolo: string; stato: string };

/** Stati che un approvatore vede; la bozza resta della risorsa. */
const STATI_VISIBILI: StatoRiga[] = ['inviata', 'approvataTL', 'approvata', 'respinta', 'chiusa'];
/** Stati che aspettano un'azione, per profilo sul progetto. */
const IN_ATTESA: Record<'TL' | 'PM', StatoRiga[]> = { TL: ['inviata'], PM: ['inviata', 'approvataTL'] };
const AZIONI: AzioneApprovazione[] = ['viaLibera', 'approva', 'respingi'];
const NUOVO_STATO: Record<AzioneApprovazione, StatoRiga> = { viaLibera: 'approvataTL', approva: 'approvata', respingi: 'respinta' };
const OPERAZIONE: Record<AzioneApprovazione, string> = { viaLibera: 'viaLibera', approva: 'approvazione', respingi: 'rifiuto' };
const MAX_RIGHE = 2000;
const MAX_AZIONE = 1000;

interface RigaTrovata {
  giornataId: Id;
  risorsaId: Id;
  data: Date;
  versione: number;
  riga: RigaConsuntivo & { _id: Id };
}

export interface EsitoRiga {
  rigaId: string;
  esito: 'fatta' | 'saltata';
  motivo?: string;
}

/**
 * Approvazioni delle righe di consuntivo (fase 3, blocco D2).
 * - Elenco delle righe dei progetti di cui l'utente è approvatore (tutti per il PMSenior), mai le proprie;
 *   per ogni riga le azioni che può fare, il via libera del TL e l'evidenza delle attività non assegnate.
 * - Costi e tariffe solo al PM del progetto, al PMSenior e al controller (decisione 6).
 * - Azioni in blocco: via libera (TL), approvazione (PM), rifiuto motivato (TL e PM). Ogni riga si aggiorna
 *   solo se è ancora nello stato letto; le altre tornano "saltate" senza far fallire il resto.
 */
@Injectable()
export class ApprovazioniService {
  constructor(
    @InjectModel(Consuntivo.name) private readonly model: Model<Consuntivo>,
    @InjectModel(Progetto.name) private readonly progetti: Model<Progetto>,
    @InjectModel(Attivita.name) private readonly attivita: Model<Attivita>,
    @InjectModel(Risorsa.name) private readonly risorse: Model<Risorsa>,
    @InjectModel(TipologiaCosto.name) private readonly tipologie: Model<TipologiaCosto>,
    @InjectModel(Utente.name) private readonly utenti: Model<Utente>,
    @InjectConnection() private readonly connection: Connection,
    private readonly permessi: PermessiService,
    private readonly audit: AuditService,
    private readonly periodi: PeriodiService,
  ) {}

  /** Progetti su cui l'utente approva, con il suo profilo. */
  private async progettiApprovabili(utente: UtenteAutenticato, filtro?: Id) {
    const s = utente;
    const query: Record<string, unknown> = ePMSenior(s) ? {} : { 'approvatori.risorsaId': s.risorsaId ? new mongoose.Types.ObjectId(s.risorsaId) : null };
    if (filtro) query._id = filtro;
    const progetti = s.risorsaId
      ? await this.progetti.find(query, { codice: 1, titolo: 1, stato: 1, approvatori: 1 }).lean<ProgettoApp[]>().exec()
      : [];
    const profili = new Map<string, { progetto: ProgettoApp; profilo: 'TL' | 'PM' }>();
    for (const p of progetti) {
      const profilo = profiloDiApprovazione(s, p);
      if (profilo) profili.set(String(p._id), { progetto: p, profilo });
    }
    return { soggetto: s, profili };
  }

  /** GET /approvazioni: righe da lavorare (o con lo stato chiesto) sui progetti dell'utente. */
  async elenco(utente: UtenteAutenticato | undefined, query: Record<string, unknown>) {
    this.permessi.verifica(utente, true, 'approvare');
    const progettoFiltro = objectId(query.progetto, 'progetto');
    const { soggetto, profili } = await this.progettiApprovabili(utente, progettoFiltro);
    const stati = leggiStati(query.stato);
    const filtroData: Record<string, Date> = {};
    const da = leggiData(query.da, 'da');
    const a = leggiData(query.a, 'a');
    if (da) filtroData.$gte = da;
    if (a) filtroData.$lte = a;
    if (da && a && (a < da || giorniTra(da, a) > 366)) throw new BadRequestException('periodo: "a" non prima di "da", al massimo un anno');

    // Per ogni progetto gli stati da cercare: quelli chiesti, oppure quelli in attesa per il profilo.
    const condizioni = [...profili.values()].map(({ progetto, profilo }) => ({
      'righe.progettoId': progetto._id,
      'righe.stato': { $in: stati ?? IN_ATTESA[profilo] },
    }));
    if (!condizioni.length) return { righe: [], totali: { righe: 0, minuti: 0 }, troncato: false };
    const proprio = soggetto.risorsaId ? new mongoose.Types.ObjectId(soggetto.risorsaId) : null;
    const filtriRiga: Record<string, unknown>[] = [{ $or: condizioni }];
    const attivitaFiltro = objectId(query.attivita, 'attivita');
    if (attivitaFiltro) filtriRiga.push({ 'righe.attivitaId': attivitaFiltro });
    const risorsaFiltro = objectId(query.risorsa, 'risorsa');

    const trovate = await this.model
      .aggregate<RigaTrovata>([
        {
          $match: {
            ...(Object.keys(filtroData).length ? { data: filtroData } : {}),
            ...(risorsaFiltro ? { risorsaId: risorsaFiltro } : proprio ? { risorsaId: { $ne: proprio } } : {}),
            'righe.progettoId': { $in: [...profili.values()].map((x) => x.progetto._id) },
          },
        },
        { $unwind: '$righe' },
        { $match: { $and: filtriRiga } },
        ...(proprio ? [{ $match: { risorsaId: { $ne: proprio } } }] : []),
        { $sort: { data: 1, risorsaId: 1, 'righe.progettoId': 1 } },
        { $limit: MAX_RIGHE + 1 },
        { $project: { _id: 0, giornataId: '$_id', risorsaId: 1, data: 1, versione: 1, riga: '$righe' } },
      ])
      .exec();
    const troncato = trovate.length > MAX_RIGHE;
    if (troncato) trovate.length = MAX_RIGHE;
    return this.presenta(trovate, soggetto, profili, utente, troncato);
  }

  /** Numero di righe che aspettano un'azione dell'utente, per il contatore del menu. */
  async inAttesa(utente: UtenteAutenticato | undefined) {
    this.permessi.verifica(utente, true, 'approvare');
    const { soggetto, profili } = await this.progettiApprovabili(utente);
    const condizioni = [...profili.values()].map(({ progetto, profilo }) => ({ 'righe.progettoId': progetto._id, 'righe.stato': { $in: IN_ATTESA[profilo] } }));
    if (!condizioni.length) return { righe: 0 };
    const proprio = soggetto.risorsaId ? new mongoose.Types.ObjectId(soggetto.risorsaId) : null;
    const [esito] = await this.model
      .aggregate<{ n: number }>([
        { $match: { 'righe.progettoId': { $in: [...profili.values()].map((x) => x.progetto._id) }, ...(proprio ? { risorsaId: { $ne: proprio } } : {}) } },
        { $unwind: '$righe' },
        { $match: { $or: condizioni } },
        { $count: 'n' },
      ])
      .exec();
    return { righe: esito?.n ?? 0 };
  }

  private async presenta(
    trovate: RigaTrovata[],
    soggetto: UtenteAutenticato,
    profili: Map<string, { progetto: ProgettoApp; profilo: 'TL' | 'PM' }>,
    utente: UtenteAutenticato,
    troncato: boolean,
  ) {
    const controller = this.permessi.permessoGlobale(utente, 'gestireTariffe');
    const unici = (valori: (Id | null | undefined)[]) => [...new Set(valori.filter(Boolean).map(String))].map((x) => new mongoose.Types.ObjectId(x));
    const idUtenti = [...new Set(trovate.flatMap((t) => [t.riga.approvazioneTL?.da, t.riga.approvazionePM?.da, t.riga.rifiuto?.da]).filter(Boolean) as string[])];
    const [risorse, attivita, tipologie, utenti] = await Promise.all([
      this.risorse.find({ _id: { $in: unici(trovate.map((t) => t.risorsaId)) } }, { nome: 1, cognome: 1 }).lean().exec(),
      this.attivita.find({ _id: { $in: unici(trovate.map((t) => t.riga.attivitaId)) } }, { codice: 1, descrizione: 1, risorseAssegnateIds: 1 }).lean().exec(),
      this.tipologie.find({ _id: { $in: unici(trovate.map((t) => t.riga.tipologiaId)) } }, { codice: 1, descrizione: 1 }).lean().exec(),
      this.utenti.find({ _id: { $in: idUtenti.filter((x) => mongoose.isValidObjectId(x)) } }, { risorsaId: 1, email: 1 }).lean().exec(),
    ]);
    const nomiRisorse = new Map(risorse.map((r) => [String(r._id), `${r.cognome} ${r.nome}`.trim()]));
    const risorseUtenti = await this.risorse.find({ _id: { $in: unici(utenti.map((u) => u.risorsaId as Id | undefined)) } }, { nome: 1, cognome: 1 }).lean().exec();
    const nomiPerRisorsa = new Map(risorseUtenti.map((r) => [String(r._id), `${r.cognome} ${r.nome}`.trim()]));
    const nomiUtenti = new Map(utenti.map((u) => [String(u._id), (u.risorsaId && nomiPerRisorsa.get(String(u.risorsaId))) || u.email]));
    const att = new Map(attivita.map((x) => [String(x._id), x]));
    const tip = new Map(tipologie.map((x) => [String(x._id), x]));
    const chi = (x?: { da: string; il: Date } | null) => (x ? { da: x.da, nome: nomiUtenti.get(x.da) ?? x.da, il: x.il } : null);

    const chiusi = await this.periodi.chiusi(trovate.map((t) => meseDi(testoData(t.data))));
    let minuti = 0;
    let costo = 0;
    let costiVisibili = true;
    const righe = trovate.map((t) => {
      const r = t.riga;
      const voce = profili.get(String(r.progettoId))!;
      const a = r.attivitaId ? att.get(String(r.attivitaId)) : undefined;
      const meseChiuso = chiusi.has(meseDi(testoData(t.data)));
      const azioni = meseChiuso ? [] : AZIONI.filter((x) => !motivoNegatoApprovazione(soggetto, voce.progetto, { risorsaId: t.risorsaId, stato: r.stato }, x));
      const vedeCosti = controller || voce.profilo === 'PM';
      minuti += r.minuti;
      if (vedeCosti) costo += r.costoCentesimi ?? 0;
      else costiVisibili = false;
      return {
        rigaId: String(r._id),
        giornataId: String(t.giornataId),
        data: testoData(t.data),
        risorsaId: String(t.risorsaId),
        risorsa: nomiRisorse.get(String(t.risorsaId)) ?? '?',
        progettoId: String(r.progettoId),
        progetto: { codice: voce.progetto.codice, titolo: voce.progetto.titolo, stato: voce.progetto.stato },
        attivitaId: r.attivitaId ? String(r.attivitaId) : null,
        attivita: a ? { codice: a.codice, descrizione: a.descrizione } : null,
        // Decisione 10 della fase 2: righe su attività a cui la risorsa non è assegnata, calcolato in lettura.
        attivitaNonAssegnata: Boolean(a && !(a.risorseAssegnateIds ?? []).some((id) => String(id) === String(t.risorsaId))),
        tipologiaId: String(r.tipologiaId),
        tipologia: tip.get(String(r.tipologiaId))?.descrizione ?? r.tipologiaCodice,
        tipologiaCodice: r.tipologiaCodice,
        minuti: r.minuti,
        nota: r.nota ?? null,
        stato: r.stato,
        profilo: voce.profilo,
        meseChiuso,
        azioni,
        viaLiberaTL: chi(r.approvazioneTL),
        approvazionePM: chi(r.approvazionePM),
        rifiuto: r.rifiuto ? { ...chi(r.rifiuto)!, motivazione: r.rifiuto.motivazione } : null,
        ...(vedeCosti
          ? { fonteTariffa: r.fonteTariffa ?? null, tariffaCentesimiOra: r.tariffaCentesimiOra ?? null, costoCentesimi: r.costoCentesimi ?? null }
          : {}),
      };
    });
    return {
      righe,
      totali: { righe: righe.length, minuti, ...(costiVisibili && righe.length ? { costoCentesimi: costo } : {}) },
      troncato,
    };
  }

  /** POST /approvazioni: { azione, righe: [rigaId], motivazione? } su più righe insieme. */
  async esegui(utente: UtenteAutenticato | undefined, body: unknown) {
    this.permessi.verifica(utente, true, 'approvare');
    const c = corpo(body);
    const azione = c.azione as AzioneApprovazione;
    if (!AZIONI.includes(azione)) throw new BadRequestException(`azione: una tra ${AZIONI.join(', ')}`);
    if (!Array.isArray(c.righe) || c.righe.length === 0) throw new BadRequestException('righe: elenco obbligatorio');
    if (c.righe.length > MAX_AZIONE) throw new BadRequestException(`al massimo ${MAX_AZIONE} righe per volta`);
    const ids = [...new Set(c.righe.map((x, i) => String(objectId(x, `righe[${i}]`, true))))].map((x) => new mongoose.Types.ObjectId(x));
    const motivazione = testo(c.motivazione, 'motivazione', { max: 500 }) ?? null;
    if (azione === 'respingi' && !motivazione) throw new BadRequestException('motivazione: obbligatoria per respingere');

    const { soggetto, profili } = await this.progettiApprovabili(utente);
    // Progetti delle righe su cui l'utente non approva: servono per il motivo del no.
    let esiti: EsitoRiga[] = [];
    const adesso = new Date();
    const firma = { da: utente.id, il: adesso };
    await this.connection.transaction(async (session) => {
      esiti = [];
      const giornate = await this.model
        .find({ 'righe._id': { $in: ids } }, { risorsaId: 1, data: 1, versione: 1, righe: 1 })
        .session(session)
        .lean<{ _id: Id; risorsaId: Id; data: Date; versione: number; righe: (RigaConsuntivo & { _id: Id })[] }[]>()
        .exec();
      const chiusi = await this.periodi.chiusi(giornate.map((g) => meseDi(testoData(g.data))), session);
      const trovate = new Map<string, { giornata: (typeof giornate)[number]; riga: RigaConsuntivo & { _id: Id } }>();
      for (const g of giornate) for (const r of g.righe) if (ids.some((id) => id.equals(r._id))) trovate.set(String(r._id), { giornata: g, riga: r });

      const perGiornata = new Map<string, { giornata: (typeof giornate)[number]; righe: (RigaConsuntivo & { _id: Id })[] }>();
      for (const id of ids) {
        const x = trovate.get(String(id));
        if (!x) {
          esiti.push({ rigaId: String(id), esito: 'saltata', motivo: 'Riga non trovata (forse cancellata o ritirata)' });
          continue;
        }
        const voce = profili.get(String(x.riga.progettoId));
        const motivo = chiusi.has(meseDi(testoData(x.giornata.data)))
          ? 'La riga è in un mese chiuso'
          : voce
          ? motivoNegatoApprovazione(soggetto, voce.progetto, { risorsaId: x.giornata.risorsaId, stato: x.riga.stato }, azione)
          : 'Non sei approvatore del progetto';
        if (motivo) {
          esiti.push({ rigaId: String(id), esito: 'saltata', motivo });
          continue;
        }
        const k = String(x.giornata._id);
        if (!perGiornata.has(k)) perGiornata.set(k, { giornata: x.giornata, righe: [] });
        perGiornata.get(k)!.righe.push(x.riga);
      }

      const voci = [];
      for (const { giornata, righe } of perGiornata.values()) {
        const fatte: (RigaConsuntivo & { _id: Id })[] = [];
        for (const r of righe) {
          const set: Record<string, unknown> = { 'righe.$.stato': NUOVO_STATO[azione] };
          if (azione === 'viaLibera') set['righe.$.approvazioneTL'] = firma;
          if (azione === 'approva') set['righe.$.approvazionePM'] = firma;
          if (azione === 'respingi') {
            set['righe.$.rifiuto'] = { ...firma, motivazione };
            set['righe.$.approvazioneTL'] = null;
            set['righe.$.approvazionePM'] = null;
          }
          // Solo se la riga è ancora nello stato letto (un altro approvatore o un ritiro nel frattempo → saltata).
          const esito = await this.model
            .updateOne({ _id: giornata._id, righe: { $elemMatch: { _id: r._id, stato: r.stato } } }, { $set: set, $inc: { versione: 1 } }, { session })
            .exec();
          if (esito.modifiedCount === 1) {
            fatte.push(r);
            esiti.push({ rigaId: String(r._id), esito: 'fatta' });
          } else {
            esiti.push({ rigaId: String(r._id), esito: 'saltata', motivo: 'La riga è cambiata nel frattempo: ricarica' });
          }
        }
        if (fatte.length) {
          voci.push({
            collezione: 'consuntivi',
            documentoId: giornata._id,
            righeIds: fatte.map((r) => r._id),
            operazione: OPERAZIONE[azione],
            prima: fatte.map((r) => ({ _id: String(r._id), stato: r.stato })),
            dopo: { stato: NUOVO_STATO[azione] },
            motivazione,
          });
        }
      }
      await this.audit.registra(voci, session);
    });
    const fatte = esiti.filter((e) => e.esito === 'fatta').length;
    return { azione, fatte, saltate: esiti.length - fatte, esiti };
  }
}

function leggiStati(valore: unknown): StatoRiga[] | undefined {
  if (valore === undefined || valore === null || valore === '') return undefined;
  if (typeof valore !== 'string') throw new BadRequestException('stato: testo, valori separati da virgola');
  const stati = valore.split(',').map((s) => s.trim()) as StatoRiga[];
  const sbagliati = stati.filter((s) => !STATI_VISIBILI.includes(s));
  if (sbagliati.length) throw new BadRequestException(`stato: valori ammessi ${STATI_VISIBILI.join(', ')}`);
  return stati;
}
