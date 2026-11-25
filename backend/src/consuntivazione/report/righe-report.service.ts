import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { type Model } from 'mongoose';
import type { UtenteAutenticato } from '../../auth/decoratori.js';
import { Utente } from '../../auth/utente.schema.js';
import { CentroCosto, Ruolo } from '../../comuni/schemi/anagrafiche.schema.js';
import { Attivita } from '../../comuni/schemi/progetto.schema.js';
import { Risorsa } from '../../comuni/schemi/risorsa.schema.js';
import { data as leggiData, objectId } from '../../comuni/validazione.js';
import { PermessiService } from '../../permessi/permessi.service.js';
import { vedeEuroProgetto } from '../../permessi/regole.js';
import { Consuntivo } from '../consuntivi/consuntivo.schema.js';
import { giorniTra, oggiInItalia } from '../consuntivi/regole-giornata.js';
import { ruoloAllaData } from '../tariffe/risoluzione.js';
import { TipologiaCosto } from '../tipologie/tipologia-costo.schema.js';
import { CostiReportService } from './costi-report.service.js';
import { type Colonna, type Esportazione, euroDaCentesimi, oreDecimali } from './esporta.js';
import { STATI_VISTA } from './viste.js';

type Id = mongoose.Types.ObjectId;
/** Righe di una sola estrazione: oltre, si chiede un periodo o un filtro più stretto. */
export const MAX_RIGHE = 100_000;
const ANTEPRIMA = 200;

interface RigaLetta {
  data: Date;
  risorsaId: Id;
  progettoId: Id;
  attivitaId: Id | null;
  centroCostoId: Id;
  tipologiaId: Id;
  minuti: number;
  nota: string | null;
  stato: string;
  tariffaCentesimiOra: number | null;
  costoCentesimi: number | null;
  approvazioneTL: { da: string; il: Date } | null;
  approvazionePM: { da: string; il: Date } | null;
}

function ids(valore: unknown, campo: string): Id[] | undefined {
  if (valore === undefined || valore === null || valore === '') return undefined;
  if (typeof valore !== 'string') throw new BadRequestException(`${campo}: id separati da virgola`);
  return valore.split(',').filter(Boolean).map((x) => objectId(x.trim(), campo, true)!);
}

/**
 * Righe di dettaglio (fase 4, blocco E6; decisione 7): le righe approvate dal PM e dei mesi chiusi, una per riga
 * di consuntivo, al massimo un anno per volta. Tariffa e costo solo sui progetti di cui l'utente vede gli euro.
 */
@Injectable()
export class RigheReportService {
  constructor(
    @InjectModel(Consuntivo.name) private readonly consuntivi: Model<Consuntivo>,
    @InjectModel(Risorsa.name) private readonly risorse: Model<Risorsa>,
    @InjectModel(Ruolo.name) private readonly ruoli: Model<Ruolo>,
    @InjectModel(Attivita.name) private readonly attivita: Model<Attivita>,
    @InjectModel(CentroCosto.name) private readonly centri: Model<CentroCosto>,
    @InjectModel(TipologiaCosto.name) private readonly tipologie: Model<TipologiaCosto>,
    @InjectModel(Utente.name) private readonly utenti: Model<Utente>,
    private readonly costi: CostiReportService,
    private readonly permessi: PermessiService,
  ) {}

  /** GET /report/righe?da=&a=&progetto=&centroCosto=&risorsa= (JSON: anteprima delle prime righe). */
  async righe(utente: UtenteAutenticato | undefined, query: Record<string, unknown>) {
    this.permessi.verifica(utente, true, 'vedereReport');
    const oggi = oggiInItalia();
    const da = leggiData(query.da, 'da') ?? leggiData(`${oggi.slice(0, 8)}01`, 'da', true)!;
    const a = leggiData(query.a, 'a') ?? leggiData(oggi, 'a', true)!;
    if (a < da || giorniTra(da, a) > 366) throw new BadRequestException('periodo: "a" non prima di "da", al massimo un anno');
    const filtroProgetti = ids(query.progetto, 'progetto');
    const filtroCdc = ids(query.centroCosto, 'centroCosto');
    const filtroRisorse = ids(query.risorsa, 'risorsa');

    const visibili = (await this.costi.progettiVisibili(utente)).filter(
      (p) => (!filtroProgetti || filtroProgetti.some((x) => x.equals(p._id))) && (!filtroCdc || filtroCdc.some((x) => x.equals(p.centroCostoId))),
    );
    const euroSu = new Set(visibili.filter((p) => vedeEuroProgetto(utente, p)).map((p) => String(p._id)));
    const vedeEuro = euroSu.size > 0;
    const base = { periodo: { da, a }, vedeEuro, euroInParte: vedeEuro && euroSu.size < visibili.length, estrattoIl: new Date() };
    if (!visibili.length) return { ...base, totale: 0, righe: [] as ReturnType<RigheReportService['presenta']>[] };

    const condizione = { 'righe.stato': { $in: STATI_VISTA.approvata }, 'righe.progettoId': { $in: visibili.map((p) => p._id) } };
    const lette = await this.consuntivi
      .aggregate<RigaLetta>([
        { $match: { data: { $gte: da, $lte: a }, ...(filtroRisorse ? { risorsaId: { $in: filtroRisorse } } : {}), ...condizione } },
        { $unwind: '$righe' },
        { $match: condizione },
        { $sort: { data: 1, risorsaId: 1 } },
        { $limit: MAX_RIGHE + 1 },
        {
          $project: {
            _id: 0,
            data: 1,
            risorsaId: 1,
            progettoId: '$righe.progettoId',
            attivitaId: '$righe.attivitaId',
            centroCostoId: '$righe.centroCostoId',
            tipologiaId: '$righe.tipologiaId',
            minuti: '$righe.minuti',
            nota: '$righe.nota',
            stato: '$righe.stato',
            tariffaCentesimiOra: '$righe.tariffaCentesimiOra',
            costoCentesimi: '$righe.costoCentesimi',
            approvazioneTL: '$righe.approvazioneTL',
            approvazionePM: '$righe.approvazionePM',
          },
        },
      ])
      .exec();
    if (lette.length > MAX_RIGHE) throw new BadRequestException(`Più di ${MAX_RIGHE.toLocaleString('it-IT')} righe: restringi il periodo o i filtri`);

    const unici = (f: (r: RigaLetta) => Id | null) => [...new Set(lette.map(f).filter(Boolean).map(String))].map((x) => new mongoose.Types.ObjectId(x));
    const approvatori = [...new Set(lette.flatMap((r) => [r.approvazioneTL?.da, r.approvazionePM?.da]).filter((x): x is string => !!x && mongoose.isValidObjectId(x)))];
    const [risorse, attivita, centri, tipologie, utenti] = await Promise.all([
      this.risorse.find({ _id: { $in: unici((r) => r.risorsaId) } }, { nome: 1, cognome: 1, storicoRuoli: 1 }).lean().exec(),
      this.attivita.find({ _id: { $in: unici((r) => r.attivitaId) } }, { codice: 1, descrizione: 1 }).lean().exec(),
      this.centri.find({ _id: { $in: unici((r) => r.centroCostoId) } }, { codice: 1 }).lean().exec(),
      this.tipologie.find({ _id: { $in: unici((r) => r.tipologiaId) } }, { codice: 1, descrizione: 1 }).lean().exec(),
      this.utenti.find({ _id: { $in: approvatori.map((x) => new mongoose.Types.ObjectId(x)) } }, { email: 1 }).lean().exec(),
    ]);
    const ruoliIds = new Set<string>();
    const risorsa = new Map(risorse.map((r) => [String(r._id), r]));
    const ruoloDi = (r: RigaLetta) => {
      const id = ruoloAllaData(risorsa.get(String(r.risorsaId))?.storicoRuoli as never, r.data);
      if (id) ruoliIds.add(id);
      return id;
    };
    const ruoliRighe = lette.map(ruoloDi);
    const ruoli = new Map((await this.ruoli.find({ _id: { $in: [...ruoliIds].map((x) => new mongoose.Types.ObjectId(x)) } }, { descrizione: 1, codice: 1 }).lean().exec()).map((r) => [String(r._id), r.descrizione || r.codice]));
    const nomi = {
      progetto: new Map(visibili.map((p) => [String(p._id), p.codice])),
      titolo: new Map(visibili.map((p) => [String(p._id), p.titolo])),
      attivita: new Map(attivita.map((x) => [String(x._id), `${x.codice} — ${x.descrizione}`])),
      cdc: new Map(centri.map((c) => [String(c._id), c.codice])),
      tipologia: new Map(tipologie.map((t) => [String(t._id), t.descrizione])),
      utente: new Map(utenti.map((u) => [String(u._id), u.email])),
    };
    const righe = lette.map((r, i) => this.presenta(r, ruoliRighe[i] ? (ruoli.get(ruoliRighe[i]!) ?? '?') : '', nomi, risorsa, euroSu.has(String(r.progettoId))));
    return { ...base, totale: righe.length, righe };
  }

  private presenta(
    r: RigaLetta,
    ruolo: string,
    n: Record<'progetto' | 'titolo' | 'attivita' | 'cdc' | 'tipologia' | 'utente', Map<string, string>>,
    risorse: Map<string, { nome?: string; cognome?: string }>,
    euro: boolean,
  ) {
    const ris = risorse.get(String(r.risorsaId));
    const chi = (a: { da: string } | null) => (a ? (n.utente.get(a.da) ?? a.da) : null);
    return {
      data: r.data,
      risorsa: ris ? `${ris.cognome} ${ris.nome}`.trim() : '?',
      ruolo,
      progetto: n.progetto.get(String(r.progettoId)) ?? '?',
      titoloProgetto: n.titolo.get(String(r.progettoId)) ?? '',
      attivita: r.attivitaId ? (n.attivita.get(String(r.attivitaId)) ?? '?') : '',
      centroCosto: n.cdc.get(String(r.centroCostoId)) ?? '?',
      tipologia: n.tipologia.get(String(r.tipologiaId)) ?? '?',
      minuti: r.minuti,
      nota: r.nota ?? '',
      stato: r.stato,
      approvataTLDa: chi(r.approvazioneTL),
      approvataTLIl: r.approvazioneTL?.il ?? null,
      approvataPMDa: chi(r.approvazionePM),
      approvataPMIl: r.approvazionePM?.il ?? null,
      ...(euro ? { tariffaCentesimiOra: r.tariffaCentesimiOra, costoCentesimi: r.costoCentesimi } : {}),
    };
  }

  /** Risposta JSON: le prime righe come anteprima. */
  anteprima(r: Awaited<ReturnType<RigheReportService['righe']>>) {
    return { ...r, righe: r.righe.slice(0, ANTEPRIMA), troncato: r.righe.length > ANTEPRIMA };
  }

  esportazione(r: Awaited<ReturnType<RigheReportService['righe']>>): Esportazione {
    const colonne: Colonna[] = [
      { titolo: 'Data', tipo: 'data', larghezza: 12 },
      { titolo: 'Risorsa', tipo: 'testo', larghezza: 24 },
      { titolo: 'Ruolo', tipo: 'testo', larghezza: 22 },
      { titolo: 'Progetto', tipo: 'testo', larghezza: 12 },
      { titolo: 'Titolo del progetto', tipo: 'testo', larghezza: 30 },
      { titolo: 'Attività', tipo: 'testo', larghezza: 26 },
      { titolo: 'Centro di costo', tipo: 'testo', larghezza: 14 },
      { titolo: 'Tipologia', tipo: 'testo', larghezza: 20 },
      { titolo: 'Ore', tipo: 'ore', larghezza: 8 },
      ...(r.vedeEuro ? ([{ titolo: 'Tariffa (€/h)', tipo: 'euro' }, { titolo: 'Costo', tipo: 'euro' }] as Colonna[]) : []),
      { titolo: 'Nota', tipo: 'testo', larghezza: 30 },
      { titolo: 'Stato', tipo: 'testo', larghezza: 12 },
      { titolo: 'Via libera TL', tipo: 'testo', larghezza: 22 },
      { titolo: 'Via libera TL il', tipo: 'dataOra', larghezza: 16 },
      { titolo: 'Approvata da', tipo: 'testo', larghezza: 22 },
      { titolo: 'Approvata il', tipo: 'dataOra', larghezza: 16 },
    ];
    const righe = r.righe.map((x) => {
      const e = x as typeof x & { tariffaCentesimiOra?: number | null; costoCentesimi?: number | null };
      return [
        x.data,
        x.risorsa,
        x.ruolo,
        x.progetto,
        x.titoloProgetto,
        x.attivita,
        x.centroCosto,
        x.tipologia,
        oreDecimali(x.minuti),
        ...(r.vedeEuro ? [euroDaCentesimi(e.tariffaCentesimiOra), euroDaCentesimi(e.costoCentesimi)] : []),
        x.nota,
        x.stato === 'chiusa' ? 'Chiusa' : 'Approvata',
        x.approvataTLDa,
        x.approvataTLIl,
        x.approvataPMDa,
        x.approvataPMIl,
      ];
    });
    const giorno = (d: Date) => d.toLocaleDateString('it-IT', { timeZone: 'UTC' });
    return {
      titolo: 'Righe di dettaglio',
      base: 'righe',
      vista: 'approvata',
      note: [
        `Periodo: dal ${giorno(r.periodo.da)} al ${giorno(r.periodo.a)}`,
        `${r.totale} righe${r.euroInParte ? '; tariffa e costo solo sui progetti di cui vedi gli importi' : ''}`,
      ],
      estrattoIl: r.estrattoIl,
      fogli: [{ nome: 'Righe', colonne, righe }],
    };
  }
}
