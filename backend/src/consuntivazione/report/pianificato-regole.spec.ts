import { describe, expect, it } from 'vitest';
import { festivita, giorniLavorativi, mesiTra, minutiPianificati, pasqua, scostamento } from './pianificato-regole.js';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('pianificato: calendario', () => {
  it('Pasqua negli anni noti', () => {
    expect(pasqua(2024).toISOString().slice(0, 10)).toBe('2024-03-31');
    expect(pasqua(2025).toISOString().slice(0, 10)).toBe('2025-04-20');
    expect(pasqua(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
    expect(pasqua(2027).toISOString().slice(0, 10)).toBe('2027-03-28');
  });

  it('festività: Pasquetta compresa, San Francesco dal 2026', () => {
    expect(festivita(2026).has('2026-04-06')).toBe(true);
    expect(festivita(2026).has('2026-10-04')).toBe(true);
    expect(festivita(2025).has('2025-10-04')).toBe(false);
    expect(festivita(2027).size).toBe(13);
  });

  it('giorni lavorativi: lun–ven meno le festività, entro ingresso e uscita', () => {
    // Aprile 2026: 22 giorni da lunedì a venerdì, meno Pasquetta (6) → 21; il 25 è sabato.
    expect(giorniLavorativi('202604')).toBe(21);
    // Dicembre 2026: 23 giorni feriali, meno l'8 (martedì) e il 25 (venerdì) → 21; il 26 è sabato.
    expect(giorniLavorativi('202612')).toBe(21);
    // Ottobre 2027: San Francesco cade di lunedì.
    expect(giorniLavorativi('202710')).toBe(20);
    expect(giorniLavorativi('202604', d('2026-04-16'))).toBe(11);
    expect(giorniLavorativi('202604', null, d('2026-04-10'))).toBe(7);
    expect(giorniLavorativi('202604', d('2026-05-01'))).toBe(0);
  });
});

describe('pianificato: ore e scostamenti', () => {
  it('minuti pianificati e scostamento', () => {
    expect(minutiPianificati(50, 21, 8)).toBe(5040);
    expect(minutiPianificati(100, 20, 7.5)).toBe(9000);
    expect(scostamento(5040, 4536)).toEqual({ minuti: -504, percentuale: -10 });
    expect(scostamento(0, 480)).toEqual({ minuti: 480, percentuale: null });
  });

  it('mesi compresi, anche a cavallo d\'anno', () => {
    expect(mesiTra('202611', '202602')).toEqual([]);
    expect(mesiTra('202611', '202702')).toEqual(['202611', '202612', '202701', '202702']);
  });
});
