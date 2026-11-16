/** Utilità per i mesi nel formato AAAAMM. */

const NOMI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

export function meseCorrente(d = new Date()): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function aggiungiMesi(mese: string, n: number): string {
  const anno = Number(mese.slice(0, 4));
  const m = Number(mese.slice(4, 6)) - 1 + n;
  const a = anno + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${a}${String(mm + 1).padStart(2, '0')}`;
}

/** "202701" -> "gen 2027" */
export function etichettaMese(mese: string): string {
  const m = Number(mese.slice(4, 6));
  return m >= 1 && m <= 12 ? `${NOMI[m - 1]} ${mese.slice(0, 4)}` : mese;
}

/** "202701" <-> "2027-01" (formato degli input type=month). */
export function daInputMese(v: string): string {
  return v.replace('-', '');
}
export function aInputMese(m: string): string {
  return m && m.length === 6 ? `${m.slice(0, 4)}-${m.slice(4)}` : '';
}
