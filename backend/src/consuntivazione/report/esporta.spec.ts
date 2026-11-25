import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { csv, type Esportazione, leggiFormato, nomeFile, oreDecimali, valoreCsv, xlsx } from './esporta.js';

const esempio = (vista: 'approvata' | 'provvisoria' = 'approvata'): Esportazione => ({
  titolo: 'Report dei costi',
  base: 'report-costi',
  vista,
  note: ['Periodo: dal 01/09/2026 al 30/09/2026'],
  estrattoIl: new Date('2026-11-25T18:30:00Z'),
  fogli: [
    {
      nome: 'Costi',
      colonne: [
        { titolo: 'Voce', tipo: 'testo' },
        { titolo: 'Ore', tipo: 'ore' },
        { titolo: 'Costo', tipo: 'euro' },
      ],
      righe: [
        ['PX — Portale; X', 41.5, 1234.5],
        ['Nota con "virgolette"', 0.25, null],
      ],
      livelli: [0, 1],
      totale: ['Totale', 41.75, 1234.5],
    },
  ],
});

describe('esportazioni', () => {
  it('formato, nome del file e ore decimali', () => {
    expect(leggiFormato(undefined)).toBeNull();
    expect(leggiFormato('csv')).toBe('csv');
    expect(() => leggiFormato('pdf')).toThrow(/xlsx oppure csv/);
    expect(nomeFile(esempio(), 'xlsx')).toBe('toolpm-report-costi-2026-11-25.xlsx');
    expect(nomeFile(esempio('provvisoria'), 'csv')).toBe('toolpm-report-costi-2026-11-25-provvisorio.csv');
    expect(oreDecimali(2490)).toBe(41.5);
  });

  it('CSV: BOM, intestazione, separatore ";", virgola decimale, testo tra virgolette se serve', () => {
    const testo = csv(esempio()).toString('utf8');
    expect(testo.charCodeAt(0)).toBe(0xfeff);
    const righe = testo.slice(1).split('\r\n');
    expect(righe[0]).toBe('Report dei costi');
    expect(righe[1]).toBe('Dati approvati dal PM (e dei mesi chiusi)');
    expect(righe[3]).toBe('Estratto il 25/11/2026, 19:30');
    expect(righe[5]).toBe('Voce;Ore;Costo');
    expect(righe[6]).toBe('"PX — Portale; X";41,5;1234,5');
    expect(righe[7]).toBe('"Nota con ""virgolette""";0,25;');
    expect(righe[8]).toBe('Totale;41,75;1234,5');
    expect(valoreCsv(new Date('2026-09-10T00:00:00Z'), 'data')).toBe('10/09/2026');
    expect(csv(esempio('provvisoria')).toString('utf8')).toContain('Dati PROVVISORI');
  });

  it('Excel: un foglio con intestazione, tabella, rientri e totale', async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load((await xlsx(esempio())) as never);
    const f = libro.getWorksheet('Costi')!;
    expect(f.getCell('A1').value).toBe('Report dei costi');
    expect(f.getRow(6).values).toEqual([undefined, 'Voce', 'Ore', 'Costo']);
    expect(f.getCell('B7').value).toBe(41.5);
    expect(f.getRow(8).outlineLevel).toBe(1);
    expect(f.getCell('A9').value).toBe('Totale');
    expect(f.getColumn(3).numFmt).toContain('€');
  });
});
