import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Connection, Model } from 'mongoose';
import { booleano, codice, corpo, idRotta, numero, presente, scelta, testo } from '../../comuni/validazione.js';
import { CATEGORIE_TIPOLOGIA, TipologiaCosto } from './tipologia-costo.schema.js';

/**
 * Tipologie di costo (fase 2, blocco C1).
 * Regole: codice unico e non modificabile; nessuna cancellazione (si disattiva);
 * c'è sempre una e una sola tipologia predefinita, ed è attiva. Per cambiarla si sceglie
 * la nuova (predefinita: true): la precedente perde il segno nella stessa transazione.
 */
@Injectable()
export class TipologieService {
  constructor(
    @InjectModel(TipologiaCosto.name) private readonly model: Model<TipologiaCosto>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  elenco(soloAttive: boolean) {
    return this.model
      .find(soloAttive ? { attiva: true } : {})
      .sort({ ordine: 1, codice: 1 })
      .lean()
      .exec();
  }

  async dettaglio(id: string) {
    const _id = idRotta(id);
    const doc = _id ? await this.model.findById(_id).lean().exec() : null;
    if (!doc) throw new NotFoundException(`Tipologia di costo ${id} non trovata`);
    return doc;
  }

  /** La tipologia proposta sulle righe nuove (null solo su un database senza migrazione 007). */
  predefinita() {
    return this.model.findOne({ predefinita: true }).lean().exec();
  }

  async crea(body: unknown) {
    const c = corpo(body);
    const dati = {
      codice: codice(c.codice),
      descrizione: testo(c.descrizione, 'descrizione', { obbligatorio: true, max: 200 }) as string,
      ordine: numero(c.ordine, 'ordine', { min: 0, max: 9999, intero: true }) ?? (await this.ordineSuccessivo()),
      categoria: scelta(c.categoria, 'categoria', CATEGORIE_TIPOLOGIA, true)!,
      attiva: booleano(c.attiva, 'attiva') ?? true,
      predefinita: booleano(c.predefinita, 'predefinita') ?? false,
    };
    if (dati.predefinita && !dati.attiva) throw new BadRequestException('La tipologia predefinita deve essere attiva');
    if (await this.model.exists({ codice: dati.codice })) {
      throw new ConflictException(`Esiste già una tipologia di costo con codice ${dati.codice}`);
    }
    return this.connection.transaction(async (session) => {
      if (dati.predefinita) await this.togliPredefinita(session);
      const [doc] = await this.model.create([dati], { session });
      return doc.toObject();
    });
  }

  async modifica(id: string, body: unknown) {
    const c = corpo(body);
    const attuale = await this.dettaglio(id);
    if (presente(c, 'codice') && c.codice !== attuale.codice) throw new ConflictException('Il codice non si può modificare');
    const $set: Partial<TipologiaCosto> = {};
    if (presente(c, 'descrizione')) $set.descrizione = testo(c.descrizione, 'descrizione', { obbligatorio: true, max: 200 });
    if (presente(c, 'ordine')) $set.ordine = numero(c.ordine, 'ordine', { min: 0, max: 9999, intero: true, obbligatorio: true });
    if (presente(c, 'categoria')) $set.categoria = scelta(c.categoria, 'categoria', CATEGORIE_TIPOLOGIA, true);
    if (presente(c, 'attiva')) {
      const v = booleano(c.attiva, 'attiva');
      if (v === undefined) throw new BadRequestException('attiva: deve essere true o false');
      $set.attiva = v;
    }
    if (presente(c, 'predefinita')) {
      const v = booleano(c.predefinita, 'predefinita');
      if (v === undefined) throw new BadRequestException('predefinita: deve essere true o false');
      $set.predefinita = v;
    }
    const predefinita = $set.predefinita ?? attuale.predefinita;
    const attiva = $set.attiva ?? attuale.attiva;
    if (attuale.predefinita && $set.predefinita === false) {
      throw new BadRequestException('Serve sempre una tipologia predefinita: scegli prima la nuova predefinita');
    }
    if (predefinita && !attiva) {
      throw new BadRequestException(
        attuale.predefinita
          ? 'La tipologia predefinita non si può disattivare: scegli prima un\'altra predefinita'
          : 'La tipologia predefinita deve essere attiva',
      );
    }
    return this.connection.transaction(async (session) => {
      if ($set.predefinita && !attuale.predefinita) await this.togliPredefinita(session);
      const doc = await this.model
        .findOneAndUpdate({ _id: attuale._id }, { $set }, { returnDocument: 'after', runValidators: true, session })
        .lean()
        .exec();
      if (!doc) throw new NotFoundException(`Tipologia di costo ${id} non trovata`);
      return doc;
    });
  }

  private async togliPredefinita(session: ClientSession) {
    await this.model.updateMany({ predefinita: true }, { $set: { predefinita: false } }, { session }).exec();
  }

  private async ordineSuccessivo() {
    const ultima = await this.model.findOne({}, { ordine: 1 }).sort({ ordine: -1 }).lean().exec();
    return (ultima?.ordine ?? 0) + 1;
  }
}
