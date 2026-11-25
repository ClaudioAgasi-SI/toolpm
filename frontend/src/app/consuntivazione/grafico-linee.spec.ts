import { tacche } from './grafico-linee';

describe('grafico: tacche dell\'asse', () => {
  it('valori tondi tra minimo e massimo', () => {
    expect(tacche(0, 1.2)).toEqual([0, 0.5, 1]);
    expect(tacche(0, 1_600_000)).toEqual([0, 500_000, 1_000_000, 1_500_000]);
    expect(tacche(0, 40)).toEqual([0, 10, 20, 30, 40]);
    expect(tacche(5, 5)).toEqual([5]);
  });
});
