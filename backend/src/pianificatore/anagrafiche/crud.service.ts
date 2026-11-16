import { NotFoundException } from '@nestjs/common';
import mongoose from 'mongoose';
import type { Model } from 'mongoose';

const { isValidObjectId } = mongoose;

/** CRUD generico per le collection di anagrafica. */
export class CrudService<T> {
  constructor(
    protected readonly model: Model<T>,
    private readonly sortBy: Record<string, 1 | -1>,
  ) {}

  findAll() {
    return this.model.find().sort(this.sortBy).lean().exec();
  }

  create(data: Partial<T>) {
    return this.model.create(data);
  }

  async update(id: string, data: Partial<T>) {
    // L'_id nel corpo della richiesta viene ignorato: conta quello nel percorso.
    const resto: Record<string, unknown> = { ...data };
    delete resto['_id'];
    const doc = isValidObjectId(id)
      ? await this.model
          .findByIdAndUpdate(id, resto as Partial<T>, { returnDocument: 'after', runValidators: true })
          .lean()
          .exec()
      : null;
    if (!doc) throw new NotFoundException(`Elemento ${id} non trovato`);
    return doc;
  }

  async remove(id: string) {
    const doc = isValidObjectId(id) ? await this.model.findByIdAndDelete(id).lean().exec() : null;
    if (!doc) throw new NotFoundException(`Elemento ${id} non trovato`);
    return { deleted: true };
  }
}
