import { NOMI_STATO, type StatoRiga } from './modelli';
import { scriviOre } from './ore';

/** Nomi delle operazioni dello storico, come li leggono le persone. */
export const NOMI_OPERAZIONE: Record<string, string> = {
  invio: 'Inviata',
  ritiro: 'Invio ritirato',
  viaLibera: 'Via libera del TL',
  approvazione: 'Approvata',
  rifiuto: 'Respinta',
  correzione: 'Corretta dopo il rifiuto',
  cancellazione: 'Cancellata',
  ricalcolo: 'Costo ricalcolato',
  chiusura: 'Mese chiuso',
  riapertura: 'Mese riaperto',
  creazione: 'Creazione',
  modifica: 'Modifica',
  stato: 'Cambio di stato',
  approvatori: 'Approvatori',
  assegnazioni: 'Risorse assegnate',
};

/** Nomi delle collection dello storico. */
export const NOMI_COLLEZIONE: Record<string, string> = {
  consuntivi: 'Consuntivo',
  periodi: 'Mese',
  progetti: 'Progetto',
  attivita: 'Attività',
  tipologie_costo: 'Tipologia di costo',
  tariffe_standard: 'Tariffa standard',
  tariffe_personalizzate: 'Tariffa personalizzata',
};

const NOMI_CAMPO: Record<string, string> = {
  minuti: 'ore',
  stato: 'stato',
  nota: 'nota',
  tipologiaCodice: 'tipologia',
  centesimiOra: 'tariffa',
  costo: 'costo',
  validoDal: 'dal',
  validoAl: 'al',
  descrizione: 'descrizione',
  titolo: 'titolo',
  risorseAssegnateIds: 'risorse assegnate',
  approvatori: 'approvatori',
  rifiuto: 'rifiuto',
};

const NASCOSTI = new Set(['_id', 'tariffaId', 'progettoId', 'attivitaId', 'fonte', 'ruoloId', 'risorsaId', 'tipologiaId']);

/** Un valore dello storico in breve. */
export function valore(campo: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (campo === 'minuti' && typeof v === 'number') return scriviOre(v) || '0:00';
  if ((campo === 'centesimiOra' || campo === 'costo') && typeof v === 'number') {
    return `${(v / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 })} €${campo === 'centesimiOra' ? '/h' : ''}`;
  }
  if (campo === 'stato' && typeof v === 'string' && v in NOMI_STATO) return NOMI_STATO[v as StatoRiga];
  if (campo === 'rifiuto' && typeof v === 'object') return `“${(v as { motivazione?: string }).motivazione ?? ''}”`;
  if (Array.isArray(v)) return `${v.length} ${v.length === 1 ? 'elemento' : 'elementi'}`;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleDateString('it-IT');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v as string | number | boolean);
}

/** "ore: 8:00 → 6:00; nota: — → …": i campi di prima e dopo in breve. */
export function descriviModifica(prima: unknown, dopo: unknown): string {
  const p = (prima && typeof prima === 'object' && !Array.isArray(prima) ? prima : {}) as Record<string, unknown>;
  const d = (dopo && typeof dopo === 'object' && !Array.isArray(dopo) ? dopo : {}) as Record<string, unknown>;
  const campi = [...new Set([...Object.keys(p), ...Object.keys(d)])].filter((c) => !NASCOSTI.has(c));
  return campi
    .map((c) => {
      const nome = NOMI_CAMPO[c] ?? c;
      if (!(c in p)) return `${nome}: ${valore(c, d[c])}`;
      if (!(c in d)) return `${nome}: ${valore(c, p[c])}`;
      if (JSON.stringify(p[c] ?? null) === JSON.stringify(d[c] ?? null)) return '';
      return `${nome}: ${valore(c, p[c])} → ${valore(c, d[c])}`;
    })
    .filter(Boolean)
    .join('; ');
}

export const quando = (il: string) =>
  new Date(il).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
