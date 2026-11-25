/**
 * Dai report alle esportazioni (fase 4, blocco E6): ogni funzione trasforma la risposta di un report (già filtrata
 * per riservatezza: gli euro ci sono solo per chi li vede) in fogli Excel / CSV.
 */
import type { CostiReportService } from './costi-report.service.js';
import { type Colonna, type Esportazione, euroDaCentesimi, type Foglio, oreDecimali, type Valore } from './esporta.js';
import type { PianificatoReportService } from './pianificato-report.service.js';
import type { ProgettiReportService } from './progetti-report.service.js';

type Elenco = Awaited<ReturnType<ProgettiReportService['elenco']>>;
type Scheda = Awaited<ReturnType<ProgettiReportService['scheda']>>;
type Costi = Awaited<ReturnType<CostiReportService['costi']>>;
type Pianificato = Awaited<ReturnType<PianificatoReportService['pianificato']>>;

const giorno = (d: Date) => d.toLocaleDateString('it-IT', { timeZone: 'UTC' });
const periodo = (da: Date, a: Date) => `Periodo: dal ${giorno(da)} al ${giorno(a)}`;
const nomeMese = (m: string) => {
  const t = new Date(Date.UTC(+m.slice(0, 4), +m.slice(4) - 1, 1)).toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const STATO_PROGETTO: Record<string, string> = { inValutazione: 'In valutazione', inCorso: 'In corso', chiuso: 'Chiuso' };
const TEMPI: Record<string, string> = { inAnticipo: 'In anticipo', inLinea: 'In linea', inRitardo: 'In ritardo', inForteRitardo: 'In forte ritardo', nonCalcolabile: 'Non calcolabile' };
const COSTI: Record<string, string> = { sottoBudget: 'Sotto budget', inLinea: 'In linea', sopraBudget: 'Sopra budget', fortementeSopraBudget: 'Fortemente sopra budget', nonCalcolabile: 'Non calcolabile' };

interface Tot {
  minuti: number;
  giorni: number;
  costoCentesimi?: number;
  daValorizzare: number;
}

/** Colonne e valori comuni: ore, giorni e (per chi li vede) costo e righe da valorizzare. */
const colonneTotali = (euro: boolean): Colonna[] => [
  { titolo: 'Ore', tipo: 'ore' },
  { titolo: 'Giorni', tipo: 'giorni' },
  ...(euro ? [{ titolo: 'Costo', tipo: 'euro' as const }, { titolo: 'Righe da valorizzare', tipo: 'numero' as const }] : []),
];
const valoriTotali = (t: Tot, euro: boolean): Valore[] => [oreDecimali(t.minuti), t.giorni, ...(euro ? [euroDaCentesimi(t.costoCentesimi ?? 0), t.daValorizzare] : [])];

export function esportaElenco(e: Elenco): Esportazione {
  const euro = e.progetti.some((p) => p.vedeEuro);
  const colonne: Colonna[] = [
    { titolo: 'Codice', tipo: 'testo', larghezza: 12 },
    { titolo: 'Titolo', tipo: 'testo', larghezza: 34 },
    { titolo: 'Cliente', tipo: 'testo' },
    { titolo: 'Centro di costo', tipo: 'testo', larghezza: 14 },
    { titolo: 'Stato', tipo: 'testo', larghezza: 14 },
    { titolo: 'Completato %', tipo: 'percento' },
    { titolo: 'Tempi', tipo: 'testo', larghezza: 16 },
    { titolo: 'Costi', tipo: 'testo', larghezza: 20 },
    { titolo: 'Stima manageriale (gg)', tipo: 'giorni' },
    { titolo: 'Stima definitiva (gg)', tipo: 'giorni' },
    { titolo: 'Consuntivato (gg)', tipo: 'giorni' },
    { titolo: 'Consuntivato (ore)', tipo: 'ore' },
    { titolo: 'In attesa (ore)', tipo: 'ore' },
    ...(euro
      ? ([
          { titolo: 'Stima manageriale (€)', tipo: 'euro' },
          { titolo: 'Stima definitiva (€)', tipo: 'euro' },
          { titolo: 'Costo', tipo: 'euro' },
          { titolo: 'Righe da valorizzare', tipo: 'numero' },
        ] as Colonna[])
      : []),
  ];
  const righe = e.progetti.map((p) => {
    const s = p.stime as Record<string, number | null | undefined>;
    return [
      p.codice,
      p.titolo,
      p.cliente ?? 'Interno',
      p.centroCosto,
      STATO_PROGETTO[p.stato] ?? p.stato,
      p.percentualeCompletamento,
      p.evm.calcolabile ? TEMPI[p.evm.statoTempi] : '',
      p.evm.calcolabile ? COSTI[p.evm.statoCosti] : '',
      s.managerialeGiorni,
      s.definitivaGiorni,
      p.consuntivato.giorni,
      oreDecimali(p.consuntivato.minuti),
      oreDecimali(p.inAttesa.minuti),
      ...(euro
        ? p.vedeEuro
          ? [euroDaCentesimi(s.managerialeCentesimi), euroDaCentesimi(s.definitivaCentesimi), euroDaCentesimi((p.consuntivato as Tot).costoCentesimi ?? 0), p.consuntivato.daValorizzare]
          : [null, null, null, null]
        : []),
    ] as Valore[];
  });
  return {
    titolo: 'Progetti: costi e avanzamento',
    base: 'progetti',
    vista: e.vista,
    note: ['Consuntivato dall\'inizio di ogni progetto; tempi e costi a oggi'],
    estrattoIl: e.calcolatoIl,
    fogli: [{ nome: 'Progetti', colonne, righe }],
  };
}

export function esportaScheda(s: Scheda): Esportazione {
  const euro = s.vedeEuro;
  const st = s.stime as Record<string, number | null | undefined>;
  const riepilogo: Foglio = {
    nome: 'Riepilogo',
    colonne: [
      { titolo: 'Voce', tipo: 'testo', larghezza: 40 },
      { titolo: 'Giorni', tipo: 'giorni' },
      ...(euro ? [{ titolo: 'Euro', tipo: 'euro' as const }] : []),
    ],
    righe: [
      ['Stima manageriale', st.managerialeGiorni, ...(euro ? [euroDaCentesimi(st.managerialeCentesimi)] : [])],
      ['Stima definitiva', st.definitivaGiorni, ...(euro ? [euroDaCentesimi(st.definitivaCentesimi)] : [])],
      ['Consuntivato dall\'inizio', s.dallInizio.giorni, ...(euro ? [euroDaCentesimi((s.dallInizio as Tot).costoCentesimi ?? 0)] : [])],
      ['Consuntivato nel periodo', s.nelPeriodo.giorni, ...(euro ? [euroDaCentesimi((s.nelPeriodo as Tot).costoCentesimi ?? 0)] : [])],
      ['Ore in attesa dall\'inizio (giorni)', s.inAttesa.dallInizio.giorni, ...(euro ? [null] : [])],
      ['Completato %', s.progetto.percentualeCompletamento, ...(euro ? [null] : [])],
    ],
  };
  const perAttivita: Foglio = {
    nome: 'Attività',
    colonne: [
      { titolo: 'Attività', tipo: 'testo', larghezza: 36 },
      { titolo: 'Stima (gg)', tipo: 'giorni' },
      { titolo: 'Completato %', tipo: 'percento' },
      { titolo: 'Dall\'inizio (gg)', tipo: 'giorni' },
      ...colonneTotali(euro).map((c) => ({ ...c, titolo: `${c.titolo} nel periodo` })),
    ],
    righe: s.perAttivita.map((x) => [
      x.attivitaId ? `${x.codice} — ${x.descrizione}` : 'Senza attività (ore sul progetto)',
      x.stimaGiorni,
      x.attivitaId ? x.percentualeCompletamento : null,
      x.dallInizio.giorni,
      ...valoriTotali(x.nelPeriodo as Tot, euro),
    ]),
  };
  const dettaglio = (nome: string, titolo: string, righe: (Tot & Record<string, string | number | null | undefined>)[], campo: string): Foglio => ({
    nome,
    colonne: [{ titolo, tipo: 'testo', larghezza: 30 }, ...colonneTotali(euro)],
    righe: righe.map((r) => [campo === 'mese' ? nomeMese(String(r.mese)) : String(r[campo] ?? ''), ...valoriTotali(r, euro)]),
  });
  return {
    titolo: `Scheda del progetto ${s.progetto.codice} — ${s.progetto.titolo}`,
    base: `progetto-${s.progetto.codice.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    vista: s.vista,
    note: [periodo(s.periodo.da, s.periodo.a), `Un giorno vale ${s.oreGiorno} ore`],
    estrattoIl: s.calcolatoIl,
    fogli: [
      riepilogo,
      perAttivita,
      dettaglio('Risorse', 'Risorsa', s.perRisorsa as never, 'risorsa'),
      dettaglio('Ruoli', 'Ruolo', s.perRuolo as never, 'ruolo'),
      dettaglio('Tipologie', 'Tipologia', s.perTipologia as never, 'tipologia'),
      dettaglio('Mesi', 'Mese', s.perMese as never, 'mese'),
    ],
  };
}

const NOMI_LIVELLO: Record<string, string> = { cdc: 'Centro di costo', progetto: 'Progetto', attivita: 'Attività', risorsa: 'Risorsa', ruolo: 'Ruolo', tipologia: 'Tipologia', mese: 'Mese' };
const PLURALI: Record<string, string> = { cdc: 'Centri di costo', progetto: 'Progetti', attivita: 'Attività', risorsa: 'Risorse', ruolo: 'Ruoli', tipologia: 'Tipologie', mese: 'Mesi' };

interface NodoEsportato extends Tot {
  livello: string;
  etichetta: string;
  figli: NodoEsportato[];
}

/**
 * Report dei costi: il primo foglio (anche il CSV) ha una riga per ogni voce dell'ultimo livello con una colonna
 * per livello; poi l'albero con i totali di ogni livello (rientri e raggruppamenti di Excel) e un foglio per livello.
 */
export function esportaCosti(c: Costi): Esportazione {
  const euro = c.vedeEuro;
  const livelli = c.livelli;
  const radici = c.righe as unknown as NodoEsportato[];

  const foglie: Valore[][] = [];
  const perLivello = livelli.map(() => [] as Valore[][]);
  const albero: Valore[][] = [];
  const rientri: number[] = [];
  const visita = (ns: NodoEsportato[], percorso: string[], profondita: number) => {
    for (const n of ns) {
      const p = [...percorso, n.etichetta];
      albero.push([n.etichetta, NOMI_LIVELLO[n.livello], ...valoriTotali(n, euro)]);
      rientri.push(profondita);
      perLivello[profondita].push([...p, ...valoriTotali(n, euro)]);
      if (profondita === livelli.length - 1) foglie.push([...p, ...valoriTotali(n, euro)]);
      visita(n.figli, p, profondita + 1);
    }
  };
  visita(radici, [], 0);
  const colonneLivelli = (fino: number): Colonna[] => livelli.slice(0, fino + 1).map((l) => ({ titolo: NOMI_LIVELLO[l], tipo: 'testo' as const, larghezza: 30 }));
  const totale = (fino: number): Valore[] => ['Totale', ...Array<Valore>(fino).fill(null), ...valoriTotali(c.totali as Tot, euro)];
  return {
    titolo: 'Report dei costi',
    base: 'report-costi',
    vista: c.vista,
    note: [periodo(c.periodo.da, c.periodo.a), `Raggruppamento: ${livelli.map((l) => NOMI_LIVELLO[l]).join(' › ')}`, `Un giorno vale ${c.oreGiorno} ore`],
    estrattoIl: c.calcolatoIl,
    fogli: [
      { nome: 'Dettaglio', colonne: [...colonneLivelli(livelli.length - 1), ...colonneTotali(euro)], righe: foglie, totale: totale(livelli.length - 1) },
      { nome: 'Albero', colonne: [{ titolo: 'Voce', tipo: 'testo', larghezza: 44 }, { titolo: 'Livello', tipo: 'testo', larghezza: 16 }, ...colonneTotali(euro)], righe: albero, livelli: rientri, totale: ['Totale', null, ...valoriTotali(c.totali as Tot, euro)] },
      ...(livelli.length > 1
        ? livelli.map((l, i) => ({ nome: PLURALI[l], colonne: [...colonneLivelli(i), ...colonneTotali(euro)], righe: perLivello[i], totale: totale(i) }))
        : []),
    ],
  };
}

/** Pianificato e consuntivato: una riga per risorsa, mese e progetto; poi i totali per risorsa e mese. */
export function esportaPianificato(p: Pianificato): Esportazione {
  const colonneOre: Colonna[] = [
    { titolo: 'Ore pianificate', tipo: 'ore' },
    { titolo: 'Ore approvate', tipo: 'ore' },
    { titolo: 'Ore in attesa', tipo: 'ore' },
    { titolo: 'Scostamento (ore)', tipo: 'ore' },
    { titolo: 'Scostamento %', tipo: 'percento' },
  ];
  const ore = (o: { pianificati: number; consuntivati: number; inAttesa: number; scostamento: { minuti: number; percentuale: number | null } }): Valore[] => [
    oreDecimali(o.pianificati),
    oreDecimali(o.consuntivati),
    oreDecimali(o.inAttesa),
    oreDecimali(o.scostamento.minuti),
    o.scostamento.percentuale,
  ];
  const dettaglio: Valore[][] = [];
  const perMese: Valore[][] = [];
  for (const r of p.risorse) {
    for (const m of r.mesi) {
      if (m.progetti.length) perMese.push([r.risorsa, nomeMese(m.mese), m.giorniLavorativi, ...ore(m)]);
      for (const x of m.progetti) dettaglio.push([r.risorsa, nomeMese(m.mese), x.progetto, x.percentuale, m.giorniLavorativi, ...ore(x), x.nonAllocato ? 'sì' : '']);
    }
  }
  return {
    titolo: 'Pianificato e consuntivato',
    base: 'pianificato',
    vista: 'approvata',
    note: [
      `Periodo: da ${nomeMese(p.periodo.da)} a ${nomeMese(p.periodo.a)}`,
      'Pianificato = allocazione × giorni lavorativi (lun–ven meno le festività nazionali, entro ingresso e uscita) × ore contrattuali al giorno; ferie non tolte',
    ],
    estrattoIl: p.calcolatoIl,
    fogli: [
      {
        nome: 'Dettaglio',
        colonne: [
          { titolo: 'Risorsa', tipo: 'testo' },
          { titolo: 'Mese', tipo: 'testo', larghezza: 16 },
          { titolo: 'Progetto', tipo: 'testo', larghezza: 34 },
          { titolo: 'Allocazione %', tipo: 'percento' },
          { titolo: 'Giorni lavorativi', tipo: 'numero' },
          ...colonneOre,
          { titolo: 'Non allocata', tipo: 'testo', larghezza: 12 },
        ],
        righe: dettaglio,
      },
      {
        nome: 'Per risorsa e mese',
        colonne: [{ titolo: 'Risorsa', tipo: 'testo' }, { titolo: 'Mese', tipo: 'testo', larghezza: 16 }, { titolo: 'Giorni lavorativi', tipo: 'numero' }, ...colonneOre],
        righe: perMese,
        totale: ['Totale', null, null, ...ore(p.totali)],
      },
    ],
  };
}
