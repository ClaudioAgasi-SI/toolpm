import {
  avvisoOrdinarie,
  erroreDateRisorsa,
  erroreMinuti,
  formattaOre,
  lunedi,
  meseDi,
  oggiInItalia,
  primaRipetuta,
  testoData,
} from './regole-giornata.js';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('regole della giornata', () => {
  it('minuti: passi di 15, almeno 15, al massimo 24 ore', () => {
    expect(erroreMinuti(15)).toBeNull();
    expect(erroreMinuti(480)).toBeNull();
    expect(erroreMinuti(1440)).toBeNull();
    expect(erroreMinuti(0)).toMatch(/almeno/);
    expect(erroreMinuti(10)).toMatch(/almeno/);
    expect(erroreMinuti(50)).toMatch(/15 minuti/);
    expect(erroreMinuti(1455)).toMatch(/24 ore/);
    expect(erroreMinuti(30.5)).toMatch(/intero/);
    expect(erroreMinuti('60')).toMatch(/intero/);
  });

  it('due righe con la stessa voce e la stessa tipologia', () => {
    const r = (p: string, a: string | null, t: string) => ({ progettoId: p, attivitaId: a, tipologiaId: t });
    expect(primaRipetuta([r('P', null, 'ORD'), r('P', 'A1', 'ORD'), r('P', null, 'STR')])).toBeNull();
    expect(primaRipetuta([r('P', 'A1', 'ORD'), r('Q', null, 'ORD'), r('P', 'A1', 'ORD')])).toBe('P|A1|ORD');
  });

  it('avviso sulle ore ordinarie oltre l\'orario contrattuale (o oreGiorno se manca)', () => {
    expect(avvisoOrdinarie(480, 8, 8)).toBeNull();
    expect(avvisoOrdinarie(495, 8, 8)).toBe("ore ordinarie (8:15) oltre l'orario contrattuale di 8:00");
    expect(avvisoOrdinarie(300, 4, 8)).toMatch(/4:00/);
    expect(avvisoOrdinarie(495, null, 8)).toMatch(/8:00/);
    expect(avvisoOrdinarie(420, null, 6)).toMatch(/6:00/);
  });

  it('date della risorsa: ingresso e uscita compresi', () => {
    expect(erroreDateRisorsa(d('2027-03-01'), d('2027-03-01'), d('2027-03-31'))).toBeNull();
    expect(erroreDateRisorsa(d('2027-02-28'), d('2027-03-01'))).toMatch(/ingresso/);
    expect(erroreDateRisorsa(d('2027-04-01'), null, d('2027-03-31'))).toMatch(/uscita/);
    expect(erroreDateRisorsa(d('2027-04-01'))).toBeNull();
  });

  it('date: lunedì della settimana, mese, oggi in Italia', () => {
    expect(testoData(lunedi(d('2027-03-03')))).toBe('2027-03-01'); // mercoledì
    expect(testoData(lunedi(d('2027-03-07')))).toBe('2027-03-01'); // domenica
    expect(testoData(lunedi(d('2027-03-01')))).toBe('2027-03-01');
    expect(meseDi('2027-03-07')).toBe('202703');
    // 23:30 UTC del 31 dicembre è già il primo gennaio in Italia.
    expect(oggiInItalia(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(formattaOre(450)).toBe('7:30');
  });
});
