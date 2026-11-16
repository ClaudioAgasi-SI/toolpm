import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { ApiService, messaggioErrore } from '../api.service';
import { aInputMese, daInputMese, meseCorrente } from '../mesi';
import { Allocazione, Rate, Risorsa, Skill, TIPI_SKILL, TipoSkill } from '../models';

function risorsaVuota(): Risorsa {
  return {
    cognome: '',
    nome: '',
    skillTecnici: [],
    skillAmbiti: [],
    skillFunzionali: [],
    certificazioni: [],
    planned: [],
  };
}

@Component({
  selector: 'app-risorsa-dettaglio',
  imports: [FormsModule, RouterLink],
  templateUrl: './risorsa-dettaglio.html',
  styleUrl: './risorsa-dettaglio.scss',
})
export class RisorsaDettaglio {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  /** Parametro di rotta: id della risorsa oppure "nuova". */
  readonly id = input.required<string>();

  protected readonly risorsa = signal<Risorsa | null>(null);
  protected readonly skills = signal<Skill[]>([]);
  protected readonly scale = signal<Record<string, string[]>>({});
  protected readonly errore = signal('');
  protected readonly messaggio = signal('');
  protected readonly salvataggio = signal(false);

  protected readonly tipiSkill = TIPI_SKILL;
  protected readonly aInputMese = aInputMese;
  protected readonly nuova = computed(() => this.id() === 'nuova');

  /** Valori già usati nella pianificazione, proposti come suggerimenti. */
  protected readonly clienti = computed(() => this.distinti((a) => a.cliente));
  protected readonly progetti = computed(() => this.distinti((a) => a.progetto));

  ngOnInit() {
    forkJoin({
      risorsa: this.nuova() ? of(risorsaVuota()) : this.api.risorsa(this.id()),
      skills: this.api.skills(),
      rate: this.api.rate(),
    }).subscribe({
      next: ({ risorsa, skills, rate }) => {
        this.risorsa.set({ ...risorsaVuota(), ...risorsa });
        this.skills.set(skills);
        this.scale.set(Object.fromEntries(rate.map((r: Rate) => [r.rateType, r.rate])));
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  protected skillPerTipo(tipo: string): string[] {
    return this.skills()
      .filter((s) => s.skillType === tipo)
      .map((s) => s.skillName);
  }

  protected scala(nome: string): string[] {
    return this.scale()[nome] ?? [];
  }

  protected aggiungiSkill(campo: TipoSkill) {
    this.risorsa()![campo].push({ skillName: '', rate: '' });
  }

  protected rimuoviSkill(campo: TipoSkill, i: number) {
    this.risorsa()![campo].splice(i, 1);
  }

  protected aggiungiAllocazione() {
    const planned = this.risorsa()!.planned;
    const ultima = planned.at(-1);
    planned.push({
      mese: ultima?.mese ?? meseCorrente(),
      cliente: ultima?.cliente ?? '',
      progetto: ultima?.progetto ?? '',
      probabilitaAllocazione: 'sicura',
      percentualeAllocazione: 50,
    });
  }

  protected rimuoviAllocazione(i: number) {
    this.risorsa()!.planned.splice(i, 1);
  }

  protected impostaMese(al: Allocazione, v: string) {
    if (v) al.mese = daInputMese(v);
  }

  protected salva() {
    const r = this.risorsa();
    if (!r) return;
    this.errore.set('');
    this.messaggio.set('');
    // Righe vuote scartate, pianificazione ordinata per mese.
    for (const t of TIPI_SKILL) r[t.campo] = r[t.campo].filter((s) => s.skillName.trim());
    r.planned.sort((x, y) => x.mese.localeCompare(y.mese));

    this.salvataggio.set(true);
    const richiesta = this.nuova() ? this.api.creaRisorsa(r) : this.api.aggiornaRisorsa(this.id(), r);
    richiesta.subscribe({
      next: (salvata) => {
        this.salvataggio.set(false);
        if (this.nuova()) {
          this.router.navigate(['/pianificatore/risorse', salvata._id]);
        } else {
          this.risorsa.set({ ...risorsaVuota(), ...salvata });
          this.messaggio.set('Salvato.');
        }
      },
      error: (e) => {
        this.salvataggio.set(false);
        this.errore.set(messaggioErrore(e));
      },
    });
  }

  protected elimina() {
    const r = this.risorsa();
    if (!r?._id || !confirm(`Eliminare ${r.cognome} ${r.nome}?`)) return;
    this.api.eliminaRisorsa(r._id).subscribe({
      next: () => this.router.navigate(['/pianificatore/risorse']),
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  private distinti(f: (a: Allocazione) => string | undefined): string[] {
    const valori = (this.risorsa()?.planned ?? []).map(f).filter((v): v is string => !!v);
    return [...new Set(valori)].sort();
  }
}
