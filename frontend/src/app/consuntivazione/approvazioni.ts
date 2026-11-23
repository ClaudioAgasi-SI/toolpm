import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { messaggioErrore } from '../core/errori';
import { ConsuntivazioneApiService } from './consuntivazione-api.service';
import { ContatoreApprovazioni } from './contatore-approvazioni';
import { type AzioneApprovazione, type EsitoApprovazione, NOMI_STATO, type RigaApprovazione } from './modelli';
import { etichettaGiorno, etichettaSettimana, lunedi, oggi, piuGiorni, totaleOre } from './ore';

/** Gruppo dell'elenco: una risorsa in una settimana. */
interface Gruppo {
  chiave: string;
  risorsa: string;
  settimana: string;
  righe: RigaApprovazione[];
  minuti: number;
  costo: number | null;
  /** Righe senza costo (da valorizzare), tra quelle con i costi visibili. */
  daValorizzare: number;
}

type Vista = 'daLavorare' | 'inviata' | 'approvataTL' | 'approvata' | 'respinta';

const VISTE: { valore: Vista; testo: string; stato: string }[] = [
  { valore: 'daLavorare', testo: 'Da lavorare', stato: '' },
  { valore: 'inviata', testo: 'Inviate', stato: 'inviata' },
  { valore: 'approvataTL', testo: 'Con via libera del TL', stato: 'approvataTL' },
  { valore: 'approvata', testo: 'Approvate', stato: 'approvata' },
  { valore: 'respinta', testo: 'Respinte', stato: 'respinta' },
];

const NOMI_AZIONE: Record<AzioneApprovazione, { pulsante: string; fatto: string }> = {
  viaLibera: { pulsante: 'Via libera', fatto: 'Via libera dato a' },
  approva: { pulsante: 'Approva', fatto: 'Approvate' },
  respingi: { pulsante: 'Respingi', fatto: 'Respinte' },
};

const quante = (n: number) => `${n} ${n === 1 ? 'riga' : 'righe'}`;
const euro = (c: number | null | undefined) =>
  c === null || c === undefined ? '—' : `${(c / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/**
 * Approvazioni (fase 3, blocco D3): righe dei progetti di cui l'utente è approvatore, mai le proprie.
 * - Di base quelle che aspettano un'azione (TL: inviate; PM: inviate e con via libera), raggruppate per risorsa e settimana.
 * - Selezione multipla e azioni in blocco: via libera (TL), approvazione (PM), rifiuto con motivazione.
 * - Evidenza delle righe su attività a cui la risorsa non è assegnata; costi solo a chi li riceve (PM, PMSenior).
 */
@Component({
  selector: 'app-approvazioni',
  imports: [FormsModule],
  templateUrl: './approvazioni.html',
  styleUrl: './approvazioni.scss',
})
export class Approvazioni {
  private readonly api = inject(ConsuntivazioneApiService);
  private readonly contatore = inject(ContatoreApprovazioni);

  protected readonly viste = VISTE;
  protected readonly nomiStato = NOMI_STATO;
  protected readonly nomiAzione = NOMI_AZIONE;
  protected readonly etichettaGiorno = etichettaGiorno;
  protected readonly totaleOre = totaleOre;
  protected readonly euro = euro;
  protected readonly quante = quante;
  protected readonly azioniPossibili: AzioneApprovazione[] = ['viaLibera', 'approva', 'respingi'];

  // Filtri: vista e periodo sul server, progetto, risorsa e "non assegnate" nella pagina.
  protected vista: Vista = 'daLavorare';
  protected da = '';
  protected a = '';
  protected readonly progetto = signal('');
  protected readonly risorsa = signal('');
  protected readonly soloNonAssegnate = signal(false);

  protected readonly righe = signal<RigaApprovazione[]>([]);
  protected readonly troncato = signal(false);
  protected readonly selezionate = signal<Set<string>>(new Set());
  protected readonly caricamento = signal(true);
  protected readonly lavoro = signal(false);
  protected readonly errore = signal('');
  protected readonly messaggio = signal('');
  protected readonly saltate = signal<{ riga: string; motivo: string }[]>([]);
  /** Finestra del rifiuto: aperta con la motivazione da scrivere. */
  protected readonly rifiuto = signal<{ motivazione: string } | null>(null);

  protected readonly progetti = computed(() => unici(this.righe().map((r) => [r.progettoId, `${r.progetto.codice} — ${r.progetto.titolo}`])));
  protected readonly risorse = computed(() => unici(this.righe().map((r) => [r.risorsaId, r.risorsa])));
  protected readonly visibili = computed(() =>
    this.righe().filter(
      (r) =>
        (!this.progetto() || r.progettoId === this.progetto()) &&
        (!this.risorsa() || r.risorsaId === this.risorsa()) &&
        (!this.soloNonAssegnate() || r.attivitaNonAssegnata),
    ),
  );
  protected readonly conCosti = computed(() => this.visibili().some((r) => 'costoCentesimi' in r));
  protected readonly gruppi = computed(() => {
    const mappa = new Map<string, Gruppo>();
    for (const r of this.visibili()) {
      const settimana = lunedi(r.data);
      const chiave = `${r.risorsaId}|${settimana}`;
      if (!mappa.has(chiave)) mappa.set(chiave, { chiave, risorsa: r.risorsa, settimana, righe: [], minuti: 0, costo: 0, daValorizzare: 0 });
      const g = mappa.get(chiave)!;
      g.righe.push(r);
      g.minuti += r.minuti;
      g.costo = 'costoCentesimi' in r && g.costo !== null ? g.costo + (r.costoCentesimi ?? 0) : null;
      if ('costoCentesimi' in r && r.costoCentesimi === null) g.daValorizzare++;
    }
    return [...mappa.values()].sort((x, y) => x.risorsa.localeCompare(y.risorsa) || x.settimana.localeCompare(y.settimana));
  });
  protected readonly totaleMinuti = computed(() => this.visibili().reduce((s, r) => s + r.minuti, 0));
  protected readonly totaleCosto = computed(() =>
    this.visibili().every((r) => 'costoCentesimi' in r) ? this.visibili().reduce((s, r) => s + (r.costoCentesimi ?? 0), 0) : null,
  );
  protected readonly daValorizzare = computed(() => this.visibili().filter((r) => 'costoCentesimi' in r && r.costoCentesimi === null).length);
  protected readonly scelte = computed(() => this.visibili().filter((r) => this.selezionate().has(r.rigaId)));
  /** Per ogni azione, quante righe selezionate la ammettono. */
  protected readonly perAzione = computed(() => {
    const conta = { viaLibera: 0, approva: 0, respingi: 0 } as Record<AzioneApprovazione, number>;
    for (const r of this.scelte()) for (const a of r.azioni) conta[a]++;
    return conta;
  });

  constructor() {
    this.a = oggi();
    this.carica();
  }

  protected etichettaSettimana(lunediSettimana: string) {
    return etichettaSettimana(lunediSettimana);
  }

  protected carica() {
    this.caricamento.set(true);
    this.errore.set('');
    const stato = VISTE.find((v) => v.valore === this.vista)?.stato ?? '';
    // "Da lavorare" guarda tutto il passato; le altre viste, se manca il "dal", gli ultimi due mesi.
    const da = this.da || (stato ? piuGiorni(this.a || oggi(), -62) : '');
    this.api.approvazioni({ da, a: this.a, stato }).subscribe({
      next: (e) => {
        this.righe.set(e.righe);
        this.troncato.set(e.troncato);
        const presenti = new Set(e.righe.map((r) => r.rigaId));
        this.selezionate.update((s) => new Set([...s].filter((id) => presenti.has(id))));
        if (this.progetto() && !e.righe.some((r) => r.progettoId === this.progetto())) this.progetto.set('');
        if (this.risorsa() && !e.righe.some((r) => r.risorsaId === this.risorsa())) this.risorsa.set('');
        this.caricamento.set(false);
      },
      error: (e) => {
        this.errore.set(messaggioErrore(e));
        this.caricamento.set(false);
      },
    });
  }

  // ---- Selezione ----

  protected scelta(r: RigaApprovazione) {
    return this.selezionate().has(r.rigaId);
  }

  protected scegli(r: RigaApprovazione, si: boolean) {
    this.selezionate.update((s) => {
      const n = new Set(s);
      if (si) n.add(r.rigaId);
      else n.delete(r.rigaId);
      return n;
    });
  }

  protected gruppoScelto(g: Gruppo) {
    const lavorabili = g.righe.filter((r) => r.azioni.length);
    return lavorabili.length > 0 && lavorabili.every((r) => this.scelta(r));
  }

  protected scegliGruppo(g: Gruppo, si: boolean) {
    this.selezionate.update((s) => {
      const n = new Set(s);
      for (const r of g.righe) if (r.azioni.length) (si ? n.add(r.rigaId) : n.delete(r.rigaId));
      return n;
    });
  }

  protected scegliTutte(si: boolean) {
    this.selezionate.set(si ? new Set(this.visibili().filter((r) => r.azioni.length).map((r) => r.rigaId)) : new Set());
  }

  // ---- Azioni ----

  protected avvia(azione: AzioneApprovazione) {
    if (azione === 'respingi') {
      this.rifiuto.set({ motivazione: '' });
      return;
    }
    this.esegui(azione);
  }

  protected confermaRifiuto() {
    const motivazione = this.rifiuto()?.motivazione.trim();
    if (!motivazione) return;
    this.esegui('respingi', motivazione);
  }

  private esegui(azione: AzioneApprovazione, motivazione?: string) {
    const righe = this.scelte().filter((r) => r.azioni.includes(azione));
    if (!righe.length) return;
    this.lavoro.set(true);
    this.errore.set('');
    this.messaggio.set('');
    this.saltate.set([]);
    this.api.agisci(azione, righe.map((r) => r.rigaId), motivazione).subscribe({
      next: (esito) => {
        this.lavoro.set(false);
        this.rifiuto.set(null);
        this.mostraEsito(esito, righe);
        this.selezionate.set(new Set());
        this.contatore.aggiorna();
        this.carica();
      },
      error: (e) => {
        this.lavoro.set(false);
        this.errore.set(messaggioErrore(e));
      },
    });
  }

  private mostraEsito(esito: EsitoApprovazione, righe: RigaApprovazione[]) {
    const nomi = new Map(righe.map((r) => [r.rigaId, `${r.risorsa}, ${etichettaGiorno(r.data)}, ${r.attivita ? `${r.progetto.codice} › ${r.attivita.codice}` : r.progetto.codice}`]));
    this.messaggio.set(`${NOMI_AZIONE[esito.azione].fatto}: ${quante(esito.fatte)}.${esito.saltate ? ` Saltate: ${esito.saltate}.` : ''}`);
    this.saltate.set(esito.esiti.filter((e) => e.esito === 'saltata').map((e) => ({ riga: nomi.get(e.rigaId) ?? e.rigaId, motivo: e.motivo ?? '' })));
  }

  protected testoVia(r: RigaApprovazione) {
    return r.viaLiberaTL ? `${r.viaLiberaTL.nome}, ${new Date(r.viaLiberaTL.il).toLocaleDateString('it-IT')}` : '';
  }
}

function unici(coppie: string[][]) {
  const m = new Map<string, string>();
  for (const [id, testo] of coppie) m.set(id, testo);
  return [...m.entries()].map(([id, testo]) => ({ id, testo })).sort((x, y) => x.testo.localeCompare(y.testo));
}
