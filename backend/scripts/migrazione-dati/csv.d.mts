export function scriviCsv(colonne: string[], righe: Record<string, unknown>[]): string;
export function leggiCsv(testo: string): { colonne: string[]; righe: (Record<string, string> & { _riga: number })[] };
