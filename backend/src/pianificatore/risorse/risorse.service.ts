import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import type { Model } from 'mongoose';
import { Attivita, Progetto } from '../../comuni/schemi/progetto.schema.js';
import { type Allocazione, Risorsa } from './risorsa.schema.js';

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

  async create(data: Partial<Risorsa>) {
    const dati: Record<string, unknown> = {};
    for (const campo of CAMPI_PIANIFICATORE) if (data?.[campo] !== undefined) dati[campo] = data[campo];
    if (Array.isArray(dati.planned)) dati.planned = await this.collegaAllocazioni(dati.planned as Allocazione[]);
    return this.model.create(dati);
  }

  /**
   * Allocazioni scritte a testo (cliente/progetto) senza progettoId: se il testo corrisponde a un progetto
   * importato dalla migrazione B7 (aliasPianificatore), ricevono il suo progettoId. Fino al blocco B5 il
   * Pianificatore inserisce ancora i progetti come testo: così le nuove righe restano collegate.
   */
  private async collegaAllocazioni(planned: Allocazione[]) {
    const testo = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const daCollegare = planned.filter((a) => a && !a.progettoId && (testo(a.progetto) || testo(a.cliente)));
    if (!daCollegare.length) return planned;
    const progetti = await this.progetti
      .find({ aliasPianificatore: { $exists: true } }, { aliasPianificatore: 1 })
      .lean()
      .exec();
    const perTesto = new Map<string, mongoose.Types.ObjectId>();
    for (const p of progetti) for (const al of p.aliasPianificatore ?? []) perTesto.set(`${al.cliente}\u0000${al.progetto}`, p._id);
    for (const a of daCollegare) {
      const id = perTesto.get(`${testo(a.cliente)}\u0000${testo(a.progetto)}`);
      if (id) Object.assign(a, { progettoId: id, clienteTesto: testo(a.cliente), progettoTesto: testo(a.progetto) });
    }
    return planned;
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
    if (Array.isArray($set.planned)) $set.planned = await this.collegaAllocazioni($set.planned as Allocazione[]);
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
