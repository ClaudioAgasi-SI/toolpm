import { describe, expect, it } from 'vitest';
import { costruisciAlbero, type Foglia, leggiLivelli } from './costi-albero.js';

const t = (minuti: number, costoCentesimi: number, daValorizzare = 0) => ({ righe: 1, minuti, costoCentesimi, daValorizzare, minutiDaValorizzare: daValorizzare ? minuti : 0 });

describe('report dei costi: livelli', () => {
  it('predefiniti, validi, senza ripetizioni, da 1 a 4', () => {
    expect(leggiLivelli(undefined)).toEqual(['cdc', 'progetto']);
    expect(leggiLivelli('progetto, risorsa')).toEqual(['progetto', 'risorsa']);
    expect(() => leggiLivelli('progetto,cliente')).toThrow(/non validi/);
    expect(() => leggiLivelli('progetto,progetto')).toThrow(/due volte/);
    expect(() => leggiLivelli('cdc,progetto,attivita,risorsa,mese')).toThrow(/da 1 a 4/);
  });
});

describe('report dei costi: albero (RF-21)', () => {
  const foglie: Foglia[] = [
    { valori: { cdc: 'C1', progetto: 'P1', attivita: 'A1' }, totali: t(480, 20000) },
    { valori: { cdc: 'C1', progetto: 'P1', attivita: '' }, totali: t(120, 6000) },
    { valori: { cdc: 'C1', progetto: 'P2', attivita: 'A2' }, totali: t(240, 0, 1) },
    { valori: { cdc: 'C2', progetto: 'P3', attivita: 'A3' }, totali: t(60, 3000) },
  ];

  it('ogni riga conta una volta per livello', () => {
    const a = costruisciAlbero(foglie, ['cdc', 'progetto', 'attivita']);
    expect(a.totali).toMatchObject({ minuti: 900, costoCentesimi: 29000, daValorizzare: 1, righe: 4 });
    const c1 = a.figli.find((n) => n.chiave === 'C1')!;
    expect(c1.totali).toMatchObject({ minuti: 840, costoCentesimi: 26000 });
    const p1 = c1.figli.find((n) => n.chiave === 'P1')!;
    expect(p1.totali.minuti).toBe(600);
    expect(p1.figli.map((n) => [n.livello, n.chiave, n.totali.minuti])).toEqual([['attivita', 'A1', 480], ['attivita', '', 120]]);
    expect(p1.figli[0].figli).toEqual([]);
  });

  it('qualunque ordine dei livelli dà gli stessi totali', () => {
    const a = costruisciAlbero(foglie, ['attivita']);
    expect(a.figli).toHaveLength(4);
    expect(costruisciAlbero(foglie, ['progetto', 'cdc']).totali).toEqual(costruisciAlbero(foglie, ['cdc']).totali);
    expect(costruisciAlbero([], ['cdc'])).toEqual({ totali: { righe: 0, minuti: 0, costoCentesimi: 0, daValorizzare: 0, minutiDaValorizzare: 0 }, figli: [] });
  });
});
