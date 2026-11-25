import type { NodoCosti } from './modelli';
import { righeVisibili, tuttiIPercorsi } from './report-costi';

const nodo = (livello: NodoCosti['livello'], chiave: string, figli: NodoCosti[] = []): NodoCosti => ({
  livello, chiave, etichetta: chiave, figli, righe: 1, minuti: 60, giorni: 0.13, daValorizzare: 0, minutiDaValorizzare: 0,
});

describe('report dei costi: albero espandibile', () => {
  const albero = [nodo('cdc', 'C1', [nodo('progetto', 'P1', [nodo('attivita', 'A1')]), nodo('progetto', 'P2')]), nodo('cdc', 'C2')];

  it('mostra i figli solo dei nodi aperti, con la profondità', () => {
    expect(righeVisibili(albero, new Set()).map((r) => r.nodo.chiave)).toEqual(['C1', 'C2']);
    const aperte = righeVisibili(albero, new Set(['/cdc:C1', '/cdc:C1/progetto:P1']));
    expect(aperte.map((r) => [r.nodo.chiave, r.profondita, r.apribile])).toEqual([['C1', 0, true], ['P1', 1, true], ['A1', 2, false], ['P2', 1, false], ['C2', 0, false]]);
  });

  it('"Espandi tutto" apre ogni nodo con figli', () => {
    expect(tuttiIPercorsi(albero)).toEqual(['/cdc:C1', '/cdc:C1/progetto:P1']);
  });
});
