/**
 * Calcoli della stima di un'offerta (fase 5, blocco F0; analisi "Stima, costo e prezzo"): funzioni pure,
 * l'unico punto dove si arrotonda. Giorni a due decimali, importi al centesimo per ruolo, poi si somma.
 *
 *   giorni del ruolo   = Σ giorni delle voci del ruolo × (1 + contingenza)
 *   costo              = Σ giorni del ruolo × ore di una giornata × tariffa di costo oraria del ruolo
 *   prezzo da listino  = Σ giorni del ruolo × tariffa di vendita giornaliera del ruolo
 *   prezzo             = prezzo da listino × (1 − sconto); a corpo lo decide il responsabile
 *   margine            = prezzo − costo; margine % = margine / prezzo
 */

export type TipoOfferta = 'corpo' | 'consuntivo' | 'pacchetto';

export interface VoceStima {
  ruoloId: string;
  giorni: number;
}

export interface GruppoStima {
  nome: string;
  voci: readonly VoceStima[];
}

/** Tariffe di un ruolo alla data: costo orario (tariffa standard, tipologia ordinaria) e vendita giornaliera. */
export interface TariffeRuolo {
  costoCentesimiOra: number | null;
  venditaCentesimiGiorno: number | null;
}

export interface IngressoStima {
  tipo: TipoOfferta;
  gruppi: readonly GruppoStima[];
  contingenzaPercento: number;
  scontoPercento: number;
  /** Solo a corpo: il prezzo finale deciso dal responsabile (null = non ancora deciso). */
  prezzoACorpoCentesimi?: number | null;
  oreGiorno: number;
  tariffe: ReadonlyMap<string, TariffeRuolo>;
}

export interface TotaleRuolo {
  ruoloId: string;
  giorni: number;
  giorniConContingenza: number;
  costoCentesimiGiorno: number | null;
  costoCentesimi: number | null;
  venditaCentesimiGiorno: number | null;
  prezzoListinoCentesimi: number | null;
}

export interface TotaliStima {
  perRuolo: TotaleRuolo[];
  perGruppo: { nome: string; giorni: number; giorniConContingenza: number }[];
  giorni: number;
  giorniConContingenza: number;
  /** null se manca almeno una tariffa di costo. */
  costoCentesimi: number | null;
  /** null se manca almeno una tariffa di vendita. */
  prezzoListinoCentesimi: number | null;
  /** Prezzo da listino meno lo sconto (proposta, anche a corpo). */
  prezzoCalcolatoCentesimi: number | null;
  /** Prezzo dell'offerta: a corpo quello deciso, altrimenti quello calcolato. */
  prezzoCentesimi: number | null;
  margineCentesimi: number | null;
  /** Percentuale con un decimale. */
  marginePercento: number | null;
  ruoliSenzaCosto: string[];
  ruoliSenzaVendita: string[];
}

export const dueDecimali = (n: number) => Math.round(n * 100) / 100;
const conContingenza = (giorni: number, contingenza: number) => dueDecimali(giorni * (1 + contingenza / 100));
const somma = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
/** Somma di importi: null se ne manca anche uno. */
const sommaImporti = (xs: readonly (number | null)[]) => (xs.some((x) => x === null) ? null : somma(xs as number[]));

/** Totali della stima: per ruolo, per gruppo e complessivi, con costo, prezzo e margine. */
export function calcolaStima(x: IngressoStima): TotaliStima {
  const giorniPerRuolo = new Map<string, number>();
  for (const g of x.gruppi) for (const v of g.voci) giorniPerRuolo.set(v.ruoloId, (giorniPerRuolo.get(v.ruoloId) ?? 0) + v.giorni);

  const perRuolo: TotaleRuolo[] = [...giorniPerRuolo.entries()].map(([ruoloId, giorni]) => {
    const t = x.tariffe.get(ruoloId);
    const gc = conContingenza(giorni, x.contingenzaPercento);
    const costoGiorno = t?.costoCentesimiOra == null ? null : Math.round(t.costoCentesimiOra * x.oreGiorno);
    const vendita = t?.venditaCentesimiGiorno ?? null;
    return {
      ruoloId,
      giorni: dueDecimali(giorni),
      giorniConContingenza: gc,
      costoCentesimiGiorno: costoGiorno,
      costoCentesimi: costoGiorno === null ? null : Math.round(gc * costoGiorno),
      venditaCentesimiGiorno: vendita,
      prezzoListinoCentesimi: vendita === null ? null : Math.round(gc * vendita),
    };
  });

  const costo = sommaImporti(perRuolo.map((r) => r.costoCentesimi));
  const listino = sommaImporti(perRuolo.map((r) => r.prezzoListinoCentesimi));
  const calcolato = listino === null ? null : Math.round(listino * (1 - x.scontoPercento / 100));
  const prezzo = x.tipo === 'corpo' ? (x.prezzoACorpoCentesimi ?? calcolato) : calcolato;
  const margine = prezzo === null || costo === null ? null : prezzo - costo;

  return {
    perRuolo,
    perGruppo: x.gruppi.map((g) => {
      const giorni = somma(g.voci.map((v) => v.giorni));
      return { nome: g.nome, giorni: dueDecimali(giorni), giorniConContingenza: conContingenza(giorni, x.contingenzaPercento) };
    }),
    giorni: dueDecimali(somma(perRuolo.map((r) => r.giorni))),
    giorniConContingenza: dueDecimali(somma(perRuolo.map((r) => r.giorniConContingenza))),
    costoCentesimi: costo,
    prezzoListinoCentesimi: listino,
    prezzoCalcolatoCentesimi: calcolato,
    prezzoCentesimi: prezzo,
    margineCentesimi: margine,
    marginePercento: margine === null || !prezzo ? null : Math.round((margine / prezzo) * 1000) / 10,
    ruoliSenzaCosto: perRuolo.filter((r) => r.costoCentesimi === null).map((r) => r.ruoloId),
    ruoliSenzaVendita: perRuolo.filter((r) => r.prezzoListinoCentesimi === null).map((r) => r.ruoloId),
  };
}

/** Sotto il margine minimo (l'approvazione chiede una nota). Senza margine calcolabile: no. */
export const sottoMargineMinimo = (t: Pick<TotaliStima, 'marginePercento'>, minimoPercento: number) =>
  t.marginePercento !== null && t.marginePercento < minimoPercento;

/** Numero dell'offerta: OFF-AAAA-NNNN (almeno quattro cifre). */
export const numeroOfferta = (anno: number, progressivo: number) => `OFF-${anno}-${String(progressivo).padStart(4, '0')}`;

/** Chiave del contatore dei numeri di un anno, nella collection "contatori". */
export const chiaveContatore = (anno: number) => `offerte-${anno}`;
