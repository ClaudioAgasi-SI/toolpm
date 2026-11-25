import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { etichettaStato } from '../comuni/modelli';
import { messaggioErrore } from '../core/errori';
import { ConsuntivazioneApiService } from './consuntivazione-api.service';
import type { SchedaProgetto as Scheda, TotaliReport, VistaReport } from './modelli';
import { oggi, totaleOre } from './ore';
import { avvisoValorizzare, calcolato, euro, gg, nomeMese, quota } from './report-testi';

/**
 * Scheda costi del progetto (fase 4, blocco E1; RF-14, RF-22, RF-24, RF-25): stime contro consuntivato
 * dall'inizio, dettaglio nel periodo per attività, risorsa, ruolo, tipologia e mese. Il TL vede solo ore e giorni.
 */
@Component({
  selector: 'app-scheda-progetto',
  imports: [FormsModule, RouterLink],
  templateUrl: './scheda-progetto.html',
  styleUrl: './scheda-progetto.scss',
})
export class SchedaProgetto {
  private readonly api = inject(ConsuntivazioneApiService);
  readonly id = input.required<string>();

  protected readonly etichettaStato = etichettaStato;
  protected readonly euro = euro;
  protected readonly gg = gg;
  protected readonly quota = quota;
  protected readonly totaleOre = totaleOre;
  protected readonly nomeMese = nomeMese;
  protected readonly avvisoValorizzare = avvisoValorizzare;

  protected da = `${oggi().slice(0, 4)}-01-01`;
  protected a = oggi();
  protected provvisoria = false;
  protected readonly scheda = signal<Scheda | null>(null);
  protected readonly caricamento = signal(true);
  protected readonly errore = signal('');

  ngOnInit() {
    this.carica();
  }

  protected carica() {
    this.caricamento.set(true);
    this.errore.set('');
    const vista: VistaReport = this.provvisoria ? 'provvisoria' : 'approvata';
    this.api.schedaProgetto(this.id(), { vista, da: this.da, a: this.a }).subscribe({
      next: (s) => {
        this.scheda.set(s);
        this.caricamento.set(false);
      },
      error: (e) => {
        this.errore.set(messaggioErrore(e));
        this.caricamento.set(false);
      },
    });
  }

  protected calcolato(s: Scheda) {
    return calcolato(s.calcolatoIl);
  }

  protected data(d: string | null) {
    return d ? new Date(d).toLocaleDateString('it-IT', { timeZone: 'UTC' }) : '—';
  }

  /** Larghezza della barra del consuntivato rispetto alla stima (al massimo 100). */
  protected barra(fatto: number | null | undefined, stima: number | null | undefined) {
    const q = quota(fatto, stima);
    return q === null ? 0 : Math.min(q, 100);
  }

  protected percento(v: number | null) {
    return v === null ? '—' : `${v}%`;
  }

  protected costo(t: TotaliReport) {
    return euro(t.costoCentesimi);
  }
}
