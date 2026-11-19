import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Parametro } from './parametro.schema.js';

/** Lettura e scrittura dei parametri di sistema. API in ParametriController (/api/parametri). */
@Injectable()
export class ParametriService {
  constructor(@InjectModel(Parametro.name) private readonly model: Model<Parametro>) {}

  /** Valore del parametro, oppure `predefinito` se il parametro non esiste. */
  async leggi<T>(chiave: string, predefinito: T): Promise<T> {
    const doc = await this.model.findOne({ chiave }).lean().exec();
    return doc ? (doc.valore as T) : predefinito;
  }

  /** Crea o aggiorna il parametro. */
  async scrivi(chiave: string, valore: unknown, descrizione?: string) {
    return this.model
      .findOneAndUpdate(
        { chiave },
        { $set: { valore, ...(descrizione ? { descrizione } : {}) } },
        { upsert: true, returnDocument: 'after', runValidators: true },
      )
      .lean()
      .exec();
  }

  elenco() {
    return this.model.find().sort({ chiave: 1 }).lean().exec();
  }
}
