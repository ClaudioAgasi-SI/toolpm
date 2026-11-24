import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import mongoose from 'mongoose';
import { PermessiService } from './permessi.service.js';
import {
  filtroProgettiGestibili,
  motivoNegatoApprovazione,
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

  it('skill di una risorsa con ore consuntivate su un progetto del TL: sì (fase 2)', () => {
    expect(motivoNegatoModificaRisorsa(TL, miei, prima, { ...prima, skillTecnici: [] }, ['p1'])).toBeNull();
    expect(motivoNegatoModificaRisorsa(TL, miei, prima, { ...prima, skillTecnici: [] }, ['p9'])).toMatch(/non lavora sui tuoi progetti/);
    // Le ore consuntivate non danno diritto a toccare le allocazioni sui progetti altrui.
    expect(motivoNegatoModificaRisorsa(TL, miei, prima, { ...prima, planned: [] }, ['p1'])).toMatch(/non sei approvatore/);
  });

  it('chiunque cura le proprie skill e certificazioni, non le proprie allocazioni (20/11/2026)', () => {
    const nuove = { ...prima, skillTecnici: [{ skillName: 'Go' }], certificazioni: [{ certName: 'PMP' }] };
    for (const s of [RISORSA, CONTROLLER]) {
      expect(motivoNegatoModificaRisorsa(s, [], prima, nuove, [], true)).toBeNull();
      expect(motivoNegatoModificaRisorsa(s, [], prima, nuove)).not.toBeNull();
      expect(motivoNegatoModificaRisorsa(s, [], prima, { ...nuove, planned: [] }, [], true)).toMatch(/tue allocazioni/);
      // Stesse allocazioni in un altro ordine: nessuna modifica.
      expect(motivoNegatoModificaRisorsa(s, [], prima, { ...nuove, planned: [...prima.planned].reverse() }, [], true)).toBeNull();
    }
    // Il TL su sé stesso: skill sì anche senza progetti in comune; allocazioni altrui no.
    expect(motivoNegatoModificaRisorsa(TL, miei, prima, nuove, [], true)).toBeNull();
    expect(motivoNegatoModificaRisorsa(TL, miei, prima, { ...nuove, planned: [] }, [], true)).toMatch(/non sei approvatore/);
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
    expect(riga(TL)).toEqual(['creareProgetto', 'consuntivare', 'approvare']);
    expect(riga(PM)).toEqual(['creareProgetto', 'gestireRisorse', 'gestireCaratteristicheTutteLeRisorse', 'consuntivare', 'approvare']);
    expect(riga(PMSENIOR)).toEqual([
      'gestireClienti',
      'gestireCentriDiCosto',
      'creareProgetto',
      'gestireRisorse',
      'gestireCaratteristicheTutteLeRisorse',
      'consuntivare',
      'approvare',
      'consultareStorico',
    ]);
    expect(riga(CONTROLLER)).toEqual(['gestireParametri', 'gestireTipologieCosto', 'gestireTariffe', 'consuntivare', 'gestirePeriodi', 'consultareStorico']);
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

describe('approvazione delle righe (fase 3)', () => {
  const di = (risorsaId: string, stato: Parameters<typeof motivoNegatoApprovazione>[2]['stato']) => ({ risorsaId, stato });
  const puo = (s: Soggetto, riga: ReturnType<typeof di>, azione: Parameters<typeof motivoNegatoApprovazione>[3]) =>
    motivoNegatoApprovazione(s, PROGETTO, riga, azione) === null;

  it('TL: via libera e rifiuto delle sole righe inviate, non l\'approvazione definitiva', () => {
    expect(puo(TL, di('r-rita', 'inviata'), 'viaLibera')).toBe(true);
    expect(puo(TL, di('r-rita', 'inviata'), 'respingi')).toBe(true);
    expect(puo(TL, di('r-rita', 'inviata'), 'approva')).toBe(false);
    expect(puo(TL, di('r-rita', 'approvataTL'), 'respingi')).toBe(false);
    expect(puo(TL, di('r-rita', 'bozza'), 'viaLibera')).toBe(false);
  });

  it('PM: approva con o senza via libera, respinge anche le approvate; niente via libera', () => {
    expect(puo(PM, di('r-rita', 'inviata'), 'approva')).toBe(true);
    expect(puo(PM, di('r-rita', 'approvataTL'), 'approva')).toBe(true);
    expect(puo(PM, di('r-rita', 'approvata'), 'respingi')).toBe(true);
    expect(puo(PM, di('r-rita', 'approvata'), 'approva')).toBe(false);
    expect(puo(PM, di('r-rita', 'respinta'), 'approva')).toBe(false);
    expect(motivoNegatoApprovazione(PM, PROGETTO, di('r-rita', 'inviata'), 'viaLibera')).toMatch(/approvi direttamente/);
  });

  it('chi è TL e PM sullo stesso progetto approva come PM; il PMSenior ovunque', () => {
    expect(puo(TL_PM, di('r-rita', 'inviata'), 'approva')).toBe(true);
    expect(puo(PMSENIOR, di('r-rita', 'approvataTL'), 'approva')).toBe(true);
  });

  it('nessuno agisce sulle proprie ore', () => {
    expect(motivoNegatoApprovazione(PM, PROGETTO, di('r-paola', 'inviata'), 'approva')).toMatch(/proprie ore/);
    expect(puo(TL, di('r-tullio', 'inviata'), 'viaLibera')).toBe(false);
    expect(puo(PMSENIOR, di('r-sara', 'inviata'), 'approva')).toBe(false);
    // Le ore del PM le approva un altro PM del progetto o un PMSenior.
    expect(puo(TL_PM, di('r-paola', 'inviata'), 'approva')).toBe(true);
    expect(puo(PMSENIOR, di('r-paola', 'inviata'), 'approva')).toBe(true);
  });

  it('esterni, risorse, controller e approvatori senza abilitazione: no', () => {
    for (const s of [RISORSA, TL_ESTERNO, PM_ESTERNO, CONTROLLER, ADMIN, EX_PM]) {
      expect(puo(s, di('r-tina', 'inviata'), 'approva')).toBe(false);
      expect(puo(s, di('r-tina', 'inviata'), 'respingi')).toBe(false);
    }
  });

  it('righe chiuse: nessuna azione', () => {
    expect(motivoNegatoApprovazione(PM, PROGETTO, di('r-rita', 'chiusa'), 'respingi')).toMatch(/mese chiuso/);
  });
});
