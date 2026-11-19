import type { UtenteSessione } from '../core/sessione.service';
import { eProgettoPM, gestisceProgetto, profiloSulProgetto, puoPercentualeAttivita } from './permessi';

const utente = (abilitazione: UtenteSessione['abilitazione'], risorsaId = 'r-me'): UtenteSessione => ({
  id: 'u',
  email: 'x@y.it',
  risorsaId,
  abilitazione,
  ruoli: ['risorsa'],
  deveCambiarePassword: false,
  permessi: {},
});
const progetto = { approvatori: [{ risorsaId: 'r-me', profilo: 'TL' as const }, { risorsaId: 'r-pm', profilo: 'PM' as const }] };

describe('permessi sui progetti nel frontend (come backend/src/permessi/regole.ts)', () => {
  it('TL del progetto: gestisce, ma non assegna gli approvatori', () => {
    expect(profiloSulProgetto(utente('TL'), progetto)).toBe('TL');
    expect(gestisceProgetto(utente('TL'), progetto)).toBe(true);
    expect(eProgettoPM(utente('TL'), progetto)).toBe(false);
  });

  it('PM del progetto e PMSenior: approvatori e riapertura', () => {
    expect(eProgettoPM(utente('PM', 'r-pm'), progetto)).toBe(true);
    expect(eProgettoPM(utente('PMSenior', 'r-altro'), progetto)).toBe(true);
  });

  it('senza abilitazione nessun diritto da approvatore; percentuale attività alle risorse assegnate', () => {
    expect(gestisceProgetto(utente(null), progetto)).toBe(false);
    expect(puoPercentualeAttivita(utente(null), progetto, { risorseAssegnateIds: ['r-me'] })).toBe(true);
    expect(puoPercentualeAttivita(utente(null), progetto, { risorseAssegnateIds: [] })).toBe(false);
  });
});
