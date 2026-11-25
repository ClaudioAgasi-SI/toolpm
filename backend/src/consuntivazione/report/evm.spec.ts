import { describe, expect, it } from 'vitest';
import {
  arrotondaCentesimi,
  arrotondaGiorni,
  calcolaEvm,
  evmProgetto,
  evmSenzaEuro,
  fineGiornoInItalia,
  percentualeAllIstante,
  quotaTrascorsa,
  SOGLIE_PREDEFINITE,
  soglieValide,
  statoCosti,
  statoTempi,
} from './evm.js';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('EVM: esempio TIMBUFE dell\'analisi', () => {
  const quota = quotaTrascorsa(d('2027-01-01'), d('2027-12-31'), d('2027-07-02'));

  it('a metà della durata la quota è 0,5', () => {
    expect(quota).toBe(0.5);
  });

  it('in euro (centesimi)', () => {
    const e = calcolaEvm({ bac: 17_600_000, percentuale: 40, ac: 8_000_000, quota }, arrotondaCentesimi)!;
    expect(e).toEqual({
      bac: 17_600_000,
      pv: 8_800_000,
      ev: 7_040_000,
      ac: 8_000_000,
      sv: -1_760_000,
      cv: -960_000,
      spi: 0.8,
      cpi: 0.88,
      eac: 20_000_000,
      etc: 12_000_000,
      vac: -2_400_000,
      tcpi: 1.1,
    });
    expect(statoTempi(e.spi, SOGLIE_PREDEFINITE)).toBe('inForteRitardo');
    expect(statoCosti(e.cpi, SOGLIE_PREDEFINITE)).toBe('sopraBudget');
  });

  it('in giorni', () => {
    const g = calcolaEvm({ bac: 440, percentuale: 40, ac: 200, quota }, arrotondaGiorni)!;
    expect(g).toMatchObject({ pv: 220, ev: 176, ac: 200, sv: -44, cv: -24, spi: 0.8, cpi: 0.88, eac: 500, vac: -60, tcpi: 1.1 });
  });
});

describe('EVM: casi particolari', () => {
  it('senza stima nessun indicatore', () => {
    expect(calcolaEvm({ bac: null, percentuale: 40, ac: 10, quota: 0.5 }, arrotondaGiorni)).toBeNull();
    expect(calcolaEvm({ bac: 0, percentuale: 40, ac: 10, quota: 0.5 }, arrotondaGiorni)).toBeNull();
  });

  it('senza date: PV, SV, SPI e stato dei tempi non calcolabili, costi sì', () => {
    expect(quotaTrascorsa(null, d('2027-12-31'), d('2027-07-02'))).toBeNull();
    expect(quotaTrascorsa(d('2027-12-31'), d('2027-12-31'), d('2027-07-02'))).toBeNull();
    const e = calcolaEvm({ bac: 100, percentuale: 50, ac: 40, quota: null }, arrotondaGiorni)!;
    expect(e.pv).toBeNull();
    expect(e.sv).toBeNull();
    expect(e.spi).toBeNull();
    expect(e.cpi).toBe(1.25);
    expect(statoTempi(e.spi, SOGLIE_PREDEFINITE)).toBe('nonCalcolabile');
    expect(statoCosti(e.cpi, SOGLIE_PREDEFINITE)).toBe('sottoBudget');
  });

  it('nessun costo consuntivato: CPI, EAC, ETC, VAC non calcolabili; TCPI sì', () => {
    const e = calcolaEvm({ bac: 100, percentuale: 10, ac: 0, quota: 0.1 }, arrotondaGiorni)!;
    expect(e).toMatchObject({ cpi: null, eac: null, etc: null, vac: null, tcpi: 0.9, spi: 1 });
  });

  it('percentuale a zero: EV zero, CPI zero e nessuna previsione', () => {
    const e = calcolaEvm({ bac: 100, percentuale: 0, ac: 30, quota: 0.2 }, arrotondaGiorni)!;
    expect(e).toMatchObject({ ev: 0, spi: 0, cpi: 0, eac: null });
    expect(statoCosti(e.cpi, SOGLIE_PREDEFINITE)).toBe('fortementeSopraBudget');
  });

  it('PV zero all\'inizio: SPI non calcolabile; costo oltre il budget: TCPI non calcolabile', () => {
    expect(calcolaEvm({ bac: 100, percentuale: 0, ac: 0, quota: 0 }, arrotondaGiorni)!.spi).toBeNull();
    expect(calcolaEvm({ bac: 100, percentuale: 90, ac: 120, quota: 1 }, arrotondaGiorni)!.tcpi).toBeNull();
  });

  it('quota limitata tra 0 e 1', () => {
    expect(quotaTrascorsa(d('2027-01-01'), d('2027-12-31'), d('2026-06-01'))).toBe(0);
    expect(quotaTrascorsa(d('2027-01-01'), d('2027-12-31'), d('2028-06-01'))).toBe(1);
  });
});

describe('EVM: stati e soglie', () => {
  it('soglie: i confini appartengono allo stato migliore', () => {
    expect(statoTempi(1.05, SOGLIE_PREDEFINITE)).toBe('inAnticipo');
    expect(statoTempi(0.95, SOGLIE_PREDEFINITE)).toBe('inLinea');
    expect(statoTempi(0.85, SOGLIE_PREDEFINITE)).toBe('inRitardo');
    expect(statoTempi(0.84, SOGLIE_PREDEFINITE)).toBe('inForteRitardo');
    expect(statoCosti(1.04, SOGLIE_PREDEFINITE)).toBe('inLinea');
  });

  it('soglie del parametro non valide: quelle predefinite', () => {
    expect(soglieValide(undefined)).toBe(SOGLIE_PREDEFINITE);
    expect(soglieValide({ anticipo: 1.1 })).toBe(SOGLIE_PREDEFINITE);
    expect(soglieValide({ anticipo: 1.1, ritardo: 0.9, fortementeInRitardo: 0.8 })).toEqual({ anticipo: 1.1, ritardo: 0.9, fortementeInRitardo: 0.8 });
  });
});

describe('EVM: percentuale alla data', () => {
  const cambi = [
    { il: new Date('2026-03-10T10:00:00Z'), valorePrecedente: 0, valoreNuovo: 20 },
    { il: new Date('2026-06-10T10:00:00Z'), valorePrecedente: 20, valoreNuovo: 50 },
  ];

  it('ultimo cambio prima della data, precedente del primo se tutti dopo, attuale senza cambi', () => {
    expect(percentualeAllIstante(70, cambi, new Date('2026-04-01T00:00:00Z'))).toBe(20);
    expect(percentualeAllIstante(70, cambi, new Date('2026-07-01T00:00:00Z'))).toBe(50);
    expect(percentualeAllIstante(70, cambi, new Date('2026-01-01T00:00:00Z'))).toBe(0);
    expect(percentualeAllIstante(70, [], new Date('2026-01-01T00:00:00Z'))).toBe(70);
  });

  it('fine del giorno in Italia: mezzanotte italiana, d\'inverno e d\'estate', () => {
    expect(fineGiornoInItalia(d('2026-01-15')).toISOString()).toBe('2026-01-15T23:00:00.000Z');
    expect(fineGiornoInItalia(d('2026-07-15')).toISOString()).toBe('2026-07-15T22:00:00.000Z');
  });
});

describe('EVM del progetto', () => {
  const p = {
    stato: 'inCorso',
    dataInizio: d('2027-01-01'),
    dataFine: d('2027-12-31'),
    stime: { managerialeGiorni: 400, managerialeCentesimi: 16_000_000, definitivaGiorni: 440, definitivaCentesimi: 17_600_000 },
  };
  const x = { percentuale: 40, al: d('2027-07-02'), minuti: 200 * 8 * 60, costoCentesimi: 8_000_000, daValorizzare: 0, minutiDaValorizzare: 0, oreGiorno: 8 };

  it('TIMBUFE: euro e giorni dalla stima definitiva, stati dagli indici in euro', () => {
    const e = evmProgetto(p, x, SOGLIE_PREDEFINITE);
    expect(e).toMatchObject({ calcolabile: true, trascorso: 50, fonteBacEuro: 'definitiva', fonteBacGiorni: 'definitiva', statoTempi: 'inForteRitardo', statoCosti: 'sopraBudget' });
    expect(e.euro!.eac).toBe(20_000_000);
    expect(e.giorni!.eac).toBe(500);
    expect(evmSenzaEuro(e)).not.toHaveProperty('euro');
    expect(e.costiDa).toBe('euro');
  });

  it('senza costi in euro (righe da valorizzare) lo stato dei costi viene dai giorni', () => {
    const e = evmProgetto(p, { ...x, costoCentesimi: 0, daValorizzare: 3, minutiDaValorizzare: 1440 }, SOGLIE_PREDEFINITE);
    expect(e.euro!.cpi).toBeNull();
    expect(e).toMatchObject({ costiDa: 'giorni', statoCosti: 'sopraBudget', daValorizzare: { righe: 3 } });
  });

  it('senza definitiva si usa la manageriale; In valutazione e senza stime nessun indicatore', () => {
    const m = evmProgetto({ ...p, stime: { managerialeGiorni: 400 } }, x, SOGLIE_PREDEFINITE);
    expect(m).toMatchObject({ calcolabile: true, euro: null, fonteBacGiorni: 'manageriale' });
    expect(m.giorni!.bac).toBe(400);
    expect(evmProgetto({ ...p, stato: 'inValutazione' }, x, SOGLIE_PREDEFINITE)).toMatchObject({ calcolabile: false, motivo: 'inValutazione' });
    expect(evmProgetto({ ...p, stime: {} }, x, SOGLIE_PREDEFINITE)).toMatchObject({ calcolabile: false, motivo: 'senzaStima' });
  });
});
