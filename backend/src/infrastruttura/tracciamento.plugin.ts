import type { Query, Schema, UpdateQuery } from 'mongoose';
import { utenteCorrente } from './contesto-utente.js';

/**
 * Tracciamento dei salvataggi (fase 1, blocco B1): ogni documento di ogni collection ha
 * creatoIl, creatoDa, modificatoIl, modificatoDa. I valori arrivano dal contesto dell'utente
 * (contesto-utente.ts), mai dal client: quelli ricevuti nel corpo di una richiesta vengono ignorati.
 *
 * L'autore è una stringa: l'id dell'utente oppure un utente tecnico "sistema:...".
 */
export const CAMPI_CREAZIONE = ['creatoIl', 'creatoDa'] as const;
export const CAMPI_MODIFICA = ['modificatoIl', 'modificatoDa'] as const;
export const CAMPI_TRACCIAMENTO = [...CAMPI_CREAZIONE, ...CAMPI_MODIFICA] as const;

export interface Tracciamento {
  creatoIl?: Date;
  creatoDa?: string;
  modificatoIl?: Date;
  modificatoDa?: string;
}

/** Toglie da un oggetto i campi di tracciamento (quelli mandati dal client non contano). */
export function senzaTracciamento<T extends Record<string, unknown>>(dati: T): T {
  const copia = { ...dati };
  for (const campo of CAMPI_TRACCIAMENTO) delete copia[campo];
  return copia;
}

/**
 * Prepara un aggiornamento (updateOne, updateMany, findOneAndUpdate):
 * - rimuove i campi di tracciamento eventualmente presenti, al primo livello o in $set;
 * - imposta modificatoIl e modificatoDa;
 * - con upsert, creatoIl e creatoDa valgono solo se il documento viene creato ($setOnInsert).
 */
export function preparaAggiornamento(update: UpdateQuery<unknown>, utente: string, ora: Date): UpdateQuery<unknown> {
  const risultato: Record<string, unknown> = senzaTracciamento({ ...(update as Record<string, unknown>) });
  const set = senzaTracciamento({ ...(risultato.$set as Record<string, unknown> | undefined) });
  const setOnInsert = senzaTracciamento({ ...(risultato.$setOnInsert as Record<string, unknown> | undefined) });
  risultato.$set = { ...set, modificatoIl: ora, modificatoDa: utente };
  risultato.$setOnInsert = { ...setOnInsert, creatoIl: ora, creatoDa: utente };
  return risultato;
}

/**
 * Prepara la sostituzione di un documento (findOneAndReplace, replaceOne): conserva creatoIl e
 * creatoDa del documento esistente e aggiorna i campi di modifica.
 */
export function preparaSostituzione(
  sostituto: Record<string, unknown>,
  esistente: Tracciamento | null,
  utente: string,
  ora: Date,
): Record<string, unknown> {
  return {
    ...senzaTracciamento(sostituto),
    creatoIl: esistente?.creatoIl ?? ora,
    creatoDa: esistente?.creatoDa ?? utente,
    modificatoIl: ora,
    modificatoDa: utente,
  };
}

/** Plugin Mongoose da registrare sulla connessione: vale per tutti gli schemi con una collection. */
export function tracciamentoPlugin(schema: Schema) {
  // Solo i documenti di una collection: gli schemi incorporati (skill, allocazioni) non dichiarano
  // "collection" e restano senza tracciamento. Ogni schema di primo livello deve dichiararla.
  if (!schema.get('collection')) return;

  schema.add({
    creatoIl: { type: Date },
    creatoDa: { type: String },
    modificatoIl: { type: Date },
    modificatoDa: { type: String },
  });

  schema.pre('save', function () {
    const utente = utenteCorrente();
    const ora = new Date();
    if (this.isNew) {
      this.set({ creatoIl: ora, creatoDa: utente });
    } else {
      // Su un documento esistente i campi di creazione non si cambiano.
      for (const campo of CAMPI_CREAZIONE) if (this.isModified(campo)) this.unmarkModified(campo);
    }
    this.set({ modificatoIl: ora, modificatoDa: utente });
  });

  schema.pre('insertMany', function (docs: unknown) {
    const utente = utenteCorrente();
    const ora = new Date();
    for (const doc of [docs].flat() as Record<string, unknown>[]) {
      Object.assign(doc, { creatoIl: ora, creatoDa: utente, modificatoIl: ora, modificatoDa: utente });
    }
  });

  schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (this: Query<unknown, unknown>) {
    const update = this.getUpdate();
    if (update && !Array.isArray(update)) {
      this.setUpdate(preparaAggiornamento(update, utenteCorrente(), new Date()));
    }
  });

  schema.pre(['findOneAndReplace', 'replaceOne'], async function (this: Query<unknown, unknown>) {
    const sostituto = this.getUpdate() as Record<string, unknown> | null;
    if (!sostituto) return;
    const esistente = (await this.model
      .findOne(this.getFilter())
      .select('creatoIl creatoDa')
      .lean()
      .exec()) as Tracciamento | null;
    this.setUpdate(preparaSostituzione(sostituto, esistente, utenteCorrente(), new Date()));
  });
}
