import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import mongoose, { type Connection, type Model } from 'mongoose';
import { Cliente, Ruolo } from '../../comuni/schemi/anagrafiche.schema.js';
import { corpo, data, idRotta, numero, objectId, presente } from '../../comuni/validazione.js';
import { TariffaStandard } from '../../consuntivazione/tariffe/tariffa.schema.js';
import { periodiSovrapposti } from '../../consuntivazione/tariffe/risoluzione.js';
import { TipologiaCosto } from '../../consuntivazione/tipologie/tipologia-costo.schema.js';
import { AuditService, differenze } from '../../infrastruttura/audit.service.js';
import { ParametriService } from '../../infrastruttura/parametri.service.js';
import { risolviCostoOra, risolviVendita, tariffeRuoli, tipologiaOrdinaria, type TariffaCostoPeriodo, type TariffeRuoloRisolte, type VoceListinoPeriodo } from './risoluzione-listino.js';
import { VoceListino } from './voce-listino.schema.js';

/** Massimo 100.000 €/giorno: un importo oltre è quasi certamente un errore di battitura. */
const MAX_CENTESIMI_GIORNO = 10_000_000;
const COLLEZIONE = 'listino_vendita';

/**
 * Listino di vendita (fase 5, blocco F1). Regole (RO-12, RO-14 dell'analisi):
 * - tariffe giornaliere intere in centesimi per ruolo, standard (cliente null) o per cliente;
 * - periodi dello stesso ruolo e cliente mai sovrapposti; ruolo e cliente non cambiano (si crea una voce nuova);
 * - ruolo e cliente devono esistere; ogni creazione, modifica e cancellazione va nello storico.
 * Le revisioni delle offerte fotografano gli importi all'invio in approvazione (F3), quindi una voce si
 * può cancellare anche se è servita per un'offerta già approvata.
 */
@Injectable()
export class ListinoService {
  constructor(
    @InjectModel(VoceListino.name) private readonly voci: Model<VoceListino>,
    @InjectModel(TariffaStandard.name) private readonly tariffeStandard: Model<TariffaStandard>,
    @InjectModel(TipologiaCosto.name) private readonly tipologie: Model<TipologiaCosto>,
    @InjectModel(Ruolo.name) private readonly ruoli: Model<Ruolo>,
    @InjectModel(Cliente.name) private readonly clienti: Model<Cliente>,
    @InjectConnection() private readonly connection: Connection,
    private readonly audit: AuditService,
    private readonly parametri: ParametriService,
  ) {}

  /** Elenco: `cliente` = id del cliente, "standard" per il solo listino standard, assente per tutto. */
  elenco(filtro: { cliente?: string; ruolo?: string }) {
    const q: Record<string, unknown> = {};
    if (filtro.cliente === 'standard') q.clienteId = null;
    else if (filtro.cliente) q.clienteId = objectId(filtro.cliente, 'cliente');
    if (filtro.ruolo) q.ruoloId = objectId(filtro.ruolo, 'ruolo');
    return this.voci.find(q).sort({ clienteId: 1, ruoloId: 1, validoDal: -1 }).lean().exec();
  }

  async crea(body: unknown) {
    const c = corpo(body);
    const ruoloId = objectId(c.ruoloId, 'ruoloId', true)!;
    if (!(await this.ruoli.exists({ _id: ruoloId }))) throw new BadRequestException('ruoloId: ruolo inesistente');
    const clienteId = objectId(c.clienteId, 'clienteId') ?? null;
    if (clienteId && !(await this.clienti.exists({ _id: clienteId }))) throw new BadRequestException('clienteId: cliente inesistente');
    const dati = {
      ruoloId,
      clienteId,
      validoDal: data(c.validoDal, 'validoDal', true)!,
      validoAl: data(c.validoAl, 'validoAl') ?? null,
      centesimiGiorno: centesimi(c.centesimiGiorno)!,
    };
    controllaPeriodo(dati.validoDal, dati.validoAl);
    return this.connection.transaction(async (session) => {
      await this.controllaSovrapposizioni(ruoloId, clienteId, dati.validoDal, dati.validoAl, null, session);
      const [doc] = await this.voci.create([dati], { session });
      await this.audit.registra({ collezione: COLLEZIONE, documentoId: doc._id, operazione: 'creazione', dopo: dati }, session);
      return doc.toObject();
    });
  }

  async modifica(id: string, body: unknown) {
    const c = corpo(body);
    const attuale = await this.trova(id);
    for (const campo of ['ruoloId', 'clienteId'] as const) {
      const nuovo = presente(c, campo) ? (objectId(c[campo], campo) ?? null) : undefined;
      if (nuovo !== undefined && String(nuovo) !== String(attuale[campo] ?? null)) {
        throw new ConflictException(`${campo}: non si modifica; crea una nuova voce del listino`);
      }
    }
    const $set: Record<string, unknown> = {};
    if (presente(c, 'validoDal')) $set.validoDal = data(c.validoDal, 'validoDal', true);
    if (presente(c, 'validoAl')) $set.validoAl = data(c.validoAl, 'validoAl') ?? null;
    if (presente(c, 'centesimiGiorno')) $set.centesimiGiorno = centesimi(c.centesimiGiorno);
    const validoDal = ($set.validoDal as Date | undefined) ?? attuale.validoDal;
    const validoAl = presente(c, 'validoAl') ? ($set.validoAl as Date | null) : attuale.validoAl;
    controllaPeriodo(validoDal, validoAl);
    return this.connection.transaction(async (session) => {
      await this.controllaSovrapposizioni(attuale.ruoloId, attuale.clienteId, validoDal, validoAl, attuale._id, session);
      const doc = await this.voci.findOneAndUpdate({ _id: attuale._id }, { $set }, { returnDocument: 'after', session }).lean().exec();
      const diff = differenze(attuale, $set);
      if (diff) await this.audit.registra({ collezione: COLLEZIONE, documentoId: attuale._id, operazione: 'modifica', ...diff }, session);
      return doc;
    });
  }

  async elimina(id: string) {
    const attuale = await this.trova(id);
    await this.connection.transaction(async (session) => {
      await this.voci.deleteOne({ _id: attuale._id }, { session }).exec();
      await this.audit.registra({ collezione: COLLEZIONE, documentoId: attuale._id, operazione: 'cancellazione', prima: attuale }, session);
    });
  }

  /**
   * Tariffe di ogni ruolo attivo alla data per un cliente (o lo standard): vendita con la provenienza e
   * costo giornaliero (tipologia ordinaria × oreGiorno). Il costo lo vede chiunque legge il listino
   * (commerciali, PM, PMSenior, controller: decisione del 27/11/2026).
   */
  async applicabili(filtro: { cliente?: string; data?: string }) {
    const clienteId = filtro.cliente && filtro.cliente !== 'standard' ? objectId(filtro.cliente, 'cliente')! : null;
    if (clienteId && !(await this.clienti.exists({ _id: clienteId }))) throw new NotFoundException(`Cliente ${filtro.cliente} non trovato`);
    const giorno = data(filtro.data ?? oggi(), 'data', true)!;
    const [ruoli, voci, costi, oreGiorno] = await Promise.all([
      this.ruoli.find({ attivo: { $ne: false } }, { codice: 1, descrizione: 1 }).sort({ codice: 1 }).lean().exec(),
      this.vociAllaData(clienteId, giorno, giorno),
      this.costiOrdinaria(giorno, giorno),
      this.parametri.leggi<number>('oreGiorno', 8),
    ]);
    const righe = ruoli.map((r) => {
      const v = risolviVendita(r._id, clienteId, giorno, voci);
      const ora = risolviCostoOra(r._id, giorno, costi);
      return {
        ruoloId: String(r._id),
        ruoloCodice: r.codice,
        ruoloDescrizione: r.descrizione,
        vendita: v,
        costoPresente: ora != null,
        costoCentesimiGiorno: ora == null ? null : Math.round(ora * oreGiorno),
      };
    });
    return {
      data: giorno.toISOString().slice(0, 10),
      clienteId: clienteId ? String(clienteId) : null,
      oreGiorno,
      ruoli: righe,
      senzaVendita: righe.filter((r) => r.vendita.centesimiGiorno == null).length,
      senzaCosto: righe.filter((r) => !r.costoPresente).length,
    };
  }

  /** Per le stime (F2): tariffe di costo e vendita dei ruoli indicati alla data, pronte per calcolaStima. */
  async tariffePerStima(ruoliIds: readonly (mongoose.Types.ObjectId | string)[], clienteId: mongoose.Types.ObjectId | null, giorno: Date): Promise<Map<string, TariffeRuoloRisolte>> {
    const [voci, costi] = await Promise.all([this.vociAllaData(clienteId, giorno, giorno), this.costiOrdinaria(giorno, giorno)]);
    return tariffeRuoli(ruoliIds, clienteId, giorno, voci, costi);
  }

  // ---- Parte interna ----

  private vociAllaData(clienteId: mongoose.Types.ObjectId | null, da: Date, a: Date) {
    return this.voci
      .find({ clienteId: { $in: clienteId ? [clienteId, null] : [null] }, ...nelPeriodo(da, a) })
      .lean<VoceListinoPeriodo[]>()
      .exec();
  }

  private async costiOrdinaria(da: Date, a: Date): Promise<TariffaCostoPeriodo[]> {
    const tip = tipologiaOrdinaria(await this.tipologie.find({}, { categoria: 1, predefinita: 1, ordine: 1, attiva: 1 }).lean().exec());
    if (!tip) return [];
    return this.tariffeStandard.find({ tipologiaId: tip._id, ...nelPeriodo(da, a) }).lean<TariffaCostoPeriodo[]>().exec();
  }

  private async trova(id: string) {
    const _id = idRotta(id);
    const doc = _id ? await this.voci.findById(_id).lean().exec() : null;
    if (!doc) throw new NotFoundException(`Voce del listino ${id} non trovata`);
    return doc;
  }

  private async controllaSovrapposizioni(
    ruoloId: mongoose.Types.ObjectId,
    clienteId: mongoose.Types.ObjectId | null,
    validoDal: Date,
    validoAl: Date | null,
    escludi: mongoose.Types.ObjectId | null,
    session: mongoose.ClientSession,
  ) {
    const altre = await this.voci
      .find({ ruoloId, clienteId, ...(escludi ? { _id: { $ne: escludi } } : {}) })
      .session(session)
      .lean()
      .exec();
    const conflitto = altre.find((t) => periodiSovrapposti(t, { validoDal, validoAl }));
    if (conflitto) {
      const fine = conflitto.validoAl ? conflitto.validoAl.toISOString().slice(0, 10) : 'senza fine';
      throw new ConflictException(
        `Periodo sovrapposto a una tariffa di vendita già presente per lo stesso ruolo e ${clienteId ? 'cliente' : 'listino standard'} (dal ${conflitto.validoDal.toISOString().slice(0, 10)}, al ${fine})`,
      );
    }
  }
}

function nelPeriodo(da: Date, a: Date) {
  return { validoDal: { $lte: a }, $or: [{ validoAl: null }, { validoAl: { $gte: da } }] };
}

function centesimi(valore: unknown) {
  return numero(valore, 'centesimiGiorno', { min: 0, max: MAX_CENTESIMI_GIORNO, intero: true, obbligatorio: true });
}

function controllaPeriodo(dal: Date, al: Date | null) {
  if (al && al.getTime() < dal.getTime()) throw new BadRequestException('validoAl: non può precedere validoDal');
}

function oggi() {
  return new Date().toISOString().slice(0, 10);
}
