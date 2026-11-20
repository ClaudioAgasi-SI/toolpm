import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { SessioneService } from '../../core/sessione.service';
import { ComuniApiService } from '../../comuni/comuni-api.service';
import { etichettaStato, type Progetto, type VoceAnagrafica } from '../../comuni/modelli';
import { gestisceProgetto } from '../../comuni/permessi';
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

/**
 * Scheda della risorsa nel Pianificatore (blocco B6): skill, certificazioni e allocazioni.
 * Il progetto di un'allocazione si sceglie da un elenco; il cliente si ricava dal progetto.
 * I dati anagrafici (nome, email, ruolo, orario) si modificano in Anagrafiche → Risorse.
 *
 * Permessi (il backend ricontrolla): PM e PMSenior tutto; il TL alloca qualsiasi risorsa sui propri progetti
 * e modifica solo quelle allocazioni, e le skill solo delle risorse che lavorano sui suoi progetti.
 */
@Component({
  selector: 'app-risorsa-dettaglio',
  imports: [FormsModule, RouterLink],
  templateUrl: './risorsa-dettaglio.html',
  styleUrl: './risorsa-dettaglio.scss',
})
export class RisorsaDettaglio {
  private readonly api = inject(ApiService);
  private readonly comuni = inject(ComuniApiService);
  private readonly sessione = inject(SessioneService);

  /** Parametro di rotta: id della risorsa. */
  readonly id = input.required<string>();

  protected readonly risorsa = signal<Risorsa | null>(null);
  protected readonly skills = signal<Skill[]>([]);
  protected readonly scale = signal<Record<string, string[]>>({});
  protected readonly progetti = signal<Progetto[]>([]);
  private readonly clienti = signal<Map<string, VoceAnagrafica>>(new Map());
  protected readonly errore = signal('');
  protected readonly messaggio = signal('');
  protected readonly salvataggio = signal(false);
  /** Aggiornato a ogni modifica delle allocazioni, per ricalcolare i permessi sulle skill. */
  private readonly versione = signal(0);

  protected readonly tipiSkill = TIPI_SKILL;
  protected readonly aInputMese = aInputMese;
  protected readonly etichettaStato = etichettaStato;

  /** PM e PMSenior modificano tutto; il TL solo le proprie allocazioni (e le skill, se la risorsa lavora con lui). */
  protected readonly tutto = computed(() => this.sessione.puo('gestireCaratteristicheTutteLeRisorse'));
  protected readonly eTL = computed(() => this.sessione.utente()?.abilitazione === 'TL');
  protected readonly mieiProgetti = computed(
    () => new Set(this.progetti().filter((p) => gestisceProgetto(this.sessione.utente(), p)).map((p) => p._id!)),
  );
  protected readonly puoSkill = computed(() => {
    this.versione();
    if (this.tutto()) return true;
    // Il TL cura le skill delle risorse che lavorano sui suoi progetti: allocate o con ore consuntivate.
    const r = this.risorsa();
    return (
      this.eTL() &&
      ((r?.planned ?? []).some((a) => !!a.progettoId && this.mieiProgetti().has(a.progettoId)) ||
        (r?.progettiConsuntivati ?? []).some((id) => this.mieiProgetti().has(id)))
    );
  });
  protected readonly puoSalvare = computed(() => this.tutto() || this.eTL());

  ngOnInit() {
    forkJoin({
      risorsa: this.api.risorsa(this.id()),
      skills: this.api.skills(),
      rate: this.api.rate(),
      progetti: this.comuni.progetti(),
      clienti: this.comuni.voci('clienti'),
    }).subscribe({
      next: ({ risorsa, skills, rate, progetti, clienti }) => {
        this.risorsa.set({ ...risorsaVuota(), ...risorsa });
        this.skills.set(skills);
        this.scale.set(Object.fromEntries(rate.map((r: Rate) => [r.rateType, r.rate])));
        this.progetti.set(progetti);
        this.clienti.set(new Map(clienti.map((c) => [c._id, c])));
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

  /** Riga modificabile: per il TL solo le allocazioni sui suoi progetti (e le righe nuove). */
  protected rigaModificabile(al: Allocazione & { nuova?: boolean }): boolean {
    if (this.tutto()) return true;
    if (!this.eTL()) return false;
    return !!al.nuova || (!!al.progettoId && this.mieiProgetti().has(al.progettoId));
  }

  /** Progetti proponibili per una riga: tutti per PM e PMSenior, per il TL solo i suoi (più quello già scelto). */
  protected progettiPerRiga(al: Allocazione): Progetto[] {
    return this.progetti().filter((p) => this.tutto() || this.mieiProgetti().has(p._id!) || p._id === al.progettoId);
  }

  protected cliente(al: Allocazione): string {
    const p = this.progetti().find((x) => x._id === al.progettoId);
    const c = p?.clienteId ? this.clienti().get(p.clienteId) : undefined;
    return p ? (c ? c.ragioneSociale ?? c.codice : 'interno') : '';
  }

  protected impostaProgetto(al: Allocazione, id: string) {
    al.progettoId = id || undefined;
    this.versione.update((v) => v + 1);
  }

  protected aggiungiSkill(campo: TipoSkill) {
    this.risorsa()![campo].push({ skillName: '', rate: '' });
  }

  protected rimuoviSkill(campo: TipoSkill, i: number) {
    this.risorsa()![campo].splice(i, 1);
  }

  protected aggiungiAllocazione() {
    const planned = this.risorsa()!.planned as (Allocazione & { nuova?: boolean })[];
    const ultima = [...planned].reverse().find((a) => this.rigaModificabile(a));
    planned.push({
      mese: ultima?.mese ?? meseCorrente(),
      progettoId: ultima?.progettoId,
      probabilitaAllocazione: 'sicura',
      percentualeAllocazione: 50,
      nuova: true,
    });
    this.versione.update((v) => v + 1);
  }

  protected rimuoviAllocazione(i: number) {
    this.risorsa()!.planned.splice(i, 1);
    this.versione.update((v) => v + 1);
  }

  protected impostaMese(al: Allocazione, v: string) {
    if (v) al.mese = daInputMese(v);
  }

  protected salva() {
    const r = this.risorsa();
    if (!r) return;
    this.errore.set('');
    this.messaggio.set('');
    // Righe di skill vuote scartate; allocazioni ordinate per mese, senza i campi ricavati dal progetto.
    for (const t of TIPI_SKILL) r[t.campo] = r[t.campo].filter((s) => s.skillName.trim());
    r.planned.sort((x, y) => x.mese.localeCompare(y.mese));
    const planned = r.planned.map((a) => {
      const { progetto: _p, cliente: _c, progettoTitolo: _t, clienteRagioneSociale: _r, nuova: _n, ...resto } = a as Allocazione & { nuova?: boolean };
      if (!resto.progettoId) delete resto.progettoId;
      return resto;
    });

    this.salvataggio.set(true);
    this.api.aggiornaRisorsa(this.id(), { ...r, planned }).subscribe({
      next: (salvata) => {
        this.salvataggio.set(false);
        this.risorsa.set({ ...risorsaVuota(), ...salvata });
        this.messaggio.set('Salvato.');
      },
      error: (e) => {
        this.salvataggio.set(false);
        this.errore.set(messaggioErrore(e));
      },
    });
  }
}
