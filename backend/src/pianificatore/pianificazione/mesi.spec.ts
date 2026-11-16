import { aggiungiMesi, intervalloMesi, MESE_RE } from './mesi.js';
import { pesoProbabilita } from './pesi.js';

describe('mesi', () => {
  it('aggiunge mesi attraversando l\'anno', () => {
    expect(aggiungiMesi('202611', 3)).toBe('202702');
    expect(aggiungiMesi('202701', -1)).toBe('202612');
  });

  it('genera un intervallo inclusivo', () => {
    expect(intervalloMesi('202611', '202702')).toEqual(['202611', '202612', '202701', '202702']);
  });

  it('valida il formato AAAAMM', () => {
    expect(MESE_RE.test('202701')).toBe(true);
    expect(MESE_RE.test('202713')).toBe(false);
    expect(MESE_RE.test('2027-1')).toBe(false);
  });
});

describe('pesoProbabilita', () => {
  it('usa la scala definita e 0 per valori sconosciuti', () => {
    expect(pesoProbabilita('sicura')).toBe(1);
    expect(pesoProbabilita('forse')).toBe(0.5);
    expect(pesoProbabilita('nessuna')).toBe(0);
    expect(pesoProbabilita('boh')).toBe(0);
    expect(pesoProbabilita(undefined)).toBe(1);
  });
});
