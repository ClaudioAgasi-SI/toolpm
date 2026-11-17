import { BadRequestException } from '@nestjs/common';
import type { Model } from 'mongoose';
import type { Risorsa } from '../risorse/risorsa.schema.js';
import { PianificazioneService } from './pianificazione.service.js';

/**
 * Test della griglia del Pianificatore (blocco B0 della fase 1): fissano il comportamento attuale,
 * così le modifiche della fase 1 (risorse nel modulo Comuni, allocazioni su progettoId)
 * possono essere verificate confrontando la griglia prima e dopo.
 */

type RisorsaTest = Partial<Risorsa> & { _id: string; cognome: string; nome: string };

/** Finto Model Mongoose: registra la query e restituisce le risorse date, come find().sort().lean().exec(). */
function modelFinto(risorse: RisorsaTest[]) {
  const chiamate: Record<string, unknown>[] = [];
  const model = {
    find(query: Record<string, unknown>) {
      chiamate.push(query);
      return { sort: () => ({ lean: () => ({ exec: async () => risorse }) }) };
    },
  };
  return { model: model as unknown as Model<Risorsa>, chiamate };
}

const ROSSI: RisorsaTest = {
  _id: 'r1',
  cognome: 'Rossi',
  nome: 'Anna',
  skillTecnici: [
    { skillName: 'Angular', rate: 'ottimo' },
    { skillName: 'Java', rate: 'n.a.' },
  ],
  skillFunzionali: [],
  skillAmbiti: [],
  planned: [
    { mese: '202701', cliente: 'TIM', progetto: 'TIMBUFE', percentualeAllocazione: 50, probabilitaAllocazione: 'sicura' },
    { mese: '202701', cliente: 'TIM', progetto: 'TIMENTFE', percentualeAllocazione: 40, probabilitaAllocazione: 'probabile' },
    { mese: '202702', cliente: 'Ebitemp', progetto: 'PortaleWeb', percentualeAllocazione: 30, probabilitaAllocazione: 'forse' },
    // segnaposto: mese libero, non conta
    { mese: '202702' },
    // fuori dall'intervallo richiesto
    { mese: '202705', progetto: 'TIMBUFE', percentualeAllocazione: 100 },
  ],
};

const BIANCHI: RisorsaTest = {
  _id: 'r2',
  cognome: 'Bianchi',
  nome: 'Luca',
  skillTecnici: [{ skillName: 'java', rate: 'buono' }],
  planned: [{ mese: '202701', progetto: 'TIMBUSINESS', percentualeAllocazione: 20, probabilitaAllocazione: 'boh' }],
};

describe('PianificazioneService.griglia', () => {
  it('somma percentuali e percentuali pesate per mese, ignorando segnaposto e mesi fuori intervallo', async () => {
    const { model } = modelFinto([ROSSI]);
    const { mesi, righe } = await new PianificazioneService(model).griglia('202701', '202703');

    expect(mesi).toEqual(['202701', '202702', '202703']);
    expect(righe).toHaveLength(1);
    const celle = righe[0].mesi;
    expect(celle['202701']).toMatchObject({ totale: 90, pesato: 80 }); // 50×1 + 40×0,75
    expect(celle['202701'].allocazioni.map((a) => a.pesato)).toEqual([50, 30]);
    expect(celle['202702']).toMatchObject({ totale: 30, pesato: 15 }); // 30×0,5; il segnaposto non conta
    expect(celle['202702'].allocazioni).toHaveLength(1);
    expect(celle['202703']).toEqual({ totale: 0, pesato: 0, allocazioni: [] });
    expect(righe[0].skillTrovate).toBeUndefined();
  });

  it('pesa 0 le probabilità sconosciute', async () => {
    const { model } = modelFinto([BIANCHI]);
    const { righe } = await new PianificazioneService(model).griglia('202701', '202701');
    expect(righe[0].mesi['202701']).toMatchObject({ totale: 20, pesato: 0 });
  });

  it('senza parametri mostra 12 mesi dal mese corrente', async () => {
    const { model } = modelFinto([]);
    const { mesi } = await new PianificazioneService(model).griglia();
    expect(mesi).toHaveLength(12);
  });

  it('rifiuta intervalli non validi', async () => {
    const servizio = new PianificazioneService(modelFinto([]).model);
    await expect(servizio.griglia('2027-01', '202702')).rejects.toBeInstanceOf(BadRequestException);
    await expect(servizio.griglia('202703', '202701')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PianificazioneService: filtro per skill', () => {
  it('cerca le skill del tipo indicato senza distinguere maiuscole e minuscole, escludendo "n.a."', async () => {
    const { model, chiamate } = modelFinto([ROSSI, BIANCHI]);
    const { righe } = await new PianificazioneService(model).griglia('202701', '202701', {
      tipo: 'tecnico',
      skill: ['java', 'angular'],
    });

    const query = chiamate[0] as { skillTecnici: { $elemMatch: { skillName: RegExp } } };
    expect(Object.keys(query)).toEqual(['skillTecnici']);
    expect(query.skillTecnici.$elemMatch.skillName.test('JAVA')).toBe(true);
    // Rossi ha Java valutato "n.a.": tra le skill trovate resta solo Angular
    expect(righe[0].skillTrovate).toEqual([{ skillName: 'Angular', rate: 'ottimo' }]);
    expect(righe[1].skillTrovate).toEqual([{ skillName: 'java', rate: 'buono' }]);
  });

  it('con il solo tipo cerca risorse con almeno una skill di quel tipo', async () => {
    const { model, chiamate } = modelFinto([ROSSI]);
    await new PianificazioneService(model).griglia('202701', '202701', { tipo: 'funzionale' });
    expect(Object.keys(chiamate[0])).toEqual(['skillFunzionali']);
  });

  it('senza filtro non applica condizioni', async () => {
    const { model, chiamate } = modelFinto([ROSSI]);
    await new PianificazioneService(model).griglia('202701', '202701');
    expect(chiamate[0]).toEqual({});
  });

  it('rifiuta skill senza tipo o con un tipo sconosciuto', async () => {
    const servizio = new PianificazioneService(modelFinto([]).model);
    await expect(servizio.griglia('202701', '202701', { skill: 'java' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(servizio.griglia('202701', '202701', { tipo: 'altro', skill: 'java' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
