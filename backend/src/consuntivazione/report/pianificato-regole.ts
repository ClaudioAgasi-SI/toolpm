/**
 * Regole pure del confronto tra pianificato e consuntivato (fase 4, blocco E5; decisione 2).
 * Ore pianificate = percentuale di allocazione × giorni lavorativi del mese × ore contrattuali al giorno.
 * Giorni lavorativi: da lunedì a venerdì, meno le festività nazionali italiane (Pasquetta compresa),
 * entro le date di ingresso e uscita della risorsa. Le ferie non si tolgono.
 */

const testo = (d: Date) => d.toISOString().slice(0, 10);

/** Domenica di Pasqua (calendario gregoriano, algoritmo di Meeus/Jones/Butcher), a mezzanotte UTC. */
export function pasqua(anno: number): Date {
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31);
  const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anno, mese - 1, giorno));
}

/**
 * Festività nazionali italiane dell'anno ("AAAA-MM-GG"): Capodanno, Epifania, Pasqua e Pasquetta, Liberazione,
 * Festa del lavoro, Festa della Repubblica, Ferragosto, San Francesco (dal 2026, legge 151/2025), Ognissanti,
 * Immacolata, Natale, Santo Stefano. I patroni locali non ci sono.
 */
export function festivita(anno: number): Set<string> {
  const p = pasqua(anno);
  const fisse = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'];
  if (anno >= 2026) fisse.push('10-04');
  return new Set([...fisse.map((g) => `${anno}-${g}`), testo(p), testo(new Date(p.getTime() + 86_400_000))]);
}

/** Giorni lavorativi del mese "AAAAMM", entro ingresso e uscita (comprese) se ci sono. */
export function giorniLavorativi(mese: string, ingresso?: Date | null, uscita?: Date | null): number {
  const anno = +mese.slice(0, 4);
  const m = +mese.slice(4) - 1;
  const feste = festivita(anno);
  let n = 0;
  for (let d = new Date(Date.UTC(anno, m, 1)); d.getUTCMonth() === m; d = new Date(d.getTime() + 86_400_000)) {
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6 || feste.has(testo(d))) continue;
    if (ingresso && d < ingresso) continue;
    if (uscita && d > uscita) continue;
    n++;
  }
  return n;
}

/** Minuti pianificati: percentuale × giorni lavorativi × ore al giorno, arrotondati al minuto. */
export function minutiPianificati(percentuale: number, giorni: number, oreGiorno: number): number {
  return Math.round((percentuale / 100) * giorni * oreGiorno * 60);
}

/** Scostamento del consuntivato dal pianificato, in minuti e in percentuale (null senza pianificato). */
export function scostamento(pianificati: number, consuntivati: number) {
  const minuti = consuntivati - pianificati;
  return { minuti, percentuale: pianificati ? Math.round((minuti / pianificati) * 100) : null };
}

/** Mesi "AAAAMM" da `da` ad `a` compresi. */
export function mesiTra(da: string, a: string): string[] {
  const mesi: string[] = [];
  let anno = +da.slice(0, 4);
  let m = +da.slice(4);
  while (`${anno}${String(m).padStart(2, '0')}` <= a) {
    mesi.push(`${anno}${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) [anno, m] = [anno + 1, 1];
  }
  return mesi;
}
