// CSV per i file della migrazione (fase 1, blocco B7), pensati per Excel in italiano:
// separatore ";", UTF-8 con BOM (così Excel mostra bene gli accenti), righe CRLF.
// In lettura accetta anche "," come separatore e file senza BOM.

const BOM = '﻿';

/** Scrive righe (oggetti) nelle colonne indicate. */
export function scriviCsv(colonne, righe) {
  const cella = (v) => {
    const t = v === undefined || v === null ? '' : String(v);
    return /[";\r\n,]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const linee = [colonne.join(';'), ...righe.map((r) => colonne.map((c) => cella(r[c])).join(';'))];
  return BOM + linee.join('\r\n') + '\r\n';
}

/**
 * Legge un CSV con intestazione. Restituisce { colonne, righe }, dove ogni riga è un oggetto
 * { colonna: testo } più `_riga` (numero della riga nel file, per i messaggi d'errore).
 * Le righe completamente vuote vengono saltate; gli spazi attorno ai valori vengono tolti.
 */
export function leggiCsv(testo) {
  let t = testo.startsWith(BOM) ? testo.slice(1) : testo;
  const primaRiga = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primaRiga.match(/;/g)?.length ?? 0) >= (primaRiga.match(/,/g)?.length ?? 0) ? ';' : ',';

  const record = [];
  let campo = '';
  let riga = [];
  let tra = false;
  let numero = 1;
  let inizio = 1;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (tra) {
      if (c === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') tra = false;
      else {
        if (c === '\n') numero++;
        campo += c;
      }
    } else if (c === '"') tra = true;
    else if (c === sep) {
      riga.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      riga.push(campo);
      record.push({ celle: riga, numero: inizio });
      riga = [];
      campo = '';
      numero++;
      inizio = numero;
    } else campo += c;
  }
  if (campo !== '' || riga.length) {
    riga.push(campo);
    record.push({ celle: riga, numero: inizio });
  }
  if (!record.length) return { colonne: [], righe: [] };
  const colonne = record[0].celle.map((c) => c.trim());
  const righe = [];
  for (const { celle, numero: n } of record.slice(1)) {
    if (celle.every((c) => !c.trim())) continue;
    const o = { _riga: n };
    colonne.forEach((col, j) => (o[col] = (celle[j] ?? '').trim()));
    righe.push(o);
  }
  return { colonne, righe };
}
