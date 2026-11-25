import { giorni, leggiVista, senzaEuro, STATI_VISTA } from './viste.js';

describe('viste dei report', () => {
  it('approvata predefinita; provvisoria senza le respinte', () => {
    expect(leggiVista(undefined)).toBe('approvata');
    expect(leggiVista('provvisoria')).toBe('provvisoria');
    expect(() => leggiVista('tutte')).toThrow(/vista/);
    expect(STATI_VISTA.approvata).toEqual(['approvata', 'chiusa']);
    expect(STATI_VISTA.provvisoria).not.toContain('respinta');
  });

  it('giorni con oreGiorno e totali senza euro', () => {
    expect(giorni(480 * 3 + 240, 8)).toBe(3.5);
    expect(giorni(100, 8)).toBe(0.21);
    expect(senzaEuro({ minuti: 60, costoCentesimi: 3000, righe: 1 })).toEqual({ minuti: 60, righe: 1 });
  });
});
