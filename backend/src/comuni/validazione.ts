import { BadRequestException } from '@nestjs/common';
import mongoose from 'mongoose';

/**
 * Lettura e controllo dei campi in ingresso per le API del modulo Comuni.
 * Ogni funzione restituisce il valore normalizzato o lancia 400 con un messaggio in italiano.
 * Convenzione per gli aggiornamenti: campo assente = non toccare; null = svuotare (solo per i facoltativi).
 */

export type Corpo = Record<string, unknown>;

export const corpo = (body: unknown): Corpo => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Corpo della richiesta mancante o non valido');
  return body as Corpo;
};

export const presente = (c: Corpo, campo: string) => Object.prototype.hasOwnProperty.call(c, campo);

export function testo(valore: unknown, campo: string, opz: { obbligatorio?: boolean; max?: number } = {}): string | undefined {
  if (valore === undefined || valore === null || valore === '') {
    if (opz.obbligatorio) throw new BadRequestException(`${campo}: obbligatorio`);
    return undefined;
  }
  if (typeof valore !== 'string') throw new BadRequestException(`${campo}: deve essere un testo`);
  const t = valore.trim();
  if (!t && opz.obbligatorio) throw new BadRequestException(`${campo}: obbligatorio`);
  if (t.length > (opz.max ?? 500)) throw new BadRequestException(`${campo}: al massimo ${opz.max ?? 500} caratteri`);
  return t || undefined;
}

/** Codice identificativo: lettere, cifre, punto, trattino e trattino basso, senza spazi. */
export function codice(valore: unknown, campo = 'codice'): string {
  const t = testo(valore, campo, { obbligatorio: true, max: 40 }) as string;
  if (!/^[A-Za-z0-9._-]+$/.test(t)) throw new BadRequestException(`${campo}: solo lettere, cifre, punto, trattino e trattino basso, senza spazi`);
  return t;
}

export function email(valore: unknown, campo = 'email', obbligatorio = false): string | undefined {
  const t = testo(valore, campo, { obbligatorio, max: 254 });
  if (t === undefined) return undefined;
  const e = t.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new BadRequestException(`${campo}: indirizzo non valido`);
  return e;
}

export function objectId(valore: unknown, campo: string, obbligatorio = false): mongoose.Types.ObjectId | undefined {
  if (valore === undefined || valore === null || valore === '') {
    if (obbligatorio) throw new BadRequestException(`${campo}: obbligatorio`);
    return undefined;
  }
  if (typeof valore !== 'string' && !(valore instanceof mongoose.Types.ObjectId)) {
    throw new BadRequestException(`${campo}: identificativo non valido`);
  }
  if (!mongoose.isValidObjectId(valore)) throw new BadRequestException(`${campo}: identificativo non valido`);
  return new mongoose.Types.ObjectId(String(valore));
}

export function elencoObjectId(valore: unknown, campo: string): mongoose.Types.ObjectId[] {
  if (!Array.isArray(valore)) throw new BadRequestException(`${campo}: deve essere un elenco`);
  const visti = new Set<string>();
  const ids: mongoose.Types.ObjectId[] = [];
  for (const v of valore) {
    const id = objectId(v, campo, true) as mongoose.Types.ObjectId;
    if (!visti.has(String(id))) {
      visti.add(String(id));
      ids.push(id);
    }
  }
  return ids;
}

/** Data nel formato AAAA-MM-GG, salvata alla mezzanotte UTC. */
export function data(valore: unknown, campo: string, obbligatorio = false): Date | undefined {
  if (valore === undefined || valore === null || valore === '') {
    if (obbligatorio) throw new BadRequestException(`${campo}: obbligatoria`);
    return undefined;
  }
  if (typeof valore !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valore)) {
    throw new BadRequestException(`${campo}: data nel formato AAAA-MM-GG`);
  }
  const d = new Date(`${valore}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valore) throw new BadRequestException(`${campo}: data inesistente`);
  return d;
}

export function numero(
  valore: unknown,
  campo: string,
  opz: { min?: number; max?: number; intero?: boolean; obbligatorio?: boolean } = {},
): number | undefined {
  if (valore === undefined || valore === null || valore === '') {
    if (opz.obbligatorio) throw new BadRequestException(`${campo}: obbligatorio`);
    return undefined;
  }
  if (typeof valore !== 'number' || !Number.isFinite(valore)) throw new BadRequestException(`${campo}: deve essere un numero`);
  if (opz.intero && !Number.isInteger(valore)) throw new BadRequestException(`${campo}: deve essere un numero intero`);
  if (opz.min !== undefined && valore < opz.min) throw new BadRequestException(`${campo}: almeno ${opz.min}`);
  if (opz.max !== undefined && valore > opz.max) throw new BadRequestException(`${campo}: al massimo ${opz.max}`);
  return valore;
}

export function booleano(valore: unknown, campo: string): boolean | undefined {
  if (valore === undefined || valore === null) return undefined;
  if (typeof valore !== 'boolean') throw new BadRequestException(`${campo}: deve essere true o false`);
  return valore;
}

export function scelta<T extends string>(valore: unknown, campo: string, ammessi: readonly T[], obbligatorio = false): T | undefined {
  if (valore === undefined || valore === null || valore === '') {
    if (obbligatorio) throw new BadRequestException(`${campo}: obbligatorio`);
    return undefined;
  }
  if (!ammessi.includes(valore as T)) throw new BadRequestException(`${campo}: valori ammessi ${ammessi.join(', ')}`);
  return valore as T;
}

/** Percentuale di completamento: intero da 0 a 100. */
export const percentuale = (valore: unknown) =>
  numero(valore, 'percentuale', { min: 0, max: 100, intero: true, obbligatorio: true }) as number;

/** Controlla che la data di fine non preceda quella di inizio. */
export function controllaDate(inizio: Date | null | undefined, fine: Date | null | undefined) {
  if (inizio && fine && fine < inizio) throw new BadRequestException('dataFine: non può precedere dataInizio');
}

/** id di una rotta: 404 se non è un ObjectId valido. */
export const idRotta = (id: string) => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null);
