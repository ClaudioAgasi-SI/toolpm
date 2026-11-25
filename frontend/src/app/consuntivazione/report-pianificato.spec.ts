import { tonoScostamento } from './report-pianificato';

const o = (pianificati: number, consuntivati: number, percentuale: number | null) => ({ pianificati, consuntivati, inAttesa: 0, scostamento: { minuti: consuntivati - pianificati, percentuale } });

describe('pianificato: tono dello scostamento', () => {
  it('entro ±10% in linea, fino a ±25% attenzione, oltre male; senza pianificato attenzione; vuoto nessuno', () => {
    expect(tonoScostamento(o(100, 92, -8))).toBe('linea');
    expect(tonoScostamento(o(100, 120, 20))).toBe('attenzione');
    expect(tonoScostamento(o(100, 20, -80))).toBe('male');
    expect(tonoScostamento(o(0, 240, null))).toBe('attenzione');
    expect(tonoScostamento(o(0, 0, null))).toBe('nessuno');
    expect(tonoScostamento({ ...o(0, 0, null), inAttesa: 120 })).toBe('attenzione');
  });
});
