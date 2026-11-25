/**
 * Calcolo degli indicatori Earned Value (fase 4, blocco E2; RF-29, RF-30, RF-32).
 * Funzioni pure: nessun accesso al database. Le formule sono quelle dell'analisi
 * ("Calcolo dell'avanzamento (EVM)"); si applicano a una grandezza alla volta, euro (centesimi) o giorni.
 */

export interface SoglieEvm {
  anticipo: number;
  ritardo: number;
  fortementeInRitardo: number;
}

export const SOGLIE_PREDEFINITE: SoglieEvm = { anticipo: 1.05, ritardo: 0.95, fortementeInRitardo: 0.85 };

export type StatoTempi = 'inAnticipo' | 'inLinea' | 'inRitardo' | 'inForteRitardo' | 'nonCalcolabile';
export type StatoCosti = 'sottoBudget' | 'inLinea' | 'sopraBudget' | 'fortementeSopraBudget' | 'nonCalcolabile';

export interface IndicatoriEvm {
  bac: number;
  /** null senza date di inizio e fine. */
  pv: number | null;
  ev: number;
  ac: number;
  sv: number | null;
  cv: number;
  spi: number | null;
  /** null se AC è zero. */
  cpi: number | null;
  eac: number | null;
  etc: number | null;
  vac: number | null;
  /** null se il costo ha già raggiunto il budget. */
  tcpi: number | null;
}

export interface IngressoEvm {
  /** Budget: stima definitiva, altrimenti manageriale. Senza (o zero) non ci sono indicatori. */
  bac: number | null | undefined;
  /** Percentuale di completamento alla data (0–100). */
  percentuale: number;
  /** Costo (o giorni) consuntivato fino alla data. */
  ac: number;
  /** Quota della durata trascorsa (0–1), null senza date. */
  quota: number | null;
}

const due = (n: number) => Math.round(n * 100) / 100;
/** Centesimi interi. */
export const arrotondaCentesimi = (n: number) => Math.round(n);
/** Giorni a due decimali. */
export const arrotondaGiorni = due;

/**
 * Quota della durata trascorsa alla data, tra 0 e 1: (giorni dall'inizio) / (giorni tra inizio e fine).
 * Con l'esempio TIMBUFE (01/01–31/12, al 02/07) vale 182/364 = 0,5. null senza date o con fine non dopo l'inizio.
 */
export function quotaTrascorsa(inizio: Date | null | undefined, fine: Date | null | undefined, al: Date): number | null {
  if (!inizio || !fine) return null;
  const durata = fine.getTime() - inizio.getTime();
  if (durata <= 0) return null;
  return Math.min(1, Math.max(0, (al.getTime() - inizio.getTime()) / durata));
}

/** Indicatori di una grandezza; null se manca il budget. Gli indici a due decimali, i valori con `arrotonda`. */
export function calcolaEvm(x: IngressoEvm, arrotonda: (n: number) => number): IndicatoriEvm | null {
  const bac = x.bac ?? 0;
  if (!(bac > 0)) return null;
  const ev = (bac * x.percentuale) / 100;
  const ac = x.ac;
  const pv = x.quota === null ? null : bac * x.quota;
  const spi = pv ? ev / pv : null;
  const cpi = ac > 0 ? ev / ac : null;
  const eac = cpi ? bac / cpi : null;
  const r = (n: number | null) => (n === null ? null : arrotonda(n));
  return {
    bac: arrotonda(bac),
    pv: r(pv),
    ev: arrotonda(ev),
    ac: arrotonda(ac),
    sv: pv === null ? null : arrotonda(ev - pv),
    cv: arrotonda(ev - ac),
    spi: spi === null ? null : due(spi),
    cpi: cpi === null ? null : due(cpi),
    eac: r(eac),
    etc: eac === null ? null : arrotonda(eac - ac),
    vac: eac === null ? null : arrotonda(bac - eac),
    tcpi: bac - ac > 0 ? due((bac - ev) / (bac - ac)) : null,
  };
}

/** Stato dei tempi da SPI: >= anticipo In anticipo; >= ritardo In linea; >= fortementeInRitardo In ritardo; sotto In forte ritardo. */
export function statoTempi(spi: number | null | undefined, s: SoglieEvm): StatoTempi {
  if (spi === null || spi === undefined) return 'nonCalcolabile';
  if (spi >= s.anticipo) return 'inAnticipo';
  if (spi >= s.ritardo) return 'inLinea';
  if (spi >= s.fortementeInRitardo) return 'inRitardo';
  return 'inForteRitardo';
}

/** Stato dei costi da CPI, con le stesse soglie. */
export function statoCosti(cpi: number | null | undefined, s: SoglieEvm): StatoCosti {
  if (cpi === null || cpi === undefined) return 'nonCalcolabile';
  if (cpi >= s.anticipo) return 'sottoBudget';
  if (cpi >= s.ritardo) return 'inLinea';
  if (cpi >= s.fortementeInRitardo) return 'sopraBudget';
  return 'fortementeSopraBudget';
}

/** Soglie lette dal parametro, con quelle predefinite se il valore non è valido. */
export function soglieValide(v: unknown): SoglieEvm {
  const s = v as Partial<SoglieEvm> | null | undefined;
  const ok = s && [s.anticipo, s.ritardo, s.fortementeInRitardo].every((n) => typeof n === 'number' && n > 0);
  return ok ? (s as SoglieEvm) : SOGLIE_PREDEFINITE;
}

/**
 * Percentuale di completamento a un istante, dallo storico dei cambi (collection avanzamenti):
 * l'ultimo cambio fino a `fine` dà il valore; se tutti i cambi sono successivi vale il "precedente" del primo;
 * senza cambi, la percentuale attuale.
 */
export function percentualeAllIstante(
  attuale: number,
  cambi: readonly { il: Date; valorePrecedente: number; valoreNuovo: number }[],
  fine: Date,
): number {
  const ordinati = [...cambi].sort((a, b) => a.il.getTime() - b.il.getTime());
  let valore: number | null = null;
  for (const c of ordinati) {
    if (c.il.getTime() <= fine.getTime()) valore = c.valoreNuovo;
    else return valore ?? c.valorePrecedente;
  }
  return valore ?? attuale;
}

/** Fine del giorno (mezzanotte successiva) in Italia per una data a mezzanotte UTC, come istante. */
export function fineGiornoInItalia(giorno: Date): Date {
  const dopo = new Date(giorno.getTime() + 24 * 3600 * 1000);
  const parti = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', timeZoneName: 'shortOffset' }).formatToParts(dopo);
  const offset = parti.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const ore = Number(/GMT([+-]\d+)/.exec(offset)?.[1] ?? 1);
  return new Date(dopo.getTime() - ore * 3600 * 1000);
}

/** Dati del progetto che servono al calcolo. */
export interface ProgettoEvm {
  stato: string;
  dataInizio?: Date | null;
  dataFine?: Date | null;
  stime?: { managerialeGiorni?: number | null; managerialeCentesimi?: number | null; definitivaGiorni?: number | null; definitivaCentesimi?: number | null } | null;
}

export type FonteBac = 'definitiva' | 'manageriale' | null;

export interface EvmProgetto {
  calcolabile: boolean;
  /** Perché non ci sono indicatori: progetto In valutazione o senza stime. */
  motivo: 'inValutazione' | 'senzaStima' | null;
  percentuale: number;
  /** Quota della durata trascorsa in percentuale (0–100, due decimali); null senza date. */
  trascorso: number | null;
  euro: IndicatoriEvm | null;
  giorni: IndicatoriEvm | null;
  fonteBacEuro: FonteBac;
  fonteBacGiorni: FonteBac;
  statoTempi: StatoTempi;
  statoCosti: StatoCosti;
  /**
   * Indici da cui viene lo stato dei costi: in euro quando il CPI in euro è calcolabile, altrimenti in giorni
   * (per esempio se nessuna riga ha ancora un costo). Lo SPI è lo stesso nelle due grandezze.
   */
  costiDa: 'euro' | 'giorni' | null;
  /** Righe fino alla data senza costo: l'AC in euro è incompleto. */
  daValorizzare: { righe: number; minuti: number };
}

const fonte = (definitiva: number | null | undefined, manageriale: number | null | undefined): [number | null, FonteBac] =>
  (definitiva ?? 0) > 0 ? [definitiva!, 'definitiva'] : (manageriale ?? 0) > 0 ? [manageriale!, 'manageriale'] : [null, null];

/**
 * Indicatori del progetto alla data (RF-29, RF-30), in euro e in giorni.
 * Lo stato dei costi viene dal CPI in euro quando è calcolabile, altrimenti da quello in giorni
 * (lo SPI è lo stesso nelle due grandezze; il CPI può differire).
 */
export function evmProgetto(
  p: ProgettoEvm,
  x: { percentuale: number; al: Date; minuti: number; costoCentesimi: number; daValorizzare: number; minutiDaValorizzare: number; oreGiorno: number },
  soglie: SoglieEvm,
): EvmProgetto {
  const quota = quotaTrascorsa(p.dataInizio, p.dataFine, x.al);
  const base: EvmProgetto = {
    calcolabile: false,
    motivo: null,
    percentuale: x.percentuale,
    trascorso: quota === null ? null : Math.round(quota * 10000) / 100,
    euro: null,
    giorni: null,
    fonteBacEuro: null,
    fonteBacGiorni: null,
    statoTempi: 'nonCalcolabile',
    statoCosti: 'nonCalcolabile',
    costiDa: null,
    daValorizzare: { righe: x.daValorizzare, minuti: x.minutiDaValorizzare },
  };
  if (p.stato === 'inValutazione') return { ...base, motivo: 'inValutazione' };
  const s = p.stime ?? {};
  const [bacEuro, fonteEuro] = fonte(s.definitivaCentesimi, s.managerialeCentesimi);
  const [bacGiorni, fonteGiorni] = fonte(s.definitivaGiorni, s.managerialeGiorni);
  const euro = calcolaEvm({ bac: bacEuro, percentuale: x.percentuale, ac: x.costoCentesimi, quota }, arrotondaCentesimi);
  const gg = calcolaEvm({ bac: bacGiorni, percentuale: x.percentuale, ac: x.minuti / 60 / x.oreGiorno, quota }, arrotondaGiorni);
  if (!euro && !gg) return { ...base, motivo: 'senzaStima' };
  const costiDa = euro?.cpi != null ? 'euro' : gg?.cpi != null ? 'giorni' : null;
  return {
    ...base,
    calcolabile: true,
    euro,
    giorni: gg,
    fonteBacEuro: fonteEuro,
    fonteBacGiorni: fonteGiorni,
    statoTempi: statoTempi(euro?.spi ?? gg?.spi, soglie),
    statoCosti: statoCosti(costiDa === 'euro' ? euro!.cpi : gg?.cpi, soglie),
    costiDa,
  };
}

/** Toglie gli importi in euro (il TL vede giorni, indici e stati: decisione 4). */
export function evmSenzaEuro(e: EvmProgetto): Omit<EvmProgetto, 'euro' | 'fonteBacEuro'> {
  const { euro: _e, fonteBacEuro: _f, ...resto } = e;
  return resto;
}
