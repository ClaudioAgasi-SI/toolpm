import { costoCentesimi, inPeriodo, periodiSovrapposti, risolviTariffa, ruoloAllaData, type TariffaPeriodo } from './risoluzione.js';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const ORD = 'tip-ordinaria';
const STR = 'tip-straordinaria';
const NOT = 'tip-notturna';
const FES = 'tip-festiva';
const NUOVA = 'tip-reperibilita';

let n = 0;
const tariffa = (tipologiaId: string, euro: number, dal: string, al: string | null = null): TariffaPeriodo => ({
  _id: `t${++n}`,
  tipologiaId,
  centesimiOra: Math.round(euro * 100),
  validoDal: d(dal),
  validoAl: al ? d(al) : null,
});

describe('periodi', () => {
  it('estremi compresi, senza fine sempre valido dopo l\'inizio', () => {
    const p = { validoDal: d('2027-01-01'), validoAl: d('2027-01-31') };
    expect(inPeriodo(p, d('2027-01-01'))).toBe(true);
    expect(inPeriodo(p, d('2027-01-31'))).toBe(true);
    expect(inPeriodo(p, d('2026-12-31'))).toBe(false);
    expect(inPeriodo(p, d('2027-02-01'))).toBe(false);
    expect(inPeriodo({ validoDal: d('2027-01-01'), validoAl: null }, d('2099-12-31'))).toBe(true);
  });

  it('sovrapposizioni: basta un giorno in comune', () => {
    const gennaio = { validoDal: d('2027-01-01'), validoAl: d('2027-01-31') };
    expect(periodiSovrapposti(gennaio, { validoDal: d('2027-01-31'), validoAl: d('2027-02-28') })).toBe(true);
    expect(periodiSovrapposti(gennaio, { validoDal: d('2027-02-01'), validoAl: null })).toBe(false);
    expect(periodiSovrapposti(gennaio, { validoDal: d('2026-01-01'), validoAl: null })).toBe(true);
    expect(periodiSovrapposti({ validoDal: d('2027-03-01'), validoAl: null }, { validoDal: d('2027-01-01'), validoAl: null })).toBe(true);
    expect(periodiSovrapposti(gennaio, { validoDal: d('2026-01-01'), validoAl: d('2026-12-31') })).toBe(false);
  });
});

describe('ruolo alla data', () => {
  const storico = [
    { ruoloId: 'junior', dal: d('2025-01-01') },
    { ruoloId: 'senior', dal: d('2027-01-16') },
  ];
  it('l\'ultima voce con decorrenza non successiva, anche a metà mese', () => {
    expect(ruoloAllaData(storico, d('2027-01-15'))).toBe('junior');
    expect(ruoloAllaData(storico, d('2027-01-16'))).toBe('senior');
    expect(ruoloAllaData([...storico].reverse(), d('2027-02-01'))).toBe('senior');
  });
  it('nessun ruolo prima della prima decorrenza o senza storico', () => {
    expect(ruoloAllaData(storico, d('2024-12-31'))).toBeNull();
    expect(ruoloAllaData([], d('2027-01-01'))).toBeNull();
    expect(ruoloAllaData(undefined, d('2027-01-01'))).toBeNull();
  });
});

describe('risoluzione della tariffa', () => {
  // Esempio dell'analisi: Sviluppatore senior 30/39/45/51 €/h, personalizzata solo per l'ordinaria a 32 €/h.
  const standardSenior = [tariffa(ORD, 30, '2027-01-01'), tariffa(STR, 39, '2027-01-01'), tariffa(NOT, 45, '2027-01-01'), tariffa(FES, 51, '2027-01-01')];
  const personalizzate = [tariffa(ORD, 32, '2027-01-01')];
  const giorno = d('2027-03-10');

  it('la personalizzata prevale per le tipologie che contiene, per le altre vale la standard', () => {
    expect(risolviTariffa(ORD, giorno, personalizzate, standardSenior)).toMatchObject({ fonte: 'personalizzata', centesimiOra: 3200 });
    expect(risolviTariffa(STR, giorno, personalizzate, standardSenior)).toMatchObject({ fonte: 'standard', centesimiOra: 3900 });
    expect(risolviTariffa(FES, giorno, personalizzate, standardSenior)).toMatchObject({ fonte: 'standard', centesimiOra: 5100 });
  });

  it('esempio dell\'analisi: 10 ore in una giornata costano 334 €', () => {
    const righe = [
      { tipologia: ORD, minuti: 6 * 60 },
      { tipologia: STR, minuti: 2 * 60 },
      { tipologia: ORD, minuti: 2 * 60 },
    ];
    const costi = righe.map((r) => costoCentesimi(r.minuti, risolviTariffa(r.tipologia, giorno, personalizzate, standardSenior).centesimiOra));
    expect(costi).toEqual([19200, 7800, 6400]);
    expect(costi.reduce((a, b) => a! + b!, 0)).toBe(33400);
  });

  it('tipologia nuova senza tariffe: nessuna, la riga resta da valorizzare', () => {
    const r = risolviTariffa(NUOVA, giorno, personalizzate, standardSenior);
    expect(r).toEqual({ fonte: null, tariffaId: null, centesimiOra: null });
    expect(costoCentesimi(120, r.centesimiOra)).toBeNull();
  });

  it('cambio di tariffa: vale quella in vigore alla data della riga', () => {
    const storia = [tariffa(STR, 39, '2027-01-01', '2027-03-31'), tariffa(STR, 41, '2027-04-01')];
    expect(risolviTariffa(STR, d('2027-03-31'), [], storia).centesimiOra).toBe(3900);
    expect(risolviTariffa(STR, d('2027-04-01'), [], storia).centesimiOra).toBe(4100);
  });

  it('personalizzata scaduta: si torna alla standard', () => {
    const scaduta = [tariffa(ORD, 32, '2027-01-01', '2027-02-28')];
    expect(risolviTariffa(ORD, d('2027-03-01'), scaduta, standardSenior)).toMatchObject({ fonte: 'standard', centesimiOra: 3000 });
  });

  it('riporta l\'identificativo della tariffa usata', () => {
    const r = risolviTariffa(ORD, giorno, personalizzate, standardSenior);
    expect(r.tariffaId).toBe(String(personalizzate[0]._id));
  });
});

describe('costo della riga', () => {
  it('minuti × centesimi all\'ora / 60, arrotondato al centesimo', () => {
    expect(costoCentesimi(60, 3900)).toBe(3900);
    expect(costoCentesimi(15, 3900)).toBe(975);
    // 15 minuti a 33,33 €/h = 8,3325 € → 8,33 €
    expect(costoCentesimi(15, 3333)).toBe(833);
    // 15 minuti a 33,34 €/h = 8,335 € → 8,34 € (metà arrotondata per eccesso)
    expect(costoCentesimi(15, 3334)).toBe(834);
    expect(costoCentesimi(45, 0)).toBe(0);
  });
});
