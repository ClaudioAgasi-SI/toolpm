/**
 * Regole pure della giornata di consuntivo (fase 2, blocco C3): nessun accesso al database.
 * Le usa ConsuntiviService; sono testate a parte in regole-giornata.spec.ts.
 */

export const MINUTI_PASSO = 15;
export const MINUTI_GIORNO = 24 * 60;
/** Righe che la risorsa può ancora modificare (respinta: dalla fase 3). */
export const STATI_MODIFICABILI = ['bozza', 'respinta'] as const;
/** Numero massimo di giorni letti o salvati in una volta. */
export const MAX_GIORNI = 62;

/** Data di oggi in Italia, "AAAA-MM-GG" (il server può girare in UTC). */
export function oggiInItalia(adesso = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(adesso);
}

/** Date in UTC a mezzanotte, come le salva il backend ("AAAA-MM-GG" ↔ Date). */
export const testoData = (d: Date) => d.toISOString().slice(0, 10);
export const meseDi = (testo: string) => testo.slice(0, 4) + testo.slice(5, 7);
export function piuGiorni(d: Date, n: number) {
  return new Date(d.getTime() + n * 86_400_000);
}
/** Lunedì della settimana che contiene la data. */
export function lunedi(d: Date) {
  const giorno = (d.getUTCDay() + 6) % 7; // lunedì = 0
  return piuGiorni(d, -giorno);
}
export function giorniTra(da: Date, a: Date) {
  return Math.round((a.getTime() - da.getTime()) / 86_400_000) + 1;
}

/** Errore sui minuti di una riga, o null se vanno bene: multipli di 15, almeno 15, al massimo 24 ore. */
export function erroreMinuti(minuti: unknown): string | null {
  if (typeof minuti !== 'number' || !Number.isInteger(minuti)) return 'i minuti devono essere un numero intero';
  if (minuti < MINUTI_PASSO) return 'almeno 15 minuti (0,25 ore)';
  if (minuti > MINUTI_GIORNO) return 'al massimo 24 ore';
  if (minuti % MINUTI_PASSO !== 0) return 'le ore vanno a passi di 15 minuti';
  return null;
}

/** Chiave che identifica una riga della griglia: progetto o attività, più tipologia. */
type IdTestuale = { toString(): string } | string | null | undefined;

export function chiaveRiga(r: { progettoId: IdTestuale; attivitaId?: IdTestuale; tipologiaId: IdTestuale }) {
  return `${String(r.progettoId)}|${r.attivitaId ? String(r.attivitaId) : '-'}|${String(r.tipologiaId)}`;
}

/** Prima chiave ripetuta tra le righe, o null. */
export function primaRipetuta(righe: readonly { progettoId: IdTestuale; attivitaId?: IdTestuale; tipologiaId: IdTestuale }[]): string | null {
  const viste = new Set<string>();
  for (const r of righe) {
    const k = chiaveRiga(r);
    if (viste.has(k)) return k;
    viste.add(k);
  }
  return null;
}

export const totaleMinuti = (righe: readonly { minuti: number }[]) => righe.reduce((s, r) => s + r.minuti, 0);

/**
 * Avviso (non un errore) se le ore ordinarie superano l'orario contrattuale del giorno.
 * Senza orario contrattuale vale il parametro oreGiorno.
 */
export function avvisoOrdinarie(minutiOrdinari: number, oreContrattuali: number | null | undefined, oreGiorno: number): string | null {
  const ore = oreContrattuali && oreContrattuali > 0 ? oreContrattuali : oreGiorno;
  if (minutiOrdinari <= ore * 60) return null;
  return `ore ordinarie (${formattaOre(minutiOrdinari)}) oltre l'orario contrattuale di ${formattaOre(ore * 60)}`;
}

/** 450 → "7:30". */
export function formattaOre(minuti: number) {
  return `${Math.floor(minuti / 60)}:${String(minuti % 60).padStart(2, '0')}`;
}

/** La data è nel rapporto di lavoro della risorsa (ingresso e uscita compresi, se indicati). */
export function erroreDateRisorsa(data: Date, ingresso?: Date | null, uscita?: Date | null): string | null {
  if (ingresso && data.getTime() < ingresso.getTime()) return `data precedente all'ingresso della risorsa (${testoData(ingresso)})`;
  if (uscita && data.getTime() > uscita.getTime()) return `data successiva all'uscita della risorsa (${testoData(uscita)})`;
  return null;
}
