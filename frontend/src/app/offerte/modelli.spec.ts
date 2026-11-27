import { euroGiorno, margineGiorno, periodoBreve } from './modelli';

describe('listino: testi e margine della giornata (F1)', () => {
  it('scrive gli importi giornalieri', () => {
    expect(euroGiorno(45000)).toBe('450,00 €/gg');
    expect(euroGiorno(null)).toBe('—');
    expect(periodoBreve('2026-01-01', null)).toBe('dal 01/01/2026');
    expect(periodoBreve('2026-01-01', '2026-12-31')).toBe('dal 01/01/2026 al 31/12/2026');
    expect(periodoBreve(null, null)).toBe('');
  });

  it('calcola il margine della giornata a listino', () => {
    expect(margineGiorno(45000, 28000)).toBe(37.8);
    expect(margineGiorno(45000, null)).toBeNull();
    expect(margineGiorno(0, 100)).toBeNull();
  });
});
