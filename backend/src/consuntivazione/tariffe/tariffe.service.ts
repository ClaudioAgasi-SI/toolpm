import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import mongoose, { type Connection, type Model } from 'mongoose';
import { Ruolo } from '../../comuni/schemi/anagrafiche.schema.js';
import { Risorsa } from '../../comuni/schemi/risorsa.schema.js';
import { corpo, data, idRotta, numero, objectId, presente } from '../../comuni/validazione.js';
import { TipologiaCosto } from '../tipologie/tipologia-costo.schema.js';
import { periodiSovrapposti, risolviTariffa, ruoloAllaData, type TariffaPeriodo, type TariffaRisolta } from './risoluzione.js';
import { TariffaPersonalizzata, TariffaStandard } from './tariffa.schema.js';

type Chiave = 'ruoloId' | 'risorsaId';
interface Genere {
  /** Le due collection hanno gli stessi campi, a parte la chiave: si usa un solo tipo. */
  model: Model<TariffaStandard>;
  chiave: Chiave;
  nome: string;
}

/** Massimo 10.000 €/h: un importo oltre è quasi certamente un errore di battitura. */
const MAX_CENTESIMI_ORA = 1_000_000;

/** Funzione di risoluzione per una risorsa in un intervallo di date (usata dal consuntivo, blocco C3). */
export type Risolutore = (tipologiaId: mongoose.Types.ObjectId | string, data: Date) => TariffaRisolta & { ruoloId: string | null };

/**
 * Tariffe standard per ruolo e personalizzate per risorsa (fase 2, blocco C2). Solo controller.
 * Regole: importi interi in centesimi all'ora; periodi della stessa coppia (ruolo o risorsa + tipologia)
 * mai sovrapposti; ruolo, risorsa e tipologia devono esistere; una tariffa già usata da un consuntivo
 * non si cancella (si chiude il periodo e se ne apre un altro).
 */
@Injectable()
export class TariffeService {
  private readonly standard: Genere;
  private readonly personalizzate: Genere;

  constructor(
    @InjectModel(TariffaStandard.name) standardModel: Model<TariffaStandard>,
    @InjectModel(TariffaPersonalizzata.name) personalizzateModel: Model<TariffaPersonalizzata>,
    @InjectModel(TipologiaCosto.name) private readonly tipologie: Model<TipologiaCosto>,
    @InjectModel(Ruolo.name) private readonly ruoli: Model<Ruolo>,
    @InjectModel(Risorsa.name) private readonly risorse: Model<Risorsa>,
    @InjectConnection() private readonly connection: Connection,
  ) {
    this.standard = { model: standardModel, chiave: 'ruoloId', nome: 'standard' };
    this.personalizzate = { model: personalizzateModel as unknown as Model<TariffaStandard>, chiave: 'risorsaId', nome: 'personalizzata' };
  }

  // ---- Tariffe standard per ruolo ----

  elencoStandard(filtro: { ruolo?: string; tipologia?: string }) {
    const q: Record<string, unknown> = {};
    if (filtro.ruolo) q.ruoloId = objectId(filtro.ruolo, 'ruolo');
    if (filtro.tipologia) q.tipologiaId = objectId(filtro.tipologia, 'tipologia');
    return this.elenco(this.standard, q);
  }

  async creaStandard(body: unknown) {
    const c = corpo(body);
    const ruoloId = objectId(c.ruoloId, 'ruoloId', true)!;
    if (!(await this.ruoli.exists({ _id: ruoloId }))) throw new BadRequestException('ruoloId: ruolo inesistente');
    return this.crea(this.standard, ruoloId, c);
  }

  modificaStandard(id: string, body: unknown) {
    return this.modifica(this.standard, null, id, body);
  }

  eliminaStandard(id: string) {
    return this.elimina(this.standard, null, id);
  }

  // ---- Tariffe personalizzate per risorsa ----

  async elencoPersonalizzate(risorsaId: string) {
    const _id = await this.risorsaEsistente(risorsaId);
    return this.elenco(this.personalizzate, { risorsaId: _id });
  }

  async creaPersonalizzata(risorsaId: string, body: unknown) {
    const _id = await this.risorsaEsistente(risorsaId);
    return this.crea(this.personalizzate, _id, corpo(body));
  }

  async modificaPersonalizzata(risorsaId: string, id: string, body: unknown) {
    return this.modifica(this.personalizzate, await this.risorsaEsistente(risorsaId), id, body);
  }

  async eliminaPersonalizzata(risorsaId: string, id: string) {
    return this.elimina(this.personalizzate, await this.risorsaEsistente(risorsaId), id);
  }

  // ---- Risoluzione ----

  /**
   * Prepara la risoluzione delle tariffe di una risorsa per tutte le date tra `da` e `a` (comprese),
   * leggendo tutto in tre query: storico dei ruoli, personalizzate della risorsa, standard dei suoi ruoli.
   */
  async risolutore(risorsaId: mongoose.Types.ObjectId, da: Date, a: Date): Promise<Risolutore> {
    const risorsa = await this.risorse.findById(risorsaId, { storicoRuoli: 1 }).lean().exec();
    if (!risorsa) throw new NotFoundException(`Risorsa ${String(risorsaId)} non trovata`);
    const storico = risorsa.storicoRuoli ?? [];
    const nelPeriodo = { validoDal: { $lte: a }, $or: [{ validoAl: null }, { validoAl: { $gte: da } }] };
    const ruoliIds = [...new Set(storico.map((v) => String(v.ruoloId)))].map((id) => new mongoose.Types.ObjectId(id));
    const [personalizzate, standard] = await Promise.all([
      this.personalizzate.model.find({ risorsaId, ...nelPeriodo }).lean<TariffaPeriodo[]>().exec(),
      ruoliIds.length
        ? this.standard.model.find({ ruoloId: { $in: ruoliIds }, ...nelPeriodo }).lean<(TariffaPeriodo & { ruoloId: mongoose.Types.ObjectId })[]>().exec()
        : Promise.resolve([] as (TariffaPeriodo & { ruoloId: mongoose.Types.ObjectId })[]),
    ]);
    return (tipologiaId, giorno) => {
      const ruoloId = ruoloAllaData(storico, giorno);
      const delRuolo = ruoloId ? standard.filter((t) => String(t.ruoloId) === ruoloId) : [];
      return { ...risolviTariffa(tipologiaId, giorno, personalizzate, delRuolo), ruoloId };
    };
  }

  /** Tariffa applicabile alla data per ogni tipologia, con la provenienza (API tariffe-applicabili). */
  async applicabili(risorsaId: string, dataTesto: unknown) {
    const _id = await this.risorsaEsistente(risorsaId);
    const giorno = data(dataTesto ?? oggi(), 'data', true)!;
    const risolvi = await this.risolutore(_id, giorno, giorno);
    const tipologie = await this.tipologie.find().sort({ ordine: 1, codice: 1 }).lean().exec();
    const voci = tipologie.map((t) => {
      const r = risolvi(t._id, giorno);
      return {
        tipologiaId: String(t._id),
        tipologiaCodice: t.codice,
        tipologiaDescrizione: t.descrizione,
        tipologiaAttiva: t.attiva,
        fonte: r.fonte,
        tariffaId: r.tariffaId,
        centesimiOra: r.centesimiOra,
      };
    });
    const ruoloId = risolvi(new mongoose.Types.ObjectId(), giorno).ruoloId;
    const ruolo = ruoloId ? await this.ruoli.findById(ruoloId, { codice: 1, descrizione: 1 }).lean().exec() : null;
    return {
      risorsaId: String(_id),
      data: giorno.toISOString().slice(0, 10),
      ruolo: ruolo ? { _id: String(ruolo._id), codice: ruolo.codice, descrizione: ruolo.descrizione } : null,
      tariffe: voci,
    };
  }

  // ---- Parte comune ----

  private elenco(g: Genere, filtro: Record<string, unknown>) {
    return g.model.find(filtro).sort({ [g.chiave]: 1, tipologiaId: 1, validoDal: -1 }).lean().exec();
  }

  private async crea(g: Genere, proprietario: mongoose.Types.ObjectId, c: Record<string, unknown>) {
    const tipologiaId = objectId(c.tipologiaId, 'tipologiaId', true)!;
    if (!(await this.tipologie.exists({ _id: tipologiaId }))) throw new BadRequestException('tipologiaId: tipologia inesistente');
    const dati = {
      [g.chiave]: proprietario,
      tipologiaId,
      validoDal: data(c.validoDal, 'validoDal', true)!,
      validoAl: data(c.validoAl, 'validoAl') ?? null,
      centesimiOra: centesimi(c.centesimiOra, true)!,
    };
    controllaPeriodo(dati.validoDal, dati.validoAl);
    return this.connection.transaction(async (session) => {
      await this.controllaSovrapposizioni(g, dati[g.chiave] as mongoose.Types.ObjectId, tipologiaId, dati.validoDal, dati.validoAl, null, session);
      const [doc] = await g.model.create([dati], { session });
      return doc.toObject();
    });
  }

  private async modifica(g: Genere, proprietario: mongoose.Types.ObjectId | null, id: string, body: unknown) {
    const c = corpo(body);
    const attuale = await this.trova(g, proprietario, id);
    for (const campo of [g.chiave, 'tipologiaId']) {
      if (presente(c, campo) && String(c[campo]) !== String((attuale as unknown as Record<string, unknown>)[campo])) {
        throw new ConflictException(`${campo}: non si modifica; crea una nuova tariffa`);
      }
    }
    const $set: Record<string, unknown> = {};
    if (presente(c, 'validoDal')) $set.validoDal = data(c.validoDal, 'validoDal', true);
    if (presente(c, 'validoAl')) $set.validoAl = data(c.validoAl, 'validoAl') ?? null;
    if (presente(c, 'centesimiOra')) $set.centesimiOra = centesimi(c.centesimiOra, true);
    const validoDal = ($set.validoDal as Date | undefined) ?? attuale.validoDal;
    const validoAl = presente(c, 'validoAl') ? ($set.validoAl as Date | null) : attuale.validoAl;
    controllaPeriodo(validoDal, validoAl);
    const chiave = (attuale as unknown as Record<Chiave, mongoose.Types.ObjectId>)[g.chiave];
    return this.connection.transaction(async (session) => {
      await this.controllaSovrapposizioni(g, chiave, attuale.tipologiaId, validoDal, validoAl, attuale._id, session);
      return g.model
        .findOneAndUpdate({ _id: attuale._id }, { $set }, { returnDocument: 'after', session })
        .lean()
        .exec();
    });
  }

  private async elimina(g: Genere, proprietario: mongoose.Types.ObjectId | null, id: string) {
    const attuale = await this.trova(g, proprietario, id);
    if (await this.connection.collection('consuntivi').findOne({ 'righe.tariffaId': attuale._id }, { projection: { _id: 1 } })) {
      throw new ConflictException('Tariffa già usata nei consuntivi: non si cancella, chiudi il periodo con una data di fine');
    }
    await g.model.deleteOne({ _id: attuale._id }).exec();
  }

  private async trova(g: Genere, proprietario: mongoose.Types.ObjectId | null, id: string) {
    const _id = idRotta(id);
    const filtro: Record<string, unknown> = { _id };
    if (proprietario) filtro[g.chiave] = proprietario;
    const doc = _id ? await g.model.findOne(filtro).lean().exec() : null;
    if (!doc) throw new NotFoundException(`Tariffa ${g.nome} ${id} non trovata`);
    return doc;
  }

  private async controllaSovrapposizioni(
    g: Genere,
    proprietario: mongoose.Types.ObjectId,
    tipologiaId: mongoose.Types.ObjectId,
    validoDal: Date,
    validoAl: Date | null,
    escludi: mongoose.Types.ObjectId | null,
    session: mongoose.ClientSession,
  ) {
    const altre = await g.model
      .find({ [g.chiave]: proprietario, tipologiaId, ...(escludi ? { _id: { $ne: escludi } } : {}) })
      .session(session)
      .lean()
      .exec();
    const conflitto = altre.find((t) => periodiSovrapposti(t, { validoDal, validoAl }));
    if (conflitto) {
      const fine = conflitto.validoAl ? conflitto.validoAl.toISOString().slice(0, 10) : 'senza fine';
      throw new ConflictException(
        `Periodo sovrapposto a una tariffa ${g.nome} già presente per la stessa tipologia (dal ${conflitto.validoDal.toISOString().slice(0, 10)}, al ${fine})`,
      );
    }
  }

  private async risorsaEsistente(id: string) {
    const _id = idRotta(id);
    if (!_id || !(await this.risorse.exists({ _id }))) throw new NotFoundException(`Risorsa ${id} non trovata`);
    return _id;
  }
}

function centesimi(valore: unknown, obbligatorio: boolean) {
  return numero(valore, 'centesimiOra', { min: 0, max: MAX_CENTESIMI_ORA, intero: true, obbligatorio });
}

function controllaPeriodo(dal: Date, al: Date | null) {
  if (al && al.getTime() < dal.getTime()) throw new BadRequestException('validoAl: non può precedere validoDal');
}

function oggi() {
  return new Date().toISOString().slice(0, 10);
}
