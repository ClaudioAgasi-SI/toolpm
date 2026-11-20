import { etichettaGiorno, etichettaSettimana, leggiOre, lunedi, oggi, scriviOre, settimana } from './ore';

describe('ore della pagina "Il mio consuntivo"', () => {
  it('legge 8, 7,5, 7.5, 7:30, 0:15 e il vuoto', () => {
    expect(leggiOre('8')).toEqual({ minuti: 480 });
    expect(leggiOre('7,5')).toEqual({ minuti: 450 });
    expect(leggiOre(' 7.5 ')).toEqual({ minuti: 450 });
    expect(leggiOre('7:30')).toEqual({ minuti: 450 });
    expect(leggiOre('0:15')).toEqual({ minuti: 15 });
    expect(leggiOre('0,25')).toEqual({ minuti: 15 });
    expect(leggiOre('')).toEqual({ minuti: 0 });
    expect(leggiOre(null)).toEqual({ minuti: 0 });
  });

  it('rifiuta passi diversi da 15 minuti, oltre 24 ore e testo', () => {
    expect(leggiOre('7:10')).toHaveProperty('errore');
    expect(leggiOre('7,3')).toHaveProperty('errore');
    expect(leggiOre('25')).toHaveProperty('errore');
    expect(leggiOre('7:75')).toHaveProperty('errore');
    expect(leggiOre('otto')).toHaveProperty('errore');
    expect(leggiOre('-1')).toHaveProperty('errore');
  });

  it('scrive i minuti come h:mm', () => {
    expect(scriviOre(450)).toBe('7:30');
    expect(scriviOre(15)).toBe('0:15');
    expect(scriviOre(0)).toBe('');
  });

  it('date: lunedì, settimana, etichette, oggi in Italia', () => {
    expect(lunedi('2026-03-04')).toBe('2026-03-02');
    expect(lunedi('2026-03-08')).toBe('2026-03-02');
    expect(settimana('2026-03-04')).toEqual(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08']);
    expect(etichettaGiorno('2026-03-02')).toBe('lun 2 mar');
    expect(etichettaSettimana('2026-03-04')).toBe('2–8 mar 2026');
    expect(etichettaSettimana('2026-04-01')).toBe('30 mar – 5 apr 2026');
    expect(oggi(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
});
