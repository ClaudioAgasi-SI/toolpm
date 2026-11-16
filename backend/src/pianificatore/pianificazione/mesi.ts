/** Utilità per i mesi nel formato AAAAMM. */

export const MESE_RE = /^\d{4}(0[1-9]|1[0-2])$/;

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

/** Elenco dei mesi da `da` ad `a` inclusi (massimo 36). */
export function intervalloMesi(da: string, a: string): string[] {
  const out: string[] = [];
  for (let m = da; m <= a && out.length < 36; m = aggiungiMesi(m, 1)) out.push(m);
  return out;
}
