import type { TotaliReport } from './modelli';

/** Formati comuni delle pagine dei report (fase 4). */
/** Numero all'italiana con il punto delle migliaia anche a quattro cifre (4.000, non 4000). */
function numero(n: number, decimali: { min: number; max: number }) {
  const [intera, dec] = n.toLocaleString('it-IT', { minimumFractionDigits: decimali.min, maximumFractionDigits: decimali.max, useGrouping: false }).split(',');
  return intera.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? `,${dec}` : '');
}

export const euro = (c: number | null | undefined) => (c === null || c === undefined ? '—' : `${numero(c / 100, { min: 2, max: 2 })} €`);

export const gg = (g: number | null | undefined) => (g === null || g === undefined ? '—' : numero(g, { min: 0, max: 2 }));

/** Quota del consuntivato sulla stima, in percentuale intera; null senza stima. */
export const quota = (fatto: number | null | undefined, stima: number | null | undefined) =>
  !stima || fatto === null || fatto === undefined ? null : Math.round((fatto / stima) * 100);

export const nomeMese = (m: string) => {
  const t = new Date(Date.UTC(+m.slice(0, 4), +m.slice(4) - 1, 1)).toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const calcolato = (il: string) =>
  new Date(il).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** "di cui 2 righe (4:00) da valorizzare": avviso per i costi incompleti. */
export function avvisoValorizzare(t: TotaliReport) {
  if (!t.daValorizzare) return '';
  const ore = `${Math.floor(t.minutiDaValorizzare / 60)}:${String(t.minutiDaValorizzare % 60).padStart(2, '0')}`;
  return `${t.daValorizzare === 1 ? '1 riga' : `${t.daValorizzare} righe`} (${ore} h) senza costo: da valorizzare`;
}
