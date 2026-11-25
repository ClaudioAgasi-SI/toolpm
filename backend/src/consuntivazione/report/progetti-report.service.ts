import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { type Model } from 'mongoose';
import type { UtenteAutenticato } from '../../auth/decoratori.js';
import { CentroCosto, Cliente, Ruolo } from '../../comuni/schemi/anagrafiche.schema.js';
import { Attivita, Progetto } from '../../comuni/schemi/progetto.schema.js';
import { Risorsa } from '../../comuni/schemi/risorsa.schema.js';
import { data as leggiData, idRotta } from '../../comuni/validazione.js';
import { PermessiService } from '../../permessi/permessi.service.js';
import { ePMSenior, type ProgettoPerPermessi, puoVedereReportProgetto, vedeEuroProgetto } from '../../permessi/regole.js';
import { giorniTra, oggiInItalia } from '../consuntivi/regole-giornata.js';
import { ruoloAllaData } from '../tariffe/risoluzione.js';
import { TipologiaCosto } from '../tipologie/tipologia-costo.schema.js';
import { type Chiave, ReportService } from './report.service.js';
import { giorni, leggiVista, type Totali, totaliVuoti, type Vista } from './viste.js';

type Id = mongoose.Types.ObjectId;
type ProgettoLetto = ProgettoPerPermessi & {
  _id: Id;
  codice: string;
  titolo: string;
  descrizione?: string;
  clienteId?: Id;
  centroCostoId: Id;
  stato: string;
  dataInizio?: Date;
  dataFine?: Date;
  percentualeCompletamento: number;
  soloSuAttivita?: boolean;
  stime?: { managerialeGiorni?: number; managerialeCentesimi?: number; definitivaGiorni?: number; definitivaCentesimi?: number };
};

const STATI_PROGETTO = ['inValutazione', 'inCorso', 'chiuso'];

/**
 * Scheda costi del progetto ed elenco dei progetti (fase 4, blocco E1; RF-14, RF-22, RF-24, RF-25).
 * - Totali sempre dall'inizio del progetto e, per il dettaglio, nel periodo scelto (predefinito: l'anno in corso).
 * - Due viste (decisione 11): approvata (predefinita) o provvisoria; righe in attesa e da valorizzare a parte.
 * - Euro (costi e stime in euro) solo a PM del progetto, PMSenior e controller (decisione 4).
 */
@Injectable()
export class ProgettiReportService {
  constructor(
    @InjectModel(Progetto.name) private readonly progetti: Model<Progetto>,
    @InjectModel(Attivita.name) private readonly attivita: Model<Attivita>,
    @InjectModel(Risorsa.name) private readonly risorse: Model<Risorsa>,
    @InjectModel(Ruolo.name) private readonly ruoli: Model<Ruolo>,
    @InjectModel(Cliente.name) private readonly clienti: Model<Cliente>,
    @InjectModel(CentroCosto.name) private readonly centri: Model<CentroCosto>,
    @InjectModel(TipologiaCosto.name) private readonly tipologie: Model<TipologiaCosto>,
    private readonly report: ReportService,
    private readonly permessi: PermessiService,
  ) {}

  /** GET /report/progetti: progetti visibili all'utente con stime, consuntivato dall'inizio e righe in attesa. */
  async elenco(utente: UtenteAutenticato | undefined, query: Record<string, unknown>) {
    this.permessi.verifica(utente, true, 'vedereReport');
    const vista = leggiVista(query.vista);
    const filtro: Record<string, unknown> = {};
    if (query.stato) {
      if (typeof query.stato !== 'string' || !STATI_PROGETTO.includes(query.stato)) throw new BadRequestException(`stato: uno tra ${STATI_PROGETTO.join(', ')}`);
      filtro.stato = query.stato;
    }
    if (!utente.ruoli.includes('controller') && !ePMSenior(utente)) {
      if (!utente.risorsaId) return this.vuoto(vista);
      filtro['approvatori.risorsaId'] = new mongoose.Types.ObjectId(utente.risorsaId);
    }
    if (typeof query.testo === 'string' && query.testo.trim()) {
      const re = new RegExp(query.testo.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filtro.$or = [{ codice: re }, { titolo: re }];
    }
    const progetti = await this.progetti.find(filtro).sort({ codice: 1 }).lean<ProgettoLetto[]>().exec();
    const ids = progetti.map((p) => p._id);
    const [totali, attese, clienti, centri, oreGiorno] = await Promise.all([
      ids.length ? this.report.totali({ progettoIds: ids }, vista, ['progettoId']) : [],
      ids.length ? this.report.inAttesa({ progettoIds: ids }, ['progettoId']) : [],
      this.clienti.find({ _id: { $in: progetti.map((p) => p.clienteId).filter(Boolean) } }, { codice: 1, ragioneSociale: 1 }).lean().exec(),
      this.centri.find({ _id: { $in: progetti.map((p) => p.centroCostoId) } }, { codice: 1, descrizione: 1 }).lean().exec(),
      this.report.oreGiorno(),
    ]);
    const perProgetto = (gruppi: ({ chiave: Partial<Record<Chiave, unknown>> } & Totali)[]) => new Map(gruppi.map((g) => [String(g.chiave.progettoId), g]));
    const tot = perProgetto(totali);
    const att = perProgetto(attese);
    const nc = new Map(clienti.map((c) => [String(c._id), c.ragioneSociale]));
    const ncdc = new Map(centri.map((c) => [String(c._id), c.codice]));
    return {
      vista,
      calcolatoIl: new Date(),
      progetti: progetti.map((p) => {
        const euro = vedeEuroProgetto(utente, p);
        const t = tot.get(String(p._id)) ?? totaliVuoti();
        const a = att.get(String(p._id));
        return {
          _id: String(p._id),
          codice: p.codice,
          titolo: p.titolo,
          cliente: p.clienteId ? (nc.get(String(p.clienteId)) ?? null) : null,
          centroCosto: ncdc.get(String(p.centroCostoId)) ?? null,
          stato: p.stato,
          dataInizio: p.dataInizio ?? null,
          dataFine: p.dataFine ?? null,
          percentualeCompletamento: p.percentualeCompletamento ?? 0,
          vedeEuro: euro,
          stime: this.stime(p, euro),
          consuntivato: this.totaliPresentati(t, oreGiorno, euro),
          inAttesa: { righe: a?.righe ?? 0, minuti: a?.minuti ?? 0, giorni: giorni(a?.minuti ?? 0, oreGiorno) },
        };
      }),
    };
  }

  /** GET /report/progetti/:id?da=&a=&vista=: scheda costi del progetto. */
  async scheda(utente: UtenteAutenticato | undefined, idGrezzo: string, query: Record<string, unknown>) {
    this.permessi.verifica(utente, true, 'vedereReport');
    const id = idRotta(idGrezzo);
    const p = id ? await this.progetti.findById(id).lean<ProgettoLetto>().exec() : null;
    if (!p) throw new NotFoundException('Progetto non trovato');
    if (!puoVedereReportProgetto(utente, p)) throw new ForbiddenException('Non hai il permesso di vedere i costi di questo progetto');
    const euro = vedeEuroProgetto(utente, p);
    const vista = leggiVista(query.vista);
    const oggi = oggiInItalia();
    const da = leggiData(query.da, 'da') ?? leggiData(`${oggi.slice(0, 4)}-01-01`, 'da', true)!;
    const a = leggiData(query.a, 'a') ?? leggiData(oggi, 'a', true)!;
    if (a < da || giorniTra(da, a) > 366 * 5) throw new BadRequestException('periodo: "a" non prima di "da", al massimo cinque anni');
    const oreGiorno = await this.report.oreGiorno();
    const tutto = { progettoIds: [p._id] };
    const periodo = { ...tutto, da, a };

    const [dallInizio, nelPeriodo, attesaTot, attesaPer, attivitaTot, attivitaPer, perRisorsaData, perTipologia, perMese, attivita, cliente, centro] =
      await Promise.all([
        this.report.totali(tutto, vista),
        this.report.totali(periodo, vista),
        this.report.inAttesa(tutto),
        this.report.inAttesa(periodo),
        this.report.totali(tutto, vista, ['attivitaId']),
        this.report.totali(periodo, vista, ['attivitaId']),
        this.report.totali(periodo, vista, ['risorsaId', 'data']),
        this.report.totali(periodo, vista, ['tipologiaId']),
        this.report.totali(periodo, vista, ['mese']),
        this.attivita.find({ progettoId: p._id }, { codice: 1, descrizione: 1, stato: 1, stimaGiorni: 1, percentualeCompletamento: 1, dataInizio: 1, dataFine: 1 }).sort({ codice: 1 }).lean().exec(),
        p.clienteId ? this.clienti.findById(p.clienteId, { codice: 1, ragioneSociale: 1 }).lean().exec() : null,
        this.centri.findById(p.centroCostoId, { codice: 1, descrizione: 1 }).lean().exec(),
      ]);
    const presenta = (t: Partial<Totali> | undefined) => this.totaliPresentati(t ?? totaliVuoti(), oreGiorno, euro);
    const attesa = (g: Totali[]) => ({ righe: g[0]?.righe ?? 0, minuti: g[0]?.minuti ?? 0, giorni: giorni(g[0]?.minuti ?? 0, oreGiorno) });

    // Per attività: dall'inizio (contro la stima) e nel periodo; "senza attività" per le ore sul progetto.
    const chiaveAttivita = (v: unknown) => (v ? String(v as Id) : '');
    const tot = new Map(attivitaTot.map((g) => [chiaveAttivita(g.chiave.attivitaId), g]));
    const per = new Map(attivitaPer.map((g) => [chiaveAttivita(g.chiave.attivitaId), g]));
    const voci: {
      attivitaId: string | null;
      codice: string;
      descrizione: string;
      stato: string;
      stimaGiorni: number | null;
      percentualeCompletamento: number;
      dallInizio: ReturnType<typeof presenta>;
      nelPeriodo: ReturnType<typeof presenta>;
    }[] = attivita.map((x) => ({
        attivitaId: String(x._id),
        codice: x.codice,
        descrizione: x.descrizione,
        stato: x.stato,
        stimaGiorni: x.stimaGiorni ?? null,
        percentualeCompletamento: x.percentualeCompletamento ?? 0,
        dallInizio: presenta(tot.get(String(x._id))),
        nelPeriodo: presenta(per.get(String(x._id))),
      }));
    if (tot.has('') || per.has('')) {
      voci.push({ attivitaId: null, codice: '', descrizione: 'Senza attività', stato: '', stimaGiorni: null, percentualeCompletamento: 0, dallInizio: presenta(tot.get('')), nelPeriodo: presenta(per.get('')) });
    }

    // Per risorsa e per ruolo (il ruolo alla data di ogni giornata).
    const idsRisorse = [...new Set(perRisorsaData.map((g) => String(g.chiave.risorsaId)))].map((x) => new mongoose.Types.ObjectId(x));
    const risorse = await this.risorse.find({ _id: { $in: idsRisorse } }, { nome: 1, cognome: 1, storicoRuoli: 1 }).lean().exec();
    const perId = new Map(risorse.map((r) => [String(r._id), r]));
    const perRisorsa = new Map<string, Totali>();
    const perRuolo = new Map<string, Totali>();
    const somma = (m: Map<string, Totali>, k: string, g: Totali) => {
      const t = m.get(k) ?? totaliVuoti();
      for (const c of ['righe', 'minuti', 'costoCentesimi', 'daValorizzare', 'minutiDaValorizzare'] as const) t[c] += g[c];
      m.set(k, t);
    };
    for (const g of perRisorsaData) {
      const r = perId.get(String(g.chiave.risorsaId));
      somma(perRisorsa, String(g.chiave.risorsaId), g);
      somma(perRuolo, ruoloAllaData(r?.storicoRuoli as never, g.chiave.data as Date) ?? '', g);
    }
    const [ruoli, tipologie] = await Promise.all([
      this.ruoli.find({ _id: { $in: [...perRuolo.keys()].filter(Boolean).map((x) => new mongoose.Types.ObjectId(x)) } }, { codice: 1, descrizione: 1 }).lean().exec(),
      this.tipologie.find({ _id: { $in: perTipologia.map((g) => g.chiave.tipologiaId) } }, { codice: 1, descrizione: 1, ordine: 1 }).lean().exec(),
    ]);
    const nr = new Map(ruoli.map((r) => [String(r._id), r]));
    const nt = new Map(tipologie.map((t) => [String(t._id), t]));
    const perMinuti = <T extends { minuti: number }>(xs: T[]) => xs.sort((x, y) => y.minuti - x.minuti);

    return {
      vista,
      calcolatoIl: new Date(),
      vedeEuro: euro,
      oreGiorno,
      periodo: { da, a },
      progetto: {
        _id: String(p._id),
        codice: p.codice,
        titolo: p.titolo,
        descrizione: p.descrizione ?? null,
        cliente: cliente ? cliente.ragioneSociale : null,
        centroCosto: centro ? `${centro.codice} — ${centro.descrizione}` : null,
        stato: p.stato,
        dataInizio: p.dataInizio ?? null,
        dataFine: p.dataFine ?? null,
        percentualeCompletamento: p.percentualeCompletamento ?? 0,
        // Per riferimento: media delle percentuali delle attività pesata sulla loro stima in giorni.
        percentualeAttivitaPesata: mediaPesata(attivita),
      },
      stime: this.stime(p, euro),
      dallInizio: presenta(dallInizio[0]),
      nelPeriodo: presenta(nelPeriodo[0]),
      inAttesa: { dallInizio: attesa(attesaTot), nelPeriodo: attesa(attesaPer) },
      perAttivita: voci,
      perRisorsa: perMinuti(
        [...perRisorsa.entries()].map(([k, t]) => {
          const r = perId.get(k);
          return { risorsaId: k, risorsa: r ? `${r.cognome} ${r.nome}`.trim() : '?', ...presenta(t) };
        }),
      ),
      perRuolo: perMinuti(
        [...perRuolo.entries()].map(([k, t]) => ({ ruoloId: k || null, ruolo: k ? (nr.get(k)?.descrizione ?? nr.get(k)?.codice ?? '?') : 'Senza ruolo', ...presenta(t) })),
      ),
      perTipologia: perTipologia
        .map((g) => ({ tipologiaId: String(g.chiave.tipologiaId), tipologia: nt.get(String(g.chiave.tipologiaId))?.descrizione ?? '?', ordine: nt.get(String(g.chiave.tipologiaId))?.ordine ?? 0, ...presenta(g) }))
        .sort((x, y) => x.ordine - y.ordine),
      perMese: perMese.map((g) => ({ mese: String(g.chiave.mese), ...presenta(g) })).sort((x, y) => x.mese.localeCompare(y.mese)),
    };
  }

  /** Totali con i giorni; il costo solo a chi vede gli euro. */
  private totaliPresentati(t: Partial<Totali>, oreGiorno: number, euro: boolean) {
    const base = {
      righe: t.righe ?? 0,
      minuti: t.minuti ?? 0,
      giorni: giorni(t.minuti ?? 0, oreGiorno),
      daValorizzare: t.daValorizzare ?? 0,
      minutiDaValorizzare: t.minutiDaValorizzare ?? 0,
    };
    return euro ? { ...base, costoCentesimi: t.costoCentesimi ?? 0 } : base;
  }

  /** Stime del progetto; quelle in euro solo a chi le vede. */
  private stime(p: ProgettoLetto, euro: boolean) {
    const s = p.stime ?? {};
    return {
      managerialeGiorni: s.managerialeGiorni ?? null,
      definitivaGiorni: s.definitivaGiorni ?? null,
      ...(euro ? { managerialeCentesimi: s.managerialeCentesimi ?? null, definitivaCentesimi: s.definitivaCentesimi ?? null } : {}),
    };
  }

  private vuoto(vista: Vista) {
    return { vista, calcolatoIl: new Date(), progetti: [] };
  }
}

/** Media delle percentuali delle attività pesata sulla stima in giorni; null se nessuna attività ha una stima. */
export function mediaPesata(attivita: { stimaGiorni?: number | null; percentualeCompletamento?: number | null }[]) {
  const conStima = attivita.filter((a) => (a.stimaGiorni ?? 0) > 0);
  const peso = conStima.reduce((s, a) => s + a.stimaGiorni!, 0);
  if (!peso) return null;
  return Math.round(conStima.reduce((s, a) => s + a.stimaGiorni! * (a.percentualeCompletamento ?? 0), 0) / peso);
}
