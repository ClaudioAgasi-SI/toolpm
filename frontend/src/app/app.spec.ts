import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { aggiungiMesi, etichettaMese } from './pianificatore/mesi';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('mostra il menu di navigazione', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const testo = (fixture.nativeElement as HTMLElement).querySelector('nav')?.textContent ?? '';
    expect(testo).toContain('ToolPM');
    expect(testo).toContain('Pianificatore risorse');
  });
});

describe('mesi', () => {
  it('calcola ed etichetta i mesi', () => {
    expect(aggiungiMesi('202612', 1)).toBe('202701');
    expect(etichettaMese('202701')).toBe('gen 2027');
  });
});
