import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import mongoose, { type Connection, type Model } from 'mongoose';
import type { UtenteAutenticato } from '../../auth/decoratori.js';
import { Attivita, Progetto } from '../../comuni/schemi/progetto.schema.js';
import { Risorsa } from '../../comuni/schemi/risorsa.schema.js';
import { corpo, data as leggiData, numero, objectId, testo } from '../../comuni/validazione.js';
import { ParametriService } from '../../infrastruttura/parametri.service.js';
import { PermessiService } from '../../permessi/permessi.service.js';
import { costoCentesimi } from '../tariffe/risoluzione.js';
import { type Risolutore, TariffeService } from '../tariffe/tariffe.service.js';
import { TipologiaCosto } from '../tipologie/tipologia-costo.schema.js';
import { Consuntivo, type RigaConsuntivo } from './consuntivo.schema.js';
import {
  MAX_GIORNI,
  MINUTI_GIORNO,
  STATI_MODIFICABILI,
  avvisoOrdinarie,
  chiaveRiga,
  erroreDateRisorsa,
  erroreMinuti,
  formattaOre,
  giorniTra,
  lunedi,
  meseDi,
  oggiInItalia,
  piuGiorni,
  primaRipetuta,
  testoData,
  totaleMinuti,
} from './regole-giornata.js';

type Id = mongoose.Types.ObjectId;
type RigaSalvata = RigaConsuntivo & { _id: Id };
type GiornataDb = { _id: Id; data: Date; versione: number; righe: RigaSalvata[] };

interface GiornataInput {
  data: Date;
  testo: string;
  versione: number;
  righe: Record<string, unknown>[];
}

export interface Avviso {
  data: string;
  messaggio: string;
}

/** Errore di una giornata: il messaggio porta la data, così la pagina sa dove mostrarlo. */
const errore = (giorno: string, msg: string) => new BadRequestException(`${giorno}: ${msg}`);

/**
 * Consuntivi giornalieri (fase 2, blocco C3).
 * - Ogni risorsa scrive solo i propri; il controller legge anche quelli degli altri.
 * - Salvataggio di una o più giornate in una transazione, condizionato sulla versione letta (409 se cambiata).
 * - Per ogni riga nuova o cambiata: progetto ricavato dall'attività, centro di costo copiato dal progetto,
 *   tipologia predefinita se manca, tariffa risolta e costo fotografati (null = da valorizzare).
 * - Le righe non in bozza/respinte (dalla fase 3) non si toccano; le righe invariate restano come sono.
 * - La risorsa non riceve mai tariffe né importi.
 */
@Injectable()
export class ConsuntiviService {
  constructor(
    @InjectModel(Consuntivo.name) private readonly model: Model<Consuntivo>,
    @InjectModel(Progetto.name) private readonly progetti: Model<Progetto>,
    @InjectModel(Attivita.name) private readonly attivita: Model<Attivita>,
    @InjectModel(Risorsa.name) private readonly risorse: Model<Risorsa>,
    @InjectModel(TipologiaCosto.name) private readonly tipologie: Model<TipologiaCosto>,
    @InjectConnection() private readonly connection: Connection,
    private readonly tariffe: TariffeService,
    private readonly parametri: ParametriService,
    private readonly permessi: PermessiService,
  ) {}

  // ---- Lettura ----

  async leggi(utente: UtenteAutenticato | undefined, query: { da?: unknown; a?: unknown; risorsa?: unknown }) {
    this.permessi.verifica(utente, true, 'leggere i consuntivi');
    const risorsaId = this.risorsaDaLeggere(utente, query.risorsa);
    const { da, a } = intervallo(query.da, query.a);
    const giornate = await this.model.find({ risorsaId, data: { $gte: da, $lte: a } }).sort({ data: 1 }).lean<GiornataDb[]>().exec();
    return this.presenta(giornate, this.vedeCosti(utente));
  }

  /**
   * Progetti non chiusi su cui la risorsa lavora nel periodo (default: il mese corrente), con le loro attività
   * attive: le voci su cui può consuntivare. Segna le attività a cui è assegnata e le mette in testa (anche i progetti che ne hanno):
   * si può consuntivare anche sulle altre, con un avviso (decisione 10 del piano della fase 2).
   */
  async voci(utente: UtenteAutenticato | undefined, periodo: { da?: unknown; a?: unknown } = {}) {
    const risorsaId = this.risorsaPropria(utente);
    const mia = String(risorsaId);
    const oggi = oggiInItalia();
    const { da, a } = intervallo(periodo.da ?? `${oggi.slice(0, 8)}01`, periodo.a ?? periodo.da ?? oggi);
    const lavoro = await this.progettiDiLavoro(risorsaId, mesiTra(da, a));
    const progetti = await this.progetti
      .find({ stato: { $ne: 'chiuso' }, _id: { $in: lavoro.tutti() } }, { codice: 1, titolo: 1, stato: 1, soloSuAttivita: 1 })
      .sort({ codice: 1 })
      .lean()
      .exec();
    const attivita = await this.attivita
      .find({ progettoId: { $in: progetti.map((p) => p._id) }, stato: 'attiva' }, { progettoId: 1, codice: 1, descrizione: 1, risorseAssegnateIds: 1 })
      .sort({ codice: 1 })
      .lean()
      .exec();
    const voci = progetti.map((p) => {
      const sue = attivita
        .filter((x) => String(x.progettoId) === String(p._id))
        .map((x) => ({
          _id: String(x._id),
          codice: x.codice,
          descrizione: x.descrizione,
          assegnata: Boolean(mia && (x.risorseAssegnateIds ?? []).some((id) => String(id) === mia)),
        }))
        .sort((a, b) => Number(b.assegnata) - Number(a.assegnata));
      return {
        _id: String(p._id),
        codice: p.codice,
        titolo: p.titolo,
        stato: p.stato,
        soloSuAttivita: Boolean(p.soloSuAttivita),
        conAttivitaAssegnate: sue.some((a) => a.assegnata),
        attivita: sue,
      };
    });
    // Ordinamento stabile: prima i progetti con attività assegnate, poi gli altri, per codice.
    return voci.sort((a, b) => Number(b.conAttivitaAssegnate) - Number(a.conAttivitaAssegnate));
  }

  /**
   * Righe proposte per la settimana che contiene `settimana`: progetti su cui la risorsa è allocata nel
   * Pianificatore nei mesi della settimana (con la tipologia predefinita) e righe usate la settimana prima.
   */
  async proposte(utente: UtenteAutenticato | undefined, settimana: unknown) {
    const risorsaId = this.risorsaPropria(utente);
    const inizio = lunedi(leggiData(settimana ?? oggiInItalia(), 'settimana', true)!);
    const fine = piuGiorni(inizio, 6);
    const mesi = [...new Set([meseDi(testoData(inizio)), meseDi(testoData(fine))])];
    const [risorsa, precedenti, predefinita] = await Promise.all([
      this.risorse.findById(risorsaId, { planned: 1 }).lean().exec(),
      this.model.find({ risorsaId, data: { $gte: piuGiorni(inizio, -7), $lte: piuGiorni(inizio, -1) } }, { righe: 1 }).lean<GiornataDb[]>().exec(),
      this.tipologie.findOne({ predefinita: true }, { _id: 1 }).lean().exec(),
    ]);
    const candidati: { progettoId: string; attivitaId: string | null; tipologiaId: string | null; origine: 'pianificatore' | 'settimanaPrecedente' }[] = [];
    for (const r of precedenti.flatMap((g) => g.righe)) {
      candidati.push({ progettoId: String(r.progettoId), attivitaId: r.attivitaId ? String(r.attivitaId) : null, tipologiaId: String(r.tipologiaId), origine: 'settimanaPrecedente' });
    }
    for (const al of risorsa?.planned ?? []) {
      if (al.progettoId && mesi.includes(al.mese) && (al.percentualeAllocazione ?? 0) > 0) {
        candidati.push({ progettoId: String(al.progettoId), attivitaId: null, tipologiaId: predefinita ? String(predefinita._id) : null, origine: 'pianificatore' });
      }
    }
    // Solo voci ancora consuntivabili, senza doppioni (vince la prima: la settimana precedente).
    const voci = await this.voci(utente, { da: testoData(inizio), a: testoData(fine) });
    const perId = new Map(voci.map((p) => [p._id, p]));
    const tipologieAttive = new Map((await this.tipologie.find({ attiva: true }, { codice: 1, descrizione: 1 }).lean().exec()).map((t) => [String(t._id), t]));
    const visti = new Set<string>();
    const risultato = [];
    for (const c of candidati) {
      const p = perId.get(c.progettoId);
      if (!p || !c.tipologiaId || !tipologieAttive.has(c.tipologiaId)) continue;
      const att = c.attivitaId ? p.attivita.find((x) => x._id === c.attivitaId) : null;
      if (c.attivitaId && !att) continue;
      // Allocazione su un progetto "solo su attività": la risorsa sceglierà l'attività; la proposta resta sul progetto.
      const k = chiaveRiga(c);
      if (visti.has(k)) continue;
      visti.add(k);
      const t = tipologieAttive.get(c.tipologiaId)!;
      risultato.push({
        progettoId: c.progettoId,
        progetto: { codice: p.codice, titolo: p.titolo, soloSuAttivita: p.soloSuAttivita },
        attivitaId: c.attivitaId,
        attivita: att ? { codice: att.codice, descrizione: att.descrizione, assegnata: att.assegnata } : null,
        tipologiaId: c.tipologiaId,
        tipologiaCodice: t.codice,
        origine: c.origine,
      });
    }
    return { settimana: testoData(inizio), righe: risultato };
  }

  // ---- Scrittura ----

  /** PUT di una giornata: { versione, righe }. */
  salvaGiornata(utente: UtenteAutenticato | undefined, dataTesto: string, body: unknown) {
    const c = corpo(body);
    return this.salva(utente, [{ ...c, data: dataTesto }]);
  }

  /** PUT di più giornate insieme: { giornate: [{ data, versione, righe }] }, tutte o nessuna. */
  salvaGiornate(utente: UtenteAutenticato | undefined, body: unknown) {
    const c = corpo(body);
    if (!Array.isArray(c.giornate) || c.giornate.length === 0) throw new BadRequestException('giornate: elenco obbligatorio');
    return this.salva(utente, c.giornate);
  }

  private async salva(utente: UtenteAutenticato | undefined, grezze: unknown[]) {
    const risorsaId = this.risorsaPropria(utente);
    const giornate = grezze.map(leggiGiornata);
    if (giornate.length > MAX_GIORNI) throw new BadRequestException(`al massimo ${MAX_GIORNI} giornate per volta`);
    const testi = giornate.map((g) => g.testo);
    if (new Set(testi).size !== testi.length) throw new BadRequestException('giornate: la stessa data compare due volte');

    const risorsa = await this.risorse.findById(risorsaId, { dataIngresso: 1, dataUscita: 1, oreContrattualiGiorno: 1 }).lean().exec();
    if (!risorsa) throw new NotFoundException('Risorsa collegata all\'utente non trovata');
    const oggi = oggiInItalia();
    for (const g of giornate) {
      if (g.testo > oggi) throw errore(g.testo, 'non si consuntivano giorni futuri');
      const e = erroreDateRisorsa(g.data, risorsa.dataIngresso, risorsa.dataUscita);
      if (e) throw errore(g.testo, e);
    }

    const esistenti = new Map(
      (await this.model.find({ risorsaId, data: { $in: giornate.map((g) => g.data) } }).lean<GiornataDb[]>().exec()).map((d) => [testoData(d.data), d]),
    );
    const contesto = await this.contesto(risorsaId, giornate, esistenti);
    const oreGiorno = await this.parametri.leggi<number>('oreGiorno', 8);
    const adesso = new Date();
    const avvisi: Avviso[] = [];
    const scritture = giornate.map((g) => {
      const vecchia = esistenti.get(g.testo);
      if ((vecchia?.versione ?? 0) !== g.versione) throw this.conflitto(g.testo);
      const righe = this.costruisciRighe(g, vecchia, contesto, utente!.id, adesso, risorsaId, avvisi);
      const ordinari = totaleMinuti(righe.filter((r) => contesto.tipologie.get(String(r.tipologiaId))?.categoria === 'ordinaria'));
      const avviso = avvisoOrdinarie(ordinari, risorsa.oreContrattualiGiorno, oreGiorno);
      if (avviso) avvisi.push({ data: g.testo, messaggio: avviso });
      return { g, vecchia, righe };
    });

    await this.connection.transaction(async (session) => {
      for (const { g, vecchia, righe } of scritture) {
        if (vecchia) {
          const r = await this.model
            .updateOne({ _id: vecchia._id, versione: g.versione }, { $set: { righe, versione: g.versione + 1 } }, { session })
            .exec();
          if (r.matchedCount === 0) throw this.conflitto(g.testo);
        } else if (righe.length > 0) {
          await this.model.create([{ risorsaId, data: g.data, mese: meseDi(g.testo), versione: 1, righe }], { session });
        }
      }
    });

    const giorniOrdinati = [...testi].sort();
    const salvate = await this.model
      .find({ risorsaId, data: { $in: giornate.map((g) => g.data) } })
      .sort({ data: 1 })
      .lean<GiornataDb[]>()
      .exec();
    return { giornate: await this.presenta(salvate, this.vedeCosti(utente)), avvisi, date: giorniOrdinati };
  }

  /** Righe finali di una giornata, con tutti i controlli. Le righe invariate restano come sono. */
  private costruisciRighe(
    g: GiornataInput,
    vecchia: GiornataDb | undefined,
    ctx: Contesto,
    utenteId: string,
    adesso: Date,
    risorsaId: Id,
    avvisi: Avviso[],
  ): RigaSalvata[] {
    const vecchie = new Map((vecchia?.righe ?? []).map((r) => [String(r._id), r]));
    const usate = new Set<string>();
    const righe: RigaSalvata[] = [];
    g.righe.forEach((grezza, i) => {
      const n = `riga ${i + 1}`;
      const idRiga = objectId(grezza._id, `${n}: _id`);
      const prima = idRiga ? vecchie.get(String(idRiga)) : undefined;
      if (idRiga && !prima) throw errore(g.testo, `${n}: riga inesistente (forse cancellata nel frattempo): ricarica`);
      if (prima) usate.add(String(prima._id));

      const attivitaId = objectId(grezza.attivitaId, `${n}: attivitaId`) ?? null;
      let progettoId = objectId(grezza.progettoId, `${n}: progettoId`) ?? null;
      const att = attivitaId ? ctx.attivita.get(String(attivitaId)) : undefined;
      if (attivitaId && !att) throw errore(g.testo, `${n}: attività inesistente`);
      if (att) {
        if (progettoId && String(progettoId) !== String(att.progettoId)) throw errore(g.testo, `${n}: l'attività non appartiene al progetto indicato`);
        progettoId = att.progettoId;
      }
      if (!progettoId) throw errore(g.testo, `${n}: indica il progetto o l'attività`);
      const tipologiaId = objectId(grezza.tipologiaId, `${n}: tipologiaId`) ?? ctx.predefinita;
      if (!tipologiaId) throw errore(g.testo, `${n}: tipologia obbligatoria (nessuna tipologia predefinita)`);
      const e = erroreMinuti(grezza.minuti);
      if (e) throw errore(g.testo, `${n}: ${e}`);
      const minuti = grezza.minuti as number;
      const nota = testo(grezza.nota, `${n}: nota`, { max: 500 }) ?? null;

      const stessa =
        prima &&
        String(prima.progettoId) === String(progettoId) &&
        String(prima.attivitaId ?? '') === String(attivitaId ?? '') &&
        String(prima.tipologiaId) === String(tipologiaId);
      if (prima && !STATI_MODIFICABILI.includes(prima.stato as (typeof STATI_MODIFICABILI)[number])) {
        if (!stessa || prima.minuti !== minuti || (prima.nota ?? null) !== nota) {
          throw new ConflictException(`${g.testo}: ${n}: la riga è ${prima.stato} e non si modifica`);
        }
        righe.push(prima);
        return;
      }
      if (stessa && prima.minuti === minuti && (prima.nota ?? null) === nota) {
        righe.push(prima);
        return;
      }

      // Riga nuova o cambiata: tutti i controlli sui riferimenti.
      const progetto = ctx.progetti.get(String(progettoId));
      if (!progetto) throw errore(g.testo, `${n}: progetto inesistente`);
      if (progetto.stato === 'chiuso') throw errore(g.testo, `${n}: il progetto ${progetto.codice} è chiuso`);
      if (!ctx.lavoro.lavora(String(progetto._id), meseDi(g.testo))) {
        throw errore(
          g.testo,
          `${n}: non lavori sul progetto ${progetto.codice} (nessuna attività assegnata, nessuna allocazione nel mese nel Pianificatore): chiedi al TL o al PM del progetto`,
        );
      }
      if (!att && progetto.soloSuAttivita) throw errore(g.testo, `${n}: sul progetto ${progetto.codice} si consuntiva solo sulle attività`);
      if (att && att.stato !== 'attiva') throw errore(g.testo, `${n}: l'attività ${att.codice} è chiusa`);
      const tipologia = ctx.tipologie.get(String(tipologiaId));
      if (!tipologia) throw errore(g.testo, `${n}: tipologia inesistente`);
      if (!tipologia.attiva) throw errore(g.testo, `${n}: la tipologia ${tipologia.codice} è disattivata`);
      if (att && !(att.risorseAssegnateIds ?? []).some((id) => String(id) === String(risorsaId))) {
        avvisi.push({ data: g.testo, messaggio: `attività ${att.codice} del progetto ${progetto.codice}: non risulti tra le risorse assegnate` });
      }

      // Costo: invariato se tipologia e minuti non cambiano (il ricalcolo è un'operazione del controller).
      const costoInvariato = prima && String(prima.tipologiaId) === String(tipologiaId) && prima.minuti === minuti;
      const tariffa = costoInvariato
        ? { fonte: prima.fonteTariffa, tariffaId: prima.tariffaId, centesimiOra: prima.tariffaCentesimiOra, costo: prima.costoCentesimi }
        : (() => {
            const t = ctx.risolvi(tipologiaId, g.data);
            return { fonte: t.fonte, tariffaId: t.tariffaId ? new mongoose.Types.ObjectId(t.tariffaId) : null, centesimiOra: t.centesimiOra, costo: costoCentesimi(minuti, t.centesimiOra) };
          })();
      righe.push({
        _id: prima?._id ?? new mongoose.Types.ObjectId(),
        progettoId: progetto._id,
        attivitaId: att ? att._id : null,
        centroCostoId: prima && String(prima.progettoId) === String(progetto._id) ? prima.centroCostoId : progetto.centroCostoId,
        tipologiaId: tipologia._id,
        tipologiaCodice: tipologia.codice,
        minuti,
        nota,
        stato: 'bozza',
        fonteTariffa: tariffa.fonte,
        tariffaId: tariffa.tariffaId,
        tariffaCentesimiOra: tariffa.centesimiOra,
        costoCentesimi: tariffa.costo,
        approvazioneTL: null,
        approvazionePM: null,
        modificatoIl: adesso,
        modificatoDa: utenteId,
      });
    });

    // Le righe tolte devono essere modificabili.
    for (const r of vecchie.values()) {
      if (!usate.has(String(r._id)) && !STATI_MODIFICABILI.includes(r.stato as (typeof STATI_MODIFICABILI)[number])) {
        throw new ConflictException(`${g.testo}: una riga ${r.stato} non si può togliere`);
      }
    }
    const ripetuta = primaRipetuta(righe);
    if (ripetuta) {
      const [p, a, t] = ripetuta.split('|');
      const nome = a !== '-' ? ctx.attivita.get(a)?.codice : ctx.progetti.get(p)?.codice;
      throw errore(g.testo, `due righe per ${nome ?? 'la stessa voce'} con la stessa tipologia (${ctx.tipologie.get(t)?.codice ?? ''}): uniscile`);
    }
    const totale = totaleMinuti(righe);
    if (totale > MINUTI_GIORNO) throw errore(g.testo, `totale della giornata ${formattaOre(totale)}: oltre 24 ore`);
    return righe;
  }

  /** Carica in poche query tutto ciò che serve a controllare e valorizzare le righe. */
  private async contesto(risorsaId: Id, giornate: GiornataInput[], esistenti: Map<string, GiornataDb>): Promise<Contesto> {
    const ids = (campo: string) =>
      [
        ...new Set([
          ...giornate.flatMap((g) => g.righe.map((r) => r[campo])).filter((v): v is string => typeof v === 'string' && mongoose.isValidObjectId(v)),
          ...[...esistenti.values()].flatMap((d) => d.righe.map((r) => (r as unknown as Record<string, unknown>)[campo])).filter(Boolean).map(String),
        ]),
      ].map((v) => new mongoose.Types.ObjectId(v));
    const attivita = await this.attivita
      .find({ _id: { $in: ids('attivitaId') } }, { progettoId: 1, codice: 1, stato: 1, risorseAssegnateIds: 1 })
      .lean()
      .exec();
    const progettiIds = [...ids('progettoId'), ...attivita.map((a) => a.progettoId)];
    const [progetti, tipologie] = await Promise.all([
      this.progetti.find({ _id: { $in: progettiIds } }, { codice: 1, stato: 1, soloSuAttivita: 1, centroCostoId: 1 }).lean().exec(),
      this.tipologie.find().lean().exec(),
    ]);
    const date = giornate.map((g) => g.data.getTime());
    const risolvi = await this.tariffe.risolutore(risorsaId, new Date(Math.min(...date)), new Date(Math.max(...date)));
    const lavoro = await this.progettiDiLavoro(risorsaId, [...new Set(giornate.map((g) => meseDi(g.testo)))]);
    return {
      attivita: new Map(attivita.map((a) => [String(a._id), a as unknown as AttivitaCtx])),
      progetti: new Map(progetti.map((p) => [String(p._id), p as unknown as ProgettoCtx])),
      tipologie: new Map(tipologie.map((t) => [String(t._id), t as unknown as TipologiaCtx])),
      predefinita: (tipologie.find((t) => t.predefinita)?._id as Id | undefined) ?? null,
      risolvi,
      lavoro,
    };
  }

  // ---- Parte comune ----

  /**
   * Progetti su cui la risorsa lavora (decisione 5 del piano della fase 2): approvatrice del progetto o
   * assegnata ad almeno una sua attività (sempre), oppure allocata nel Pianificatore nel mese (percentuale > 0).
   */
  private async progettiDiLavoro(risorsaId: Id, mesi: string[]): Promise<ProgettiDiLavoro> {
    const [approvatrice, assegnata, risorsa] = await Promise.all([
      this.progetti.distinct('_id', { 'approvatori.risorsaId': risorsaId }).exec(),
      this.attivita.distinct('progettoId', { risorseAssegnateIds: risorsaId }).exec(),
      this.risorse.findById(risorsaId, { planned: 1 }).lean().exec(),
    ]);
    const sempre = new Set([...approvatrice, ...assegnata].map(String));
    const perMese = new Map<string, Set<string>>();
    for (const al of risorsa?.planned ?? []) {
      if (al.progettoId && mesi.includes(al.mese) && (al.percentualeAllocazione ?? 0) > 0) {
        if (!perMese.has(al.mese)) perMese.set(al.mese, new Set());
        perMese.get(al.mese)!.add(String(al.progettoId));
      }
    }
    return {
      lavora: (progettoId, mese) => sempre.has(progettoId) || Boolean(perMese.get(mese)?.has(progettoId)),
      tutti: () => [...new Set([...sempre, ...[...perMese.values()].flatMap((s) => [...s])])].map((id) => new mongoose.Types.ObjectId(id)),
    };
  }

  /** Giornate come le vede la pagina: con codici e titoli; tariffe e importi solo a chi li può vedere. */
  private async presenta(giornate: GiornataDb[], conCosti: boolean) {
    const righe = giornate.flatMap((g) => g.righe);
    const [progetti, attivita] = await Promise.all([
      this.progetti.find({ _id: { $in: righe.map((r) => r.progettoId) } }, { codice: 1, titolo: 1 }).lean().exec(),
      this.attivita.find({ _id: { $in: righe.map((r) => r.attivitaId).filter(Boolean) } }, { codice: 1, descrizione: 1 }).lean().exec(),
    ]);
    const p = new Map(progetti.map((x) => [String(x._id), x]));
    const a = new Map(attivita.map((x) => [String(x._id), x]));
    return giornate.map((g) => ({
      data: testoData(g.data),
      versione: g.versione,
      totaleMinuti: totaleMinuti(g.righe),
      righe: g.righe.map((r) => {
        const pr = p.get(String(r.progettoId));
        const at = r.attivitaId ? a.get(String(r.attivitaId)) : undefined;
        const base = {
          _id: String(r._id),
          progettoId: String(r.progettoId),
          progetto: pr ? { codice: pr.codice, titolo: pr.titolo } : null,
          attivitaId: r.attivitaId ? String(r.attivitaId) : null,
          attivita: at ? { codice: at.codice, descrizione: at.descrizione } : null,
          tipologiaId: String(r.tipologiaId),
          tipologiaCodice: r.tipologiaCodice,
          minuti: r.minuti,
          nota: r.nota ?? null,
          stato: r.stato,
          modificatoIl: r.modificatoIl,
        };
        if (!conCosti) return base;
        return {
          ...base,
          centroCostoId: String(r.centroCostoId),
          fonteTariffa: r.fonteTariffa ?? null,
          tariffaId: r.tariffaId ? String(r.tariffaId) : null,
          tariffaCentesimiOra: r.tariffaCentesimiOra ?? null,
          costoCentesimi: r.costoCentesimi ?? null,
        };
      }),
    }));
  }

  private vedeCosti(utente: UtenteAutenticato | undefined) {
    return Boolean(utente && this.permessi.permessoGlobale(utente, 'gestireTariffe'));
  }

  private risorsaPropria(utente: UtenteAutenticato | undefined): Id {
    this.permessi.verifica(utente, true, 'consuntivare');
    if (!utente.risorsaId) throw new ForbiddenException('Il tuo utente non è collegato a una risorsa: non puoi consuntivare');
    return new mongoose.Types.ObjectId(utente.risorsaId);
  }

  /** La propria risorsa; un'altra solo per il controller. */
  private risorsaDaLeggere(utente: UtenteAutenticato, richiesta: unknown): Id {
    if (richiesta === undefined || richiesta === '' || richiesta === utente.risorsaId) return this.risorsaPropria(utente);
    if (!this.vedeCosti(utente)) throw new ForbiddenException('Non hai il permesso di leggere i consuntivi di altre risorse');
    return objectId(richiesta, 'risorsa', true)!;
  }

  private conflitto(giorno: string) {
    return new ConflictException(`${giorno}: la giornata è stata modificata nel frattempo (da un'altra finestra o un altro dispositivo): ricarica la pagina`);
  }
}

interface ProgettoCtx {
  _id: Id;
  codice: string;
  stato: string;
  soloSuAttivita?: boolean;
  centroCostoId: Id;
}
interface AttivitaCtx {
  _id: Id;
  progettoId: Id;
  codice: string;
  stato: string;
  risorseAssegnateIds?: Id[];
}
interface TipologiaCtx {
  _id: Id;
  codice: string;
  attiva: boolean;
  categoria: string;
}
interface ProgettiDiLavoro {
  lavora(progettoId: string, mese: string): boolean;
  tutti(): Id[];
}
interface Contesto {
  attivita: Map<string, AttivitaCtx>;
  progetti: Map<string, ProgettoCtx>;
  tipologie: Map<string, TipologiaCtx>;
  predefinita: Id | null;
  risolvi: Risolutore;
  lavoro: ProgettiDiLavoro;
}

function leggiGiornata(grezza: unknown): GiornataInput {
  const c = corpo(grezza);
  const testoGiorno = typeof c.data === 'string' ? c.data : '';
  const d = leggiData(c.data, 'data', true)!;
  const versione = numero(c.versione, `${testoGiorno}: versione`, { min: 0, intero: true }) ?? 0;
  if (!Array.isArray(c.righe)) throw errore(testoGiorno, 'righe: elenco obbligatorio (anche vuoto)');
  if (c.righe.length > 100) throw errore(testoGiorno, 'troppe righe');
  return { data: d, testo: testoData(d), versione, righe: c.righe.map((r) => corpo(r)) };
}

/** Mesi "AAAAMM" toccati dall'intervallo. */
function mesiTra(da: Date, a: Date) {
  const mesi = new Set<string>();
  for (let d = da; d <= a; d = piuGiorni(d, 1)) mesi.add(meseDi(testoData(d)));
  return [...mesi];
}

function intervallo(da: unknown, a: unknown) {
  const inizio = leggiData(da, 'da', true)!;
  const fine = leggiData(a, 'a', true)!;
  if (fine < inizio) throw new BadRequestException('a: non può precedere da');
  if (giorniTra(inizio, fine) > MAX_GIORNI) throw new BadRequestException(`al massimo ${MAX_GIORNI} giorni per volta`);
  return { da: inizio, a: fine };
}
