/**
 * Regole pure del listino di vendita (fase 5, blocco F1): nessun accesso al database, testate a parte.
 *
 * Tariffa di vendita di un ruolo per un cliente a una data:
 * 1. la voce del listino di quel cliente valida alla data;
 * 2. altrimenti la voce del listino standard (clienteId null) valida alla data;
 * 3. altrimenti nessuna: il ruolo è segnalato "senza tariffa di vendita".
 *
 * Tariffa di costo del ruolo: la tariffa standard del ruolo per la tipologia ordinaria, valida alla data
 * (centesimi all'ora; il costo giornaliero è centesimi all'ora × oreGiorno, calcolato in calcoli.ts).
 */
import { inPeriodo, type Periodo } from '../../consuntivazione/tariffe/risoluzione.js';
import type { TariffeRuolo } from '../calcoli.js';

type Id = { toString(): string } | string;

export type FonteVendita = 'cliente' | 'standard';

export interface VoceListinoPeriodo extends Periodo {
  _id: Id;
  ruoloId: Id;
  clienteId: Id | null;
  centesimiGiorno: number;
}

export interface TariffaCostoPeriodo extends Periodo {
  _id: Id;
  ruoloId: Id;
  centesimiOra: number;
}

export interface VenditaRisolta {
  fonte: FonteVendita | null;
  voceId: string | null;
  centesimiGiorno: number | null;
}

export interface TipologiaPerCosto {
  _id: Id;
  categoria: string;
  predefinita?: boolean;
  ordine: number;
  attiva?: boolean;
}

/** Tariffe di un ruolo pronte per calcolaStima, con la provenienza della vendita. */
export interface TariffeRuoloRisolte extends TariffeRuolo {
  fonteVendita: FonteVendita | null;
}

const stesso = (a: Id | null | undefined, b: Id | null | undefined) => (a == null ? b == null : b != null && String(a) === String(b));

/** Tariffa di vendita del ruolo alla data: prima il listino del cliente, poi lo standard. */
export function risolviVendita(ruoloId: Id, clienteId: Id | null, data: Date, voci: readonly VoceListinoPeriodo[]): VenditaRisolta {
  const cerca = (cliente: Id | null) => voci.find((v) => stesso(v.ruoloId, ruoloId) && stesso(v.clienteId, cliente) && inPeriodo(v, data));
  if (clienteId != null) {
    const c = cerca(clienteId);
    if (c) return { fonte: 'cliente', voceId: String(c._id), centesimiGiorno: c.centesimiGiorno };
  }
  const s = cerca(null);
  if (s) return { fonte: 'standard', voceId: String(s._id), centesimiGiorno: s.centesimiGiorno };
  return { fonte: null, voceId: null, centesimiGiorno: null };
}

/** Tariffa di costo del ruolo valida alla data (tariffa standard della tipologia ordinaria), null se manca. */
export function tariffaCostoAllaData<T extends TariffaCostoPeriodo>(ruoloId: Id, data: Date, tariffeOrdinaria: readonly T[]): T | null {
  return tariffeOrdinaria.find((t) => stesso(t.ruoloId, ruoloId) && inPeriodo(t, data)) ?? null;
}

/** Costo orario del ruolo alla data, null se manca. */
export function risolviCostoOra(ruoloId: Id, data: Date, tariffeOrdinaria: readonly TariffaCostoPeriodo[]): number | null {
  return tariffaCostoAllaData(ruoloId, data, tariffeOrdinaria)?.centesimiOra ?? null;
}

/**
 * Tipologia di costo da usare per le stime: quella di categoria "ordinaria" proposta sulle righe nuove
 * (ORDINARIA, creata dalla migrazione 007); se non c'è, la prima ordinaria attiva per ordine.
 */
export function tipologiaOrdinaria<T extends TipologiaPerCosto>(tipologie: readonly T[]): T | null {
  const ordinarie = tipologie.filter((t) => t.categoria === 'ordinaria');
  return ordinarie.find((t) => t.predefinita) ?? [...ordinarie].filter((t) => t.attiva !== false).sort((a, b) => a.ordine - b.ordine)[0] ?? null;
}

/** Tariffe di costo e vendita di più ruoli alla data, nella forma attesa da calcolaStima. */
export function tariffeRuoli(
  ruoliIds: readonly Id[],
  clienteId: Id | null,
  data: Date,
  voci: readonly VoceListinoPeriodo[],
  tariffeOrdinaria: readonly TariffaCostoPeriodo[],
): Map<string, TariffeRuoloRisolte> {
  const m = new Map<string, TariffeRuoloRisolte>();
  for (const r of ruoliIds) {
    const v = risolviVendita(r, clienteId, data, voci);
    m.set(String(r), { costoCentesimiOra: risolviCostoOra(r, data, tariffeOrdinaria), venditaCentesimiGiorno: v.centesimiGiorno, fonteVendita: v.fonte });
  }
  return m;
}
