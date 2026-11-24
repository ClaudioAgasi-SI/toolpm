import { descriviModifica, valore } from './storico-testi';

describe('testi dello storico', () => {
  it('valori in breve: ore, importi, stati, elenchi', () => {
    expect(valore('minuti', 450)).toBe('7:30');
    expect(valore('centesimiOra', 3250)).toBe('32,50 €/h');
    expect(valore('stato', 'approvataTL')).toBe('Via libera del TL');
    expect(valore('risorseAssegnateIds', ['a', 'b'])).toBe('2 elementi');
    expect(valore('nota', null)).toBe('—');
  });

  it('solo i campi leggibili, con prima e dopo', () => {
    expect(descriviModifica({ minuti: 480, stato: 'respinta', _id: 'x' }, { minuti: 360 })).toBe('ore: 8:00 → 6:00; stato: Respinta');
    expect(descriviModifica(null, { descrizione: 'Trasferta' })).toBe('descrizione: Trasferta');
    expect(descriviModifica({ minuti: 120, nota: null }, { minuti: 90, nota: null })).toBe('ore: 2:00 → 1:30');
  });
});
