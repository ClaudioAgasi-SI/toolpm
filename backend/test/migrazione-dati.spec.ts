// Test unitari degli strumenti della migrazione dei dati (fase 1, blocco B7).
import { verificaPassword } from '../src/auth/password.js';
import { codiceProposto, fotografiaGriglia } from '../scripts/migrazione-dati/comune.mjs';
import { leggiCsv, scriviCsv } from '../scripts/migrazione-dati/csv.mjs';
import { cifraPassword, passwordProvvisoria } from '../scripts/migrazione-dati/password.mjs';

describe('CSV per Excel', () => {
  it('scrive con BOM e ";" e rilegge gli stessi valori, anche con virgolette, ";" e a capo', () => {
    const righe = [
      { a: 'semplice', b: 'con; punto e virgola' },
      { a: 'con "virgolette"', b: 'su\ndue righe' },
      { a: '', b: 'àèìòù' },
    ];
    const testo = scriviCsv(['a', 'b'], righe);
    expect(testo.startsWith('﻿a;b\r\n')).toBe(true);
    const letto = leggiCsv(testo);
    expect(letto.colonne).toEqual(['a', 'b']);
    expect(letto.righe.map(({ _riga, ...r }) => r)).toEqual([righe[0], righe[1], { a: '', b: 'àèìòù' }]);
    expect(letto.righe.map((r) => r._riga)).toEqual([2, 3, 5]);
  });

  it('accetta anche file con "," senza BOM e salta le righe vuote', () => {
    const { righe } = leggiCsv('id,email\n1, mario@x.it \n\n2,\n;\n');
    expect(righe).toEqual([
      { _riga: 2, id: '1', email: 'mario@x.it' },
      { _riga: 4, id: '2', email: '' },
      { _riga: 5, id: ';', email: '' },
    ]);
  });
});

describe('utilità della migrazione', () => {
  it('propone codici validi dai testi liberi', () => {
    expect(codiceProposto('Reigegnerizzazione ROC')).toBe('Reigegnerizzazione-ROC');
    expect(codiceProposto(' Città & Più ')).toBe('Citta-Piu');
  });

  it('la fotografia della griglia somma righe e percentuali per risorsa e mese', () => {
    const r = [{ _id: 'r1', planned: [{ mese: '202701', percentualeAllocazione: 30 }, { mese: '202701', percentualeAllocazione: 20 }, { mese: '202702' }] }];
    expect(fotografiaGriglia(r)).toEqual({ 'r1|202701': { righe: 2, percentuale: 50 }, 'r1|202702': { righe: 1, percentuale: 0 } });
  });

  it('le password create dagli script sono riconosciute dal backend', async () => {
    const pw = passwordProvvisoria();
    expect(pw).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]{12}$/);
    expect(await verificaPassword(pw, await cifraPassword(pw))).toBe(true);
    expect(await verificaPassword('altra-password', await cifraPassword(pw))).toBe(false);
  });
});
