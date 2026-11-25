import type { EvmProgetto } from './modelli';
import { indice, spiegazione, toneStato } from './evm-testi';
import { euro, gg } from './report-testi';

const timbufe: EvmProgetto = {
  calcolabile: true,
  motivo: null,
  percentuale: 40,
  trascorso: 50,
  euro: { bac: 17_600_000, pv: 8_800_000, ev: 7_040_000, ac: 8_000_000, sv: -1_760_000, cv: -960_000, spi: 0.8, cpi: 0.88, eac: 20_000_000, etc: 12_000_000, vac: -2_400_000, tcpi: 1.1 },
  giorni: { bac: 440, pv: 220, ev: 176, ac: 200, sv: -44, cv: -24, spi: 0.8, cpi: 0.88, eac: 500, etc: 300, vac: -60, tcpi: 1.1 },
  fonteBacEuro: 'definitiva',
  fonteBacGiorni: 'definitiva',
  statoTempi: 'inForteRitardo',
  statoCosti: 'sopraBudget',
  costiDa: 'euro',
  daValorizzare: { righe: 0, minuti: 0 },
};

describe('testi EVM', () => {
  it('spiega l\'esempio TIMBUFE come nell\'analisi', () => {
    const s = spiegazione(timbufe);
    expect(s.tempi).toBe('In forte ritardo: è stato fatto il 40% del lavoro contro il 50% previsto a questa data (SPI 0,80).');
    expect(s.costi.replace(/ /g, ' ')).toBe(
      'Sopra budget: al ritmo attuale costerà 200.000,00 €, 24.000,00 € oltre la stima; per rientrare nel budget il lavoro restante dovrebbe rendere il 10% in più (TCPI 1,10).',
    );
  });

  it('in giorni per chi non vede gli euro; casi non calcolabili', () => {
    const { euro: _e, ...tl } = timbufe;
    expect(spiegazione(tl).costi).toContain('richiederà 500 giorni, 60 giorni oltre la stima');
    expect(spiegazione({ ...timbufe, trascorso: null }).tempi).toContain('Senza data di inizio e di fine');
    expect(spiegazione({ ...timbufe, calcolabile: false, motivo: 'inValutazione' }).tempi).toContain('In valutazione');
    expect(spiegazione({ ...timbufe, euro: { ...timbufe.euro!, cpi: null, eac: null }, costiDa: null }).costi).toContain('Nessun costo consuntivato');
    const daiGiorni = spiegazione({ ...timbufe, euro: { ...timbufe.euro!, ac: 0, cpi: null, eac: null }, costiDa: 'giorni' }).costi;
    expect(daiGiorni).toContain('richiederà 500 giorni');
    expect(daiGiorni).toContain('Calcolato in giorni');
  });

  it('euro e giorni con il punto delle migliaia', () => {
    expect(euro(400_000)).toBe('4.000,00 €');
    expect(euro(-1_120_988)).toBe('-11.209,88 €');
    expect(gg(1234.5)).toBe('1.234,5');
    expect(gg(40)).toBe('40');
  });

  it('indici e colori', () => {
    expect(indice(0.8)).toBe('0,80');
    expect(indice(null)).toBe('—');
    expect(toneStato('inForteRitardo')).toBe('male');
    expect(toneStato('sottoBudget')).toBe('bene');
    expect(toneStato('nonCalcolabile')).toBe('nessuno');
  });
});
