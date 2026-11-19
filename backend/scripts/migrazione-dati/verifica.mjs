// Passo 7 della migrazione: controlli finali. Non scrive nulla.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { allocazioniConTesto, FILE_GRIGLIA, fotografiaGriglia } from './comune.mjs';

/**
 * @returns {{ problemi: string[], riepilogo: object }} problemi vuoto = migrazione completa e coerente
 */
export async function verifica(db, cartella) {
  const problemi = [];
  const risorse = await db.collection('risorse').find().toArray();
  const progetti = await db.collection('progetti').find().toArray();
  const utenti = await db.collection('utenti').find().toArray();
  const idProgetti = new Set(progetti.map((p) => String(p._id)));

  const senzaEmail = risorse.filter((r) => !r.email);
  const allocazioni = [...allocazioniConTesto(risorse)];
  const nonCollegate = allocazioni.filter(({ allocazione: a }) => !a.progettoId);
  const collegateMale = allocazioni.filter(({ allocazione: a }) => a.progettoId && !idProgetti.has(String(a.progettoId)));
  const attiviSenzaPM = progetti.filter((p) => p.stato !== 'inValutazione' && !(p.approvatori ?? []).some((a) => a.profilo === 'PM'));

  for (const { risorsa: r, allocazione: a } of nonCollegate) {
    problemi.push(`Allocazione non collegata: ${r.cognome} ${r.nome}, mese ${a.mese}, "${a.cliente ?? ''}" / "${a.progetto ?? ''}"`);
  }
  for (const { risorsa: r, allocazione: a } of collegateMale) problemi.push(`Allocazione collegata a un progetto inesistente: ${r.cognome} ${r.nome}, mese ${a.mese}`);
  for (const p of attiviSenzaPM) problemi.push(`Progetto ${p.codice} (${p.stato}) senza PM`);

  // Griglia: per ogni risorsa e mese, stesso numero di righe e stessa somma delle percentuali di prima.
  let griglia = 'fotografia non trovata';
  try {
    const prima = JSON.parse(await readFile(path.join(cartella, FILE_GRIGLIA), 'utf8')).totali;
    const dopo = fotografiaGriglia(risorse);
    const diverse = [...new Set([...Object.keys(prima), ...Object.keys(dopo)])].filter(
      (k) => prima[k]?.righe !== dopo[k]?.righe || prima[k]?.percentuale !== dopo[k]?.percentuale,
    );
    for (const k of diverse) {
      const [id, mese] = k.split('|');
      const r = risorse.find((x) => String(x._id) === id);
      problemi.push(`Griglia diversa da prima: ${r ? `${r.cognome} ${r.nome}` : id}, mese ${mese}: prima ${JSON.stringify(prima[k] ?? null)}, ora ${JSON.stringify(dopo[k] ?? null)}`);
    }
    griglia = diverse.length ? `${diverse.length} celle diverse` : 'uguale a prima';
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  return {
    problemi,
    riepilogo: {
      risorse: risorse.length,
      risorseSenzaEmail: senzaEmail.map((r) => `${r.cognome} ${r.nome}`),
      utentiCollegati: utenti.filter((u) => u.risorsaId).length,
      progetti: progetti.length,
      progettiPerStato: Object.fromEntries(['inValutazione', 'inCorso', 'chiuso'].map((s) => [s, progetti.filter((p) => p.stato === s).length])),
      allocazioniConTesto: allocazioni.length,
      allocazioniCollegate: allocazioni.length - nonCollegate.length,
      griglia,
    },
  };
}
