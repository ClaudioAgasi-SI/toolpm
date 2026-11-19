/**
 * Regole dei permessi di ToolPM (fase 1, blocco B3), decise nell'analisi del 17/11/2026.
 *
 * Funzioni pure: ricevono chi agisce e i dati che servono (progetto, attività, progetti della risorsa)
 * e rispondono sì o no. Non leggono il database: i dati li procura chi le chiama (PermessiService,
 * servizi del modulo Comuni). Così le regole si provano una per una nei test.
 *
 * Due livelli:
 * - abilitazione generale dell'utente (TL, PM, PMSenior o nessuna), assegnata dall'amministratore;
 * - ruolo sul singolo progetto (approvatore TL o PM), indipendente dall'abilitazione.
 * Il PMSenior può tutto ciò che può il PM, su tutti i progetti, anche dove non è assegnato.
 * I diritti da approvatore valgono solo per chi ha un'abilitazione: se l'amministratore la toglie,
 * la persona resta nell'elenco degli approvatori ma non può più gestire il progetto.
 */
import type { Abilitazione, Ruolo } from '../auth/utente.schema.js';

/** Chi agisce: basta il sottoinsieme di UtenteAutenticato che serve alle regole. */
export interface Soggetto {
  id: string;
  risorsaId?: string;
  abilitazione: Abilitazione | null;
  ruoli: Ruolo[];
}

/** Profilo con cui una persona è assegnata a un progetto. Il PMSenior che crea un progetto vale come PM. */
export type ProfiloProgetto = 'TL' | 'PM' | 'PMSenior';

export interface ApprovatoreProgetto {
  risorsaId: string | { toString(): string };
  profilo: ProfiloProgetto;
}

/** Quanto serve di un progetto per decidere i permessi. */
export interface ProgettoPerPermessi {
  approvatori?: ApprovatoreProgetto[];
}

/** Quanto serve di un'attività per decidere i permessi. */
export interface AttivitaPerPermessi {
  risorseAssegnateIds?: (string | { toString(): string })[];
}

export type StatoProgetto = 'inValutazione' | 'inCorso' | 'chiuso';

/**
 * Permessi che non dipendono da un progetto o da una risorsa precisi: si decidono solo da
 * abilitazione e ruoli. Si usano con il decoratore @Permesso() sui controller e li riceve il
 * frontend (GET /api/auth/me) per mostrare solo le voci di menu consentite.
 */
export const PERMESSI_GLOBALI = [
  'gestireClienti',
  'gestireCentriDiCosto',
  'creareProgetto',
  'gestireRisorse',
  'gestireCaratteristicheTutteLeRisorse',
  'gestireParametri',
  'gestireUtenti',
] as const;
export type PermessoGlobale = (typeof PERMESSI_GLOBALI)[number];

const id = (v: string | { toString(): string } | undefined | null) => (v == null ? undefined : String(v));

export const ePMSenior = (s: Soggetto) => s.abilitazione === 'PMSenior';
const ePMoPMSenior = (s: Soggetto) => s.abilitazione === 'PM' || s.abilitazione === 'PMSenior';

/** Profilo del soggetto sul progetto (null se non è approvatore o non ha più un'abilitazione). */
export function profiloSulProgetto(s: Soggetto, progetto: ProgettoPerPermessi): ProfiloProgetto | null {
  if (!s.abilitazione || !s.risorsaId) return null;
  const profili = (progetto.approvatori ?? []).filter((a) => id(a.risorsaId) === s.risorsaId).map((a) => a.profilo);
  if (profili.includes('PM') || profili.includes('PMSenior')) return 'PM';
  return profili.includes('TL') ? 'TL' : null;
}

/** TL o PM approvatore del progetto, oppure PMSenior. */
function gestoreDelProgetto(s: Soggetto, progetto: ProgettoPerPermessi) {
  return ePMSenior(s) || profiloSulProgetto(s, progetto) !== null;
}

/** Valore di ogni permesso globale per il soggetto. */
export function permessoGlobale(s: Soggetto, permesso: PermessoGlobale): boolean {
  switch (permesso) {
    case 'gestireClienti':
    case 'gestireCentriDiCosto':
      return ePMSenior(s);
    case 'creareProgetto':
      return s.abilitazione !== null;
    case 'gestireRisorse':
    case 'gestireCaratteristicheTutteLeRisorse':
      return ePMoPMSenior(s);
    case 'gestireParametri':
      return s.ruoli.includes('controller');
    case 'gestireUtenti':
      return s.ruoli.includes('admin');
  }
}

export function permessiGlobali(s: Soggetto): Record<PermessoGlobale, boolean> {
  return Object.fromEntries(PERMESSI_GLOBALI.map((p) => [p, permessoGlobale(s, p)])) as Record<PermessoGlobale, boolean>;
}

/** Dati del progetto (titolo, descrizione, cliente, date, stime in giorni ed euro, opzioni). */
export const puoModificareProgetto = gestoreDelProgetto;

/** Percentuale di completamento del progetto: solo TL e PM approvatori e PMSenior, non le risorse semplici. */
export const puoModificarePercentualeProgetto = gestoreDelProgetto;

/** Creare, modificare ed eliminare le attività del progetto e assegnarne le risorse. */
export const puoGestireAttivita = gestoreDelProgetto;

/**
 * Passaggio di stato. In avanti (In valutazione → In corso → Chiuso): TL e PM del progetto, PMSenior.
 * Riapertura di un progetto Chiuso: solo PM del progetto o PMSenior.
 * Qui si decide solo chi può; se il passaggio è ammesso (date, almeno un PM) lo controlla il modulo Comuni.
 */
export function puoCambiareStatoProgetto(s: Soggetto, progetto: ProgettoPerPermessi, da: StatoProgetto): boolean {
  if (ePMSenior(s)) return true;
  const profilo = profiloSulProgetto(s, progetto);
  return da === 'chiuso' ? profilo === 'PM' : profilo !== null;
}

/**
 * Approvatori del progetto (chi è TL e chi è PM). Scelta di B3 da confermare: PM del progetto e PMSenior;
 * il TL no, perché potrebbe togliere il PM o nominarne uno. Il creatore viene aggiunto in automatico (B4).
 */
export function puoGestireApprovatori(s: Soggetto, progetto: ProgettoPerPermessi): boolean {
  return ePMSenior(s) || profiloSulProgetto(s, progetto) === 'PM';
}

/** Percentuale di completamento dell'attività: risorse assegnate, TL e PM del progetto, PMSenior. */
export function puoModificarePercentualeAttivita(
  s: Soggetto,
  progetto: ProgettoPerPermessi,
  attivita: AttivitaPerPermessi,
): boolean {
  if (gestoreDelProgetto(s, progetto)) return true;
  return !!s.risorsaId && (attivita.risorseAssegnateIds ?? []).some((r) => id(r) === s.risorsaId);
}

/** Dati anagrafici della persona, ruolo professionale, orario contrattuale: PM e PMSenior. */
export const puoGestireRisorse = (s: Soggetto) => ePMoPMSenior(s);

/**
 * Caratteristiche della risorsa (skill, certificazioni, allocazioni del Pianificatore…):
 * PM e PMSenior su tutte; TL solo sulle risorse che lavorano su un progetto di cui è approvatore.
 * "Lavorano" nella fase 1 = allocate nel Pianificatore; dalla fase 2 anche con ore consuntivate.
 *
 * @param progettiDelSoggetto id dei progetti di cui il soggetto è approvatore (TL o PM)
 * @param progettiDellaRisorsa id dei progetti su cui la risorsa lavora
 */
export function puoModificareCaratteristicheRisorsa(
  s: Soggetto,
  progettiDelSoggetto: Iterable<string>,
  progettiDellaRisorsa: Iterable<string>,
): boolean {
  if (ePMoPMSenior(s)) return true;
  if (s.abilitazione !== 'TL') return false;
  const miei = new Set(progettiDelSoggetto);
  for (const p of progettiDellaRisorsa) if (miei.has(p)) return true;
  return false;
}

/**
 * Filtro MongoDB per i progetti che il soggetto può gestire (elenco "I miei progetti", scelte nei menu):
 * tutti per il PMSenior, quelli in cui è approvatore per TL e PM, nessuno per gli altri.
 * Restituisce null quando non c'è niente da cercare.
 */
export function filtroProgettiGestibili(s: Soggetto): Record<string, unknown> | null {
  if (ePMSenior(s)) return {};
  if (!s.abilitazione || !s.risorsaId) return null;
  return { 'approvatori.risorsaId': s.risorsaId };
}
