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
  'gestireRuoli',
  'gestireParametri',
  'gestireUtenti',
  // Consuntivazione (fase 2)
  'gestireTipologieCosto',
  'gestireTariffe',
  'consuntivare',
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
    case 'gestireTipologieCosto':
    case 'gestireTariffe':
      return s.ruoli.includes('controller');
    case 'consuntivare':
      // Consuntiva solo chi è collegato a una risorsa, e solo per sé stesso (decisione 7 della fase 2).
      return Boolean(s.risorsaId);
    case 'gestireRuoli':
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
 * Approvatori del progetto (chi è TL e chi è PM): PM del progetto e PMSenior (decisione del 19/11/2026);
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

/** Caratteristiche di una risorsa prima e dopo una modifica dal Pianificatore. */
export interface CaratteristicheRisorsa {
  skillTecnici?: unknown[];
  skillAmbiti?: unknown[];
  skillFunzionali?: unknown[];
  certificazioni?: unknown[];
  planned?: { progettoId?: unknown }[];
}

/** Campi delle allocazioni che non si salvano (ricavati dal progetto): non contano nei confronti. */
const CAMPI_RICAVATI = new Set(['cliente', 'progetto', 'progettoTitolo', 'clienteRagioneSociale']);

/** Id come testo (stringa, ObjectId o altro oggetto con toString). */
const comeTesto = (v: unknown) => (v == null ? undefined : typeof v === 'string' ? v : (v as { toString(): string }).toString());

/** Forma canonica (chiavi ordinate, id come testo) per confrontare due valori. */
function canonico(v: unknown): string {
  return JSON.stringify(v, (k, x: unknown) => {
    if (k === 'progettoId') return comeTesto(x);
    if (x && typeof x === 'object' && !Array.isArray(x)) {
      return Object.fromEntries(
        Object.entries(x as Record<string, unknown>)
          .filter(([k, val]) => val !== undefined && !CAMPI_RICAVATI.has(k))
          .sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return x;
  });
}

/**
 * Modifica delle caratteristiche di una risorsa dal Pianificatore (decisioni del 19/11/2026).
 * - PM e PMSenior: tutto, su tutte le risorse.
 * - TL: alloca qualsiasi risorsa sui progetti di cui è approvatore e ne modifica o toglie quelle
 *   allocazioni; le allocazioni su altri progetti (e i mesi liberi) restano come sono. Skill e
 *   certificazioni solo se la risorsa lavora su un suo progetto: allocata prima o dopo la modifica, oppure
 *   con ore consuntivate su un suo progetto.
 * - Gli altri: nulla.
 * Restituisce null se la modifica è consentita, altrimenti l'azione negata (per il messaggio 403).
 *
 * @param progettiDelSoggetto id dei progetti di cui il soggetto è approvatore (TL o PM)
 * @param progettiConsuntivati id dei progetti su cui la risorsa ha ore consuntivate (fase 2, blocco C4)
 * @param propria la risorsa modificata è quella del soggetto: chiunque cura le proprie skill e certificazioni
 *   (decisione del 20/11/2026), ma non le proprie allocazioni se non ne ha già il diritto
 */
export function motivoNegatoModificaRisorsa(
  s: Soggetto,
  progettiDelSoggetto: Iterable<string>,
  prima: CaratteristicheRisorsa,
  dopo: CaratteristicheRisorsa,
  progettiConsuntivati: Iterable<string> = [],
  propria = false,
): string | null {
  if (ePMoPMSenior(s)) return null;
  if (s.abilitazione !== 'TL') {
    if (!propria) return 'modificare le caratteristiche di questa risorsa';
    const tutte = (c: CaratteristicheRisorsa) => canonico((c.planned ?? []).map(canonico).sort());
    if (tutte(prima) !== tutte(dopo)) return 'modificare le tue allocazioni (le gestiscono PM, PMSenior e i TL dei progetti)';
    return null;
  }
  const miei = new Set(progettiDelSoggetto);
  const mia = (a: { progettoId?: unknown }) => a.progettoId != null && miei.has(comeTesto(a.progettoId)!);
  const altrui = (c: CaratteristicheRisorsa) => (c.planned ?? []).filter((a) => !mia(a)).map(canonico).sort();
  if (canonico(altrui(prima)) !== canonico(altrui(dopo))) {
    return 'modificare le allocazioni su progetti di cui non sei approvatore (o i mesi liberi)';
  }
  const altre = (c: CaratteristicheRisorsa) => canonico([c.skillTecnici, c.skillAmbiti, c.skillFunzionali, c.certificazioni].map((v) => v ?? []));
  const lavoraConMe =
    propria || (prima.planned ?? []).some(mia) || (dopo.planned ?? []).some(mia) || [...progettiConsuntivati].some((id) => miei.has(id));
  if (altre(prima) !== altre(dopo) && !lavoraConMe) return 'modificare skill e certificazioni di una risorsa che non lavora sui tuoi progetti';
  return null;
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
