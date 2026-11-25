import { describe, expect, it } from 'vitest';
import { avvisoAndamento, giornoDiPartenza, giorniDa, valoreDelGiorno } from './andamento-regole.js';
import { evmProgetto, SOGLIE_PREDEFINITE } from './evm.js';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('andamento: giorno di partenza', () => {
  const ieri = d('2026-11-24');
  it('riparte dal giorno dopo l\'ultimo completato', () => {
    expect(giornoDiPartenza({ ultimoCompletato: d('2026-11-20'), inizioPiuVecchio: d('2020-01-01'), ieri })).toEqual(d('2026-11-21'));
  });
  it('primo avvio: inizio più vecchio, al massimo un anno indietro; senza progetti ieri', () => {
    expect(giornoDiPartenza({ ultimoCompletato: null, inizioPiuVecchio: d('2026-06-01'), ieri })).toEqual(d('2026-06-01'));
    expect(giornoDiPartenza({ ultimoCompletato: null, inizioPiuVecchio: d('2020-01-01'), ieri })).toEqual(d('2025-11-24'));
    expect(giornoDiPartenza({ ultimoCompletato: null, inizioPiuVecchio: null, ieri })).toEqual(ieri);
  });
  it('giorni compresi, vuoto se già aggiornato', () => {
    expect(giorniDa(d('2026-11-22'), d('2026-11-24')).map((x) => x.toISOString().slice(0, 10))).toEqual(['2026-11-22', '2026-11-23', '2026-11-24']);
    expect(giorniDa(d('2026-11-25'), d('2026-11-24'))).toEqual([]);
  });
});

describe('andamento: valore del giorno e avvisi', () => {
  it('null per i progetti senza indicatori, altrimenti gli indicatori senza "calcolabile"', () => {
    const x = { percentuale: 40, al: d('2027-07-02'), minuti: 96000, costoCentesimi: 8_000_000, daValorizzare: 0, minutiDaValorizzare: 0, oreGiorno: 8 };
    const p = { stato: 'inCorso', dataInizio: d('2027-01-01'), dataFine: d('2027-12-31'), stime: { definitivaGiorni: 440, definitivaCentesimi: 17_600_000 } };
    expect(valoreDelGiorno(evmProgetto({ ...p, stime: {} }, x, SOGLIE_PREDEFINITE))).toBeNull();
    const v = valoreDelGiorno(evmProgetto(p, x, SOGLIE_PREDEFINITE))!;
    expect(v).not.toHaveProperty('calcolabile');
    expect(v.euro!.spi).toBe(0.8);
  });

  it('avvisi: mai eseguita, in corso, fallita, non aggiornata a ieri, tutto bene', () => {
    const ieri = d('2026-11-24');
    expect(avvisoAndamento({ ultima: null, aggiornatoAl: null, ieri })).toContain('non è ancora stata eseguita');
    expect(avvisoAndamento({ ultima: { stato: 'inCorso', inizio: new Date() }, aggiornatoAl: ieri, ieri })).toContain('in corso');
    const f = avvisoAndamento({ ultima: { stato: 'fallita', inizio: new Date('2026-11-25T01:00:00Z'), motivo: 'database non raggiungibile' }, aggiornatoAl: d('2026-11-20'), ieri })!;
    expect(f).toContain('25/11/26, 02:00');
    expect(f).toContain('database non raggiungibile');
    expect(f).toContain('20/11/2026');
    expect(avvisoAndamento({ ultima: { stato: 'completata', inizio: new Date() }, aggiornatoAl: d('2026-11-23'), ieri })).toContain('23/11/2026');
    expect(avvisoAndamento({ ultima: { stato: 'completataConAvvisi', inizio: new Date() }, aggiornatoAl: ieri, ieri })).toBeNull();
  });
});
