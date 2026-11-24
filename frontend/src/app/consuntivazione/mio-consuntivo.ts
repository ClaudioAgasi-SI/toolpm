import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ComuniApiService } from '../comuni/comuni-api.service';
import { messaggioErrore } from '../core/errori';
import { ConsuntivazioneApiService } from './consuntivazione-api.service';
import { type DaInviare, type Giornata, NOMI_STATO, type Proposta, type RigaDaSalvare, type StatoRiga, type TipologiaCosto, type VoceAttivita, type VoceProgetto } from './modelli';
import { etichettaGiorno, etichettaSettimana, fineSettimana, leggiOre, oggi, piuGiorni, scriviOre, settimana, totaleOre } from './ore';

type Vista = 'settimana' | 'giorno';

/** Una cella della griglia: ore scritte, nota, e la riga salvata da cui viene (se c'è). */
interface Cella {
  testo: string;
  nota: string;
  rigaId?: string;
  /** Stato della riga salvata: solo bozza e respinta si modificano. */
  stato?: StatoRiga;
  /** Motivazione del rifiuto, sulle righe respinte. */
  motivazione?: string;
}

/** Riga della griglia: progetto o attività, più tipologia; una cella per giorno. */
interface RigaGriglia {
  chiave: string;
  progettoId: string;
  attivitaId: string | null;
  tipologiaId: string;
  etichetta: string;
  dettaglio: string;
  /** Attività a cui la risorsa non è assegnata (decisione 10: permessa, con avviso). */
  nonAssegnata: boolean;
  /** Riga proposta e non ancora usata. */
  proposta?: 'pianificatore' | 'settimanaPrecedente';
  celle: Record<string, Cella>;
}

const chiaveDi = (progettoId: string, attivitaId: string | null, tipologiaId: string) => `${progettoId}|${attivitaId ?? '-'}|${tipologiaId}`;
const MODIFICABILI: StatoRiga[] = ['bozza', 'respinta'];

/**
 * Il mio consuntivo (fase 2, blocco C5): ore della risorsa per settimana o per giorno.
 * - Righe = progetto o attività + tipologia (la nuova riga propone la tipologia predefinita); colonne = giorni.
 * - Salva insieme solo le giornate cambiate, con la versione letta (409 → ricaricare).
 * - Copia della settimana o del giorno precedente nella pagina: le ore copiate si vedono prima di salvarle.
 * - Nessun importo: la risorsa non vede tariffe né costi.
 * - Invio e ritiro delle giornate del periodo (fase 3, blocco D1): stato di ogni cella, righe respinte con la motivazione,
 *   contatore delle righe ancora da inviare nei giorni passati.
 */
@Component({
  selector: 'app-mio-consuntivo',
  imports: [FormsModule],
  templateUrl: './mio-consuntivo.html',
  styleUrl: './mio-consuntivo.scss',
})
export class MioConsuntivo {
  private readonly api = inject(ConsuntivazioneApiService);
  private readonly comuni = inject(ComuniApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly scriviOre = scriviOre;
  protected readonly totaleOre = totaleOre;
  protected readonly etichettaGiorno = etichettaGiorno;
  protected readonly fineSettimana = fineSettimana;
  protected readonly nomiStato = NOMI_STATO;
  protected readonly statiLegenda: StatoRiga[] = ['inviata', 'approvataTL', 'approvata', 'respinta', 'chiusa'];

  protected readonly oggi = oggi();
  protected readonly vista = signal<Vista>('settimana');
  protected readonly data = signal(this.oggi);
  protected readonly giorni = computed(() => (this.vista() === 'settimana' ? settimana(this.data()) : [this.data()]));
  protected readonly titolo = computed(() => (this.vista() === 'settimana' ? etichettaSettimana(this.data()) : etichettaGiorno(this.data())));

  protected readonly voci = signal<VoceProgetto[]>([]);
  protected readonly tipologie = signal<TipologiaCosto[]>([]);
  protected readonly righe = signal<RigaGriglia[]>([]);
  protected readonly proposteDaAggiungere = signal<Proposta[]>([]);
  /** Cresce a ogni modifica delle celle: ricalcola totali e giornate cambiate. */
  private readonly modifiche = signal(0);
  private versioni = new Map<string, number>();
  private originali = new Map<string, string>();

  protected readonly caricamento = signal(true);
  protected readonly salvataggio = signal(false);
  protected readonly errore = signal('');
  protected readonly conflitto = signal(false);
  protected readonly messaggio = signal('');
  protected readonly avvisi = signal<{ data: string; messaggio: string }[]>([]);
  protected readonly selezionata = signal<{ riga: RigaGriglia; giorno: string } | null>(null);
  protected readonly invio = signal(false);
  /** Righe proprie ancora da inviare nei giorni passati, in tutto il calendario. */
  protected readonly daInviare = signal<DaInviare | null>(null);
  /** Mesi chiusi (AAAAMM) del periodo visibile (fase 3, D4). */
  protected readonly mesiChiusi = signal<string[]>([]);
  protected meseChiuso(g: string) {
    return this.mesiChiusi().includes(g.slice(0, 4) + g.slice(5, 7));
  }
  protected readonly nomiMesiChiusi = computed(() =>
    this.mesiChiusi().map((m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(4) - 1, 1)).toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' })),
  );

  // Nuova riga
  protected nuova = { voce: '', tipologiaId: '' };
  protected readonly predefinita = computed(() => this.tipologie().find((t) => t.predefinita)?._id ?? '');
  protected readonly attivitaAssegnate = computed(() =>
    this.voci().flatMap((p) => p.attivita.filter((a) => a.assegnata).map((a) => ({ progetto: p, attivita: a }))),
  );

  // ---- Totali e stato ----

  protected readonly totaliGiorno = computed(() => {
    this.modifiche();
    const tot: Record<string, number> = {};
    for (const g of this.giorni()) tot[g] = this.righe().reduce((s, r) => s + this.minuti(r.celle[g]), 0);
    return tot;
  });
  protected readonly totale = computed(() => Object.values(this.totaliGiorno()).reduce((a, b) => a + b, 0));
  protected readonly giorniCambiati = computed(() => {
    this.modifiche();
    this.righe();
    return this.giorni().filter((g) => this.serializza(g) !== (this.originali.get(g) ?? '[]'));
  });
  protected readonly erroriCelle = computed(() => {
    this.modifiche();
    return this.righe().flatMap((r) =>
      this.giorni()
        .filter((g) => 'errore' in leggiOre(r.celle[g]?.testo))
        .map((g) => `${r.etichetta}, ${etichettaGiorno(g)}: ${(leggiOre(r.celle[g].testo) as { errore: string }).errore}`),
    );
  });

  // ---- Invio (fase 3) ----

  /** Righe salvate del periodo per stato: le celle con rigaId vengono dal database. */
  private righeSalvate(filtro: (s: StatoRiga) => boolean) {
    this.modifiche();
    return this.righe().flatMap((r) =>
      this.giorni()
        .filter((g) => r.celle[g]?.rigaId && filtro(r.celle[g].stato!))
        .map((g) => ({ riga: r, giorno: g, cella: r.celle[g] })),
    );
  }
  protected readonly daInviareQui = computed(() => this.righeSalvate((s) => MODIFICABILI.includes(s)));
  protected readonly ritirabili = computed(() => this.righeSalvate((s) => s === 'inviata'));
  protected readonly respinte = computed(() => this.righeSalvate((s) => s === 'respinta'));
  /** Righe da inviare fuori dal periodo visibile: il contatore le segnala. */
  protected readonly daInviareAltrove = computed(() => {
    const d = this.daInviare();
    if (!d) return 0;
    return d.bozza + d.respinte - this.daInviareQui().length;
  });

  protected statoCella(r: RigaGriglia, g: string) {
    const s = r.celle[g]?.rigaId ? r.celle[g].stato : undefined;
    return s && s !== 'bozza' ? s : '';
  }

  protected titoloCella(r: RigaGriglia, g: string) {
    const c = r.celle[g];
    if (this.erroreCella(r, g)) return this.erroreCella(r, g);
    if (g > this.oggi) return 'Giorno futuro';
    if (this.meseChiuso(g)) return 'Mese chiuso: le ore non si modificano';
    if (c?.stato === 'respinta') return `Respinta: ${c.motivazione ?? ''}`;
    if (c?.rigaId && c.stato && c.stato !== 'bozza') return `${NOMI_STATO[c.stato]}: non si modifica`;
    return '';
  }

  protected invia() {
    this.cambiaStato('invio', this.daInviareQui());
  }

  protected ritira() {
    this.cambiaStato('ritiro', this.ritirabili());
  }

  private cambiaStato(operazione: 'invio' | 'ritiro', righe: { giorno: string }[]) {
    if (this.giorniCambiati().length) {
      this.errore.set('Ci sono ore non salvate: salva prima di inviare.');
      return;
    }
    const giorni = [...new Set(righe.map((x) => x.giorno))].sort();
    if (!giorni.length) return;
    const quante = righe.length === 1 ? '1 riga' : `${righe.length} righe`;
    const di = giorni.length === 1 ? etichettaGiorno(giorni[0]) : `${giorni.length} giorni`;
    const domanda =
      operazione === 'invio'
        ? `Inviare all'approvazione ${quante} (${di})? Dopo l'invio le ore non si modificano, a meno di ritirarle prima che un approvatore le guardi.`
        : `Ritirare l'invio di ${quante} (${di})? Tornano in bozza e potrai correggerle e inviarle di nuovo.`;
    if (!confirm(domanda)) return;
    this.invio.set(true);
    this.errore.set('');
    this.messaggio.set('');
    this.avvisi.set([]);
    const giornate = giorni.map((g) => ({ data: g, versione: this.versioni.get(g) ?? 0 }));
    const chiamata = operazione === 'invio' ? this.api.invia(giornate) : this.api.ritira(giornate);
    chiamata.subscribe({
      next: (esito) => {
        this.invio.set(false);
        const n = esito.righe === 1 ? '1 riga' : `${esito.righe} righe`;
        this.messaggio.set(operazione === 'invio' ? `Inviate all'approvazione: ${n}.` : `Invio ritirato: ${n} di nuovo in bozza.`);
        this.ricarica();
      },
      error: (e: { status?: number }) => {
        this.invio.set(false);
        this.conflitto.set(e.status === 409);
        this.errore.set(messaggioErrore(e));
      },
    });
  }

  /** Dopo un salvataggio o un invio: giornate del periodo e contatore; le righe proposte ancora vuote restano. */
  private ricarica() {
    const proposte = this.righe().filter((r) => r.proposta && this.totaleRiga(r) === 0);
    this.api.consuntivi(this.giorni()[0], this.giorni()[this.giorni().length - 1]).subscribe((g) => {
      this.costruisci(g);
      this.righe.update((rr) => [...rr, ...proposte.filter((p) => !rr.some((r) => r.chiave === p.chiave))]);
    });
    this.api.daInviare().subscribe({ next: (d) => this.daInviare.set(d), error: () => this.daInviare.set(null) });
  }

  constructor() {
    this.route.queryParamMap.subscribe((q) => {
      this.vista.set(q.get('vista') === 'giorno' ? 'giorno' : 'settimana');
      const d = q.get('data');
      this.data.set(d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : this.oggi);
      this.carica();
    });
  }

  // ---- Caricamento ----

  protected carica() {
    const giorni = this.giorni();
    const [da, a] = [giorni[0], giorni[giorni.length - 1]];
    this.caricamento.set(true);
    this.errore.set('');
    this.conflitto.set(false);
    this.selezionata.set(null);
    forkJoin({
      giornate: this.api.consuntivi(da, a),
      voci: this.api.voci(da, a),
      tipologie: this.api.tipologie(true),
      proposte: this.api.proposte(da),
      chiusi: this.api.mesiChiusi(da, a),
    }).subscribe({
      next: ({ giornate, voci, tipologie, proposte, chiusi }) => {
        this.mesiChiusi.set(chiusi);
        this.voci.set(voci);
        this.tipologie.set(tipologie);
        this.nuova = { voce: '', tipologiaId: this.predefinita() };
        this.costruisci(giornate);
        // Proposte: subito in griglia se il periodo è vuoto, altrimenti a richiesta.
        const mancanti = proposte.righe.filter((p) => !this.righe().some((r) => r.chiave === chiaveDi(p.progettoId, p.attivitaId, p.tipologiaId)));
        if (this.righe().length === 0) {
          this.aggiungiProposte(mancanti);
          this.proposteDaAggiungere.set([]);
        } else {
          this.proposteDaAggiungere.set(mancanti);
        }
        this.caricamento.set(false);
      },
      error: (e) => {
        this.errore.set(messaggioErrore(e));
        this.caricamento.set(false);
      },
    });
    this.api.daInviare().subscribe({ next: (d) => this.daInviare.set(d), error: () => this.daInviare.set(null) });
  }

  /** Griglia dalle giornate salvate; memorizza versioni e contenuto originale per riconoscere le modifiche. */
  private costruisci(giornate: Giornata[]) {
    const righe = new Map<string, RigaGriglia>();
    this.versioni = new Map(giornate.map((g) => [g.data, g.versione]));
    for (const g of giornate) {
      for (const r of g.righe) {
        const k = chiaveDi(r.progettoId, r.attivitaId, r.tipologiaId);
        if (!righe.has(k)) righe.set(k, this.nuovaRiga(r.progettoId, r.attivitaId, r.tipologiaId, r));
        righe.get(k)!.celle[g.data] = { testo: scriviOre(r.minuti), nota: r.nota ?? '', rigaId: r._id, stato: r.stato, motivazione: r.rifiuto?.motivazione };
      }
    }
    this.righe.set([...righe.values()].sort((x, y) => x.etichetta.localeCompare(y.etichetta)));
    this.originali = new Map(this.giorni().map((g) => [g, this.serializza(g)]));
    this.modifiche.update((v) => v + 1);
  }

  private nuovaRiga(
    progettoId: string,
    attivitaId: string | null,
    tipologiaId: string,
    salvata?: { progetto: { codice: string; titolo: string } | null; attivita: { codice: string; descrizione: string } | null },
  ): RigaGriglia {
    const p = this.voci().find((v) => v._id === progettoId);
    const a = p?.attivita.find((x) => x._id === attivitaId);
    const progetto = p ?? salvata?.progetto ?? { codice: '?', titolo: '' };
    const attivita = a ?? salvata?.attivita ?? null;
    return {
      chiave: chiaveDi(progettoId, attivitaId, tipologiaId),
      progettoId,
      attivitaId,
      tipologiaId,
      etichetta: attivitaId && attivita ? `${progetto.codice} › ${attivita.codice}` : progetto.codice,
      dettaglio: attivitaId && attivita ? attivita.descrizione : progetto.titolo,
      nonAssegnata: !!attivitaId && !!a && !a.assegnata,
      celle: {},
    };
  }

  // ---- Celle ----

  protected cella(r: RigaGriglia, g: string): Cella {
    return (r.celle[g] ??= { testo: '', nota: '' });
  }

  protected modificabile(r: RigaGriglia, g: string) {
    const c = r.celle[g];
    return g <= this.oggi && !this.meseChiuso(g) && (!c?.stato || MODIFICABILI.includes(c.stato));
  }

  private minuti(c?: Cella) {
    const e = leggiOre(c?.testo);
    return 'minuti' in e ? e.minuti : 0;
  }

  protected erroreCella(r: RigaGriglia, g: string) {
    const e = leggiOre(r.celle[g]?.testo);
    return 'errore' in e ? e.errore : '';
  }

  protected totaleRiga(r: RigaGriglia) {
    this.modifiche();
    return this.giorni().reduce((s, g) => s + this.minuti(r.celle[g]), 0);
  }

  protected cambiata() {
    this.messaggio.set('');
    this.modifiche.update((v) => v + 1);
  }

  /** All'uscita dalla cella le ore valide si riscrivono come h:mm. */
  protected normalizza(c: Cella) {
    const e = leggiOre(c.testo);
    if ('minuti' in e) c.testo = scriviOre(e.minuti);
    this.cambiata();
  }

  protected seleziona(riga: RigaGriglia, giorno: string) {
    this.selezionata.set({ riga, giorno });
  }

  // ---- Righe ----

  protected readonly vociScelta = computed(() =>
    this.voci().map((p) => ({
      progetto: p,
      opzioni: [
        ...(p.soloSuAttivita ? [] : [{ valore: `${p._id}|-`, testo: `${p.codice} — ${p.titolo} (sul progetto)`, attivita: null as VoceAttivita | null }]),
        ...p.attivita.map((a) => ({
          valore: `${p._id}|${a._id}`,
          testo: `${a.assegnata ? '★ ' : ''}${p.codice} › ${a.codice} — ${a.descrizione}${a.assegnata ? '' : ' (non assegnata)'}`,
          attivita: a as VoceAttivita | null,
        })),
      ],
    })),
  );

  protected avvisoNuova() {
    const [p, a] = this.nuova.voce.split('|');
    const att = this.voci().find((v) => v._id === p)?.attivita.find((x) => x._id === a);
    return att && !att.assegnata ? `Non risulti tra le risorse assegnate all'attività ${att.codice}: puoi consuntivare, ma l'approvatore lo vedrà.` : '';
  }

  protected aggiungiRiga() {
    const [progettoId, a] = this.nuova.voce.split('|');
    const attivitaId = a === '-' ? null : a;
    const tipologiaId = this.nuova.tipologiaId || this.predefinita();
    if (!progettoId || !tipologiaId) return;
    const k = chiaveDi(progettoId, attivitaId, tipologiaId);
    if (this.righe().some((r) => r.chiave === k)) {
      this.errore.set('Questa riga c\'è già: scrivi le ore lì.');
      return;
    }
    this.errore.set('');
    this.righe.update((rr) => [...rr, this.nuovaRiga(progettoId, attivitaId, tipologiaId)]);
    this.nuova = { voce: '', tipologiaId: this.predefinita() };
  }

  /** Cambio di tipologia di una riga (es. da ordinaria a straordinaria). */
  protected cambiaTipologia(r: RigaGriglia, tipologiaId: string) {
    const k = chiaveDi(r.progettoId, r.attivitaId, tipologiaId);
    if (this.righe().some((x) => x !== r && x.chiave === k)) {
      this.errore.set('Esiste già una riga con questa voce e questa tipologia: usa quella.');
      this.righe.update((rr) => [...rr]);
      return;
    }
    this.errore.set('');
    r.tipologiaId = tipologiaId;
    r.chiave = k;
    this.righe.update((rr) => [...rr]);
    this.cambiata();
  }

  protected bloccata(r: RigaGriglia) {
    return this.giorni().some((g) => !this.modificabile(r, g) && this.minuti(r.celle[g]) > 0);
  }

  /** Toglie la riga: le ore modificabili si cancellano al salvataggio. */
  protected togliRiga(r: RigaGriglia) {
    if (this.bloccata(r)) {
      for (const g of this.giorni()) if (this.modificabile(r, g)) r.celle[g] = { ...this.cella(r, g), testo: '', nota: '' };
      this.cambiata();
      return;
    }
    this.righe.update((rr) => rr.filter((x) => x !== r));
    this.cambiata();
  }

  protected nomeTipologia(id: string) {
    const t = this.tipologie().find((x) => x._id === id);
    return t ? t.descrizione : '(tipologia non più attiva)';
  }

  // ---- Proposte e copia ----

  protected aggiungiProposte(proposte = this.proposteDaAggiungere()) {
    const nuove = proposte
      .filter((p) => !this.righe().some((r) => r.chiave === chiaveDi(p.progettoId, p.attivitaId, p.tipologiaId)))
      .map((p) => ({
        ...this.nuovaRiga(p.progettoId, p.attivitaId, p.tipologiaId, { progetto: p.progetto, attivita: p.attivita }),
        proposta: p.origine,
      }));
    this.righe.update((rr) => [...rr, ...nuove]);
    this.proposteDaAggiungere.set([]);
  }

  /** Copia le ore della settimana (o del giorno) precedente nei giorni ancora vuoti e non futuri. */
  protected copiaPrecedente() {
    const passo = this.vista() === 'settimana' ? 7 : 1;
    const giorni = this.giorni();
    this.errore.set('');
    this.api.consuntivi(piuGiorni(giorni[0], -passo), piuGiorni(giorni[giorni.length - 1], -passo)).subscribe({
      next: (giornate) => {
        let copiate = 0;
        const saltati = new Set<string>();
        for (const g of giornate) {
          const destinazione = piuGiorni(g.data, passo);
          const piena = this.totaliGiorno()[destinazione] > 0;
          if (destinazione > this.oggi || piena || this.meseChiuso(destinazione)) {
            if (g.righe.length) saltati.add(etichettaGiorno(destinazione));
            continue;
          }
          for (const r of g.righe) {
            const k = chiaveDi(r.progettoId, r.attivitaId, r.tipologiaId);
            let riga = this.righe().find((x) => x.chiave === k);
            if (!riga) {
              // Voce non più consuntivabile (progetto chiuso, attività chiusa...): non si copia.
              if (!this.voci().some((v) => v._id === r.progettoId)) continue;
              riga = this.nuovaRiga(r.progettoId, r.attivitaId, r.tipologiaId, r);
              this.righe.update((rr) => [...rr, riga!]);
            }
            riga.celle[destinazione] = { ...this.cella(riga, destinazione), testo: scriviOre(r.minuti), nota: r.nota ?? '' };
            copiate++;
          }
        }
        this.cambiata();
        this.messaggio.set(
          copiate
            ? `Copiate ${copiate} righe: controlla e salva.${saltati.size ? ` Giorni non toccati perché già compilati o futuri: ${[...saltati].join(', ')}.` : ''}`
            : `Niente da copiare${saltati.size ? ': i giorni sono già compilati o futuri' : ''}.`,
        );
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  // ---- Salvataggio ----

  /** Righe di un giorno come le riceve il backend; ordinate per confrontarle con l'originale. */
  private serializza(giorno: string): string {
    return JSON.stringify(this.righeDelGiorno(giorno));
  }

  private righeDelGiorno(giorno: string): RigaDaSalvare[] {
    return this.righe()
      .map((r) => ({ r, c: r.celle[giorno], m: this.minuti(r.celle[giorno]) }))
      .filter(({ m }) => m > 0)
      .map(({ r, c, m }) => ({
        ...(c?.rigaId ? { _id: c.rigaId } : {}),
        progettoId: r.progettoId,
        attivitaId: r.attivitaId,
        tipologiaId: r.tipologiaId,
        minuti: m,
        nota: c?.nota?.trim() || null,
      }))
      .sort((x, y) => chiaveDi(x.progettoId, x.attivitaId, x.tipologiaId).localeCompare(chiaveDi(y.progettoId, y.attivitaId, y.tipologiaId)));
  }

  protected salva() {
    if (this.erroriCelle().length) {
      this.errore.set('Correggi le ore segnate in rosso prima di salvare.');
      return;
    }
    const giornate = this.giorniCambiati().map((g) => ({ data: g, versione: this.versioni.get(g) ?? 0, righe: this.righeDelGiorno(g) }));
    if (!giornate.length) return;
    this.salvataggio.set(true);
    this.errore.set('');
    this.messaggio.set('');
    this.avvisi.set([]);
    this.api.salvaGiornate(giornate).subscribe({
      next: (esito) => {
        this.salvataggio.set(false);
        this.avvisi.set(esito.avvisi);
        this.messaggio.set(`Salvato: ${giornate.length === 1 ? '1 giornata' : `${giornate.length} giornate`}. Quando le ore sono complete, inviale all'approvazione.`);
        this.ricarica();
      },
      error: (e: { status?: number }) => {
        this.salvataggio.set(false);
        this.conflitto.set(e.status === 409);
        this.errore.set(messaggioErrore(e));
      },
    });
  }

  // ---- Navigazione ----

  protected vai(cambio: { vista?: Vista; data?: string }) {
    if (this.giorniCambiati().length && !confirm('Ci sono ore non salvate: uscire senza salvarle?')) return;
    const vista = cambio.vista ?? this.vista();
    this.router.navigate([], { queryParams: { vista, data: cambio.data ?? this.data() } });
  }

  protected sposta(verso: -1 | 1) {
    this.vai({ data: piuGiorni(this.data(), verso * (this.vista() === 'settimana' ? 7 : 1)) });
  }

  // ---- Avanzamento delle mie attività ----

  protected readonly percentuali = signal<Record<string, number>>({});
  protected readonly esitoPercentuale = signal<Record<string, string>>({});

  protected percentuale(a: VoceAttivita) {
    return this.percentuali()[a._id] ?? a.percentualeCompletamento;
  }

  protected impostaPercentuale(a: VoceAttivita, v: number) {
    this.percentuali.update((p) => ({ ...p, [a._id]: v }));
  }

  protected salvaPercentuale(p: VoceProgetto, a: VoceAttivita) {
    const valore = Math.round(Number(this.percentuale(a)));
    this.comuni.completamentoAttivita(p._id, a._id, valore).subscribe({
      next: () => {
        a.percentualeCompletamento = valore;
        this.esitoPercentuale.update((x) => ({ ...x, [a._id]: 'salvata' }));
      },
      error: (e) => this.esitoPercentuale.update((x) => ({ ...x, [a._id]: messaggioErrore(e) })),
    });
  }
}
