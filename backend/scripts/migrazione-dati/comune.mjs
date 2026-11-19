// Parti comuni agli script della migrazione dei dati del Pianificatore (fase 1, blocco B7).

export const FILE_RISORSE = 'risorse.csv';
export const FILE_PROGETTI = 'progetti.csv';
export const FILE_GRIGLIA = 'controllo-griglia.json';
export const UTENTE = 'sistema:migrazione';

export const COLONNE_RISORSE = [
  'id',
  'cognome',
  'nome',
  'email',
  'cellulare',
  'matricola',
  'ruoloCodice',
  'ruoloDescrizione',
  'ruoloDal',
  'oreContrattualiGiorno',
  'abilitazione',
  'accesso',
];

export const COLONNE_PROGETTI = [
  'clienteTesto',
  'progettoTesto',
  'allocazioni',
  'codice',
  'titolo',
  'descrizione',
  'clienteCodice',
  'clienteRagioneSociale',
  'centroCostoCodice',
  'centroCostoDescrizione',
  'pm',
  'tl',
  'stato',
  'dataInizio',
  'dataFine',
];

/** Testo normalizzato delle allocazioni: spazi esterni tolti, assente = ''. */
export const norm = (v) => (typeof v === 'string' ? v.trim() : '');

/** Chiave di una coppia cliente/progetto testuale. */
export const chiaveCoppia = (cliente, progetto) => `${norm(cliente)}\u0000${norm(progetto)}`;

/**
 * Testi cliente/progetto di un'allocazione: quelli scritti a mano (cliente, progetto) oppure, dopo la
 * migrazione e il blocco B5, quelli conservati in clienteTesto e progettoTesto.
 */
export const testiAllocazione = (a) => ({
  cliente: norm(a.cliente) || norm(a.clienteTesto),
  progetto: norm(a.progetto) || norm(a.progettoTesto),
});

/** Allocazioni con un progetto scritto a testo (le righe senza progetto sono segnaposto). */
export function* allocazioniConTesto(risorse) {
  for (const r of risorse) {
    for (const [i, a] of (r.planned ?? []).entries()) {
      const t = testiAllocazione(a);
      if (t.progetto || t.cliente) yield { risorsa: r, allocazione: a, indice: i, ...t };
    }
  }
}

/** Codice proposto a partire da un testo libero: spazi → trattino, solo caratteri ammessi. */
export function codiceProposto(testo) {
  return norm(testo)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 40);
}

/** Somma delle percentuali per risorsa e mese: deve restare uguale prima e dopo la migrazione. */
export function fotografiaGriglia(risorse) {
  const totali = {};
  for (const r of risorse) {
    for (const a of r.planned ?? []) {
      const k = `${String(r._id)}|${a.mese}`;
      const t = (totali[k] ??= { righe: 0, percentuale: 0 });
      t.righe++;
      t.percentuale += a.percentualeAllocazione ?? 0;
    }
  }
  return totali;
}

export const tracciaNuovo = (ora) => ({ creatoIl: ora, creatoDa: UTENTE, modificatoIl: ora, modificatoDa: UTENTE });
export const tracciaModifica = (ora) => ({ modificatoIl: ora, modificatoDa: UTENTE });
