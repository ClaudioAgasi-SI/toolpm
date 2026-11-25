/** Tipi dei dati della sezione Consuntivazione (come restituiti da /api/consuntivazione). */

export type CategoriaTipologia = 'ordinaria' | 'straordinaria';

export interface TipologiaCosto {
  _id: string;
  codice: string;
  descrizione: string;
  ordine: number;
  categoria: CategoriaTipologia;
  attiva: boolean;
  /** Tipologia proposta sulle righe nuove: una sola. */
  predefinita: boolean;
  modificatoIl?: string;
  modificatoDa?: string;
}

/** Tariffa (standard per ruolo o personalizzata per risorsa): importo in centesimi di euro all'ora. */
export interface Tariffa {
  _id: string;
  tipologiaId: string;
  validoDal: string;
  validoAl: string | null;
  centesimiOra: number;
  ruoloId?: string;
  risorsaId?: string;
}

export type FonteTariffa = 'personalizzata' | 'standard';

export interface TariffaApplicabile {
  tipologiaId: string;
  tipologiaCodice: string;
  tipologiaDescrizione: string;
  tipologiaAttiva: boolean;
  fonte: FonteTariffa | null;
  tariffaId: string | null;
  centesimiOra: number | null;
}

export interface TariffeApplicabili {
  risorsaId: string;
  data: string;
  ruolo: { _id: string; codice: string; descrizione: string } | null;
  tariffe: TariffaApplicabile[];
}

/** Dati di una tariffa nuova o modificata, come li manda la pagina. */
export interface DatiTariffa {
  tipologiaId?: string;
  validoDal?: string;
  validoAl?: string | null;
  centesimiOra?: number;
}

/** La tariffa vale nella data "AAAA-MM-GG" (estremi compresi). */
export const tariffaValida = (t: Tariffa, data: string) =>
  t.validoDal.slice(0, 10) <= data && (!t.validoAl || data <= t.validoAl.slice(0, 10));

/** Centesimi all'ora → "39,00 €/h". */
export const euroOra = (c: number | null | undefined) =>
  c === null || c === undefined ? '—' : `${(c / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/h`;

// ---- Il mio consuntivo (blocco C5) ----

/** Attività tra le voci consuntivabili. */
export interface VoceAttivita {
  _id: string;
  codice: string;
  descrizione: string;
  percentualeCompletamento: number;
  /** La risorsa è tra le assegnate: in testa; sulle altre si consuntiva con un avviso. */
  assegnata: boolean;
}

/** Progetto su cui la risorsa lavora nel periodo, con le attività attive. */
export interface VoceProgetto {
  _id: string;
  codice: string;
  titolo: string;
  stato: string;
  soloSuAttivita: boolean;
  conAttivitaAssegnate: boolean;
  attivita: VoceAttivita[];
}

export type StatoRiga = 'bozza' | 'inviata' | 'approvataTL' | 'approvata' | 'respinta' | 'chiusa';

/** Nome di ogni stato della riga, come lo leggono le persone. */
export const NOMI_STATO: Record<StatoRiga, string> = {
  bozza: 'In bozza',
  inviata: 'Inviata',
  approvataTL: 'Via libera del TL',
  approvata: 'Approvata',
  respinta: 'Respinta',
  chiusa: 'Mese chiuso',
};

/** Esito di invio e ritiro (fase 3, blocco D1). */
export interface EsitoInvio {
  giornate: Giornata[];
  righe: number;
  giorni: string[];
}

/** Righe proprie dei giorni passati ancora da inviare. */
export interface DaInviare {
  bozza: number;
  respinte: number;
  primaData: string | null;
}

/** Riga salvata, come la vede la risorsa (senza tariffe né importi). */
export interface RigaGiornata {
  _id: string;
  progettoId: string;
  progetto: { codice: string; titolo: string } | null;
  attivitaId: string | null;
  attivita: { codice: string; descrizione: string } | null;
  tipologiaId: string;
  tipologiaCodice: string;
  minuti: number;
  nota: string | null;
  stato: StatoRiga;
  /** Riga respinta: quando e perché (fase 3). */
  rifiuto?: { il: string; motivazione: string } | null;
  /** Solo nelle risposte al controller. */
  fonteTariffa?: FonteTariffa | null;
  tariffaCentesimiOra?: number | null;
  costoCentesimi?: number | null;
}

export interface Giornata {
  data: string;
  versione: number;
  totaleMinuti: number;
  righe: RigaGiornata[];
}

export interface Proposta {
  progettoId: string;
  progetto: { codice: string; titolo: string; soloSuAttivita: boolean };
  attivitaId: string | null;
  attivita: { codice: string; descrizione: string; assegnata: boolean } | null;
  tipologiaId: string;
  tipologiaCodice: string;
  origine: 'pianificatore' | 'settimanaPrecedente';
}

/** Riga da salvare in una giornata. */
export interface RigaDaSalvare {
  _id?: string;
  progettoId: string;
  attivitaId: string | null;
  tipologiaId: string;
  minuti: number;
  nota: string | null;
}

export interface EsitoSalvataggio {
  giornate: Giornata[];
  avvisi: { data: string; messaggio: string }[];
}

// ---- Righe da valorizzare e ricalcolo (blocco C6) ----

export type MotivoDaValorizzare = 'ruoloMancante' | 'tariffaMancante' | 'tariffaDisponibile';

/** Riga di consuntivo come la vede il controller in queste pagine. */
export interface RigaControllo {
  risorsaId: string;
  risorsa: string;
  data: string;
  rigaId: string;
  progetto: string;
  attivita: string | null;
  tipologiaId: string;
  tipologia: string;
  minuti: number;
  stato: string;
}

export interface RigaDaValorizzare extends RigaControllo {
  ruolo: { _id: string; codice: string; descrizione: string } | null;
  motivo: MotivoDaValorizzare;
}

export interface ValoriCosto {
  fonte: FonteTariffa | null;
  tariffaId: string | null;
  centesimiOra: number | null;
  costo: number | null;
}

export interface TotaliRicalcolo {
  righe: number;
  giornate: number;
  primaCentesimi: number;
  dopoCentesimi: number;
  daValorizzarePrima: number;
  daValorizzareDopo: number;
}

export interface AnteprimaRicalcolo {
  da: string;
  a: string;
  totali: TotaliRicalcolo;
  righe: (RigaControllo & { prima: ValoriCosto; dopo: ValoriCosto })[];
  troncato: boolean;
}

// ---- Approvazioni (fase 3, blocchi D2 e D3) ----

export type AzioneApprovazione = 'viaLibera' | 'approva' | 'respingi';

/** Chi ha firmato (via libera, approvazione o rifiuto) e quando. */
export interface Firma {
  da: string;
  nome: string;
  il: string;
}

/** Riga come la vede un approvatore; costi solo al PM del progetto, al PMSenior e al controller. */
export interface RigaApprovazione {
  rigaId: string;
  giornataId: string;
  data: string;
  risorsaId: string;
  risorsa: string;
  progettoId: string;
  progetto: { codice: string; titolo: string; stato: string };
  attivitaId: string | null;
  attivita: { codice: string; descrizione: string } | null;
  attivitaNonAssegnata: boolean;
  meseChiuso: boolean;
  tipologiaId: string;
  tipologia: string;
  tipologiaCodice: string;
  minuti: number;
  nota: string | null;
  stato: StatoRiga;
  profilo: 'TL' | 'PM';
  azioni: AzioneApprovazione[];
  viaLiberaTL: Firma | null;
  approvazionePM: Firma | null;
  rifiuto: (Firma & { motivazione: string }) | null;
  fonteTariffa?: FonteTariffa | null;
  tariffaCentesimiOra?: number | null;
  costoCentesimi?: number | null;
}

export interface ElencoApprovazioni {
  righe: RigaApprovazione[];
  totali: { righe: number; minuti: number; costoCentesimi?: number };
  troncato: boolean;
}

export interface EsitoApprovazione {
  azione: AzioneApprovazione;
  fatte: number;
  saltate: number;
  esiti: { rigaId: string; esito: 'fatta' | 'saltata'; motivo?: string }[];
}

// ---- Periodi (fase 3, blocco D4) ----

export type ConteggiStati = Record<StatoRiga, number>;

export interface Mese {
  mese: string;
  nome: string;
  stato: 'aperto' | 'chiuso';
  conteggi: ConteggiStati;
  nonApprovate: number;
  chiusura: { il: string; da: string; forzata: boolean; motivazione: string | null } | null;
  riapertura: { il: string; da: string; motivazione: string } | null;
  chiudibile: boolean;
  riapribile: boolean;
}

export interface ElencoPeriodi {
  mesi: Mese[];
  progettiSenzaPM: { _id: string; codice: string; titolo: string }[];
}

export interface AnteprimaChiusura {
  mese: string;
  nome: string;
  chiuso: boolean;
  conteggi: ConteggiStati;
  nonApprovate: number;
  bloccoOrdine: string | null;
  righe: { data: string; risorsa: string; progetto: string; stato: StatoRiga; minuti: number }[];
  troncato: boolean;
}

// ---- Storico (fase 3, blocco D5) ----

export interface VoceStorico {
  _id: string;
  il: string;
  collezione: string;
  documentoId: string;
  documento: string;
  righeIds: string[];
  operazione: string;
  utente: string;
  nomeUtente: string;
  prima: unknown;
  dopo: unknown;
  motivazione: string | null;
}

export interface CronologiaRiga {
  riga: { rigaId: string; data: string; progetto: string | null; stato: StatoRiga; minuti: number };
  voci: { il: string; operazione: string; nomeUtente: string; prima: unknown; dopo: unknown; motivazione: string | null }[];
}

// ---- Report (fase 4) ----

export type VistaReport = 'approvata' | 'provvisoria';

/** Totali di un gruppo di righe; il costo solo a chi vede gli euro. */
export interface TotaliReport {
  righe: number;
  minuti: number;
  giorni: number;
  daValorizzare: number;
  minutiDaValorizzare: number;
  costoCentesimi?: number;
}

export interface StimeReport {
  managerialeGiorni: number | null;
  definitivaGiorni: number | null;
  managerialeCentesimi?: number | null;
  definitivaCentesimi?: number | null;
}

export interface ProgettoReport {
  _id: string;
  codice: string;
  titolo: string;
  cliente: string | null;
  centroCosto: string | null;
  stato: string;
  dataInizio: string | null;
  dataFine: string | null;
  percentualeCompletamento: number;
  vedeEuro: boolean;
  stime: StimeReport;
  consuntivato: TotaliReport;
  inAttesa: { righe: number; minuti: number; giorni: number };
  evm: StatiEvmElenco;
}

export interface ElencoProgettiReport {
  vista: VistaReport;
  calcolatoIl: string;
  opzioni: { centriCosto: OpzioneFiltro[]; clienti: OpzioneFiltro[] };
  progetti: ProgettoReport[];
}

export interface SchedaProgetto {
  vista: VistaReport;
  calcolatoIl: string;
  vedeEuro: boolean;
  oreGiorno: number;
  periodo: { da: string; a: string };
  progetto: {
    _id: string;
    codice: string;
    titolo: string;
    descrizione: string | null;
    cliente: string | null;
    centroCosto: string | null;
    stato: string;
    dataInizio: string | null;
    dataFine: string | null;
    percentualeCompletamento: number;
    percentualeAttivitaPesata: number | null;
  };
  stime: StimeReport;
  dallInizio: TotaliReport;
  nelPeriodo: TotaliReport;
  inAttesa: { dallInizio: { righe: number; minuti: number; giorni: number }; nelPeriodo: { righe: number; minuti: number; giorni: number } };
  perAttivita: {
    attivitaId: string | null;
    codice: string;
    descrizione: string;
    stato: string;
    stimaGiorni: number | null;
    percentualeCompletamento: number;
    dallInizio: TotaliReport;
    nelPeriodo: TotaliReport;
  }[];
  perRisorsa: (TotaliReport & { risorsaId: string; risorsa: string })[];
  perRuolo: (TotaliReport & { ruoloId: string | null; ruolo: string })[];
  perTipologia: (TotaliReport & { tipologiaId: string; tipologia: string })[];
  perMese: (TotaliReport & { mese: string })[];
}

// ---- Indicatori EVM (fase 4, blocco E2) ----

export type StatoTempi = 'inAnticipo' | 'inLinea' | 'inRitardo' | 'inForteRitardo' | 'nonCalcolabile';
export type StatoCosti = 'sottoBudget' | 'inLinea' | 'sopraBudget' | 'fortementeSopraBudget' | 'nonCalcolabile';

/** Indicatori di una grandezza: centesimi di euro oppure giorni. */
export interface IndicatoriEvm {
  bac: number;
  pv: number | null;
  ev: number;
  ac: number;
  sv: number | null;
  cv: number;
  spi: number | null;
  cpi: number | null;
  eac: number | null;
  etc: number | null;
  vac: number | null;
  tcpi: number | null;
}

export interface EvmProgetto {
  calcolabile: boolean;
  motivo: 'inValutazione' | 'senzaStima' | null;
  percentuale: number;
  trascorso: number | null;
  /** Solo a chi vede gli euro. */
  euro?: IndicatoriEvm | null;
  giorni: IndicatoriEvm | null;
  fonteBacEuro?: 'definitiva' | 'manageriale' | null;
  fonteBacGiorni: 'definitiva' | 'manageriale' | null;
  statoTempi: StatoTempi;
  statoCosti: StatoCosti;
  costiDa: 'euro' | 'giorni' | null;
  daValorizzare: { righe: number; minuti: number };
}

export interface EvmScheda {
  vista: VistaReport;
  calcolatoIl: string;
  al: string;
  vedeEuro: boolean;
  oreGiorno: number;
  soglie: { anticipo: number; ritardo: number; fortementeInRitardo: number };
  progetto: { _id: string; codice: string; titolo: string; stato: string; dataInizio: string | null; dataFine: string | null };
  evm: EvmProgetto;
  attivita: {
    attivitaId: string;
    codice: string;
    descrizione: string;
    stato: string;
    stimaGiorni: number | null;
    dataInizio: string | null;
    dataFine: string | null;
    percentuale: number;
    giorni: IndicatoriEvm | null;
    statoTempi: StatoTempi;
    statoCosti: StatoCosti;
  }[];
}

/** Stati di tempi e costi a oggi, nell'elenco dei progetti. */
export interface StatiEvmElenco {
  calcolabile: boolean;
  motivo: 'inValutazione' | 'senzaStima' | null;
  statoTempi: StatoTempi;
  statoCosti: StatoCosti;
  spi: number | null;
  cpi: number | null;
}

// ---- Andamento EVM (fase 4, blocco E3) ----

export interface PuntoEvm {
  pv: number | null;
  ev: number;
  ac: number;
  spi: number | null;
  cpi: number | null;
}

export interface AndamentoEvm {
  vista: VistaReport;
  vedeEuro: boolean;
  periodo: { da: string; a: string };
  /** Ultimo giorno elaborato dalla procedura notturna. */
  aggiornatoAl: string | null;
  avviso: string | null;
  soglie: { anticipo: number; ritardo: number; fortementeInRitardo: number };
  serie: {
    data: string;
    percentuale: number;
    trascorso: number | null;
    statoTempi: StatoTempi;
    statoCosti: StatoCosti;
    giorni: PuntoEvm | null;
    euro?: PuntoEvm | null;
  }[];
}

export type StatoEsecuzione = 'inCorso' | 'completata' | 'completataConAvvisi' | 'fallita' | 'interrotta';

export interface EsecuzioneBatch {
  _id: string;
  procedura: string;
  inizio: string;
  fine: string | null;
  stato: StatoEsecuzione;
  avviataDa: string;
  daGiorno: string | null;
  ultimoGiornoCompletato: string | null;
  giorniElaborati: number;
  avvisi: string[];
  motivo: string | null;
}

export interface StatoEsecuzioni {
  aggiornatoAl: string | null;
  ultima: EsecuzioneBatch | null;
  recenti: EsecuzioneBatch[];
  avviso: string | null;
}

// ---- Report dei costi (fase 4, blocco E4) ----

export type LivelloCosti = 'cdc' | 'progetto' | 'attivita' | 'risorsa' | 'ruolo' | 'tipologia' | 'mese';

export interface OpzioneFiltro {
  _id: string;
  etichetta: string;
}

export interface NodoCosti extends TotaliReport {
  livello: LivelloCosti;
  chiave: string;
  etichetta: string;
  progettoId?: string;
  figli: NodoCosti[];
}

export interface ReportCosti {
  vista: VistaReport;
  calcolatoIl: string;
  periodo: { da: string; a: string };
  livelli: LivelloCosti[];
  vedeEuro: boolean;
  /** Euro nascosti perché tra i progetti compresi ce n'è qualcuno di cui l'utente non li vede. */
  euroNascostiInParte: boolean;
  oreGiorno: number;
  opzioni: { centriCosto: OpzioneFiltro[]; clienti: OpzioneFiltro[]; progetti: (OpzioneFiltro & { stato: string })[] };
  totali: TotaliReport;
  inAttesa: { righe: number; minuti: number; giorni: number };
  righe: NodoCosti[];
}

// ---- Pianificato e consuntivato (fase 4, blocco E5) ----

export interface OrePianificato {
  pianificati: number;
  consuntivati: number;
  inAttesa: number;
  scostamento: { minuti: number; percentuale: number | null };
}

export interface ReportPianificato {
  periodo: { da: string; a: string };
  mesi: string[];
  oreGiorno: number;
  calcolatoIl: string;
  opzioni: { progetti: OpzioneFiltro[]; risorse: OpzioneFiltro[] };
  totali: OrePianificato;
  risorse: (OrePianificato & {
    risorsaId: string;
    risorsa: string;
    oreGiorno: number;
    mesi: (OrePianificato & {
      mese: string;
      giorniLavorativi: number;
      progetti: (OrePianificato & { progettoId: string; progetto: string; percentuale: number | null; nonAllocato: boolean })[];
    })[];
  })[];
}
