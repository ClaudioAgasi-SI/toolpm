/**
 * Esportazioni dei report in Excel (xlsx) e CSV (fase 4, blocco E6; decisione 7).
 * Un'esportazione è un elenco di fogli; ognuno ha le righe di intestazione (report, vista, periodo, data
 * di estrazione), le colonne con il tipo e le righe. Il CSV usa il primo foglio: separatore ";", decimali con la
 * virgola e BOM UTF-8, come lo apre Excel in italiano.
 */
import { BadRequestException, StreamableFile } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Vista } from './viste.js';

export type Formato = 'xlsx' | 'csv';
export type TipoColonna = 'testo' | 'numero' | 'ore' | 'giorni' | 'euro' | 'percento' | 'data' | 'dataOra';

export interface Colonna {
  titolo: string;
  tipo: TipoColonna;
  larghezza?: number;
}

export type Valore = string | number | Date | null | undefined;

export interface Foglio {
  nome: string;
  colonne: Colonna[];
  righe: Valore[][];
  /** Livello di rientro di ogni riga (struttura ad albero), facoltativo. */
  livelli?: number[];
  /** Riga dei totali in fondo, facoltativa. */
  totale?: Valore[];
}

export interface Esportazione {
  titolo: string;
  /** Nome breve per il file, es. "report-costi". */
  base: string;
  vista: Vista;
  /** Righe descrittive dopo il titolo (periodo, filtri...). */
  note: string[];
  fogli: Foglio[];
  estrattoIl?: Date;
}

export function leggiFormato(valore: unknown): Formato | null {
  if (valore === undefined || valore === null || valore === '') return null;
  if (valore === 'xlsx' || valore === 'csv') return valore;
  throw new BadRequestException('formato: xlsx oppure csv');
}

/** Ore decimali dai minuti (41:30 → 41,5). */
export const oreDecimali = (minuti: number | null | undefined) => (minuti === null || minuti === undefined ? null : Math.round((minuti / 60) * 100) / 100);
/** Euro dai centesimi. */
export const euroDaCentesimi = (c: number | null | undefined) => (c === null || c === undefined ? null : c / 100);

const dataItaliana = (d: Date) => d.toLocaleDateString('it-IT', { timeZone: 'UTC' });
const dataOraItaliana = (d: Date) => d.toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Righe di intestazione comuni: titolo, vista, note, data di estrazione. */
export function intestazione(e: Esportazione): string[] {
  const vista = e.vista === 'provvisoria'
    ? 'Dati PROVVISORI: comprendono le ore in bozza, inviate e con il via libera del TL, non ancora approvate dal PM'
    : 'Dati approvati dal PM (e dei mesi chiusi)';
  return [e.titolo, vista, ...e.note, `Estratto il ${dataOraItaliana(e.estrattoIl ?? new Date())}`];
}

/** Nome del file: toolpm-<base>-<AAAA-MM-GG>[-provvisorio].<ext> */
export function nomeFile(e: Esportazione, formato: Formato): string {
  const giorno = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(e.estrattoIl ?? new Date());
  return `toolpm-${e.base}-${giorno}${e.vista === 'provvisoria' ? '-provvisorio' : ''}.${formato}`;
}

/** Valore di una cella CSV: numeri con la virgola e senza separatore delle migliaia, date all'italiana. */
export function valoreCsv(v: Valore, tipo: TipoColonna): string {
  if (v === null || v === undefined || v === '') return '';
  let s: string;
  if (v instanceof Date) s = tipo === 'dataOra' ? dataOraItaliana(v) : dataItaliana(v);
  else if (typeof v === 'number') s = String(tipo === 'euro' ? Math.round(v * 100) / 100 : v).replace('.', ',');
  else s = v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV del primo foglio, con le righe di intestazione in testa e una riga vuota prima della tabella. */
export function csv(e: Esportazione): Buffer {
  const f = e.fogli[0];
  const righe = [
    ...intestazione(e).map((t) => valoreCsv(t, 'testo')),
    '',
    f.colonne.map((c) => valoreCsv(c.titolo, 'testo')).join(';'),
    ...f.righe.map((r) => r.map((v, i) => valoreCsv(v, f.colonne[i].tipo)).join(';')),
    ...(f.totale ? [f.totale.map((v, i) => valoreCsv(v, f.colonne[i].tipo)).join(';')] : []),
  ];
  return Buffer.from(`﻿${righe.join('\r\n')}\r\n`, 'utf8');
}

const FORMATI: Partial<Record<TipoColonna, string>> = {
  ore: '#,##0.00',
  giorni: '#,##0.00',
  euro: '#,##0.00 "€"',
  percento: '0"%"',
  numero: '#,##0.##',
  data: 'dd/mm/yyyy',
  dataOra: 'dd/mm/yyyy hh:mm',
};

/** Excel: un foglio per elemento, con intestazione, tabella con filtri, riquadri bloccati, rientri e totale. */
export async function xlsx(e: Esportazione): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'ToolPM';
  libro.created = e.estrattoIl ?? new Date();
  const testa = intestazione(e);
  for (const f of e.fogli) {
    const foglio = libro.addWorksheet(f.nome.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'), { properties: { outlineLevelRow: 1 } });
    testa.forEach((t, i) => {
      const r = foglio.addRow([t]);
      if (i === 0) r.font = { bold: true, size: 13 };
      if (i === 1 && e.vista === 'provvisoria') r.font = { bold: true, color: { argb: 'FF9A5B00' } };
    });
    foglio.addRow([]);
    const riga0 = foglio.rowCount + 1;
    const titoli = foglio.addRow(f.colonne.map((c) => c.titolo));
    titoli.font = { bold: true };
    titoli.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8ECF2' } };
      c.border = { bottom: { style: 'thin', color: { argb: 'FF9AA3B2' } } };
    });
    f.righe.forEach((valori, i) => {
      const r = foglio.addRow(valori.map((v) => (v === undefined ? null : v)));
      const livello = f.livelli?.[i];
      if (livello !== undefined) {
        r.outlineLevel = livello;
        r.getCell(1).alignment = { indent: livello * 2 };
        if (livello === 0) r.font = { bold: true };
      }
    });
    if (f.totale) {
      const t = foglio.addRow(f.totale.map((v) => (v === undefined ? null : v)));
      t.font = { bold: true };
      t.eachCell((c) => (c.border = { top: { style: 'thin', color: { argb: 'FF9AA3B2' } } }));
    }
    f.colonne.forEach((c, i) => {
      const col = foglio.getColumn(i + 1);
      col.width = c.larghezza ?? (c.tipo === 'testo' ? 28 : 14);
      const fmt = FORMATI[c.tipo];
      if (fmt) col.numFmt = fmt;
    });
    foglio.views = [{ state: 'frozen', ySplit: riga0 }];
    foglio.autoFilter = { from: { row: riga0, column: 1 }, to: { row: riga0, column: f.colonne.length } };
  }
  return Buffer.from(await libro.xlsx.writeBuffer());
}

/** File pronto da scaricare, con il nome e il tipo giusti. */
export async function file(e: Esportazione, formato: Formato): Promise<StreamableFile> {
  const contenuto = formato === 'csv' ? csv(e) : await xlsx(e);
  return new StreamableFile(contenuto, {
    type: formato === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    disposition: `attachment; filename="${nomeFile(e, formato)}"`,
  });
}
