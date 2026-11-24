import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import mongoose, { type Connection, type Model } from 'mongoose';
import type { UtenteAutenticato } from '../../auth/decoratori.js';
import { Ruolo } from '../../comuni/schemi/anagrafiche.schema.js';
import { Attivita, Progetto } from '../../comuni/schemi/progetto.schema.js';
import { Risorsa } from '../../comuni/schemi/risorsa.schema.js';
import { booleano, corpo, data as leggiData, objectId } from '../../comuni/validazione.js';
import { Consuntivo, type RigaConsuntivo } from '../consuntivi/consuntivo.schema.js';
import { giorniTra, testoData } from '../consuntivi/regole-giornata.js';
import { PeriodiService } from '../periodi/periodi.service.js';
import { costoCentesimi } from '../tariffe/risoluzione.js';
import { type Risolutore, TariffeService } from '../tariffe/tariffe.service.js';
import { TipologiaCosto } from '../tipologie/tipologia-costo.schema.js';

type Id = mongoose.Types.ObjectId;
type RigaSalvata = RigaConsuntivo & { _id: Id };
type GiornataDb = { _id: Id; risorsaId: Id; data: Date; mese: string; versione: number; righe: RigaSalvata[] };

/** Al massimo un anno per volta. */
const MAX_GIORNI = 366;
/** Righe elencate nell'anteprima del ricalcolo (i totali contano tutte). */
const MAX_ELENCO = 1000;
/** Le righe di un periodo chiuso (fase 3) non si ricalcolano. */
const NON_RICALCOLABILI = ['chiusa'];

export interface Valori {
  fonte: string | null;
  tariffaId: string | null;
  centesimiOra: number | null;
  costo: number | null;
}

/**
 * Righe da valorizzare e ricalcolo dei costi (fase 2, blocco C6). Solo controller (gestireTariffe).
 * - Da valorizzare: righe senza costo, con il motivo (ruolo mancante alla data, nessuna tariffa, oppure
 *   tariffa ora disponibile e basta ricalcolare).
 * - Ricalcolo: per ogni riga del periodo (escluse quelle chiuse) risolve di nuovo la tariffa alla data; con
 *   conferma: false restituisce l'anteprima prima/dopo, con conferma: true aggiorna in una transazione le sole
 *   righe che cambiano, condizionato sulla versione di ogni giornata (409 se nel frattempo è cambiata).
 */
@Injectable()
export class ValorizzazioneService {
  constructor(
    @InjectModel(Consuntivo.name) private readonly consuntivi: Model<Consuntivo>,
    @InjectModel(Risorsa.name) private readonly risorse: Model<Risorsa>,
    @InjectModel(Progetto.name) private readonly progetti: Model<Progetto>,
    @InjectModel(Attivita.name) private readonly attivita: Model<Attivita>,
    @InjectModel(Ruolo.name) private readonly ruoli: Model<Ruolo>,
    @InjectModel(TipologiaCosto.name) private readonly tipologie: Model<TipologiaCosto>,
    @InjectConnection() private readonly connection: Connection,
    private readonly tariffe: TariffeService,
    private readonly periodi: PeriodiService,
  ) {}

  async daValorizzare(query: { da?: unknown; a?: unknown }) {
    const { da, a } = intervallo(query.da, query.a);
    const giornate = await this.consuntivi
      .find({ data: { $gte: da, $lte: a }, 'righe.costoCentesimi': null })
      .sort({ data: 1 })
      .lean<GiornataDb[]>()
      .exec();
    const risolutori = await this.risolutori(giornate, da, a);
    const nomi = await this.nomi(giornate);
    const righe = giornate.flatMap((g) =>
      g.righe
        .filter((r) => r.costoCentesimi == null && !NON_RICALCOLABILI.includes(r.stato))
        .map((r) => {
          const t = risolutori.get(String(g.risorsaId))!(r.tipologiaId, g.data);
          const motivo = !t.ruoloId
            ? 'ruoloMancante'
            : t.fonte
              ? 'tariffaDisponibile'
              : 'tariffaMancante';
          return {
            ...nomi.riga(g, r),
            ruolo: t.ruoloId ? nomi.ruolo(t.ruoloId) : null,
            motivo,
          };
        }),
    );
    return { da: testoData(da), a: testoData(a), righe };
  }

  async ricalcola(utente: UtenteAutenticato, body: unknown) {
    const c = corpo(body);
    const { da, a } = intervallo(c.da, c.a);
    const risorsaId = objectId(c.risorsaId, 'risorsaId');
    const conferma = booleano(c.conferma, 'conferma') ?? false;
    const tutte = await this.consuntivi
      .find({ data: { $gte: da, $lte: a }, ...(risorsaId ? { risorsaId } : {}) })
      .sort({ data: 1 })
      .lean<GiornataDb[]>()
      .exec();
    // Mai le giornate di un mese chiuso (decisione 7 della fase 3).
    const chiusi = await this.periodi.chiusi(tutte.map((g) => g.mese));
    const giornate = tutte.filter((g) => !chiusi.has(g.mese));
    const risolutori = await this.risolutori(giornate, da, a);

    // Righe il cui valore cambierebbe, per giornata.
    const cambi = new Map<string, { g: GiornataDb; righe: Map<string, Valori> }>();
    const elenco: { g: GiornataDb; r: RigaSalvata; prima: Valori; dopo: Valori }[] = [];
    for (const g of giornate) {
      const risolvi = risolutori.get(String(g.risorsaId))!;
      for (const r of g.righe) {
        if (NON_RICALCOLABILI.includes(r.stato)) continue;
        const t = risolvi(r.tipologiaId, g.data);
        const dopo: Valori = { fonte: t.fonte, tariffaId: t.tariffaId, centesimiOra: t.centesimiOra, costo: costoCentesimi(r.minuti, t.centesimiOra) };
        const prima: Valori = {
          fonte: r.fonteTariffa ?? null,
          tariffaId: r.tariffaId ? String(r.tariffaId) : null,
          centesimiOra: r.tariffaCentesimiOra ?? null,
          costo: r.costoCentesimi ?? null,
        };
        if (JSON.stringify(prima) === JSON.stringify(dopo)) continue;
        if (!cambi.has(String(g._id))) cambi.set(String(g._id), { g, righe: new Map() });
        cambi.get(String(g._id))!.righe.set(String(r._id), dopo);
        elenco.push({ g, r, prima, dopo });
      }
    }
    const somma = (f: (x: (typeof elenco)[number]) => number | null) => elenco.reduce((s, x) => s + (f(x) ?? 0), 0);
    const totali = {
      righe: elenco.length,
      giornate: cambi.size,
      primaCentesimi: somma((x) => x.prima.costo),
      dopoCentesimi: somma((x) => x.dopo.costo),
      daValorizzarePrima: elenco.filter((x) => x.prima.costo == null).length,
      daValorizzareDopo: elenco.filter((x) => x.dopo.costo == null).length,
    };

    if (!conferma) {
      const nomi = await this.nomi(elenco.slice(0, MAX_ELENCO).map((x) => x.g));
      return {
        da: testoData(da),
        a: testoData(a),
        totali,
        righe: elenco.slice(0, MAX_ELENCO).map((x) => ({ ...nomi.riga(x.g, x.r), prima: x.prima, dopo: x.dopo })),
        troncato: elenco.length > MAX_ELENCO,
      };
    }

    const adesso = new Date();
    await this.connection.transaction(async (session) => {
      for (const { g, righe } of cambi.values()) {
        const nuove = g.righe.map((r) => {
          const v = righe.get(String(r._id));
          if (!v) return r;
          return Object.assign({}, r, {
            fonteTariffa: v.fonte as RigaConsuntivo['fonteTariffa'],
            tariffaId: v.tariffaId ? new mongoose.Types.ObjectId(v.tariffaId) : null,
            tariffaCentesimiOra: v.centesimiOra,
            costoCentesimi: v.costo,
            modificatoIl: adesso,
            modificatoDa: utente.id,
          });
        });
        const esito = await this.consuntivi
          .updateOne({ _id: g._id, versione: g.versione }, { $set: { righe: nuove, versione: g.versione + 1 } }, { session })
          .exec();
        if (esito.matchedCount === 0) {
          throw new ConflictException(`${testoData(g.data)}: la giornata è stata modificata nel frattempo; rifai l'anteprima e riprova`);
        }
      }
    });
    return { da: testoData(da), a: testoData(a), totali, applicato: true };
  }

  // ---- Parte comune ----

  /** Un risolutore delle tariffe per ogni risorsa delle giornate. */
  private async risolutori(giornate: GiornataDb[], da: Date, a: Date) {
    const mappa = new Map<string, Risolutore>();
    for (const id of new Set(giornate.map((g) => String(g.risorsaId)))) {
      mappa.set(id, await this.tariffe.risolutore(new mongoose.Types.ObjectId(id), da, a));
    }
    return mappa;
  }

  /** Nomi di risorse, progetti, attività, tipologie e ruoli per presentare le righe. */
  private async nomi(giornate: GiornataDb[]) {
    const righe = giornate.flatMap((g) => g.righe);
    const [risorse, progetti, attivita, tipologie, ruoli] = await Promise.all([
      this.risorse.find({ _id: { $in: giornate.map((g) => g.risorsaId) } }, { cognome: 1, nome: 1 }).lean().exec(),
      this.progetti.find({ _id: { $in: righe.map((r) => r.progettoId) } }, { codice: 1 }).lean().exec(),
      this.attivita.find({ _id: { $in: righe.map((r) => r.attivitaId).filter(Boolean) } }, { codice: 1 }).lean().exec(),
      this.tipologie.find({}, { codice: 1, descrizione: 1 }).lean().exec(),
      this.ruoli.find({}, { codice: 1, descrizione: 1 }).lean().exec(),
    ]);
    const m = <T extends { _id: unknown }>(xs: T[]) => new Map(xs.map((x) => [String(x._id), x]));
    const [ris, pro, att, tip, ruo] = [m(risorse), m(progetti), m(attivita), m(tipologie), m(ruoli)];
    return {
      riga: (g: GiornataDb, r: RigaSalvata) => ({
        risorsaId: String(g.risorsaId),
        risorsa: ris.get(String(g.risorsaId)) ? `${ris.get(String(g.risorsaId))!.cognome} ${ris.get(String(g.risorsaId))!.nome}` : '?',
        data: testoData(g.data),
        rigaId: String(r._id),
        progetto: pro.get(String(r.progettoId))?.codice ?? '?',
        attivita: r.attivitaId ? (att.get(String(r.attivitaId))?.codice ?? '?') : null,
        tipologiaId: String(r.tipologiaId),
        tipologia: tip.get(String(r.tipologiaId))?.descrizione ?? r.tipologiaCodice,
        minuti: r.minuti,
        stato: r.stato,
      }),
      ruolo: (id: string) => {
        const x = ruo.get(id);
        return x ? { _id: id, codice: x.codice, descrizione: x.descrizione } : { _id: id, codice: '?', descrizione: '?' };
      },
    };
  }
}

function intervallo(da: unknown, a: unknown) {
  const inizio = leggiData(da, 'da', true)!;
  const fine = leggiData(a, 'a', true)!;
  if (fine < inizio) throw new BadRequestException('a: non può precedere da');
  if (giorniTra(inizio, fine) > MAX_GIORNI) throw new BadRequestException(`al massimo ${MAX_GIORNI} giorni per volta`);
  return { da: inizio, a: fine };
}
