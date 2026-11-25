import type { EvmProgetto, StatoCosti, StatoTempi } from './modelli';
import { euro, gg } from './report-testi';

/** Testi degli indicatori EVM (fase 4, blocco E2; RF-30). */
export const ETICHETTA_TEMPI: Record<StatoTempi, string> = {
  inAnticipo: 'In anticipo',
  inLinea: 'In linea',
  inRitardo: 'In ritardo',
  inForteRitardo: 'In forte ritardo',
  nonCalcolabile: 'Non calcolabile',
};

export const ETICHETTA_COSTI: Record<StatoCosti, string> = {
  sottoBudget: 'Sotto budget',
  inLinea: 'In linea',
  sopraBudget: 'Sopra budget',
  fortementeSopraBudget: 'Fortemente sopra budget',
  nonCalcolabile: 'Non calcolabile',
};

/** Colore dello stato: bene, linea, attenzione, male, nessuno. */
export function toneStato(s: StatoTempi | StatoCosti): 'bene' | 'linea' | 'attenzione' | 'male' | 'nessuno' {
  switch (s) {
    case 'inAnticipo':
    case 'sottoBudget':
      return 'bene';
    case 'inLinea':
      return 'linea';
    case 'inRitardo':
    case 'sopraBudget':
      return 'attenzione';
    case 'inForteRitardo':
    case 'fortementeSopraBudget':
      return 'male';
    default:
      return 'nessuno';
  }
}

/** Indice con due decimali alla italiana (0,80). */
export const indice = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Spiegazione a parole di tempi e costi, come nell'esempio dell'analisi; in giorni per chi non vede gli euro. */
export function spiegazione(e: EvmProgetto): { tempi: string; costi: string } {
  if (!e.calcolabile) {
    const motivo = e.motivo === 'inValutazione' ? 'il progetto è In valutazione: gli indicatori si calcolano per i progetti In corso e Chiusi' : 'il progetto non ha stime: senza budget non ci sono indicatori';
    return { tempi: `Nessun indicatore: ${motivo}.`, costi: '' };
  }
  const rif = e.euro ?? e.giorni!;
  // I costi dalla grandezza che ha dato lo stato: euro se il CPI in euro è calcolabile, altrimenti giorni.
  const costiRif = e.costiDa === 'giorni' ? e.giorni! : rif;
  const tempi =
    e.trascorso === null || rif.spi === null
      ? e.trascorso === null
        ? 'Senza data di inizio e di fine non si può dire se il progetto è in linea con i tempi.'
        : 'Il progetto non è ancora iniziato: lo stato dei tempi non è calcolabile.'
      : `${ETICHETTA_TEMPI[e.statoTempi]}: è stato fatto il ${e.percentuale}% del lavoro contro il ${Math.round(e.trascorso)}% previsto a questa data (SPI ${indice(rif.spi)}).`;

  let costi: string;
  if (costiRif.cpi === null) costi = 'Nessun costo consuntivato fino a questa data: CPI e previsioni non sono calcolabili.';
  else if (costiRif.eac === null) costi = `${ETICHETTA_COSTI[e.statoCosti]}: il lavoro fatto risulta a zero, le previsioni non sono calcolabili (CPI ${indice(costiRif.cpi)}).`;
  else {
    const inEuro = costiRif === e.euro;
    const f = (n: number) => (inEuro ? euro(n) : `${gg(n)} giorni`);
    const vac = costiRif.vac ?? 0;
    const scarto = vac === 0 ? 'in linea con la stima' : `${f(Math.abs(vac))} ${vac < 0 ? 'oltre' : 'sotto'} la stima`;
    costi = `${ETICHETTA_COSTI[e.statoCosti]}: al ritmo attuale ${inEuro ? 'costerà' : 'richiederà'} ${f(costiRif.eac)}, ${scarto}`;
    if (vac < 0 && costiRif.tcpi !== null) {
      costi += `; per rientrare nel budget il lavoro restante dovrebbe rendere il ${Math.round((costiRif.tcpi - 1) * 100)}% in più (TCPI ${indice(costiRif.tcpi)})`;
    }
    costi += '.';
    if (e.euro && !inEuro) costi += ' Calcolato in giorni: nessuna riga fino a questa data ha ancora un costo in euro.';
  }
  return { tempi, costi };
}
