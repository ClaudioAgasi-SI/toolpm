import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { SessioneService, type UtenteSessione } from './core/sessione.service';
import { aggiungiMesi, etichettaMese } from './pianificatore/mesi';

const PAOLA: UtenteSessione = {
  id: 'u1',
  email: 'paola@azienda.it',
  nome: 'Paola Bianchi',
  risorsaId: 'r1',
  abilitazione: 'PM',
  ruoli: ['risorsa'],
  deveCambiarePassword: false,
  permessi: { creareProgetto: true, gestireRisorse: true },
};

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
  });

  it('senza accesso mostra solo il marchio', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const testo = (fixture.nativeElement as HTMLElement).querySelector('nav')?.textContent ?? '';
    expect(testo).toContain('ToolPM');
    expect(testo).not.toContain('Pianificatore risorse');
  });

  it("con l'accesso mostra le sezioni, l'utente con il suo profilo e il comando per uscire", async () => {
    TestBed.inject(SessioneService).utente.set(PAOLA);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const testo = (fixture.nativeElement as HTMLElement).querySelector('nav')?.textContent ?? '';
    expect(testo).toContain('Pianificatore risorse');
    expect(testo).toContain('Anagrafiche');
    expect(testo).toContain('Paola Bianchi');
    expect(testo).toContain('PM');
    expect(testo).toContain('Esci');
  });
});

describe('mesi', () => {
  it('calcola ed etichetta i mesi', () => {
    expect(aggiungiMesi('202612', 1)).toBe('202701');
    expect(etichettaMese('202701')).toBe('gen 2027');
  });
});
