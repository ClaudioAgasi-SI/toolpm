import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Connection, Model } from 'mongoose';
import type { UtenteAutenticato } from '../../auth/decoratori.js';
import { Progetto } from '../../comuni/schemi/progetto.schema.js';
import { Risorsa } from '../../comuni/schemi/risorsa.schema.js';
import { booleano, corpo, testo } from '../../comuni/validazione.js';
import { AuditService } from '../../infrastruttura/audit.service.js';
import { Consuntivo, type StatoRiga } from '../consuntivi/consuntivo.schema.js';
import { meseDi, oggiInItalia, testoData } from '../consuntivi/regole-giornata.js';
import { Periodo } from './periodo.schema.js';

/** Stati che bloccano la chiusura (decisione 4): righe non ancora approvate dal PM. */
const NON_APPROVATI: StatoRiga[] = ['bozza', 'inviata', 'approvataTL', 'respinta'];
const MAX_ELENCO = 200;

type Conteggi = Record<StatoRiga, number>;
const vuoti = (): Conteggi => ({ bozza: 0, inviata: 0, approvataTL: 0, approvata: 0, respinta: 0, chiusa: 0 });

/** "202611" → "novembre 2026". */
export function nomeMese(mese: string) {
  const d = new Date(Date.UTC(Number(mese.slice(0, 4)), Number(mese.slice(4)) - 1, 1));
  return d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function leggiMese(valore: unknown) {
  if (typeof valore !== 'string' || !/^\d{6}$/.test(valore) || Number(valore.slice(4)) < 1 || Number(valore.slice(4)) > 12) {
    throw new BadRequestException('mese: AAAAMM');
  }
  return valore;
}

/**
 * Chiusura e riapertura dei mesi (RF-12, fase 3 blocco D4), solo controller.
 * - Chiusura in ordine (decisione 5): non si chiude un mese se uno precedente con ore è aperto.
 * - Bloccata se nel mese ci sono righe non approvate; il controller può forzarla con una motivazione (decisione 4).
 * - Le righe approvate diventano "chiusa"; tutte le giornate del mese cambiano versione, così un salvataggio
 *   iniziato prima riceve 409. In un mese chiuso il backend rifiuta salvataggi, invii, ritiri, approvazioni
 *   e ricalcolo (`chiusi()` usato dagli altri servizi).
 * - Riapertura con motivazione, a partire dall'ultimo mese chiuso: le righe "chiusa" tornano "approvata".
 */
@Injectable()
export class PeriodiService {
  constructor(
    @InjectModel(Periodo.name) private readonly model: Model<Periodo>,
    @InjectModel(Consuntivo.name) private readonly consuntivi: Model<Consuntivo>,
    @InjectModel(Progetto.name) private readonly progetti: Model<Progetto>,
    @InjectModel(Risorsa.name) private readonly risorse: Model<Risorsa>,
    @InjectConnection() private readonly connection: Connection,
    private readonly audit: AuditService,
  ) {}

  /** Mesi chiusi tra quelli indicati (AAAAMM), per i controlli degli altri servizi. */
  async chiusi(mesi: Iterable<string>, session?: ClientSession | null): Promise<Set<string>> {
    const elenco = [...new Set(mesi)];
    if (!elenco.length) return new Set();
    const docs = await this.model
      .find({ mese: { $in: elenco }, stato: 'chiuso' }, { mese: 1 })
      .session(session ?? null)
      .lean()
      .exec();
    return new Set(docs.map((d) => d.mese));
  }

  /** Errore 409 se una delle date cade in un mese chiuso. */
  async verificaAperti(date: (Date | string)[], session?: ClientSession | null) {
    const mesi = date.map((d) => meseDi(typeof d === 'string' ? d : testoData(d)));
    const chiusi = await this.chiusi(mesi, session);
    if (chiusi.size) {
      throw new ConflictException(`Il mese di ${[...chiusi].sort().map(nomeMese).join(', ')} è chiuso: le ore non si modificano (chiedi al controller di riaprirlo)`);
    }
  }

  /** GET /periodi/chiusi?da=&a=: mesi chiusi nel periodo, per le pagine (accesso libero). */
  async chiusiTra(da: string, a: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(da) || !/^\d{4}-\d{2}-\d{2}$/.test(a)) throw new BadRequestException('da, a: AAAA-MM-GG');
    const docs = await this.model.find({ mese: { $gte: meseDi(da), $lte: meseDi(a) }, stato: 'chiuso' }, { mese: 1 }).lean().exec();
    return docs.map((d) => d.mese).sort();
  }

  /** GET /periodi: un elemento per mese, dal primo con ore al mese corrente, dal più recente. */
  async elenco() {
    const perMese = await this.conteggi();
    const periodi = new Map((await this.model.find().lean().exec()).map((p) => [p.mese, p]));
    const corrente = meseDi(oggiInItalia());
    const primo = [...perMese.keys(), ...periodi.keys(), corrente].sort()[0];
    const mesi: string[] = [];
    for (let m = primo; m <= corrente; m = meseSuccessivo(m)) mesi.push(m);
    for (const m of [...perMese.keys(), ...periodi.keys()]) if (!mesi.includes(m)) mesi.push(m);
    mesi.sort();
    const chiusi = new Set([...periodi.values()].filter((p) => p.stato === 'chiuso').map((p) => p.mese));
    const ultimoChiuso = [...chiusi].sort().at(-1) ?? null;
    const primoApertoConOre = mesi.find((m) => !chiusi.has(m) && perMese.has(m)) ?? null;
    const elenco = mesi.reverse().map((mese) => {
      const p = periodi.get(mese);
      const conteggi = perMese.get(mese) ?? vuoti();
      const chiuso = chiusi.has(mese);
      return {
        mese,
        nome: nomeMese(mese),
        stato: chiuso ? 'chiuso' : 'aperto',
        conteggi,
        nonApprovate: NON_APPROVATI.reduce((s, x) => s + conteggi[x], 0),
        chiusura: p?.chiusoIl ? { il: p.chiusoIl, da: p.chiusoDa, forzata: p.forzata, motivazione: p.motivazioneChiusura } : null,
        riapertura: p?.riapertoIl ? { il: p.riapertoIl, da: p.riapertoDa, motivazione: p.motivazioneRiapertura } : null,
        // Ordine (decisione 5): si chiude il primo mese aperto con ore (o un mese senza ore dopo l'ultimo chiuso),
        // si riapre l'ultimo chiuso.
        chiudibile: !chiuso && (primoApertoConOre === null || mese <= primoApertoConOre) && (ultimoChiuso === null || mese > ultimoChiuso),
        riapribile: chiuso && mese === ultimoChiuso,
      };
    });
    return { mesi: elenco, progettiSenzaPM: await this.progettiSenzaPM() };
  }

  /** GET /periodi/:mese/anteprima: cosa succede chiudendo il mese. */
  async anteprima(meseGrezzo: string) {
    const mese = leggiMese(meseGrezzo);
    const conteggi = (await this.conteggi(mese)).get(mese) ?? vuoti();
    const nonApprovate = NON_APPROVATI.reduce((s, x) => s + conteggi[x], 0);
    const righe = nonApprovate ? await this.righeNonApprovate(mese) : [];
    return {
      mese,
      nome: nomeMese(mese),
      chiuso: (await this.chiusi([mese])).size > 0,
      conteggi,
      nonApprovate,
      bloccoOrdine: await this.bloccoOrdine(mese),
      righe,
      troncato: nonApprovate > righe.length,
    };
  }

  /** POST /periodi/:mese/chiusura { forzata?, motivazione? }. */
  async chiudi(utente: UtenteAutenticato, meseGrezzo: string, body: unknown) {
    const mese = leggiMese(meseGrezzo);
    const c = corpo(body);
    const forzata = booleano(c.forzata, 'forzata') ?? false;
    const motivazione = testo(c.motivazione, 'motivazione', { max: 500 }) ?? null;
    if (forzata && !motivazione) throw new BadRequestException('motivazione: obbligatoria per chiudere un mese con righe non approvate');
    if (mese > meseDi(oggiInItalia())) throw new BadRequestException('Non si chiude un mese futuro');
    let esito = { righeChiuse: 0, nonApprovate: 0 };
    await this.connection.transaction(async (session) => {
      if ((await this.chiusi([mese], session)).size) throw new ConflictException(`${nomeMese(mese)} è già chiuso`);
      const blocco = await this.bloccoOrdine(mese, session);
      if (blocco) throw new ConflictException(blocco);
      const conteggi = (await this.conteggi(mese, session)).get(mese) ?? vuoti();
      const nonApprovate = NON_APPROVATI.reduce((s, x) => s + conteggi[x], 0);
      if (nonApprovate && !forzata) {
        throw new ConflictException(`${nomeMese(mese)} ha ancora ${nonApprovate === 1 ? '1 riga non approvata' : `${nonApprovate} righe non approvate`}: falle approvare, oppure chiudi comunque con una motivazione`);
      }
      await this.consuntivi
        .updateMany({ mese }, { $set: { 'righe.$[r].stato': 'chiusa' }, $inc: { versione: 1 } }, { arrayFilters: [{ 'r.stato': 'approvata' }], session })
        .exec();
      const adesso = new Date();
      await this.model
        .updateOne(
          { mese },
          {
            $set: { stato: 'chiuso', chiusoIl: adesso, chiusoDa: utente.id, forzata: nonApprovate > 0, motivazioneChiusura: motivazione },
            $setOnInsert: { mese },
          },
          { upsert: true, session },
        )
        .exec();
      await this.audit.registra(
        { collezione: 'periodi', documentoId: mese, operazione: 'chiusura', prima: { stato: 'aperto' }, dopo: { stato: 'chiuso', righeChiuse: conteggi.approvata, nonApprovate, forzata: nonApprovate > 0 }, motivazione },
        session,
      );
      esito = { righeChiuse: conteggi.approvata, nonApprovate };
    });
    return { mese, nome: nomeMese(mese), ...esito };
  }

  /** POST /periodi/:mese/riapertura { motivazione }. */
  async riapri(utente: UtenteAutenticato, meseGrezzo: string, body: unknown) {
    const mese = leggiMese(meseGrezzo);
    const motivazione = testo(corpo(body).motivazione, 'motivazione', { max: 500 });
    if (!motivazione) throw new BadRequestException('motivazione: obbligatoria per riaprire un mese');
    let righeRiaperte = 0;
    await this.connection.transaction(async (session) => {
      const periodo = await this.model.findOne({ mese }).session(session).lean().exec();
      if (periodo?.stato !== 'chiuso') throw new NotFoundException(`${nomeMese(mese)} non è chiuso`);
      if (await this.model.exists({ mese: { $gt: mese }, stato: 'chiuso' }).session(session)) {
        throw new ConflictException('Si riapre a partire dall\'ultimo mese chiuso');
      }
      const r = await this.consuntivi
        .updateMany({ mese }, { $set: { 'righe.$[r].stato': 'approvata' }, $inc: { versione: 1 } }, { arrayFilters: [{ 'r.stato': 'chiusa' }], session })
        .exec();
      righeRiaperte = (await this.conteggi(mese, session)).get(mese)?.approvata ?? 0;
      await this.model
        .updateOne({ mese }, { $set: { stato: 'aperto', riapertoIl: new Date(), riapertoDa: utente.id, motivazioneRiapertura: motivazione } }, { session })
        .exec();
      await this.audit.registra(
        { collezione: 'periodi', documentoId: mese, operazione: 'riapertura', prima: { stato: 'chiuso' }, dopo: { stato: 'aperto', giornate: r.modifiedCount }, motivazione },
        session,
      );
    });
    return { mese, nome: nomeMese(mese), righeRiaperte };
  }

  // ---- Parte comune ----

  /** Righe per stato e mese (tutti i mesi, o uno). */
  private async conteggi(mese?: string, session?: ClientSession) {
    const gruppi = await this.consuntivi
      .aggregate<{ _id: { mese: string; stato: StatoRiga }; n: number }>([
        ...(mese ? [{ $match: { mese } }] : []),
        { $unwind: '$righe' },
        { $group: { _id: { mese: '$mese', stato: '$righe.stato' }, n: { $sum: 1 } } },
      ])
      .session(session ?? null)
      .exec();
    const mappa = new Map<string, Conteggi>();
    for (const g of gruppi) {
      if (!mappa.has(g._id.mese)) mappa.set(g._id.mese, vuoti());
      mappa.get(g._id.mese)![g._id.stato] = g.n;
    }
    return mappa;
  }

  /** Motivo per cui il mese non si può ancora chiudere per l'ordine (decisione 5), oppure null. */
  private async bloccoOrdine(mese: string, session?: ClientSession) {
    const precedenti = (await this.consuntivi.distinct('mese', { mese: { $lt: mese } }).session(session ?? null).exec()) as string[];
    const chiusi = await this.chiusi(precedenti, session);
    const aperti = precedenti.filter((m) => !chiusi.has(m)).sort();
    if (aperti.length) return `Prima va chiuso ${nomeMese(aperti[0])}: i mesi si chiudono in ordine`;
    const successivo = await this.model.exists({ mese: { $gt: mese }, stato: 'chiuso' }).session(session ?? null);
    if (successivo) return 'Un mese successivo è già chiuso';
    return null;
  }

  private async righeNonApprovate(mese: string) {
    const trovate = await this.consuntivi
      .aggregate<{ data: Date; risorsaId: unknown; stato: StatoRiga; progettoId: unknown; minuti: number }>([
        { $match: { mese } },
        { $unwind: '$righe' },
        { $match: { 'righe.stato': { $in: NON_APPROVATI } } },
        { $sort: { data: 1 } },
        { $limit: MAX_ELENCO },
        { $project: { _id: 0, data: 1, risorsaId: 1, stato: '$righe.stato', progettoId: '$righe.progettoId', minuti: '$righe.minuti' } },
      ])
      .exec();
    const [risorse, progetti] = await Promise.all([
      this.risorse.find({ _id: { $in: trovate.map((t) => t.risorsaId) } }, { nome: 1, cognome: 1 }).lean().exec(),
      this.progetti.find({ _id: { $in: trovate.map((t) => t.progettoId) } }, { codice: 1 }).lean().exec(),
    ]);
    const nr = new Map(risorse.map((r) => [String(r._id), `${r.cognome} ${r.nome}`.trim()]));
    const np = new Map(progetti.map((p) => [String(p._id), p.codice]));
    return trovate.map((t) => ({
      data: testoData(t.data),
      risorsa: nr.get(String(t.risorsaId)) ?? '?',
      progetto: np.get(String(t.progettoId)) ?? '?',
      stato: t.stato,
      minuti: t.minuti,
    }));
  }

  /** Progetti con righe in attesa e nessun PM tra gli approvatori: le approva solo un PMSenior. */
  private async progettiSenzaPM() {
    const conRighe = (await this.consuntivi.distinct('righe.progettoId', { 'righe.stato': { $in: ['inviata', 'approvataTL'] } }).exec()) as unknown[];
    if (!conRighe.length) return [];
    const progetti = await this.progetti
      .find({ _id: { $in: conRighe }, 'approvatori.profilo': { $ne: 'PM' } }, { codice: 1, titolo: 1 })
      .lean()
      .exec();
    return progetti.map((p) => ({ _id: String(p._id), codice: p.codice, titolo: p.titolo }));
  }
}

function meseSuccessivo(m: string) {
  const anno = Number(m.slice(0, 4));
  const n = Number(m.slice(4));
  return n === 12 ? `${anno + 1}01` : `${anno}${String(n + 1).padStart(2, '0')}`;
}
