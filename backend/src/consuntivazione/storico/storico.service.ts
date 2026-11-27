import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { type Model } from 'mongoose';
import type { UtenteAutenticato } from '../../auth/decoratori.js';
import { Utente } from '../../auth/utente.schema.js';
import { Cliente, Ruolo } from '../../comuni/schemi/anagrafiche.schema.js';
import { Attivita, Progetto } from '../../comuni/schemi/progetto.schema.js';
import { Risorsa } from '../../comuni/schemi/risorsa.schema.js';
import { data as leggiData, idRotta, numero } from '../../comuni/validazione.js';
import { VoceStorico } from '../../infrastruttura/voce-storico.schema.js';
import { PermessiService } from '../../permessi/permessi.service.js';
import { profiloDiApprovazione, type ProgettoPerPermessi } from '../../permessi/regole.js';
import { Consuntivo } from '../consuntivi/consuntivo.schema.js';
import { testoData } from '../consuntivi/regole-giornata.js';
import { nomeMese } from '../periodi/periodi.service.js';
import { TipologiaCosto } from '../tipologie/tipologia-costo.schema.js';

type Id = mongoose.Types.ObjectId;
type Voce = VoceStorico & { _id: Id };

/** Operazioni che portano importi: la risorsa e il TL non le vedono. */
const CON_IMPORTI = ['ricalcolo'];

/**
 * Consultazione dello storico delle modifiche (fase 3, blocco D5).
 * - Elenco con filtri per controller e PMSenior (`consultareStorico`), con il nome di chi ha agito e
 *   un'etichetta leggibile del documento.
 * - Cronologia di una riga di consuntivo per chi la può vedere: la risorsa, gli approvatori del progetto,
 *   controller e PMSenior; ricalcoli e importi solo a chi vede i costi.
 */
@Injectable()
export class StoricoService {
  constructor(
    @InjectModel(VoceStorico.name) private readonly voci: Model<VoceStorico>,
    @InjectModel(Consuntivo.name) private readonly consuntivi: Model<Consuntivo>,
    @InjectModel(Utente.name) private readonly utenti: Model<Utente>,
    @InjectModel(Risorsa.name) private readonly risorse: Model<Risorsa>,
    @InjectModel(Progetto.name) private readonly progetti: Model<Progetto>,
    @InjectModel(Attivita.name) private readonly attivita: Model<Attivita>,
    @InjectModel(TipologiaCosto.name) private readonly tipologie: Model<TipologiaCosto>,
    @InjectModel(Ruolo.name) private readonly ruoli: Model<Ruolo>,
    @InjectModel(Cliente.name) private readonly clienti: Model<Cliente>,
    private readonly permessi: PermessiService,
  ) {}

  /** GET /storico?collezione=&documento=&riga=&operazione=&utente=&da=&a=&limite= */
  async elenco(query: Record<string, unknown>) {
    const filtro: Record<string, unknown> = {};
    for (const [campo, chiave] of [
      ['collezione', 'collezione'],
      ['documento', 'documentoId'],
      ['riga', 'righeIds'],
      ['operazione', 'operazione'],
      ['utente', 'utente'],
    ] as const) {
      const v = query[campo];
      if (v === undefined || v === '') continue;
      if (typeof v !== 'string' || v.length > 100) throw new BadRequestException(`${campo}: testo`);
      filtro[chiave] = v;
    }
    const da = leggiData(query.da, 'da');
    const a = leggiData(query.a, 'a');
    if (da || a) filtro.il = { ...(da ? { $gte: da } : {}), ...(a ? { $lt: new Date(a.getTime() + 86_400_000) } : {}) };
    const limite = numero(query.limite, 'limite', { min: 1, max: 1000, intero: true }) ?? 200;
    const voci = await this.voci.find(filtro).sort({ il: -1, _id: -1 }).limit(limite + 1).lean<Voce[]>().exec();
    const troncato = voci.length > limite;
    if (troncato) voci.length = limite;
    const [nomi, etichette] = await Promise.all([this.nomiUtenti(voci), this.etichette(voci)]);
    return {
      voci: voci.map((v) => ({
        _id: String(v._id),
        il: v.il,
        collezione: v.collezione,
        documentoId: v.documentoId,
        documento: etichette.get(`${v.collezione}|${v.documentoId}`) ?? v.documentoId,
        righeIds: v.righeIds ?? [],
        operazione: v.operazione,
        utente: v.utente,
        nomeUtente: nomi.get(v.utente) ?? v.utente,
        prima: v.prima ?? null,
        dopo: v.dopo ?? null,
        motivazione: v.motivazione ?? null,
      })),
      troncato,
    };
  }

  /** GET /storico/riga/:rigaId: cronologia di una riga di consuntivo, dalla più vecchia. */
  async riga(utente: UtenteAutenticato, rigaGrezza: string) {
    const rigaId = idRotta(rigaGrezza);
    const giornata = rigaId
      ? await this.consuntivi.findOne({ 'righe._id': rigaId }, { risorsaId: 1, data: 1, righe: { $elemMatch: { _id: rigaId } } }).lean().exec()
      : null;
    const riga = giornata?.righe[0];
    if (!giornata || !riga) throw new NotFoundException('Riga non trovata');
    const propria = utente.risorsaId === String(giornata.risorsaId);
    const progetto = await this.progetti.findById(riga.progettoId, { approvatori: 1, codice: 1 }).lean<ProgettoPerPermessi & { codice: string }>().exec();
    const profilo = progetto ? profiloDiApprovazione(utente, progetto) : null;
    const tutto = this.permessi.permessoGlobale(utente, 'consultareStorico') || this.permessi.permessoGlobale(utente, 'gestireTariffe');
    if (!propria && !profilo && !tutto) throw new ForbiddenException('Non hai il permesso di vedere la cronologia di questa riga');
    const vedeImporti = tutto || profilo === 'PM';

    const voci = await this.voci
      .find({ collezione: 'consuntivi', documentoId: String(giornata._id), righeIds: String(rigaId) })
      .sort({ il: 1, _id: 1 })
      .lean<Voce[]>()
      .exec();
    const visibili = voci.filter((v) => vedeImporti || !CON_IMPORTI.includes(v.operazione));
    const nomi = await this.nomiUtenti(visibili);
    // Le voci su più righe portano un elenco: tengo solo l'elemento di questa riga.
    const soloRiga = (x: unknown) =>
      Array.isArray(x) ? ((x as { _id?: string }[]).find((e) => String(e._id) === String(rigaId)) ?? null) : (x ?? null);
    return {
      riga: { rigaId: String(rigaId), data: testoData(giornata.data), progetto: progetto?.codice ?? null, stato: riga.stato, minuti: riga.minuti },
      voci: visibili.map((v) => ({
        il: v.il,
        operazione: v.operazione,
        nomeUtente: nomi.get(v.utente) ?? v.utente,
        prima: soloRiga(v.prima),
        dopo: soloRiga(v.dopo),
        motivazione: v.motivazione ?? null,
      })),
    };
  }

  /** Nome della persona dietro ogni utente (id) delle voci; gli utenti tecnici restano come sono. */
  private async nomiUtenti(voci: Voce[]) {
    const ids = [...new Set(voci.map((v) => v.utente))].filter((x) => mongoose.isValidObjectId(x));
    const utenti = await this.utenti.find({ _id: { $in: ids } }, { risorsaId: 1, email: 1 }).lean().exec();
    const risorse = await this.risorse.find({ _id: { $in: utenti.map((u) => u.risorsaId).filter(Boolean) } }, { nome: 1, cognome: 1 }).lean().exec();
    const nr = new Map(risorse.map((r) => [String(r._id), `${r.cognome} ${r.nome}`.trim()]));
    return new Map(utenti.map((u) => [String(u._id), (u.risorsaId && nr.get(String(u.risorsaId))) || u.email]));
  }

  /** Etichetta leggibile dei documenti delle voci (giornata, progetto, attività, tipologia, mese). */
  private async etichette(voci: Voce[]) {
    const per = (c: string) => [...new Set(voci.filter((v) => v.collezione === c).map((v) => v.documentoId))].filter((x) => mongoose.isValidObjectId(x));
    const mappa = new Map<string, string>();
    const [giornate, progetti, attivita, tipologie] = await Promise.all([
      this.consuntivi.find({ _id: { $in: per('consuntivi') } }, { risorsaId: 1, data: 1 }).lean().exec(),
      this.progetti.find({ _id: { $in: per('progetti') } }, { codice: 1 }).lean().exec(),
      this.attivita.find({ _id: { $in: per('attivita') } }, { codice: 1, progettoId: 1 }).lean().exec(),
      this.tipologie.find({ _id: { $in: per('tipologie_costo') } }, { codice: 1 }).lean().exec(),
    ]);
    const progettiAttivita = await this.progetti.find({ _id: { $in: attivita.map((a) => a.progettoId) } }, { codice: 1 }).lean().exec();
    const risorse = await this.risorse.find({ _id: { $in: giornate.map((g) => g.risorsaId) } }, { nome: 1, cognome: 1 }).lean().exec();
    const nr = new Map(risorse.map((r) => [String(r._id), `${r.cognome} ${r.nome}`.trim()]));
    const np = new Map(progettiAttivita.map((p) => [String(p._id), p.codice]));
    const giorno = (d: Date) => d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
    for (const g of giornate) mappa.set(`consuntivi|${String(g._id)}`, `${nr.get(String(g.risorsaId)) ?? '?'}, ${giorno(g.data)}`);
    for (const p of progetti) mappa.set(`progetti|${String(p._id)}`, p.codice);
    for (const a of attivita) mappa.set(`attivita|${String(a._id)}`, `${np.get(String(a.progettoId)) ?? '?'} › ${a.codice}`);
    for (const t of tipologie) mappa.set(`tipologie_costo|${String(t._id)}`, t.codice);
    for (const v of voci) if (v.collezione === 'periodi') mappa.set(`periodi|${v.documentoId}`, nomeMese(v.documentoId));
    await this.etichetteListino(voci, mappa, giorno);
    return mappa;
  }

  /** Tariffe di vendita (fase 5, F1): "ruolo · cliente o standard · dal"; per le cancellate si usa la fotografia "prima". */
  private async etichetteListino(voci: Voce[], mappa: Map<string, string>, giorno: (d: Date) => string) {
    const delListino = voci.filter((v) => v.collezione === 'listino_vendita');
    if (!delListino.length) return;
    type DatiVoce = { ruoloId?: Id | string; clienteId?: Id | string | null; validoDal?: Date | string };
    const ids = [...new Set(delListino.map((v) => v.documentoId))].filter((x) => mongoose.isValidObjectId(x)).map((x) => new mongoose.Types.ObjectId(x));
    const presenti = await this.voci.db.collection<DatiVoce & { _id: Id }>('listino_vendita').find({ _id: { $in: ids } }).toArray();
    const dati = new Map<string, DatiVoce>(presenti.map((d) => [String(d._id), d]));
    for (const v of delListino) if (!dati.has(v.documentoId) && v.prima) dati.set(v.documentoId, v.prima as DatiVoce);
    const idsDi = (campo: 'ruoloId' | 'clienteId') => [...new Set([...dati.values()].map((d) => d[campo]).filter((x) => x && mongoose.isValidObjectId(x)).map(String))];
    const [ruoli, clienti] = await Promise.all([
      this.ruoli.find({ _id: { $in: idsDi('ruoloId') } }, { codice: 1 }).lean().exec(),
      this.clienti.find({ _id: { $in: idsDi('clienteId') } }, { codice: 1 }).lean().exec(),
    ]);
    const nr = new Map(ruoli.map((r) => [String(r._id), r.codice]));
    const nc = new Map(clienti.map((c) => [String(c._id), c.codice]));
    for (const [id, d] of dati) {
      const dal = d.validoDal ? giorno(new Date(d.validoDal)) : '?';
      mappa.set(`listino_vendita|${id}`, `${nr.get(String(d.ruoloId)) ?? '?'} · ${d.clienteId ? (nc.get(String(d.clienteId)) ?? '?') : 'standard'} · dal ${dal}`);
    }
  }
}
