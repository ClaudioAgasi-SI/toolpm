import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import type { Model } from 'mongoose';

const { isValidObjectId } = mongoose;
import { Risorsa } from './risorsa.schema.js';

@Injectable()
export class RisorseService {
  constructor(@InjectModel(Risorsa.name) private readonly model: Model<Risorsa>) {}

  findAll() {
    return this.model.find().sort({ cognome: 1, nome: 1 }).lean().exec();
  }

  async findOne(id: string) {
    const doc = isValidObjectId(id) ? await this.model.findById(id).lean().exec() : null;
    if (!doc) throw new NotFoundException(`Risorsa ${id} non trovata`);
    return doc;
  }

  create(data: Partial<Risorsa>) {
    return this.model.create(data);
  }

  /** Sostituisce l'intero documento con quello ricevuto (semantica PUT). */
  async update(id: string, data: Partial<Risorsa> & { _id?: unknown }) {
    const { _id, ...resto } = data;
    const doc = isValidObjectId(id)
      ? await this.model
          .findOneAndReplace({ _id: id }, resto, { returnDocument: 'after', runValidators: true })
          .lean()
          .exec()
      : null;
    if (!doc) throw new NotFoundException(`Risorsa ${id} non trovata`);
    return doc;
  }

  async remove(id: string) {
    const doc = isValidObjectId(id) ? await this.model.findByIdAndDelete(id).lean().exec() : null;
    if (!doc) throw new NotFoundException(`Risorsa ${id} non trovata`);
    return { deleted: true };
  }
}
