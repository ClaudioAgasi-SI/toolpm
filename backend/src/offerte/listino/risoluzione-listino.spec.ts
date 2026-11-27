import { risolviCostoOra, risolviVendita, tariffeRuoli, tipologiaOrdinaria, type TariffaCostoPeriodo, type VoceListinoPeriodo } from './risoluzione-listino.js';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const SVIL = 'r-svil';
const PM = 'r-pm';
const ACME = 'c-acme';

const voci: VoceListinoPeriodo[] = [
  { _id: 'v1', ruoloId: SVIL, clienteId: null, validoDal: d('2026-01-01'), validoAl: d('2026-12-31'), centesimiGiorno: 45000 },
  { _id: 'v2', ruoloId: SVIL, clienteId: null, validoDal: d('2027-01-01'), validoAl: null, centesimiGiorno: 47000 },
  { _id: 'v3', ruoloId: SVIL, clienteId: ACME, validoDal: d('2026-06-01'), validoAl: d('2026-12-31'), centesimiGiorno: 42000 },
  { _id: 'v4', ruoloId: PM, clienteId: null, validoDal: d('2026-01-01'), validoAl: null, centesimiGiorno: 60000 },
];
const costi: TariffaCostoPeriodo[] = [
  { _id: 't1', ruoloId: SVIL, validoDal: d('2026-01-01'), validoAl: null, centesimiOra: 3500 },
];

describe('listino di vendita: risoluzione (F1)', () => {
  it('prima il listino del cliente, poi lo standard', () => {
    expect(risolviVendita(SVIL, ACME, d('2026-07-15'), voci)).toEqual({ fonte: 'cliente', voceId: 'v3', centesimiGiorno: 42000 });
    expect(risolviVendita(SVIL, ACME, d('2026-05-31'), voci)).toEqual({ fonte: 'standard', voceId: 'v1', centesimiGiorno: 45000 });
    expect(risolviVendita(SVIL, ACME, d('2027-03-01'), voci)).toEqual({ fonte: 'standard', voceId: 'v2', centesimiGiorno: 47000 });
    expect(risolviVendita(SVIL, null, d('2026-07-15'), voci)).toEqual({ fonte: 'standard', voceId: 'v1', centesimiGiorno: 45000 });
    expect(risolviVendita(PM, ACME, d('2026-07-15'), voci).fonte).toBe('standard');
  });

  it('senza voce valida il ruolo resta senza tariffa di vendita', () => {
    expect(risolviVendita(SVIL, null, d('2025-12-31'), voci)).toEqual({ fonte: null, voceId: null, centesimiGiorno: null });
    expect(risolviVendita('r-tester', ACME, d('2026-07-15'), voci).centesimiGiorno).toBeNull();
  });

  it('costo orario della tipologia ordinaria alla data', () => {
    expect(risolviCostoOra(SVIL, d('2026-07-15'), costi)).toBe(3500);
    expect(risolviCostoOra(SVIL, d('2025-07-15'), costi)).toBeNull();
    expect(risolviCostoOra(PM, d('2026-07-15'), costi)).toBeNull();
  });

  it('sceglie la tipologia ordinaria predefinita, altrimenti la prima ordinaria attiva', () => {
    const tip = [
      { _id: 'a', categoria: 'straordinaria', predefinita: false, ordine: 1 },
      { _id: 'b', categoria: 'ordinaria', predefinita: false, ordine: 3, attiva: true },
      { _id: 'c', categoria: 'ordinaria', predefinita: true, ordine: 5 },
    ];
    expect(tipologiaOrdinaria(tip)?._id).toBe('c');
    expect(tipologiaOrdinaria(tip.slice(0, 2))?._id).toBe('b');
    expect(tipologiaOrdinaria(tip.slice(0, 1))).toBeNull();
  });

  it('prepara le tariffe dei ruoli per calcolaStima', () => {
    const m = tariffeRuoli([SVIL, PM], ACME, d('2026-07-15'), voci, costi);
    expect(m.get(SVIL)).toEqual({ costoCentesimiOra: 3500, venditaCentesimiGiorno: 42000, fonteVendita: 'cliente' });
    expect(m.get(PM)).toEqual({ costoCentesimiOra: null, venditaCentesimiGiorno: 60000, fonteVendita: 'standard' });
  });
});
