/**
 * Albero dei report dei costi (fase 4, blocco E4; RF-21): funzioni pure, provate in costi-albero.spec.ts.
 * Le foglie sono i gruppi di righe con il valore di ogni livello; l'albero somma ogni foglia una sola volta
 * per livello (attività → progetto → centro di costo, o qualunque ordine di livelli scelto).
 */
import { BadRequestException } from '@nestjs/common';
import { type Totali, totaliVuoti } from './viste.js';

export const LIVELLI = ['cdc', 'progetto', 'attivita', 'risorsa', 'ruolo', 'tipologia', 'mese'] as const;
export type Livello = (typeof LIVELLI)[number];
export const MAX_LIVELLI = 4;

export interface Foglia {
  /** Valore di ogni livello richiesto ('' = nessuno, es. ore sul progetto senza attività). */
  valori: Partial<Record<Livello, string>>;
  totali: Totali;
}

export interface NodoGrezzo {
  livello: Livello;
  chiave: string;
  totali: Totali;
  figli: NodoGrezzo[];
}

/** Legge "cdc,progetto,attivita": livelli validi, senza ripetizioni, da 1 a 4. Predefinito: centro di costo e progetto. */
export function leggiLivelli(valore: unknown): Livello[] {
  if (valore === undefined || valore === null || valore === '') return ['cdc', 'progetto'];
  if (typeof valore !== 'string') throw new BadRequestException('raggruppa: elenco di livelli separati da virgola');
  const livelli = valore.split(',').map((x) => x.trim()).filter(Boolean);
  const errati = livelli.filter((l) => !(LIVELLI as readonly string[]).includes(l));
  if (errati.length) throw new BadRequestException(`raggruppa: livelli non validi (${errati.join(', ')}); ammessi ${LIVELLI.join(', ')}`);
  if (new Set(livelli).size !== livelli.length) throw new BadRequestException('raggruppa: un livello compare due volte');
  if (!livelli.length || livelli.length > MAX_LIVELLI) throw new BadRequestException(`raggruppa: da 1 a ${MAX_LIVELLI} livelli`);
  return livelli as Livello[];
}

export function somma(a: Totali, b: Totali): Totali {
  return {
    righe: a.righe + b.righe,
    minuti: a.minuti + b.minuti,
    costoCentesimi: a.costoCentesimi + b.costoCentesimi,
    daValorizzare: a.daValorizzare + b.daValorizzare,
    minutiDaValorizzare: a.minutiDaValorizzare + b.minutiDaValorizzare,
  };
}

/** Albero annidato secondo i livelli, con i totali di ogni nodo e della radice. */
export function costruisciAlbero(foglie: Foglia[], livelli: Livello[]): { totali: Totali; figli: NodoGrezzo[] } {
  const nodi = (gruppo: Foglia[], profondita: number): NodoGrezzo[] => {
    if (profondita >= livelli.length) return [];
    const livello = livelli[profondita];
    const perChiave = new Map<string, Foglia[]>();
    for (const f of gruppo) {
      const k = f.valori[livello] ?? '';
      perChiave.set(k, [...(perChiave.get(k) ?? []), f]);
    }
    return [...perChiave.entries()].map(([chiave, fs]) => ({
      livello,
      chiave,
      totali: fs.reduce((t, f) => somma(t, f.totali), totaliVuoti()),
      figli: nodi(fs, profondita + 1),
    }));
  };
  return { totali: foglie.reduce((t, f) => somma(t, f.totali), totaliVuoti()), figli: nodi(foglie, 0) };
}
