import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, messaggioErrore } from '../api.service';
import { MultiSelect } from '../multi-select';
import { aInputMese, aggiungiMesi, daInputMese, etichettaMese, meseCorrente } from '../mesi';
import { Allocazione, AllocazioneGriglia, CellaMese, Pianificazione as Griglia, Skill } from '../models';

/** Ordine di presentazione dei tipi di skill noti; eventuali altri tipi seguono in ordine alfabetico. */
const ORDINE_TIPI = ['tecnico', 'funzionale', 'ambito'];

@Component({
  selector: 'app-pianificazione',
  imports: [FormsModule, RouterLink, NgTemplateOutlet, MultiSelect],
  templateUrl: './pianificazione.html',
  styleUrl: './pianificazione.scss',
})
export class Pianificazione {
  private readonly api = inject(ApiService);

  protected readonly da = signal(meseCorrente());
  protected readonly a = signal(aggiungiMesi(meseCorrente(), 11));
  protected readonly filtro = signal('');

  /** Anagrafica skill, per popolare le tendine. */
  private readonly skills = signal<Skill[]>([]);
  /** Valori scelti nelle tendine (applicati con "Aggiorna"). */
  protected readonly tipoScelto = signal('');
  protected readonly skillScelte = signal<string[]>([]);
  /** Filtro per skill effettivamente applicato all'ultimo caricamento. */
  protected readonly filtroSkillApplicato = signal<{ tipo: string; skill: string[] } | null>(null);

  protected readonly tipiSkill = computed(() =>
    [...new Set(this.skills().map((s) => s.skillType))].sort((x, y) => {
      const ix = ORDINE_TIPI.indexOf(x);
      const iy = ORDINE_TIPI.indexOf(y);
      return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy) || x.localeCompare(y);
    }),
  );

  protected readonly skillDelTipo = computed(() =>
    this.skills()
      .filter((s) => s.skillType === this.tipoScelto())
      .map((s) => s.skillName)
      .sort((x, y) => x.localeCompare(y, 'it', { sensitivity: 'base' })),
  );
  protected readonly dati = signal<Griglia | null>(null);
  protected readonly errore = signal('');
  protected readonly caricamento = signal(false);
  protected readonly selezione = signal<{ nome: string; mese: string; cella: CellaMese } | null>(null);

  protected readonly etichettaMese = etichettaMese;
  protected readonly aInputMese = aInputMese;

  /** Celle con più progetti attualmente espanse (chiave: id risorsa + mese). */
  protected readonly espanse = signal<ReadonlySet<string>>(new Set());

  /** Tutte le celle con più di un progetto nella griglia visibile. */
  protected readonly celleMultiple = computed(() => {
    const d = this.dati();
    if (!d) return [];
    return this.righe().flatMap((r) =>
      d.mesi.filter((m) => r.mesi[m].allocazioni.length > 1).map((m) => this.chiave(r._id, m)),
    );
  });

  protected readonly tutteEspanse = computed(() => {
    const multiple = this.celleMultiple();
    return multiple.length > 0 && multiple.every((k) => this.espanse().has(k));
  });

  protected readonly righe = computed(() => {
    const f = this.filtro().trim().toLowerCase();
    const righe = this.dati()?.righe ?? [];
    return f ? righe.filter((r) => `${r.cognome} ${r.nome}`.toLowerCase().includes(f)) : righe;
  });

  constructor() {
    this.api.skills().subscribe({ next: (s) => this.skills.set(s) });
    this.carica();
  }

  protected scegliTipo(tipo: string) {
    this.tipoScelto.set(tipo);
    this.skillScelte.set([]); // le skill dipendono dal tipo
  }

  protected impostaDa(v: string) {
    if (v) this.da.set(daInputMese(v));
  }
  protected impostaA(v: string) {
    if (v) this.a.set(daInputMese(v));
  }

  protected carica() {
    this.caricamento.set(true);
    this.errore.set('');
    const tipo = this.tipoScelto();
    const skill = this.skillScelte();
    this.api.pianificazione(this.da(), this.a(), tipo, skill).subscribe({
      next: (d) => {
        this.dati.set(d);
        this.filtroSkillApplicato.set(tipo ? { tipo, skill } : null);
        this.caricamento.set(false);
      },
      error: (e) => {
        this.errore.set(messaggioErrore(e));
        this.caricamento.set(false);
      },
    });
  }

  /** Classe di colore in base alla percentuale (allocata o pesata). */
  protected livello(v: number): string {
    if (v === 0) return 'libero';
    if (v > 100) return 'sovra';
    if (v === 100) return 'pieno';
    if (v > 50) return 'medio';
    if (v === 50) return 'meta';
    return 'basso';
  }

  /** Bordo della singola attività: oro se "imprescindibile", argento se "importante". */
  protected importanza(al: Allocazione): string {
    switch (al.importanzaStrategica?.trim().toLowerCase()) {
      case 'imprescindibile':
        return 'oro';
      case 'importante':
        return 'argento';
      default:
        return '';
    }
  }

  /** Testo del tooltip di un'attività. */
  protected descrizione(al: AllocazioneGriglia): string {
    return [
      [al.cliente, al.progetto].filter(Boolean).join(' — '),
      `allocata ${al.percentualeAllocazione}%`,
      `probabilità ${al.probabilitaAllocazione ?? '—'} → pesata ${al.pesato}%`,
      `importanza ${al.importanzaStrategica ?? '—'}`,
    ].join('\n');
  }

  protected chiave(id: string, mese: string): string {
    return `${id}|${mese}`;
  }

  protected espansa(id: string, mese: string): boolean {
    return this.espanse().has(this.chiave(id, mese));
  }

  protected alterna(id: string, mese: string) {
    const k = this.chiave(id, mese);
    this.espanse.update((s) => {
      const nuovo = new Set(s);
      if (nuovo.has(k)) nuovo.delete(k);
      else nuovo.add(k);
      return nuovo;
    });
  }

  /** Un solo click: apre tutti gli accordion, oppure li chiude tutti se sono già aperti. */
  protected alternaTutti() {
    this.espanse.set(this.tutteEspanse() ? new Set() : new Set(this.celleMultiple()));
  }

  protected apri(nome: string, mese: string, cella: CellaMese) {
    this.selezione.set(cella.allocazioni.length ? { nome, mese, cella } : null);
  }
}
