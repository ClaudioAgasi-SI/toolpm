import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import type { Model } from 'mongoose';
import { Attivita, Progetto } from '../../comuni/schemi/progetto.schema.js';
import { Risorsa } from './risorsa.schema.js';

const { isValidObjectId } = mongoose;

/**
 * Campi della risorsa che appartengono al Pianificatore. Dal blocco B4 il PUT sostituisce solo questi:
 * i dati anagrafici (email, cellulare, ruolo, orario...) si gestiscono da /api/comuni/risorse e restano intatti.
 */
const CAMPI_PIANIFICATORE = ['cognome', 'nome', 'skillTecnici', 'skillAmbiti', 'skillFunzionali', 'certificazioni', 'planned'] as const;
const PREDEFINITI: Partial<Record<(typeof CAMPI_PIANIFICATORE)[number], unknown>> = {
  skillTecnici: [],
  skillAmbiti: [],
  skillFunzionali: [],
  certificazioni: [],
  planned: [],
};

@Injectable()
export class RisorseService {
  constructor(
    @InjectModel(Risorsa.name) private readonly model: Model<Risorsa>,
    @InjectModel(Progetto.name) private readonly progetti: Model<Progetto>,
    @InjectModel(Attivita.name) private readonly attivita: Model<Attivita>,
  ) {}

  findAll() {
    return this.model.find().sort({ cognome: 1, nome: 1 }).lean().exec();
  }

  async findOne(id: string) {
    const doc = isValidObjectId(id) ? await this.model.findById(id).lean().exec() : null;
    if (!doc) throw new NotFoundException(`Risorsa ${id} non trovata`);
    return doc;
  }

  create(data: Partial<Risorsa>) {
    const dati: Record<string, unknown> = {};
    for (const campo of CAMPI_PIANIFICATORE) if (data?.[campo] !== undefined) dati[campo] = data[campo];
    return this.model.create(dati);
  }

  /**
   * Sostituisce i dati del Pianificatore (nome, skill, certificazioni, allocazioni) con quelli ricevuti:
   * i campi non inviati tornano ai valori predefiniti. I dati anagrafici non si toccano.
   */
  async update(id: string, data: Partial<Risorsa> & { _id?: unknown }) {
    const $set: Record<string, unknown> = {};
    for (const campo of CAMPI_PIANIFICATORE) {
      const valore = data?.[campo] ?? PREDEFINITI[campo];
      if (valore !== undefined) $set[campo] = valore;
    }
    const doc = isValidObjectId(id)
      ? await this.model.findOneAndUpdate({ _id: id }, { $set }, { returnDocument: 'after', runValidators: true }).lean().exec()
      : null;
    if (!doc) throw new NotFoundException(`Risorsa ${id} non trovata`);
    return doc;
  }

  /** Elimina la risorsa, se non è approvatore di un progetto né assegnata a un'attività. */
  async remove(id: string) {
    if (isValidObjectId(id)) {
      const _id = new mongoose.Types.ObjectId(id);
      const [progetto, attivita] = await Promise.all([
        this.progetti.findOne({ 'approvatori.risorsaId': _id }, { codice: 1 }).lean().exec(),
        this.attivita.exists({ risorseAssegnateIds: _id }),
      ]);
      if (progetto) throw new ConflictException(`La risorsa è approvatore del progetto ${progetto.codice}: non si può eliminare`);
      if (attivita) throw new ConflictException('La risorsa è assegnata a un\'attività: non si può eliminare');
    }
    const doc = isValidObjectId(id) ? await this.model.findByIdAndDelete(id).lean().exec() : null;
    if (!doc) throw new NotFoundException(`Risorsa ${id} non trovata`);
    return { deleted: true };
  }
}
