import { describe, expect, it } from 'vitest';
import { calcolaStima, chiaveContatore, type IngressoStima, numeroOfferta, sottoMargineMinimo, type TariffeRuolo } from './calcoli.js';

// Esempio "Portale ordini" dell'analisi (sezione "Stima, costo e prezzo").
const tariffe = new Map<string, TariffeRuolo>([
  ['PM', { costoCentesimiOra: 4500, venditaCentesimiGiorno: 60000 }],
  ['AN', { costoCentesimiOra: 3800, venditaCentesimiGiorno: 50000 }],
  ['SR', { costoCentesimiOra: 3500, venditaCentesimiGiorno: 48000 }],
  ['JR', { costoCentesimiOra: 2500, venditaCentesimiGiorno: 35000 }],
  ['TE', { costoCentesimiOra: 2800, venditaCentesimiGiorno: 38000 }],
]);
const portale: IngressoStima = {
  tipo: 'corpo',
  gruppi: [
    { nome: 'Analisi', voci: [{ ruoloId: 'PM', giorni: 2 }, { ruoloId: 'AN', giorni: 10 }] },
    { nome: 'Sviluppo', voci: [{ ruoloId: 'SR', giorni: 20 }, { ruoloId: 'JR', giorni: 30 }] },
    { nome: 'Collaudo', voci: [{ ruoloId: 'TE', giorni: 8 }] },
  ],
  contingenzaPercento: 10,
  scontoPercento: 5,
  prezzoACorpoCentesimi: null,
  oreGiorno: 8,
  tariffe,
};

describe('calcoli dell\'offerta: esempio "Portale ordini" dell\'analisi', () => {
  it('per ruolo: giorni con contingenza, costo e prezzo da listino', () => {
    const t = calcolaStima(portale);
    expect(t.perRuolo.map((r) => [r.ruoloId, r.giorniConContingenza, r.costoCentesimi, r.prezzoListinoCentesimi])).toEqual([
      ['PM', 2.2, 79_200, 132_000],
      ['AN', 11, 334_400, 550_000],
      ['SR', 22, 616_000, 1_056_000],
      ['JR', 33, 660_000, 1_155_000],
      ['TE', 8.8, 197_120, 334_400],
    ]);
    expect(t.perRuolo[0].costoCentesimiGiorno).toBe(36_000);
  });

  it('totali: 77 giorni, costo 18.867,20 €, listino 32.274,00 €, scontato 30.660,30 €, margine 38,5%', () => {
    const t = calcolaStima(portale);
    expect(t).toMatchObject({
      giorni: 70,
      giorniConContingenza: 77,
      costoCentesimi: 1_886_720,
      prezzoListinoCentesimi: 3_227_400,
      prezzoCalcolatoCentesimi: 3_066_030,
      prezzoCentesimi: 3_066_030,
      margineCentesimi: 1_179_310,
      marginePercento: 38.5,
      ruoliSenzaCosto: [],
      ruoliSenzaVendita: [],
    });
    expect(t.perGruppo).toEqual([
      { nome: 'Analisi', giorni: 12, giorniConContingenza: 13.2 },
      { nome: 'Sviluppo', giorni: 50, giorniConContingenza: 55 },
      { nome: 'Collaudo', giorni: 8, giorniConContingenza: 8.8 },
    ]);
  });

  it('a corpo a 30.000 €: margine 11.132,80 € (37,1%), sopra il minimo del 25%', () => {
    const t = calcolaStima({ ...portale, prezzoACorpoCentesimi: 3_000_000 });
    expect(t).toMatchObject({ prezzoCentesimi: 3_000_000, prezzoCalcolatoCentesimi: 3_066_030, margineCentesimi: 1_113_280, marginePercento: 37.1 });
    expect(sottoMargineMinimo(t, 25)).toBe(false);
    expect(sottoMargineMinimo(calcolaStima({ ...portale, prezzoACorpoCentesimi: 2_200_000 }), 25)).toBe(true);
  });
});

describe('calcoli dell\'offerta: casi particolari', () => {
  it('a consuntivo il prezzo a corpo è ignorato', () => {
    expect(calcolaStima({ ...portale, tipo: 'consuntivo', prezzoACorpoCentesimi: 1 }).prezzoCentesimi).toBe(3_066_030);
  });

  it('ruoli senza tariffa: totali non calcolabili e ruoli segnalati', () => {
    const senza = new Map(tariffe);
    senza.set('TE', { costoCentesimiOra: null, venditaCentesimiGiorno: 38000 });
    senza.delete('JR');
    const t = calcolaStima({ ...portale, tariffe: senza });
    expect(t).toMatchObject({ costoCentesimi: null, prezzoListinoCentesimi: null, prezzoCentesimi: null, margineCentesimi: null, marginePercento: null, ruoliSenzaCosto: ['JR', 'TE'], ruoliSenzaVendita: ['JR'] });
    // A corpo il prezzo deciso c'è anche senza listino, ma il margine no (manca il costo).
    expect(calcolaStima({ ...portale, tariffe: senza, prezzoACorpoCentesimi: 3_000_000 })).toMatchObject({ prezzoCentesimi: 3_000_000, margineCentesimi: null });
    expect(sottoMargineMinimo(t, 25)).toBe(false);
  });

  it('stima vuota, mezze giornate, stesso ruolo in più gruppi, nessuno sconto', () => {
    expect(calcolaStima({ ...portale, gruppi: [] })).toMatchObject({ giorni: 0, costoCentesimi: 0, prezzoCentesimi: 0, marginePercento: null });
    const t = calcolaStima({
      ...portale,
      tipo: 'pacchetto',
      contingenzaPercento: 0,
      scontoPercento: 0,
      gruppi: [
        { nome: 'A', voci: [{ ruoloId: 'SR', giorni: 0.5 }] },
        { nome: 'B', voci: [{ ruoloId: 'SR', giorni: 1.5 }] },
      ],
    });
    expect(t.perRuolo).toEqual([expect.objectContaining({ ruoloId: 'SR', giorni: 2, costoCentesimi: 56_000, prezzoListinoCentesimi: 96_000 })]);
    expect(t).toMatchObject({ prezzoCentesimi: 96_000, margineCentesimi: 40_000, marginePercento: 41.7 });
  });

  it('numero dell\'offerta e chiave del contatore', () => {
    expect(numeroOfferta(2026, 1)).toBe('OFF-2026-0001');
    expect(numeroOfferta(2026, 12345)).toBe('OFF-2026-12345');
    expect(chiaveContatore(2027)).toBe('offerte-2027');
  });
});
