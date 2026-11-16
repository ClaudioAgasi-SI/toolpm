/** Tipi condivisi con le API del backend. */

export interface SkillValutata {
  skillName: string;
  rate?: string;
}

export interface Allocazione {
  /** Mese nel formato AAAAMM. */
  mese: string;
  cliente?: string;
  progetto?: string;
  competenzaTecnica?: string;
  conoscenzaAmbito?: string;
  conoscenzaFunzionale?: string;
  importanzaStrategica?: string;
  probabilitaAllocazione?: string;
  percentualeAllocazione?: number;
}

export interface Risorsa {
  _id?: string;
  cognome: string;
  nome: string;
  skillTecnici: SkillValutata[];
  skillAmbiti: SkillValutata[];
  skillFunzionali: SkillValutata[];
  certificazioni: Record<string, unknown>[];
  planned: Allocazione[];
}

export interface Skill {
  _id?: string;
  skillName: string;
  skillType: string;
}

export interface Certificazione {
  _id?: string;
  certName: string;
  certType?: string;
}

export interface Rate {
  _id?: string;
  rateType: string;
  rate: string[];
}

/** Allocazione nella griglia: include la percentuale pesata per probabilità. */
export interface AllocazioneGriglia extends Allocazione {
  pesato: number;
}

export interface CellaMese {
  totale: number;
  pesato: number;
  allocazioni: AllocazioneGriglia[];
}

export interface Pianificazione {
  mesi: string[];
  righe: {
    _id: string;
    cognome: string;
    nome: string;
    mesi: Record<string, CellaMese>;
    /** Presente solo con un filtro per skill: skill che lo soddisfano, con il livello. */
    skillTrovate?: SkillValutata[];
  }[];
}

export type TipoSkill = 'skillTecnici' | 'skillAmbiti' | 'skillFunzionali';

/** Collegamento tra il campo della risorsa e il tipo nell'anagrafica skill. */
export const TIPI_SKILL: { campo: TipoSkill; tipo: string; etichetta: string }[] = [
  { campo: 'skillTecnici', tipo: 'tecnico', etichetta: 'Skill tecniche' },
  { campo: 'skillFunzionali', tipo: 'funzionale', etichetta: 'Skill funzionali' },
  { campo: 'skillAmbiti', tipo: 'ambito', etichetta: 'Skill di ambito' },
];
