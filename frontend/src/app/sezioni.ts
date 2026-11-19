/**
 * Sezioni di ToolPM mostrate nel menu principale e nella home.
 * Per aggiungere una sezione: aggiungi qui la voce e la rotta in app.routes.ts.
 */
export interface Sezione {
  /** Percorso di primo livello, es. "pianificatore". */
  percorso: string;
  nome: string;
  descrizione: string;
}

export const SEZIONI: Sezione[] = [
  {
    percorso: 'pianificatore',
    nome: 'Pianificatore risorse',
    descrizione:
      'Allocazione delle persone sui progetti nel tempo, in base a skill tecniche, funzionali, di ambito e importanza strategica.',
  },
  {
    percorso: 'comuni',
    nome: 'Anagrafiche',
    descrizione:
      'Dati comuni a tutte le sezioni: progetti con attività e approvatori, risorse, clienti, centri di costo, ruoli e utenti.',
  },
];
