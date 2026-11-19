export const FILE_RISORSE: string;
export const FILE_PROGETTI: string;
export const FILE_GRIGLIA: string;
export const UTENTE: string;
export const COLONNE_RISORSE: string[];
export const COLONNE_PROGETTI: string[];
export function norm(v: unknown): string;
export function chiaveCoppia(cliente: unknown, progetto: unknown): string;
export function codiceProposto(testo: string): string;
export function fotografiaGriglia(
  risorse: { _id: unknown; planned?: { mese: string; percentualeAllocazione?: number }[] }[],
): Record<string, { righe: number; percentuale: number }>;
export function testiAllocazione(a: Record<string, unknown>): { cliente: string; progetto: string };
