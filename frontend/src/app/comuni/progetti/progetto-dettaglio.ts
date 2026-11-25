import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, type Observable, of } from 'rxjs';
import { messaggioErrore } from '../../core/errori';
import { SessioneService } from '../../core/sessione.service';
import { ComuniApiService } from '../comuni-api.service';
import {
  type Approvatore,
  type Attivita,
  type Avanzamento,
  etichettaStato,
  giorno,
  inCentesimi,
  inEuro,
  type Progetto,
  type RisorsaAnagrafica,
  type VoceAnagrafica,
} from '../modelli';
import { eProgettoPM, gestisceProgetto, PASSAGGI, puoPercentualeAttivita } from '../permessi';

interface ModuloProgetto {
  codice: string;
  titolo: string;
  descrizione: string;
  clienteId: string;
  centroCostoId: string;
  dataInizio: string;
  dataFine: string;
  soloSuAttivita: boolean;
  managerialeGiorni: number | null;
  managerialeEuro: number | null;
  definitivaGiorni: number | null;
  definitivaEuro: number | null;
}

interface RigaAttivita {
  attivita: Attivita;
  modifica: boolean;
  bozza: { descrizione: string; stato: 'attiva' | 'chiusa'; stimaGiorni: number | null; dataInizio: string; dataFine: string };
  percentuale: number;
  risorseAperte: boolean;
  risorse: Set<string>;
}

/**
 * Scheda del progetto (blocco B6): dati e stime, stato, percentuale, approvatori, attività con risorse e
 * percentuali, storico degli avanzamenti. I comandi si mostrano secondo i permessi; il backend ricontrolla tutto.
 */
@Component({
  selector: 'app-progetto-dettaglio',
  imports: [FormsModule, RouterLink],
  templateUrl: './progetto-dettaglio.html',
  styles: `
    .navigazione { display: flex; justify-content: space-between; }
    .scelta-risorse { max-height: 12rem; overflow-y: auto; border: 1px solid var(--bordo); border-radius: 6px; padding: 0.3rem 0.5rem; margin: 0.3rem 0; display: flex; flex-direction: column; }
    form.blocco { border: 1px solid var(--bordo); border-radius: 8px; padding: 0.75rem 1rem 1rem; margin: 1rem 0; }
    form.blocco > h2 { margin: 0.25rem 0 0.5rem; }
    h1 .stato { vertical-align: middle; margin-left: 0.5rem; }
  `,
})
export class ProgettoDettaglio {
  private readonly api = inject(ComuniApiService);
  private readonly router = inject(Router);
  protected readonly sessione = inject(SessioneService);
  protected readonly etichettaStato = etichettaStato;

  /** Parametro di rotta: id del progetto oppure "nuovo". */
  readonly id = input.required<string>();

  protected readonly progetto = signal<Progetto | null>(null);
  protected readonly modulo = signal<ModuloProgetto | null>(null);
  protected readonly clienti = signal<VoceAnagrafica[]>([]);
  protected readonly centri = signal<VoceAnagrafica[]>([]);
  protected readonly risorse = signal<RisorsaAnagrafica[]>([]);
  protected readonly attivita = signal<RigaAttivita[]>([]);
  protected readonly avanzamenti = signal<Avanzamento[]>([]);
  protected readonly approvatori = signal<Approvatore[]>([]);
  protected readonly errore = signal('');
  protected readonly messaggio = signal('');
  protected percentuale = 0;
  protected nuovaAttivita = { codice: '', descrizione: '', stimaGiorni: null as number | null };

  protected readonly nuovo = computed(() => this.id() === 'nuovo');
  protected readonly gestisce = computed(() => this.nuovo() ? this.sessione.puo('creareProgetto') : !!this.progetto() && gestisceProgetto(this.sessione.utente(), this.progetto()!));
  protected readonly pm = computed(() => !!this.progetto() && eProgettoPM(this.sessione.utente(), this.progetto()!));
  /** Stime in euro: il backend le manda solo a chi gestisce il progetto e al controller. */
  protected readonly vedeEuro = computed(
    () => this.nuovo() || this.gestisce() || this.sessione.haRuolo('controller'),
  );
  protected readonly passaggi = computed(() => {
    const p = this.progetto();
    if (!p) return [];
    return (PASSAGGI[p.stato] ?? []).filter((x) => (x.soloPM ? this.pm() : this.gestisce()));
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.carica(id));
    });
  }

  private carica(id: string) {
    this.errore.set('');
    const nuovo = id === 'nuovo';
    forkJoin({
      progetto: nuovo ? of(null) : this.api.progetto(id),
      attivita: nuovo ? of([]) : this.api.attivita(id),
      avanzamenti: nuovo ? of([]) : this.api.avanzamenti(id),
      clienti: this.api.voci('clienti'),
      centri: this.api.voci('centri-costo'),
      risorse: this.api.risorse(),
    }).subscribe({
      next: (d) => {
        this.clienti.set(d.clienti);
        this.centri.set(d.centri);
        this.risorse.set(d.risorse);
        this.mostra(d.progetto);
        this.mostraAttivita(d.attivita);
        this.avanzamenti.set(d.avanzamenti);
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  private mostra(p: Progetto | null) {
    this.progetto.set(p);
    this.percentuale = p?.percentualeCompletamento ?? 0;
    this.approvatori.set((p?.approvatori ?? []).map((a) => ({ ...a })));
    this.modulo.set({
      codice: p?.codice ?? '',
      titolo: p?.titolo ?? '',
      descrizione: p?.descrizione ?? '',
      clienteId: p?.clienteId ?? '',
      centroCostoId: p?.centroCostoId ?? '',
      dataInizio: giorno(p?.dataInizio),
      dataFine: giorno(p?.dataFine),
      soloSuAttivita: p?.soloSuAttivita ?? false,
      managerialeGiorni: p?.stime?.managerialeGiorni ?? null,
      managerialeEuro: inEuro(p?.stime?.managerialeCentesimi),
      definitivaGiorni: p?.stime?.definitivaGiorni ?? null,
      definitivaEuro: inEuro(p?.stime?.definitivaCentesimi),
    });
  }

  private mostraAttivita(elenco: Attivita[]) {
    this.attivita.set(
      elenco.map((a) => ({
        attivita: a,
        modifica: false,
        bozza: { descrizione: a.descrizione, stato: a.stato, stimaGiorni: a.stimaGiorni ?? null, dataInizio: giorno(a.dataInizio), dataFine: giorno(a.dataFine) },
        percentuale: a.percentualeCompletamento,
        risorseAperte: false,
        risorse: new Set(a.risorseAssegnateIds),
      })),
    );
  }

  /** Voci selezionabili: le attive, più quella già scelta anche se disattivata. */
  protected selezionabili(voci: VoceAnagrafica[], scelta: string) {
    return voci.filter((v) => v.attivo || v._id === scelta);
  }

  protected nomeRisorsa(id: string) {
    const r = this.risorse().find((x) => x._id === id);
    return r ? `${r.cognome} ${r.nome}` : id;
  }

  protected nomeAttivita(id?: string) {
    return id ? (this.attivita().find((r) => r.attivita._id === id)?.attivita.codice ?? 'attività') : 'Progetto';
  }

  /** Esegue una chiamata e mostra l'esito; dopo il successo esegue "poi". */
  private esegui<T>(chiamata: Observable<T>, poi: (r: T) => void, messaggio = 'Salvato.') {
    this.errore.set('');
    this.messaggio.set('');
    chiamata.subscribe({
      next: (r) => {
        poi(r);
        this.messaggio.set(messaggio);
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  protected salvaDati() {
    const m = this.modulo()!;
    const stime: Record<string, number | null> = {
      managerialeGiorni: m.managerialeGiorni ?? null,
      definitivaGiorni: m.definitivaGiorni ?? null,
    };
    if (this.vedeEuro()) {
      stime['managerialeCentesimi'] = inCentesimi(m.managerialeEuro);
      stime['definitivaCentesimi'] = inCentesimi(m.definitivaEuro);
    }
    const corpo = {
      titolo: m.titolo,
      descrizione: m.descrizione || null,
      clienteId: m.clienteId || null,
      centroCostoId: m.centroCostoId,
      dataInizio: m.dataInizio || null,
      dataFine: m.dataFine || null,
      soloSuAttivita: m.soloSuAttivita,
      stime,
    } as unknown as Partial<Progetto>;
    if (this.nuovo()) {
      this.esegui(this.api.creaProgetto({ ...corpo, codice: m.codice.trim() }), (p) => void this.router.navigate(['/comuni/progetti', p._id]), 'Progetto creato.');
    } else {
      this.esegui(this.api.modificaProgetto(this.id(), corpo), (p) => this.mostra(p));
    }
  }

  protected cambiaStato(verso: string) {
    this.esegui(this.api.cambiaStato(this.id(), verso), (p) => this.mostra(p), `Stato: ${etichettaStato(verso)}.`);
  }

  protected salvaPercentuale() {
    this.esegui(this.api.completamentoProgetto(this.id(), this.percentuale), (p) => {
      this.mostra(p);
      this.ricaricaAvanzamenti();
    });
  }

  protected aggiungiApprovatore() {
    this.approvatori.update((a) => [...a, { risorsaId: '', profilo: 'TL' }]);
  }

  protected rimuoviApprovatore(i: number) {
    this.approvatori.update((a) => a.filter((_, j) => j !== i));
  }

  protected salvaApprovatori() {
    const elenco = this.approvatori().filter((a) => a.risorsaId);
    this.esegui(this.api.impostaApprovatori(this.id(), elenco), (p) => this.mostra(p));
  }

  protected creaAttivita() {
    const a = this.nuovaAttivita;
    this.esegui(this.api.creaAttivita(this.id(), { codice: a.codice.trim(), descrizione: a.descrizione, stimaGiorni: a.stimaGiorni }), () => {
      this.nuovaAttivita = { codice: '', descrizione: '', stimaGiorni: null };
      this.ricaricaAttivita();
    }, 'Attività creata.');
  }

  protected salvaAttivita(r: RigaAttivita) {
    const b = r.bozza;
    this.esegui(
      this.api.modificaAttivita(this.id(), r.attivita._id!, {
        descrizione: b.descrizione,
        stato: b.stato,
        stimaGiorni: b.stimaGiorni ?? null,
        dataInizio: b.dataInizio || null,
        dataFine: b.dataFine || null,
      }),
      () => this.ricaricaAttivita(),
    );
  }

  protected alternaRisorsa(r: RigaAttivita, id: string) {
    if (r.risorse.has(id)) r.risorse.delete(id);
    else r.risorse.add(id);
  }

  protected salvaRisorse(r: RigaAttivita) {
    this.esegui(this.api.risorseAttivita(this.id(), r.attivita._id!, [...r.risorse]), () => this.ricaricaAttivita());
  }

  protected salvaPercentualeAttivita(r: RigaAttivita) {
    this.esegui(this.api.completamentoAttivita(this.id(), r.attivita._id!, r.percentuale), () => {
      this.ricaricaAttivita();
      this.ricaricaAvanzamenti();
    });
  }

  protected puoPercentuale(a: Attivita) {
    const p = this.progetto();
    return !!p && puoPercentualeAttivita(this.sessione.utente(), p, a);
  }

  private ricaricaAttivita() {
    this.api.attivita(this.id()).subscribe({ next: (a) => this.mostraAttivita(a), error: (e) => this.errore.set(messaggioErrore(e)) });
  }

  private ricaricaAvanzamenti() {
    this.api.avanzamenti(this.id()).subscribe({ next: (a) => this.avanzamenti.set(a) });
  }
}
