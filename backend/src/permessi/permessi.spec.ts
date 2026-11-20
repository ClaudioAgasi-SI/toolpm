import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import mongoose from 'mongoose';
import { PermessiService } from './permessi.service.js';
import {
  filtroProgettiGestibili,
  motivoNegatoModificaRisorsa,
  permessiGlobali,
  type ProgettoPerPermessi,
  profiloSulProgetto,
  puoCambiareStatoProgetto,
  puoGestireApprovatori,
  puoGestireAttivita,
  puoGestireRisorse,
  puoModificareCaratteristicheRisorsa,
  puoModificarePercentualeAttivita,
  puoModificarePercentualeProgetto,
  puoModificareProgetto,
  type Soggetto,
} from './regole.js';

// Persone di prova: risorsaId = r-<nome>.
const persona = (nome: string, abilitazione: Soggetto['abilitazione'], ruoli: Soggetto['ruoli'] = ['risorsa']): Soggetto => ({
  id: `u-${nome}`,
  risorsaId: `r-${nome}`,
  abilitazione,
  ruoli,
});

const RISORSA = persona('rita', null); // assegnata all'attività, senza abilitazione
const TL = persona('tullio', 'TL'); // TL del progetto
const PM = persona('paola', 'PM'); // PM del progetto
const TL_PM = persona('teo', 'TL'); // abilitato TL ma assegnato come PM sul progetto
const TL_ESTERNO = persona('tina', 'TL'); // TL di un altro progetto
const PM_ESTERNO = persona('piero', 'PM'); // PM di un altro progetto
const PMSENIOR = persona('sara', 'PMSenior'); // non assegnata al progetto
const CONTROLLER = persona('carlo', null, ['risorsa', 'controller']);
const ADMIN: Soggetto = { id: 'u-admin', abilitazione: null, ruoli: ['admin'] }; // senza risorsa collegata
const EX_PM = persona('enzo', null); // ancora nell'elenco approvatori, ma l'abilitazione è stata tolta

const PROGETTO: ProgettoPerPermessi = {
  approvatori: [
    { risorsaId: 'r-tullio', profilo: 'TL' },
    { risorsaId: 'r-paola', profilo: 'PM' },
    { risorsaId: 'r-teo', profilo: 'PM' },
    { risorsaId: 'r-enzo', profilo: 'PM' },
  ],
};
const ATTIVITA = { risorseAssegnateIds: ['r-rita', 'r-tina'] };

/** Tabella: per ogni persona, il risultato atteso di ogni regola sul PROGETTO. */
const ATTESI: [string, Soggetto, Record<string, boolean>][] = [
  // nome, persona, { modificare, percentualeProgetto, attivita, avanzare, riaprire, approvatori, percentualeAttivita }
  ['risorsa assegnata', RISORSA, { mod: false, pctP: false, att: false, avanza: false, riapre: false, appr: false, pctA: true }],
  ['TL del progetto', TL, { mod: true, pctP: true, att: true, avanza: true, riapre: false, appr: false, pctA: true }],
  ['PM del progetto', PM, { mod: true, pctP: true, att: true, avanza: true, riapre: true, appr: true, pctA: true }],
  ['abilitato TL, PM sul progetto', TL_PM, { mod: true, pctP: true, att: true, avanza: true, riapre: true, appr: true, pctA: true }],
  ['TL esterno assegnato all\'attività', TL_ESTERNO, { mod: false, pctP: false, att: false, avanza: false, riapre: false, appr: false, pctA: true }],
  ['PM esterno', PM_ESTERNO, { mod: false, pctP: false, att: false, avanza: false, riapre: false, appr: false, pctA: false }],
  ['PMSenior', PMSENIOR, { mod: true, pctP: true, att: true, avanza: true, riapre: true, appr: true, pctA: true }],
  ['controller', CONTROLLER, { mod: false, pctP: false, att: false, avanza: false, riapre: false, appr: false, pctA: false }],
  ['admin', ADMIN, { mod: false, pctP: false, att: false, avanza: false, riapre: false, appr: false, pctA: false }],
  ['ex PM senza abilitazione', EX_PM, { mod: false, pctP: false, att: false, avanza: false, riapre: false, appr: false, pctA: false }],
];

describe('permessi su progetto e attività, per profilo', () => {
  it.each(ATTESI)('%s', (_nome, s, atteso) => {
    expect({
      mod: puoModificareProgetto(s, PROGETTO),
      pctP: puoModificarePercentualeProgetto(s, PROGETTO),
      att: puoGestireAttivita(s, PROGETTO),
      avanza: puoCambiareStatoProgetto(s, PROGETTO, 'inValutazione') && puoCambiareStatoProgetto(s, PROGETTO, 'inCorso'),
      riapre: puoCambiareStatoProgetto(s, PROGETTO, 'chiuso'),
      appr: puoGestireApprovatori(s, PROGETTO),
      pctA: puoModificarePercentualeAttivita(s, PROGETTO, ATTIVITA),
    }).toEqual(atteso);
  });

  it('il profilo sul progetto: PM prevale su TL; PMSenior come approvatore vale PM', () => {
    expect(profiloSulProgetto(TL, PROGETTO)).toBe('TL');
    expect(profiloSulProgetto(TL_PM, PROGETTO)).toBe('PM');
    expect(profiloSulProgetto(PMSENIOR, PROGETTO)).toBeNull();
    const doppio = { approvatori: [{ risorsaId: 'r-tullio', profilo: 'TL' as const }, { risorsaId: 'r-tullio', profilo: 'PM' as const }] };
    expect(profiloSulProgetto(TL, doppio)).toBe('PM');
    const creatoDaSenior = { approvatori: [{ risorsaId: 'r-sara', profilo: 'PMSenior' as const }] };
    expect(profiloSulProgetto(PMSENIOR, creatoDaSenior)).toBe('PM');
  });

  it('confronta gli id anche quando sono ObjectId', () => {
    const rid = new mongoose.Types.ObjectId();
    const s: Soggetto = { id: 'u-x', risorsaId: String(rid), abilitazione: 'TL', ruoli: ['risorsa'] };
    expect(puoModificareProgetto(s, { approvatori: [{ risorsaId: rid, profilo: 'TL' }] })).toBe(true);
    expect(puoModificarePercentualeAttivita(persona('y', null), {}, { risorseAssegnateIds: [rid] })).toBe(false);
  });

  it('un progetto senza approvatori lo gestisce solo il PMSenior', () => {
    expect(puoModificareProgetto(PM, {})).toBe(false);
    expect(puoModificareProgetto(PMSENIOR, {})).toBe(true);
  });
});

describe('permessi sulle risorse', () => {
  it('anagrafica, ruolo e orario: PM e PMSenior', () => {
    expect([RISORSA, TL, PM, PMSENIOR, CONTROLLER, ADMIN].map(puoGestireRisorse)).toEqual([false, false, true, true, false, false]);
  });

  it('caratteristiche: PM e PMSenior su tutte, TL solo su chi lavora sui suoi progetti', () => {
    const miei = ['p1', 'p2'];
    expect(puoModificareCaratteristicheRisorsa(PM, [], ['p9'])).toBe(true);
    expect(puoModificareCaratteristicheRisorsa(PMSENIOR, [], [])).toBe(true);
    expect(puoModificareCaratteristicheRisorsa(TL, miei, ['p9', 'p2'])).toBe(true);
    expect(puoModificareCaratteristicheRisorsa(TL, miei, ['p9'])).toBe(false);
    expect(puoModificareCaratteristicheRisorsa(TL, miei, [])).toBe(false);
    expect(puoModificareCaratteristicheRisorsa(RISORSA, miei, ['p1'])).toBe(false);
    expect(puoModificareCaratteristicheRisorsa(CONTROLLER, miei, ['p1'])).toBe(false);
  });
});

describe('modifica delle caratteristiche dal Pianificatore (decisioni del 19/11/2026)', () => {
  const miei = ['p1'];
  const prima = {
    skillTecnici: [{ skillName: 'Java', rate: 'buono' }],
    planned: [
      { mese: '202701', progettoId: 'p9', percentualeAllocazione: 50 },
      { mese: '202702' },
    ],
  };
  const conAllocazione = (a: object) => ({ ...prima, planned: [...prima.planned, a] });

  it('il TL alloca qualsiasi risorsa sui propri progetti, e poi ne cura anche le skill', () => {
    const dopo = conAllocazione({ mese: '202703', progettoId: 'p1', percentualeAllocazione: 30 });
    expect(motivoNegatoModificaRisorsa(TL, miei, prima, dopo)).toBeNull();
    expect(motivoNegatoModificaRisorsa(TL, miei, prima, { ...dopo, skillTecnici: [{ skillName: 'Go' }] })).toBeNull();
    // modifica e rimozione delle proprie allocazioni
    expect(motivoNegatoModificaRisorsa(TL, miei, dopo, { ...dopo, planned: prima.planned })).toBeNull();
  });

  it('il TL non tocca le allocazioni su altri progetti né i mesi liberi', () => {
    const cambiata = { ...prima, planned: [{ mese: '202701', progettoId: 'p9', percentualeAllocazione: 80 }, { mese: '202702' }] };
    expect(motivoNegatoModificaRisorsa(TL, miei, prima, cambiata)).toMatch(/non sei approvatore/);
    expect(motivoNegatoModificaRisorsa(TL, miei, prima, { ...prima, planned: [prima.planned[0]] })).toMatch(/non sei approvatore/);
    // stesso contenuto in un altro ordine, con i campi ricavati e id come oggetti: nessuna modifica
    const riordinata = { ...prima, planned: [{ mese: '202702' }, { percentualeAllocazione: 50, progetto: 'P9', progettoId: { toString: () => 'p9' }, mese: '202701' }] };
    expect(motivoNegatoModificaRisorsa(TL, miei, prima, riordinata)).toBeNull();
  });

  it('skill di una risorsa che non lavora sui progetti del TL: no', () => {
    expect(motivoNegatoModificaRisorsa(TL, miei, prima, { ...prima, skillTecnici: [] })).toMatch(/non lavora sui tuoi progetti/);
  });

  it('PM e PMSenior tutto; risorse semplici e controller niente', () => {
    const tutto = { skillTecnici: [], planned: [] };
    expect(motivoNegatoModificaRisorsa(PM_ESTERNO, [], prima, tutto)).toBeNull();
    expect(motivoNegatoModificaRisorsa(PMSENIOR, [], prima, tutto)).toBeNull();
    expect(motivoNegatoModificaRisorsa(RISORSA, miei, prima, tutto)).not.toBeNull();
    expect(motivoNegatoModificaRisorsa(CONTROLLER, miei, prima, prima)).not.toBeNull();
  });
});

describe('permessi globali', () => {
  it('per ogni profilo', () => {
    const riga = (s: Soggetto) => Object.entries(permessiGlobali(s)).filter(([, v]) => v).map(([k]) => k);
    expect(riga(RISORSA)).toEqual(['consuntivare']);
    expect(riga(TL)).toEqual(['creareProgetto', 'consuntivare']);
    expect(riga(PM)).toEqual(['creareProgetto', 'gestireRisorse', 'gestireCaratteristicheTutteLeRisorse', 'consuntivare']);
    expect(riga(PMSENIOR)).toEqual([
      'gestireClienti',
      'gestireCentriDiCosto',
      'creareProgetto',
      'gestireRisorse',
      'gestireCaratteristicheTutteLeRisorse',
      'consuntivare',
    ]);
    expect(riga(CONTROLLER)).toEqual(['gestireParametri', 'gestireTipologieCosto', 'gestireTariffe', 'consuntivare']);
    // L'amministratore senza risorsa collegata non consuntiva.
    expect(riga(ADMIN)).toEqual(['gestireRuoli', 'gestireUtenti']);
  });
});

describe('filtro dei progetti gestibili', () => {
  it('tutti per il PMSenior, i propri per TL e PM, nessuno per gli altri', () => {
    expect(filtroProgettiGestibili(PMSENIOR)).toEqual({});
    expect(filtroProgettiGestibili(TL)).toEqual({ 'approvatori.risorsaId': 'r-tullio' });
    expect(filtroProgettiGestibili(RISORSA)).toBeNull();
    expect(filtroProgettiGestibili(ADMIN)).toBeNull();
  });

  it('il servizio converte l\'id della risorsa in ObjectId per MongoDB', () => {
    const rid = new mongoose.Types.ObjectId();
    const filtro = new PermessiService().filtroProgettiGestibili({ ...PM, risorsaId: String(rid) });
    expect(filtro?.['approvatori.risorsaId']).toEqual(rid);
  });
});

describe('PermessiService.verifica', () => {
  const servizio = new PermessiService();
  it('401 senza accesso, 403 con permesso negato, niente se consentito', () => {
    expect(() => servizio.verifica(undefined, true, 'fare qualcosa')).toThrow(UnauthorizedException);
    expect(() => servizio.verifica(TL, false, 'riaprire il progetto')).toThrow(
      new ForbiddenException('Non hai il permesso di riaprire il progetto'),
    );
    expect(() => servizio.verifica(PM, true, 'riaprire il progetto')).not.toThrow();
  });
});
