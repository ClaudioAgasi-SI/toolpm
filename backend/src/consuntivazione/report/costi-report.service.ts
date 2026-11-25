import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { type Model } from 'mongoose';
import type { UtenteAutenticato } from '../../auth/decoratori.js';
import { CentroCosto, Cliente, Ruolo } from '../../comuni/schemi/anagrafiche.schema.js';
import { Attivita, Progetto } from '../../comuni/schemi/progetto.schema.js';
import { Risorsa } from '../../comuni/schemi/risorsa.schema.js';
import { data as leggiData, objectId } from '../../comuni/validazione.js';
import { PermessiService } from '../../permessi/permessi.service.js';
import { ePMSenior, type ProgettoPerPermessi, vedeEuroProgetto } from '../../permessi/regole.js';
import { giorniTra, oggiInItalia } from '../consuntivi/regole-giornata.js';
import { ruoloAllaData } from '../tariffe/risoluzione.js';
import { TipologiaCosto } from '../tipologie/tipologia-costo.schema.js';
import { costruisciAlbero, type Foglia, leggiLivelli, type Livello, type NodoGrezzo } from './costi-albero.js';
import { type Chiave, ReportService } from './report.service.js';
import { giorni, leggiVista, type Totali } from './viste.js';

type Id = mongoose.Types.ObjectId;
type ProgettoLetto = ProgettoPerPermessi & { _id: Id; codice: string; titolo: string; clienteId?: Id; centroCostoId: Id; stato: string };

/** Chiavi di aggregazione che servono a ogni livello (il ruolo si ricava da risorsa e giorno). */
const CHIAVI: Record<Livello, Chiave[]> = {
  cdc: ['centroCostoId'],
  progetto: ['progettoId'],
  attivita: ['attivitaId', 'progettoId'],
  risorsa: ['risorsaId'],
  ruolo: ['risorsaId', 'data'],
  tipologia: ['tipologiaId'],
  mese: ['mese'],
};

const testoId = (v: unknown) => (v ? String(v as Id) : '');

const nomeMese = (m: string) => {
  const t = new Date(Date.UTC(+m.slice(0, 4), +m.slice(4) - 1, 1)).toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Un elenco di id separati da virgola (o un id solo). */
function idDaQuery(valore: unknown, campo: string): Id[] | undefined {
  if (valore === undefined || valore === null || valore === '') return undefined;
  if (typeof valore !== 'string') throw new BadRequestException(`${campo}: id separati da virgola`);
  return valore.split(',').filter(Boolean).map((x) => objectId(x.trim(), campo, true)!);
}

/**
 * Report dei costi (fase 4, blocco E4; RF-21, RF-22): ore, giorni e costi del periodo annidati per i livelli
 * scelti, con i totali di ogni livello e le righe da valorizzare. Controller e PMSenior vedono tutto, TL e PM
 * i propri progetti; gli euro solo se l'utente li vede su tutti i progetti compresi (decisione 4).
 */
@Injectable()
export class CostiReportService {
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

  /** Progetti che l'utente può vedere nei report. */
  async progettiVisibili(utente: UtenteAutenticato): Promise<ProgettoLetto[]> {
    const filtro: Record<string, unknown> = {};
    if (!utente.ruoli.includes('controller') && !ePMSenior(utente)) {
      if (!utente.risorsaId) return [];
      filtro['approvatori.risorsaId'] = new mongoose.Types.ObjectId(utente.risorsaId);
    }
    return this.progetti.find(filtro, { codice: 1, titolo: 1, clienteId: 1, centroCostoId: 1, stato: 1, approvatori: 1 }).sort({ codice: 1 }).lean<ProgettoLetto[]>().exec();
  }

  /** GET /report/costi?da=&a=&raggruppa=&centroCosto=&cliente=&progetto=&vista= */
  async costi(utente: UtenteAutenticato | undefined, query: Record<string, unknown>) {
    this.permessi.verifica(utente, true, 'vedereReport');
    const vista = leggiVista(query.vista);
    const livelli = leggiLivelli(query.raggruppa);
    const oggi = oggiInItalia();
    const da = leggiData(query.da, 'da') ?? leggiData(`${oggi.slice(0, 8)}01`, 'da', true)!;
    const a = leggiData(query.a, 'a') ?? leggiData(oggi, 'a', true)!;
    if (a < da || giorniTra(da, a) > 366 * 5) throw new BadRequestException('periodo: "a" non prima di "da", al massimo cinque anni');
    const filtroCdc = idDaQuery(query.centroCosto, 'centroCosto');
    const filtroClienti = idDaQuery(query.cliente, 'cliente');
    const filtroProgetti = idDaQuery(query.progetto, 'progetto');

    const visibili = await this.progettiVisibili(utente);
    const compresi = visibili.filter(
      (p) =>
        (!filtroCdc || filtroCdc.some((x) => x.equals(p.centroCostoId))) &&
        (!filtroClienti || filtroClienti.some((x) => p.clienteId && x.equals(p.clienteId))) &&
        (!filtroProgetti || filtroProgetti.some((x) => x.equals(p._id))),
    );
    // Euro solo se l'utente li vede su ogni progetto compreso: altrimenti un totale li rivelerebbe.
    const vedeEuro = compresi.length > 0 && compresi.every((p) => vedeEuroProgetto(utente, p));
    const euroNascostiInParte = !vedeEuro && compresi.some((p) => vedeEuroProgetto(utente, p));
    const [opzioni, oreGiorno] = await Promise.all([this.opzioni(visibili), this.report.oreGiorno()]);
    const base = { vista, calcolatoIl: new Date(), periodo: { da, a }, livelli, vedeEuro, euroNascostiInParte, oreGiorno, opzioni };
    if (!compresi.length) return { ...base, totali: this.presenta(costruisciAlbero([], livelli).totali, oreGiorno, vedeEuro), inAttesa: { righe: 0, minuti: 0, giorni: 0 }, righe: [] };

    const filtro = { progettoIds: compresi.map((p) => p._id), ...(filtroCdc ? { centroCostoIds: filtroCdc } : {}), da, a };
    const chiavi = [...new Set(livelli.flatMap((l) => CHIAVI[l]))];
    const [gruppi, attesa] = await Promise.all([this.report.totali(filtro, vista, chiavi), this.report.inAttesa(filtro)]);

    // Ruolo alla data di ogni giornata (solo se serve).
    const storici = new Map<string, unknown>();
    if (livelli.includes('ruolo')) {
      const ids = [...new Set(gruppi.map((g) => testoId(g.chiave.risorsaId)))].map((x) => new mongoose.Types.ObjectId(x));
      for (const r of await this.risorse.find({ _id: { $in: ids } }, { storicoRuoli: 1 }).lean().exec()) storici.set(String(r._id), r.storicoRuoli);
    }
    const valore: Record<Livello, (g: (typeof gruppi)[number]) => string> = {
      cdc: (g) => testoId(g.chiave.centroCostoId),
      progetto: (g) => testoId(g.chiave.progettoId),
      attivita: (g) => (g.chiave.attivitaId ? testoId(g.chiave.attivitaId) : `senza:${testoId(g.chiave.progettoId)}`),
      risorsa: (g) => testoId(g.chiave.risorsaId),
      ruolo: (g) => ruoloAllaData(storici.get(testoId(g.chiave.risorsaId)) as never, g.chiave.data as Date) ?? '',
      tipologia: (g) => testoId(g.chiave.tipologiaId),
      mese: (g) => String(g.chiave.mese),
    };
    const foglie: Foglia[] = gruppi.map((g) => ({ valori: Object.fromEntries(livelli.map((l) => [l, valore[l](g)])), totali: g }));
    const albero = costruisciAlbero(foglie, livelli);
    const etichette = await this.etichette(albero.figli, compresi);

    const presentaNodo = (n: NodoGrezzo, sopra: Set<Livello>): object => {
      const e = etichette(n, sopra);
      const sotto = new Set(sopra).add(n.livello);
      return {
        livello: n.livello,
        chiave: n.chiave,
        etichetta: e.etichetta,
        ...(e.progettoId ? { progettoId: e.progettoId } : {}),
        ...this.presenta(n.totali, oreGiorno, vedeEuro),
        figli: this.ordina(n.figli, etichette, sopra).map((f) => presentaNodo(f, sotto)),
      };
    };
    const a0 = attesa[0];
    return {
      ...base,
      totali: this.presenta(albero.totali, oreGiorno, vedeEuro),
      inAttesa: { righe: a0?.righe ?? 0, minuti: a0?.minuti ?? 0, giorni: giorni(a0?.minuti ?? 0, oreGiorno) },
      righe: this.ordina(albero.figli, etichette, new Set()).map((n) => presentaNodo(n, new Set())),
    };
  }

  private presenta(t: Totali, oreGiorno: number, euro: boolean) {
    const base = { righe: t.righe, minuti: t.minuti, giorni: giorni(t.minuti, oreGiorno), daValorizzare: t.daValorizzare, minutiDaValorizzare: t.minutiDaValorizzare };
    return euro ? { ...base, costoCentesimi: t.costoCentesimi } : base;
  }

  /** Ordine: mesi in ordine di tempo, tipologie per ordine, il resto per etichetta; le voci "senza" in fondo. */
  private ordina(nodi: NodoGrezzo[], etichette: (n: NodoGrezzo, sopra: Set<Livello>) => { etichetta: string; ordine: string }, sopra: Set<Livello>) {
    return [...nodi].sort((x, y) => etichette(x, sopra).ordine.localeCompare(etichette(y, sopra).ordine, 'it'));
  }

  /** Nomi leggibili di ogni voce, letti una volta sola. */
  private async etichette(nodi: NodoGrezzo[], progetti: ProgettoLetto[]) {
    const chiavi = new Map<Livello, Set<string>>();
    const visita = (ns: NodoGrezzo[]) => {
      for (const n of ns) {
        if (!chiavi.has(n.livello)) chiavi.set(n.livello, new Set());
        chiavi.get(n.livello)!.add(n.chiave);
        visita(n.figli);
      }
    };
    visita(nodi);
    const ids = (l: Livello) => [...(chiavi.get(l) ?? [])].filter((k) => mongoose.isValidObjectId(k)).map((k) => new mongoose.Types.ObjectId(k));
    const [centri, attivita, risorse, ruoli, tipologie] = await Promise.all([
      this.centri.find({ _id: { $in: ids('cdc') } }, { codice: 1, descrizione: 1 }).lean().exec(),
      this.attivita.find({ _id: { $in: ids('attivita') } }, { codice: 1, descrizione: 1, progettoId: 1 }).lean().exec(),
      this.risorse.find({ _id: { $in: ids('risorsa') } }, { nome: 1, cognome: 1 }).lean().exec(),
      this.ruoli.find({ _id: { $in: ids('ruolo') } }, { codice: 1, descrizione: 1 }).lean().exec(),
      this.tipologie.find({ _id: { $in: ids('tipologia') } }, { codice: 1, descrizione: 1, ordine: 1 }).lean().exec(),
    ]);
    const prog = new Map(progetti.map((p) => [String(p._id), p]));
    const cdc = new Map(centri.map((c) => [String(c._id), `${c.codice} — ${c.descrizione}`]));
    const att = new Map(attivita.map((x) => [String(x._id), x]));
    const ris = new Map(risorse.map((r) => [String(r._id), `${r.cognome} ${r.nome}`.trim()]));
    const ruo = new Map(ruoli.map((r) => [String(r._id), r.descrizione || r.codice]));
    const tip = new Map(tipologie.map((t) => [String(t._id), t]));
    const z = 'zzzz';

    return (n: NodoGrezzo, sopra: Set<Livello>): { etichetta: string; ordine: string; progettoId?: string } => {
      switch (n.livello) {
        case 'cdc':
          return { etichetta: cdc.get(n.chiave) ?? '?', ordine: cdc.get(n.chiave) ?? z };
        case 'progetto': {
          const p = prog.get(n.chiave);
          return { etichetta: p ? `${p.codice} — ${p.titolo}` : '?', ordine: p?.codice ?? z, progettoId: n.chiave };
        }
        case 'attivita': {
          const conProgetto = !sopra.has('progetto');
          if (n.chiave.startsWith('senza:')) {
            const p = prog.get(n.chiave.slice(6));
            return { etichetta: conProgetto && p ? `${p.codice} › senza attività` : 'Senza attività (ore sul progetto)', ordine: `${conProgetto ? (p?.codice ?? '') : ''}${z}` };
          }
          const x = att.get(n.chiave);
          const p = x ? prog.get(String(x.progettoId)) : undefined;
          const nome = x ? `${x.codice} — ${x.descrizione}` : '?';
          return { etichetta: conProgetto && p ? `${p.codice} › ${nome}` : nome, ordine: `${conProgetto ? (p?.codice ?? '') : ''} ${x?.codice ?? z}` };
        }
        case 'risorsa':
          return { etichetta: ris.get(n.chiave) ?? '?', ordine: ris.get(n.chiave) ?? z };
        case 'ruolo':
          return n.chiave ? { etichetta: ruo.get(n.chiave) ?? '?', ordine: ruo.get(n.chiave) ?? z } : { etichetta: 'Senza ruolo', ordine: z };
        case 'tipologia': {
          const t = tip.get(n.chiave);
          return { etichetta: t?.descrizione ?? '?', ordine: String(t?.ordine ?? 999).padStart(4, '0') };
        }
        case 'mese':
          return { etichetta: nomeMese(n.chiave), ordine: n.chiave };
      }
    };
  }

  /** Valori dei filtri: centri di costo, clienti e progetti tra quelli visibili. */
  private async opzioni(visibili: ProgettoLetto[]) {
    const [centri, clienti] = await Promise.all([
      this.centri.find({ _id: { $in: visibili.map((p) => p.centroCostoId) } }, { codice: 1, descrizione: 1 }).sort({ codice: 1 }).lean().exec(),
      this.clienti.find({ _id: { $in: visibili.map((p) => p.clienteId).filter(Boolean) } }, { codice: 1, ragioneSociale: 1 }).sort({ ragioneSociale: 1 }).lean().exec(),
    ]);
    return {
      centriCosto: centri.map((c) => ({ _id: String(c._id), etichetta: `${c.codice} — ${c.descrizione}` })),
      clienti: clienti.map((c) => ({ _id: String(c._id), etichetta: c.ragioneSociale })),
      progetti: visibili.map((p) => ({ _id: String(p._id), etichetta: `${p.codice} — ${p.titolo}`, stato: p.stato })),
    };
  }
}
