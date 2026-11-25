import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { type Model } from 'mongoose';
import type { UtenteAutenticato } from '../../auth/decoratori.js';
import { Risorsa } from '../../comuni/schemi/risorsa.schema.js';
import { objectId } from '../../comuni/validazione.js';
import { PermessiService } from '../../permessi/permessi.service.js';
import { oggiInItalia } from '../consuntivi/regole-giornata.js';
import { CostiReportService } from './costi-report.service.js';
import { giorniLavorativi, mesiTra, minutiPianificati, scostamento } from './pianificato-regole.js';
import { ReportService } from './report.service.js';

type Id = mongoose.Types.ObjectId;
const MAX_MESI = 24;

interface Celle {
  pianificati: number;
  consuntivati: number;
  inAttesa: number;
}
const vuote = (): Celle => ({ pianificati: 0, consuntivati: 0, inAttesa: 0 });
const aggiungi = (a: Celle, b: Celle) => {
  a.pianificati += b.pianificati;
  a.consuntivati += b.consuntivati;
  a.inAttesa += b.inAttesa;
};
const conScostamento = (c: Celle) => ({ ...c, scostamento: scostamento(c.pianificati, c.consuntivati) });

function mese(valore: unknown, campo: string): string | undefined {
  if (valore === undefined || valore === null || valore === '') return undefined;
  if (typeof valore !== 'string' || !/^\d{4}(0[1-9]|1[0-2])$/.test(valore)) throw new BadRequestException(`${campo}: mese nel formato AAAAMM`);
  return valore;
}

function ids(valore: unknown, campo: string): Id[] | undefined {
  if (valore === undefined || valore === null || valore === '') return undefined;
  if (typeof valore !== 'string') throw new BadRequestException(`${campo}: id separati da virgola`);
  return valore.split(',').filter(Boolean).map((x) => objectId(x.trim(), campo, true)!);
}

/**
 * Pianificato e consuntivato (fase 4, blocco E5; decisioni 2 e 3): per risorsa, mese e progetto le ore pianificate
 * nel Pianificatore contro le ore approvate, con le ore ancora in attesa a parte e lo scostamento. Solo ore, niente euro.
 * Visibilità come il report dei costi: controller e PMSenior tutto, TL e PM i propri progetti.
 */
@Injectable()
export class PianificatoReportService {
  constructor(
    @InjectModel(Risorsa.name) private readonly risorse: Model<Risorsa>,
    private readonly costi: CostiReportService,
    private readonly report: ReportService,
    private readonly permessi: PermessiService,
  ) {}

  /** GET /report/pianificato?da=AAAAMM&a=AAAAMM&risorsa=&progetto= */
  async pianificato(utente: UtenteAutenticato | undefined, query: Record<string, unknown>) {
    this.permessi.verifica(utente, true, 'vedereReport');
    const corrente = oggiInItalia().slice(0, 7).replace('-', '');
    const da = mese(query.da, 'da') ?? corrente;
    const a = mese(query.a, 'a') ?? da;
    const mesi = mesiTra(da, a);
    if (!mesi.length || mesi.length > MAX_MESI) throw new BadRequestException(`periodo: "a" non prima di "da", al massimo ${MAX_MESI} mesi`);
    const filtroRisorse = ids(query.risorsa, 'risorsa');
    const filtroProgetti = ids(query.progetto, 'progetto');

    const visibili = await this.costi.progettiVisibili(utente);
    const compresi = visibili.filter((p) => !filtroProgetti || filtroProgetti.some((x) => x.equals(p._id)));
    const idsProgetti = compresi.map((p) => p._id);
    const oreGiorno = await this.report.oreGiorno();
    const base = {
      periodo: { da, a },
      mesi,
      oreGiorno,
      calcolatoIl: new Date(),
      opzioni: { progetti: visibili.map((p) => ({ _id: String(p._id), etichetta: `${p.codice} — ${p.titolo}` })), risorse: [] as { _id: string; etichetta: string }[] },
    };
    if (!idsProgetti.length) return { ...base, totali: conScostamento(vuote()), risorse: [] };

    const primo = new Date(`${da.slice(0, 4)}-${da.slice(4)}-01T00:00:00.000Z`);
    const ultimo = new Date(Date.UTC(+a.slice(0, 4), +a.slice(4), 0));
    const filtro = { progettoIds: idsProgetti, ...(filtroRisorse ? { risorsaIds: filtroRisorse } : {}), da: primo, a: ultimo };
    const chiavi = ['risorsaId', 'progettoId', 'mese'] as const;
    const [approvate, attese, allocate] = await Promise.all([
      this.report.totali(filtro, 'approvata', [...chiavi]),
      this.report.inAttesa(filtro, [...chiavi]),
      this.risorse
        .find(
          {
            ...(filtroRisorse ? { _id: { $in: filtroRisorse } } : {}),
            planned: { $elemMatch: { mese: { $gte: da, $lte: a }, progettoId: { $in: idsProgetti }, percentualeAllocazione: { $gt: 0 } } },
          },
          { nome: 1, cognome: 1, oreContrattualiGiorno: 1, dataIngresso: 1, dataUscita: 1, planned: 1 },
        )
        .lean()
        .exec(),
    ]);

    // Celle per risorsa | progetto | mese.
    const celle = new Map<string, Celle & { percentuale: number | null }>();
    const cella = (r: string, p: string, m: string) => {
      const k = `${r}|${p}|${m}`;
      if (!celle.has(k)) celle.set(k, { ...vuote(), percentuale: null });
      return celle.get(k)!;
    };
    const visibile = new Set(idsProgetti.map(String));
    const infoRisorse = new Map<string, { nome: string; oreGiorno: number; ingresso?: Date | null; uscita?: Date | null }>();
    for (const r of allocate) {
      const ore = r.oreContrattualiGiorno ?? oreGiorno;
      infoRisorse.set(String(r._id), { nome: `${r.cognome} ${r.nome}`.trim(), oreGiorno: ore, ingresso: r.dataIngresso, uscita: r.dataUscita });
      for (const al of r.planned ?? []) {
        if (!al.progettoId || !visibile.has(String(al.progettoId)) || al.mese < da || al.mese > a || !(al.percentualeAllocazione ?? 0)) continue;
        const c = cella(String(r._id), String(al.progettoId), al.mese);
        c.percentuale = (c.percentuale ?? 0) + al.percentualeAllocazione!;
        c.pianificati += minutiPianificati(al.percentualeAllocazione!, giorniLavorativi(al.mese, r.dataIngresso, r.dataUscita), ore);
      }
    }
    for (const g of approvate) cella(String(g.chiave.risorsaId as Id), String(g.chiave.progettoId as Id), String(g.chiave.mese)).consuntivati += g.minuti;
    for (const g of attese) cella(String(g.chiave.risorsaId as Id), String(g.chiave.progettoId as Id), String(g.chiave.mese)).inAttesa += g.minuti;

    // Nomi delle risorse che hanno solo ore consuntivate.
    const mancanti = [...new Set([...celle.keys()].map((k) => k.split('|')[0]))].filter((r) => !infoRisorse.has(r));
    if (mancanti.length) {
      for (const r of await this.risorse.find({ _id: { $in: mancanti.map((x) => new mongoose.Types.ObjectId(x)) } }, { nome: 1, cognome: 1, oreContrattualiGiorno: 1, dataIngresso: 1, dataUscita: 1 }).lean().exec()) {
        infoRisorse.set(String(r._id), { nome: `${r.cognome} ${r.nome}`.trim(), oreGiorno: r.oreContrattualiGiorno ?? oreGiorno, ingresso: r.dataIngresso, uscita: r.dataUscita });
      }
    }

    const nomeProgetto = new Map(compresi.map((p) => [String(p._id), `${p.codice} — ${p.titolo}`]));
    const perRisorsa = new Map<string, Map<string, Map<string, Celle & { percentuale: number | null }>>>();
    for (const [k, c] of celle) {
      const [r, p, m] = k.split('|');
      if (!perRisorsa.has(r)) perRisorsa.set(r, new Map());
      const mm = perRisorsa.get(r)!;
      if (!mm.has(m)) mm.set(m, new Map());
      mm.get(m)!.set(p, c);
    }
    const totali = vuote();
    const risorse = [...perRisorsa.entries()]
      .map(([r, perMese]) => {
        const info = infoRisorse.get(r);
        const totRisorsa = vuote();
        const voceMesi = mesi.map((m) => {
          const progetti = [...(perMese.get(m)?.entries() ?? [])]
            .map(([p, c]) => ({
              progettoId: p,
              progetto: nomeProgetto.get(p) ?? '?',
              percentuale: c.percentuale,
              ...conScostamento(c),
              // Ore su un progetto su cui la risorsa non era allocata nel mese.
              nonAllocato: c.pianificati === 0 && c.consuntivati + c.inAttesa > 0,
            }))
            .sort((x, y) => x.progetto.localeCompare(y.progetto, 'it'));
          const tot = vuote();
          for (const p of progetti) aggiungi(tot, p);
          aggiungi(totRisorsa, tot);
          return { mese: m, giorniLavorativi: giorniLavorativi(m, info?.ingresso, info?.uscita), ...conScostamento(tot), progetti };
        });
        aggiungi(totali, totRisorsa);
        return { risorsaId: r, risorsa: info?.nome ?? '?', oreGiorno: info?.oreGiorno ?? oreGiorno, ...conScostamento(totRisorsa), mesi: voceMesi };
      })
      .sort((x, y) => x.risorsa.localeCompare(y.risorsa, 'it'));

    return {
      ...base,
      opzioni: { ...base.opzioni, risorse: risorse.map((r) => ({ _id: r.risorsaId, etichetta: r.risorsa })) },
      totali: conScostamento(totali),
      risorse,
    };
  }
}
