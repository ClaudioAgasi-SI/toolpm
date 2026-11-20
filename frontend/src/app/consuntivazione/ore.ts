/**
 * Funzioni pure della pagina "Il mio consuntivo" (fase 2, blocco C5): ore e date.
 * Le stesse regole le controlla il backend (regole-giornata.ts); qui servono a guidare chi scrive.
 */

export type EsitoOre = { minuti: number } | { errore: string };

/**
 * Ore scritte in una cella → minuti. Accetta "8", "7,5", "7.5", "7:30", "0:15"; vuoto = 0.
 * Passi di 15 minuti, al massimo 24 ore.
 */
export function leggiOre(testo: string | null | undefined): EsitoOre {
  const t = (testo ?? '').trim().replace(/\s+/g, '');
  if (!t) return { minuti: 0 };
  let minuti: number;
  const hm = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (hm) {
    if (Number(hm[2]) >= 60) return { errore: 'minuti oltre 59' };
    minuti = Number(hm[1]) * 60 + Number(hm[2]);
  } else if (/^\d{1,2}([.,]\d{1,2})?$/.test(t)) {
    minuti = Math.round(Number(t.replace(',', '.')) * 60);
  } else {
    return { errore: 'scrivi le ore come 8, 7,5 oppure 7:30' };
  }
  if (minuti % 15 !== 0) return { errore: 'a passi di 15 minuti (0,25 ore)' };
  if (minuti > 24 * 60) return { errore: 'al massimo 24 ore' };
  return { minuti };
}

/** Minuti → "7:30"; 0 → "". */
export function scriviOre(minuti: number): string {
  if (!minuti) return '';
  return `${Math.floor(minuti / 60)}:${String(minuti % 60).padStart(2, '0')}`;
}

/** Totale da mostrare: "0:00" quando è zero. */
export const totaleOre = (minuti: number) => scriviOre(minuti) || '0:00';

/** Oggi in Italia, "AAAA-MM-GG". */
export function oggi(adesso = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(adesso);
}

const comeData = (s: string) => new Date(`${s}T00:00:00Z`);
const comeTesto = (d: Date) => d.toISOString().slice(0, 10);

export function piuGiorni(s: string, n: number): string {
  return comeTesto(new Date(comeData(s).getTime() + n * 86_400_000));
}

/** Lunedì della settimana che contiene la data. */
export function lunedi(s: string): string {
  return piuGiorni(s, -((comeData(s).getUTCDay() + 6) % 7));
}

/** I sette giorni da lunedì a domenica. */
export function settimana(s: string): string[] {
  const l = lunedi(s);
  return Array.from({ length: 7 }, (_, i) => piuGiorni(l, i));
}

const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** "lun 2 mar" */
export function etichettaGiorno(s: string): string {
  const d = comeData(s);
  return `${GIORNI[d.getUTCDay()]} ${d.getUTCDate()} ${MESI[d.getUTCMonth()]}`;
}

export const fineSettimana = (s: string) => [0, 6].includes(comeData(s).getUTCDay());

/** "2-8 marzo 2026" o "30 mar - 5 apr 2026" */
export function etichettaSettimana(s: string): string {
  const [l, d] = [comeData(lunedi(s)), comeData(piuGiorni(lunedi(s), 6))];
  const mese = (x: Date) => MESI[x.getUTCMonth()];
  return l.getUTCMonth() === d.getUTCMonth()
    ? `${l.getUTCDate()}–${d.getUTCDate()} ${mese(d)} ${d.getUTCFullYear()}`
    : `${l.getUTCDate()} ${mese(l)} – ${d.getUTCDate()} ${mese(d)} ${d.getUTCFullYear()}`;
}
