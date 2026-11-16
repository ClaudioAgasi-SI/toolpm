import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Allocazione, Risorsa, SkillValutata } from '../risorse/risorsa.schema.js';
import { MESE_RE, aggiungiMesi, intervalloMesi, meseCorrente } from './mesi.js';
import { pesoProbabilita } from './pesi.js';

/** Allocazione del mese con la percentuale pesata per probabilità. */
export type AllocazioneGriglia = Allocazione & { pesato: number };

export interface CellaMese {
  /** Somma delle percentuali allocate (senza pesi). */
  totale: number;
  /** Somma delle percentuali pesate per probabilità. */
  pesato: number;
  allocazioni: AllocazioneGriglia[];
}

/** Collegamento tra lo skillType dell'anagrafica e il campo della risorsa. */
export const CAMPO_PER_TIPO: Record<string, 'skillTecnici' | 'skillFunzionali' | 'skillAmbiti'> = {
  tecnico: 'skillTecnici',
  funzionale: 'skillFunzionali',
  ambito: 'skillAmbiti',
};

export interface FiltroSkill {
  /** skillType: tecnico | funzionale | ambito */
  tipo?: string;
  /** skillName, una o più: la risorsa ne deve avere almeno una (OR). Confronto senza maiuscole/minuscole. */
  skill?: string | string[];
}

export interface RigaPianificazione {
  _id: string;
  cognome: string;
  nome: string;
  /** Skill che soddisfano il filtro, con il livello della risorsa (solo se è attivo un filtro). */
  skillTrovate?: SkillValutata[];
  mesi: Record<string, CellaMese>;
}

@Injectable()
export class PianificazioneService {
  constructor(@InjectModel(Risorsa.name) private readonly model: Model<Risorsa>) {}

  async griglia(da?: string, a?: string, filtro: FiltroSkill = {}) {
    const inizio = da ?? meseCorrente();
    const fine = a ?? aggiungiMesi(inizio, 11);
    if (!MESE_RE.test(inizio) || !MESE_RE.test(fine) || inizio > fine) {
      throw new BadRequestException('Parametri "da" e "a" nel formato AAAAMM, con da <= a');
    }
    const mesi = intervalloMesi(inizio, fine);
    const { query, corrisponde } = this.filtroSkill(filtro);
    const risorse = await this.model.find(query).sort({ cognome: 1, nome: 1 }).lean().exec();

    const righe: RigaPianificazione[] = risorse.map((r) => {
      const celle: Record<string, CellaMese> = {};
      for (const m of mesi) celle[m] = { totale: 0, pesato: 0, allocazioni: [] };

      for (const al of r.planned ?? []) {
        const cella = celle[al.mese];
        const perc = al.percentualeAllocazione ?? 0;
        // Le righe segnaposto (senza percentuale) indicano solo un mese libero.
        if (!cella || perc <= 0) continue;
        const pesato = arrotonda(perc * pesoProbabilita(al.probabilitaAllocazione));
        cella.allocazioni.push({ ...al, pesato });
        cella.totale += perc;
        cella.pesato += pesato;
      }
      for (const c of Object.values(celle)) c.pesato = arrotonda(c.pesato);

      const riga: RigaPianificazione = { _id: String(r._id), cognome: r.cognome, nome: r.nome, mesi: celle };
      if (corrisponde) riga.skillTrovate = corrisponde(r);
      return riga;
    });

    return { mesi, righe };
  }

  /**
   * Filtro per skill: con tipo e una o più skill, risorse che hanno almeno una di quelle skill (OR);
   * con il solo tipo, risorse con almeno una skill di quel tipo. Le skill valutate "n.a." non contano.
   */
  private filtroSkill(filtro: FiltroSkill) {
    const tipo = filtro.tipo?.trim();
    const skills = [filtro.skill ?? []]
      .flat()
      .map((s) => s.trim())
      .filter(Boolean);
    if (!tipo && !skills.length) return { query: {}, corrisponde: undefined };
    if (!tipo || !CAMPO_PER_TIPO[tipo]) {
      throw new BadRequestException(
        `Parametro "tipoSkill" obbligatorio con "skill"; valori ammessi: ${Object.keys(CAMPO_PER_TIPO).join(', ')}`,
      );
    }
    const campo = CAMPO_PER_TIPO[tipo];
    const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nome = skills.length ? new RegExp(`^(?:${skills.map(escape).join('|')})$`, 'i') : /\S/;
    const valida = { skillName: nome, rate: { $not: /^n\.a\.$/i } };
    const corrisponde = (r: Risorsa) =>
      (r[campo] ?? []).filter((s) => nome.test(s.skillName) && !/^n\.a\.$/i.test(s.rate ?? ''));
    return { query: { [campo]: { $elemMatch: valida } }, corrisponde };
  }
}

/** Arrotonda a un decimale. */
function arrotonda(v: number): number {
  return Math.round(v * 10) / 10;
}
