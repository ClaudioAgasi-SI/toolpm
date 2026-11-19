/** Tipi delle API del modulo Comuni (/api/comuni) e della gestione utenti (/api/utenti). */
import type { Abilitazione, PermessoGlobale, RuoloApplicativo } from '../core/sessione.service';

export interface Tracciamento {
  creatoIl?: string;
  creatoDa?: string;
  modificatoIl?: string;
  modificatoDa?: string;
}

/** Voce di un'anagrafica semplice: clienti (ragioneSociale), centri di costo e ruoli (descrizione). */
export interface VoceAnagrafica extends Tracciamento {
  _id: string;
  codice: string;
  ragioneSociale?: string;
  descrizione?: string;
  attivo: boolean;
}

export interface DefinizioneAnagrafica {
  percorso: 'clienti' | 'centri-costo' | 'ruoli';
  titolo: string;
  campo: 'ragioneSociale' | 'descrizione';
  etichettaCampo: string;
  permesso: PermessoGlobale;
}

export interface RuoloRisorsa {
  ruoloId: string;
  dal: string;
}

export interface RisorsaAnagrafica extends Tracciamento {
  _id?: string;
  cognome: string;
  nome: string;
  email?: string;
  cellulare?: string;
  matricola?: string;
  dataIngresso?: string | null;
  dataUscita?: string | null;
  oreContrattualiGiorno?: number | null;
  storicoRuoli: RuoloRisorsa[];
}

export type StatoProgetto = 'inValutazione' | 'inCorso' | 'chiuso';
export const STATI_PROGETTO: { valore: StatoProgetto; etichetta: string }[] = [
  { valore: 'inValutazione', etichetta: 'In valutazione' },
  { valore: 'inCorso', etichetta: 'In corso' },
  { valore: 'chiuso', etichetta: 'Chiuso' },
];
export const etichettaStato = (s: string) => STATI_PROGETTO.find((x) => x.valore === s)?.etichetta ?? s;

export interface Approvatore {
  risorsaId: string;
  profilo: 'TL' | 'PM';
}

export interface Stime {
  managerialeGiorni?: number;
  managerialeCentesimi?: number;
  definitivaGiorni?: number;
  definitivaCentesimi?: number;
}

export interface Progetto extends Tracciamento {
  _id?: string;
  codice: string;
  titolo: string;
  descrizione?: string;
  clienteId?: string | null;
  centroCostoId: string;
  approvatori: Approvatore[];
  soloSuAttivita: boolean;
  dataInizio?: string | null;
  dataFine?: string | null;
  stato: StatoProgetto;
  percentualeCompletamento: number;
  stime: Stime;
}

export interface Attivita extends Tracciamento {
  _id?: string;
  progettoId?: string;
  codice: string;
  descrizione: string;
  dataInizio?: string | null;
  dataFine?: string | null;
  stato: 'attiva' | 'chiusa';
  stimaGiorni?: number | null;
  percentualeCompletamento: number;
  risorseAssegnateIds: string[];
}

export interface Avanzamento {
  _id: string;
  progettoId: string;
  attivitaId?: string;
  valorePrecedente: number;
  valoreNuovo: number;
  il: string;
  da: string;
}

export interface UtenteAdmin {
  _id: string;
  email: string;
  nome?: string;
  risorsaId?: string | null;
  abilitazione: Abilitazione | null;
  ruoli: RuoloApplicativo[];
  attivo: boolean;
  deveCambiarePassword: boolean;
  ultimoAccesso?: string;
}

/** Data ISO (anche con l'ora) → "AAAA-MM-GG" per gli input type="date". */
export const giorno = (v?: string | null) => (v ? v.slice(0, 10) : '');

/** Centesimi → euro per i campi del form, e ritorno. */
export const inEuro = (c?: number | null) => (c === undefined || c === null ? null : c / 100);
export const inCentesimi = (e?: number | null) => (e === undefined || e === null || (e as unknown) === '' ? null : Math.round(e * 100));
