/**
 * Test di integrazione della fase 4 (Report) contro un MongoDB vero (replica set).
 * E0: migrazione 009 (evm_giornalieri, esecuzioni_batch), aggregazioni nelle due viste, permesso vedereReport.
 * E1: elenco dei progetti e scheda costi (totali, dettagli, ruolo alla data, viste, riservatezza degli euro).
 * E2: indicatori EVM del progetto e delle attività alla data (percentuale dallo storico, viste, TL senza euro).
 * E4: report dei costi annidato (livelli, ruolo alla data, filtri, visibilità ed euro).
 * E5: pianificato contro consuntivato (giorni lavorativi, ingresso, progetti non allocati, visibilità).
 * E3: procedura dell'andamento (ripresa dall'ultimo giorno, blocco, esecuzione scaduta), serie giornaliera, registro.
 *
 * Si esegue solo se è impostata MONGODB_URI_TEST, es.:
 *   MONGODB_URI_TEST="mongodb://localhost:27017/?directConnection=true" npm test
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';
import request from 'supertest';
import { cifraPassword } from '../src/auth/password.js';
import { AndamentoService } from '../src/consuntivazione/report/andamento.service.js';
import { ReportService } from '../src/consuntivazione/report/report.service.js';

const URI_BASE = process.env.MONGODB_URI_TEST;
const NOME_DB = `toolpm_test_${Date.now()}_rep`;
const CARTELLA = join(import.meta.dirname, '../scripts/migrazioni');
const CONTESTO = () => ({ utente: 'sistema:test', ora: new Date() });

describe.skipIf(!URI_BASE)('Report (fase 4) con MongoDB vero', () => {
  let app: INestApplication;
  let client: mongoose.mongo.MongoClient;
  let db: mongoose.mongo.Db;
  const cookie: Record<string, string> = {};
  const risorsa: Record<string, mongoose.Types.ObjectId> = {};

  const PERSONE = [
    { nome: 'paola', abilitazione: 'PM', ruoli: ['risorsa'] },
    { nome: 'rita', abilitazione: null, ruoli: ['risorsa'] },
    { nome: 'carlo', abilitazione: null, ruoli: ['risorsa', 'controller'] },
    { nome: 'tito', abilitazione: 'TL', ruoli: ['risorsa'] },
    { nome: 'piero', abilitazione: 'PM', ruoli: ['risorsa'] },
  ];
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    const url = new URL(URI_BASE!);
    url.pathname = `/${NOME_DB}`;
    process.env.MONGODB_URI = url.toString();
    process.env.JWT_SECRET = 'segreto-dei-test';
    delete process.env.ADMIN_EMAIL;
    client = await mongoose.mongo.MongoClient.connect(process.env.MONGODB_URI);
    db = client.db(NOME_DB);
    for (const f of readdirSync(CARTELLA).filter((n) => /^\d{3}-.+\.mjs$/.test(n)).sort()) {
      await (await import(pathToFileURL(join(CARTELLA, f)).href)).esegui(db, CONTESTO());
    }
    const hash = await cifraPassword('password-di-prova');
    for (const p of PERSONE) {
      risorsa[p.nome] = (await db.collection('risorse').insertOne({ cognome: p.nome, nome: p.nome, email: `${p.nome}@prova.it` })).insertedId;
      await db.collection('utenti').insertOne({
        email: `${p.nome}@prova.it`,
        passwordHash: hash,
        abilitazione: p.abilitazione,
        ruoli: p.ruoli,
        attivo: true,
        deveCambiarePassword: false,
        risorsaId: risorsa[p.nome],
      });
    }
    const { AppModule } = await import('../src/app.module.js');
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    for (const p of PERSONE) {
      const r = await api().post('/api/auth/login').send({ email: `${p.nome}@prova.it`, password: 'password-di-prova' });
      cookie[p.nome] = String(r.headers['set-cookie']).split(';')[0];
    }
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.dropDatabase();
    await client?.close();
  });

  describe('E0 — migrazione 009-report', () => {
    it('crea evm_giornalieri ed esecuzioni_batch con i validatori e gli indici', async () => {
      const nomi = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
      expect(nomi).toEqual(expect.arrayContaining(['evm_giornalieri', 'esecuzioni_batch']));
      const progettoId = new mongoose.Types.ObjectId();
      await db.collection('evm_giornalieri').insertOne({ progettoId, data: new Date('2026-11-01'), approvata: {}, provvisoria: null });
      await expect(db.collection('evm_giornalieri').insertOne({ progettoId, data: new Date('2026-11-01'), approvata: {}, provvisoria: {} })).rejects.toThrow(/duplicate key/);
      await expect(db.collection('evm_giornalieri').insertOne({ progettoId, data: new Date('2026-11-02') })).rejects.toThrow(/validation/);
      await expect(db.collection('esecuzioni_batch').insertOne({ procedura: 'evm', inizio: new Date(), stato: 'boh' })).rejects.toThrow(/validation/);
      await db.collection('evm_giornalieri').deleteMany({});
      const indici = (await db.collection('consuntivi').indexes()).map((i) => JSON.stringify(i.key));
      expect(indici).toContain(JSON.stringify({ 'righe.stato': 1, data: 1 }));
    });

    it('si può rieseguire', async () => {
      const m = await import(pathToFileURL(join(CARTELLA, '009-report.mjs')).href);
      expect((await m.esegui(db, CONTESTO())).validatori).toEqual(['evm_giornalieri', 'esecuzioni_batch']);
    });
  });

  describe('E0 — aggregazioni nelle due viste', () => {
    const pa = new mongoose.Types.ObjectId();
    const pb = new mongoose.Types.ObjectId();
    const svi = new mongoose.Types.ObjectId();
    const cdc = new mongoose.Types.ObjectId();
    const tip = new mongoose.Types.ObjectId();
    const riga = (progettoId: mongoose.Types.ObjectId, stato: string, minuti: number, costoCentesimi: number | null, attivitaId: mongoose.Types.ObjectId | null = null) => ({
      _id: new mongoose.Types.ObjectId(),
      progettoId,
      attivitaId,
      centroCostoId: cdc,
      tipologiaId: tip,
      tipologiaCodice: 'ORDINARIA',
      minuti,
      nota: null,
      stato,
      fonteTariffa: costoCentesimi === null ? null : 'standard',
      tariffaId: null,
      tariffaCentesimiOra: costoCentesimi === null ? null : 3000,
      costoCentesimi,
      approvazioneTL: null,
      approvazionePM: null,
      modificatoIl: new Date(),
      modificatoDa: 'sistema:test',
    });

    beforeAll(async () => {
      await db.collection('consuntivi').insertMany([
        {
          risorsaId: risorsa.rita,
          data: new Date('2026-10-05'),
          mese: '202610',
          versione: 1,
          righe: [riga(pa, 'approvata', 480, 24000, svi), riga(pb, 'inviata', 120, 6000)],
        },
        {
          risorsaId: risorsa.rita,
          data: new Date('2026-10-06'),
          mese: '202610',
          versione: 1,
          righe: [riga(pa, 'chiusa', 240, 12000), riga(pa, 'respinta', 60, 3000, svi), riga(pa, 'approvata', 120, null, svi)],
        },
        {
          risorsaId: risorsa.tito,
          data: new Date('2026-11-02'),
          mese: '202611',
          versione: 1,
          righe: [riga(pa, 'bozza', 480, 24000, svi), riga(pb, 'approvataTL', 60, 3000)],
        },
      ]);
    });

    it('vista approvata: solo approvate e chiuse; da valorizzare a parte', async () => {
      const report = app.get(ReportService);
      const [tot] = await report.totali({}, 'approvata');
      expect(tot).toMatchObject({ righe: 3, minuti: 840, costoCentesimi: 36000, daValorizzare: 1, minutiDaValorizzare: 120 });
      const perAttivita = await report.totali({ progettoIds: [pa] }, 'approvata', ['progettoId', 'attivitaId']);
      const conSvi = perAttivita.find((g) => String(g.chiave.attivitaId) === String(svi))!;
      const senza = perAttivita.find((g) => g.chiave.attivitaId === null)!;
      expect(conSvi).toMatchObject({ minuti: 600, costoCentesimi: 24000 });
      expect(senza).toMatchObject({ minuti: 240, costoCentesimi: 12000 });
    });

    it('vista provvisoria: anche bozza, inviate e via libera, mai le respinte', async () => {
      const report = app.get(ReportService);
      const [tot] = await report.totali({}, 'provvisoria');
      expect(tot).toMatchObject({ righe: 6, minuti: 1500, costoCentesimi: 69000 });
      const perMese = await report.totali({ da: new Date('2026-11-01'), a: new Date('2026-11-30') }, 'provvisoria', ['mese']);
      expect(perMese).toEqual([expect.objectContaining({ chiave: { mese: '202611' }, minuti: 540 })]);
    });

    it('righe in attesa per progetto: numero e minuti', async () => {
      const report = app.get(ReportService);
      const attese = await report.inAttesa({}, ['progettoId']);
      expect(attese.find((g) => String(g.chiave.progettoId) === String(pa))).toMatchObject({ righe: 2, minuti: 540 });
      expect(attese.find((g) => String(g.chiave.progettoId) === String(pb))).toMatchObject({ righe: 2, minuti: 180 });
      expect(await report.oreGiorno()).toBe(8);
    });
  });

  describe('E0 — permessi', () => {
    it('vedereReport a TL, PM, PMSenior e controller; non alla risorsa', async () => {
      const permessi = async (chi: string) => (await api().get('/api/auth/me').set('Cookie', cookie[chi])).body.permessi as Record<string, boolean>;
      expect((await permessi('paola')).vedereReport).toBe(true);
      expect((await permessi('tito')).vedereReport).toBe(true);
      expect((await permessi('carlo')).vedereReport).toBe(true);
      expect((await permessi('rita')).vedereReport).toBe(false);
    });
  });

  describe('E1 — elenco dei progetti e scheda costi', () => {
    const REP = '/api/consuntivazione/report/progetti';
    const come = (chi: string, url: string) => api().get(url).set('Cookie', cookie[chi]);
    const px = new mongoose.Types.ObjectId();
    const py = new mongoose.Types.ObjectId();
    const pe = new mongoose.Types.ObjectId(); // progetto degli indicatori EVM (E2, E3)
    const ana = new mongoose.Types.ObjectId();
    const col = new mongoose.Types.ObjectId();
    const ord = new mongoose.Types.ObjectId();
    const str = new mongoose.Types.ObjectId();
    const cdc = new mongoose.Types.ObjectId();
    const junior = new mongoose.Types.ObjectId();
    const senior = new mongoose.Types.ObjectId();
    let n = 0;
    const riga = (progettoId: mongoose.Types.ObjectId, attivitaId: mongoose.Types.ObjectId | null, tipologiaId: mongoose.Types.ObjectId, stato: string, minuti: number, costoCentesimi: number | null) => ({
      _id: new mongoose.Types.ObjectId(),
      progettoId,
      attivitaId,
      centroCostoId: cdc,
      tipologiaId,
      tipologiaCodice: String(++n),
      minuti,
      nota: null,
      stato,
      fonteTariffa: null,
      tariffaId: null,
      tariffaCentesimiOra: null,
      costoCentesimi,
      approvazioneTL: null,
      approvazionePM: null,
      modificatoIl: new Date(),
      modificatoDa: 'sistema:test',
    });
    const giornata = (chi: string, data: string, righe: object[]) => ({ risorsaId: risorsa[chi], data: new Date(data), mese: data.slice(0, 7).replace('-', ''), versione: 1, righe });

    beforeAll(async () => {
      await db.collection('centri_costo').insertOne({ _id: cdc, codice: 'CDC-SVI', descrizione: 'Sviluppo', attivo: true });
      await db.collection('ruoli').insertMany([
        { _id: junior, codice: 'SVJ', descrizione: 'Sviluppatore junior', attivo: true },
        { _id: senior, codice: 'SVS', descrizione: 'Sviluppatore senior', attivo: true },
      ]);
      await db.collection('tipologie_costo').insertMany([
        { _id: ord, codice: 'ORD-X', descrizione: 'Ordinaria X', categoria: 'ordinaria', ordine: 1, attiva: true, predefinita: false },
        { _id: str, codice: 'STR-X', descrizione: 'Straordinaria X', categoria: 'straordinaria', ordine: 2, attiva: true, predefinita: false },
      ]);
      // rita: junior fino al 14 settembre, senior dal 15.
      await db.collection('risorse').updateOne({ _id: risorsa.rita }, { $set: { storicoRuoli: [{ ruoloId: junior, dal: new Date('2026-01-01') }, { ruoloId: senior, dal: new Date('2026-09-15') }] } });
      await db.collection('progetti').insertMany([
        {
          _id: px,
          codice: 'PX',
          titolo: 'Portale X',
          centroCostoId: cdc,
          stato: 'inCorso',
          dataInizio: new Date('2026-01-01'),
          approvatori: [{ risorsaId: risorsa.paola, profilo: 'PM' }, { risorsaId: risorsa.tito, profilo: 'TL' }],
          percentualeCompletamento: 30,
          soloSuAttivita: false,
          stime: { managerialeGiorni: 100, managerialeCentesimi: 4_000_000, definitivaGiorni: 120, definitivaCentesimi: 4_800_000 },
        },
        { _id: py, codice: 'PY', titolo: 'Interno Y', centroCostoId: cdc, stato: 'inValutazione', approvatori: [], percentualeCompletamento: 0, soloSuAttivita: false, stime: {} },
      ]);
      await db.collection('attivita').insertMany([
        { _id: ana, progettoId: px, codice: 'ANA', descrizione: 'Analisi', stato: 'attiva', stimaGiorni: 10, percentualeCompletamento: 100, risorseAssegnateIds: [] },
        { _id: col, progettoId: px, codice: 'COL', descrizione: 'Collaudo', stato: 'attiva', stimaGiorni: 30, percentualeCompletamento: 0, risorseAssegnateIds: [] },
      ]);
      await db.collection('consuntivi').insertMany([
        giornata('rita', '2025-12-15', [riga(px, ana, ord, 'chiusa', 480, 20000)]),
        giornata('rita', '2026-09-10', [riga(px, ana, ord, 'approvata', 480, 20000), riga(px, null, str, 'approvata', 120, 6000)]),
        giornata('rita', '2026-09-16', [riga(px, col, ord, 'approvata', 480, 24000), riga(px, col, ord, 'inviata', 60, 3000)]),
        giornata('tito', '2026-09-16', [riga(px, col, ord, 'approvata', 240, null), riga(px, null, ord, 'bozza', 120, 5000)]),
        giornata('rita', '2026-09-17', [riga(py, null, ord, 'approvata', 480, 24000)]),
      ]);
    });

    it('elenco: progetti propri per PM e TL, tutti per il controller; euro solo a chi li vede', async () => {
      expect((await come('rita', REP)).status).toBe(403);
      const perPaola = (await come('paola', REP)).body;
      expect(perPaola.vista).toBe('approvata');
      const x = perPaola.progetti.find((p: { codice: string }) => p.codice === 'PX');
      expect(perPaola.progetti.some((p: { codice: string }) => p.codice === 'PY')).toBe(false);
      expect(x).toMatchObject({ vedeEuro: true, centroCosto: 'CDC-SVI', stime: { definitivaGiorni: 120, definitivaCentesimi: 4_800_000 } });
      expect(x.consuntivato).toMatchObject({ minuti: 1800, giorni: 3.75, costoCentesimi: 70000, daValorizzare: 1 });
      expect(x.inAttesa).toMatchObject({ righe: 2, minuti: 180 });
      const perTito = (await come('tito', REP)).body.progetti.find((p: { codice: string }) => p.codice === 'PX');
      expect(perTito.vedeEuro).toBe(false);
      expect(JSON.stringify(perTito)).not.toMatch(/Centesimi/);
      const perCarlo = (await come('carlo', `${REP}?stato=inValutazione`)).body.progetti;
      expect(perCarlo.map((p: { codice: string }) => p.codice)).toEqual(['PY']);
      expect((await come('carlo', `${REP}?testo=portale`)).body.progetti.map((p: { codice: string }) => p.codice)).toEqual(['PX']);
    });

    it('scheda: dall\'inizio e nel periodo, per attività (con Senza attività), risorsa, ruolo alla data, tipologia, mese', async () => {
      const r = await come('paola', `${REP}/${px.toHexString()}?da=2026-09-01&a=2026-09-30`);
      expect(r.status).toBe(200);
      const s = r.body;
      expect(s.progetto).toMatchObject({ codice: 'PX', percentualeCompletamento: 30, percentualeAttivitaPesata: 25 });
      expect(s.dallInizio).toMatchObject({ minuti: 1800, costoCentesimi: 70000 });
      expect(s.nelPeriodo).toMatchObject({ minuti: 1320, costoCentesimi: 50000, daValorizzare: 1, minutiDaValorizzare: 240 });
      expect(s.inAttesa.nelPeriodo).toMatchObject({ righe: 2, minuti: 180 });
      const att = Object.fromEntries(s.perAttivita.map((a: { codice: string }) => [a.codice || 'senza', a]));
      expect(att.ANA).toMatchObject({ stimaGiorni: 10, dallInizio: { minuti: 960 }, nelPeriodo: { minuti: 480 } });
      expect(att.COL.nelPeriodo.minuti).toBe(720);
      expect(att.senza).toMatchObject({ descrizione: 'Senza attività', nelPeriodo: { minuti: 120 } });
      expect(s.perRisorsa.map((x: { risorsa: string; minuti: number }) => [x.risorsa, x.minuti])).toEqual([['rita rita', 1080], ['tito tito', 240]]);
      const ruoli = Object.fromEntries(s.perRuolo.map((x: { ruolo: string; minuti: number }) => [x.ruolo, x.minuti]));
      expect(ruoli).toEqual({ 'Sviluppatore junior': 600, 'Sviluppatore senior': 480, 'Senza ruolo': 240 });
      expect(s.perTipologia.map((x: { tipologia: string }) => x.tipologia)).toEqual(['Ordinaria X', 'Straordinaria X']);
      expect(s.perMese).toEqual([expect.objectContaining({ mese: '202609', minuti: 1320 })]);
    });

    it('vista provvisoria: anche bozza e inviate, mai le respinte', async () => {
      const s = (await come('paola', `${REP}/${px.toHexString()}?da=2026-09-01&a=2026-09-30&vista=provvisoria`)).body;
      expect(s.vista).toBe('provvisoria');
      expect(s.nelPeriodo.minuti).toBe(1500);
    });

    it('TL senza euro, PM non approvatore e risorse escluse, progetto inesistente', async () => {
      const s = (await come('tito', `${REP}/${px.toHexString()}`)).body;
      expect(s.vedeEuro).toBe(false);
      expect(JSON.stringify(s)).not.toMatch(/Centesimi/);
      expect(s.stime).toEqual({ managerialeGiorni: 100, definitivaGiorni: 120 });
      expect((await come('piero', `${REP}/${px.toHexString()}`)).status).toBe(403);
      expect((await come('rita', `${REP}/${px.toHexString()}`)).status).toBe(403);
      expect((await come('carlo', `${REP}/${px.toHexString()}`)).body.vedeEuro).toBe(true);
      expect((await come('carlo', `${REP}/${new mongoose.Types.ObjectId().toHexString()}`)).status).toBe(404);
      expect((await come('paola', `${REP}/${px.toHexString()}?da=2026-10-01&a=2026-09-01`)).status).toBe(400);
    });
      describe('E2 — indicatori EVM', () => {
      const a1 = new mongoose.Types.ObjectId();
      const a2 = new mongoose.Types.ObjectId();
      const EVM = () => `${REP}/${pe.toHexString()}/evm`;

      beforeAll(async () => {
        await db.collection('progetti').insertOne({
          _id: pe,
          codice: 'PE',
          titolo: 'Progetto EVM',
          centroCostoId: cdc,
          stato: 'inCorso',
          dataInizio: new Date('2026-01-01'),
          dataFine: new Date('2026-12-31'),
          approvatori: [{ risorsaId: risorsa.paola, profilo: 'PM' }, { risorsaId: risorsa.tito, profilo: 'TL' }],
          percentualeCompletamento: 40,
          soloSuAttivita: false,
          stime: { managerialeGiorni: 8, definitivaGiorni: 10, definitivaCentesimi: 400_000 },
        });
        await db.collection('attivita').insertMany([
          { _id: a1, progettoId: pe, codice: 'A1', descrizione: 'Con date', stato: 'attiva', stimaGiorni: 4, percentualeCompletamento: 50, dataInizio: new Date('2026-01-01'), dataFine: new Date('2026-06-30'), risorseAssegnateIds: [] },
          { _id: a2, progettoId: pe, codice: 'A2', descrizione: 'Senza date', stato: 'attiva', stimaGiorni: 6, percentualeCompletamento: 0, risorseAssegnateIds: [] },
        ]);
        const cambio = (attivitaId: mongoose.Types.ObjectId | undefined, il: string, prima: number, dopo: number) => ({
          progettoId: pe,
          ...(attivitaId ? { attivitaId } : {}),
          valorePrecedente: prima,
          valoreNuovo: dopo,
          il: new Date(il),
          da: 'sistema:test',
        });
        await db.collection('avanzamenti').insertMany([
          cambio(undefined, '2026-03-01T10:00:00Z', 0, 20),
          cambio(undefined, '2026-08-01T10:00:00Z', 20, 40),
          cambio(a1, '2026-05-01T10:00:00Z', 0, 50),
        ]);
        await db.collection('consuntivi').insertMany([
          ...['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-12'].map((g) => giornata('rita', g, [riga(pe, a1, ord, 'approvata', 480, 40_000)])),
          giornata('rita', '2026-06-11', [riga(pe, a1, ord, 'inviata', 240, 20_000)]),
          giornata('rita', '2026-08-05', [riga(pe, a1, ord, 'approvata', 480, 40_000)]),
        ]);
      });

      it('progetto alla data: percentuale dallo storico, AC fino alla data, stati', async () => {
        const r = await come('paola', `${EVM()}?al=2026-07-02`);
        expect(r.status).toBe(200);
        const e = r.body.evm;
        expect(e).toMatchObject({ calcolabile: true, percentuale: 20, trascorso: 50, fonteBacEuro: 'definitiva', fonteBacGiorni: 'definitiva' });
        expect(e.euro).toMatchObject({ bac: 400_000, pv: 200_000, ev: 80_000, ac: 160_000, spi: 0.4, cpi: 0.5, eac: 800_000, vac: -400_000 });
        expect(e.giorni).toMatchObject({ bac: 10, pv: 5, ev: 2, ac: 4, eac: 20 });
        expect(e).toMatchObject({ statoTempi: 'inForteRitardo', statoCosti: 'fortementeSopraBudget' });
        const att = Object.fromEntries(r.body.attivita.map((a: { codice: string }) => [a.codice, a]));
        expect(att.A1).toMatchObject({ percentuale: 50, giorni: { ev: 2, ac: 4, cpi: 0.5, spi: 0.5 }, statoTempi: 'inForteRitardo' });
        expect(att.A2).toMatchObject({ percentuale: 0, giorni: { ev: 0, ac: 0, cpi: null, spi: null }, statoTempi: 'nonCalcolabile', statoCosti: 'nonCalcolabile' });
      });

      it('vista provvisoria, TL senza euro, In valutazione, data futura, permessi', async () => {
        expect((await come('paola', `${EVM()}?al=2026-07-02&vista=provvisoria`)).body.evm.giorni.ac).toBe(4.5);
        const t = (await come('tito', `${EVM()}?al=2026-07-02`)).body;
        expect(t.vedeEuro).toBe(false);
        expect(t.evm).not.toHaveProperty('euro');
        expect(JSON.stringify(t)).not.toMatch(/Centesimi/);
        expect(t.evm).toMatchObject({ statoTempi: 'inForteRitardo', giorni: { cpi: 0.5 } });
        const y = (await come('carlo', `${REP}/${py.toHexString()}/evm`)).body;
        expect(y.evm).toMatchObject({ calcolabile: false, motivo: 'inValutazione' });
        expect(y.attivita).toEqual([]);
        expect((await come('paola', `${EVM()}?al=2999-01-01`)).status).toBe(400);
        expect((await come('piero', EVM())).status).toBe(403);
        expect((await come('carlo', `${REP}/${new mongoose.Types.ObjectId().toHexString()}/evm`)).status).toBe(404);
      });

      it('elenco: stati di tempi e costi a oggi', async () => {
        const lista = (await come('paola', REP)).body.progetti;
        const e = lista.find((p: { codice: string }) => p.codice === 'PE').evm;
        expect(e.calcolabile).toBe(true);
        expect(e.cpi).toBe(0.8);
        expect(['inAnticipo', 'inLinea', 'inRitardo', 'inForteRitardo']).toContain(e.statoTempi);
        expect(lista.find((p: { codice: string }) => p.codice === 'PX').evm).toMatchObject({ calcolabile: true, statoTempi: 'nonCalcolabile' });
      });
    });
    describe('E4 — report dei costi', () => {
      const COSTI = '/api/consuntivazione/report/costi';
      const SET = 'da=2026-09-01&a=2026-09-30';
      type NodoT = { etichetta: string; minuti: number; figli: NodoT[]; costoCentesimi?: number; progettoId?: string };
      const piatto = (ns: NodoT[]) => ns.map((n) => [n.etichetta, n.minuti]);

      it('centro di costo › progetto › attività: totali di ogni livello, senza attività in fondo, in attesa a parte', async () => {
        const r = await come('carlo', `${COSTI}?${SET}&raggruppa=cdc,progetto,attivita`);
        expect(r.status).toBe(200);
        const b = r.body;
        expect(b).toMatchObject({ livelli: ['cdc', 'progetto', 'attivita'], vedeEuro: true });
        expect(b.totali).toMatchObject({ minuti: 1800, costoCentesimi: 74000, daValorizzare: 1, giorni: 3.75 });
        expect(b.inAttesa).toMatchObject({ righe: 2, minuti: 180 });
        expect(piatto(b.righe)).toEqual([['CDC-SVI — Sviluppo', 1800]]);
        const [nx, ny] = b.righe[0].figli as NodoT[];
        expect([nx.etichetta, nx.minuti, nx.costoCentesimi, ny.etichetta, ny.minuti]).toEqual(['PX — Portale X', 1320, 50000, 'PY — Interno Y', 480]);
        expect(nx.progettoId).toBe(px.toHexString());
        expect(piatto(nx.figli)).toEqual([['ANA — Analisi', 480], ['COL — Collaudo', 720], ['Senza attività (ore sul progetto)', 120]]);
        expect(b.opzioni.progetti.map((p: { etichetta: string }) => p.etichetta)).toContain('PY — Interno Y');
      });

      it('livelli in altro ordine, ruolo alla data, filtri', async () => {
        const att = (await come('carlo', `${COSTI}?${SET}&raggruppa=attivita&progetto=${px.toHexString()}`)).body;
        expect(piatto(att.righe)).toEqual([['PX › ANA — Analisi', 480], ['PX › COL — Collaudo', 720], ['PX › senza attività', 120]]);
        const ruoli = (await come('carlo', `${COSTI}?${SET}&raggruppa=ruolo,risorsa&progetto=${px.toHexString()}`)).body;
        expect(piatto(ruoli.righe)).toEqual([['Sviluppatore junior', 600], ['Sviluppatore senior', 480], ['Senza ruolo', 240]]);
        expect(piatto(ruoli.righe[0].figli)).toEqual([['rita rita', 600]]);
        const mesi = (await come('carlo', `${COSTI}?da=2026-06-01&a=2026-09-30&raggruppa=mese,tipologia`)).body;
        expect(piatto(mesi.righe)).toEqual([['Giugno 2026', 1920], ['Agosto 2026', 480], ['Settembre 2026', 1800]]);
        expect(piatto(mesi.righe[2].figli)).toEqual([['Ordinaria X', 1680], ['Straordinaria X', 120]]);
        expect((await come('carlo', `${COSTI}?${SET}&progetto=${py.toHexString()}`)).body.totali.minuti).toBe(480);
        expect((await come('carlo', `${COSTI}?${SET}&centroCosto=${new mongoose.Types.ObjectId().toHexString()}`)).body).toMatchObject({ righe: [], totali: { minuti: 0 } });
        expect((await come('carlo', `${COSTI}?${SET}&raggruppa=progetto,cliente`)).status).toBe(400);
        expect((await come('carlo', `${COSTI}?da=2026-09-30&a=2026-09-01`)).status).toBe(400);
      });

      it('visibilità: PM i propri progetti con gli euro, TL senza euro, altri nulla', async () => {
        const pm = (await come('paola', `${COSTI}?${SET}&raggruppa=progetto`)).body;
        expect(pm.vedeEuro).toBe(true);
        expect(piatto(pm.righe)).toEqual([['PX — Portale X', 1320]]);
        expect(pm.opzioni.progetti.map((p: { etichetta: string }) => p.etichetta)).toEqual(['PE — Progetto EVM', 'PX — Portale X']);
        const tl = (await come('tito', `${COSTI}?${SET}&raggruppa=progetto`)).body;
        expect(tl.vedeEuro).toBe(false);
        expect(JSON.stringify(tl)).not.toMatch(/Centesimi/);
        expect(tl.totali.minuti).toBe(1320);
        expect((await come('piero', COSTI)).body).toMatchObject({ righe: [], vedeEuro: false });
        expect((await come('rita', COSTI)).status).toBe(403);
        // Predefinito: il mese corrente.
        expect((await come('carlo', COSTI)).body.periodo.da).toMatch(/-01T00:00:00/);
      });

      it('elenco dei progetti: filtri per centro di costo e cliente, con i valori possibili', async () => {
        const e = (await come('carlo', `${REP}?centroCosto=${cdc.toHexString()}`)).body;
        expect(e.progetti.map((p: { codice: string }) => p.codice)).toEqual(['PE', 'PX', 'PY']);
        expect(e.opzioni.centriCosto).toEqual([{ _id: cdc.toHexString(), etichetta: 'CDC-SVI — Sviluppo' }]);
        expect((await come('carlo', `${REP}?cliente=${new mongoose.Types.ObjectId().toHexString()}`)).body.progetti).toEqual([]);
      });
    });

    describe('E5 — pianificato e consuntivato', () => {
      const PIAN = '/api/consuntivazione/report/pianificato';
      type Voce = { progetto: string; pianificati: number; consuntivati: number; inAttesa: number; nonAllocato: boolean; percentuale: number | null; scostamento: { minuti: number; percentuale: number | null } };
      type RisorsaT = { risorsa: string; pianificati: number; mesi: { mese: string; giorniLavorativi: number; pianificati: number; progetti: Voce[] }[] };
      const di = (b: { risorse: RisorsaT[] }, nome: string) => b.risorse.find((r) => r.risorsa === nome)!;

      beforeAll(async () => {
        // Settembre 2026: 22 giorni lavorativi. rita 50% su PX e 25% su PY; tito 100% su PE dal suo ingresso (16/09: 11 giorni).
        await db.collection('risorse').updateOne({ _id: risorsa.rita }, { $set: { planned: [{ mese: '202609', progettoId: px, percentualeAllocazione: 50 }, { mese: '202609', progettoId: py, percentualeAllocazione: 25 }, { mese: '202610', progettoId: px }] } });
        await db.collection('risorse').updateOne({ _id: risorsa.tito }, { $set: { dataIngresso: new Date('2026-09-16'), oreContrattualiGiorno: 8, planned: [{ mese: '202609', progettoId: pe, percentualeAllocazione: 100 }] } });
      });

      it('per risorsa e mese: pianificato, approvato, in attesa, scostamento; ore su progetti non allocati', async () => {
        const r = await come('carlo', `${PIAN}?da=202609`);
        expect(r.status).toBe(200);
        const b = r.body;
        expect(b.mesi).toEqual(['202609']);
        expect(JSON.stringify(b)).not.toMatch(/Centesimi/);
        const rita = di(b, 'rita rita');
        expect(rita.mesi[0].giorniLavorativi).toBe(22);
        expect(rita.mesi[0].progetti).toEqual([
          expect.objectContaining({ progetto: 'PX — Portale X', percentuale: 50, pianificati: 5280, consuntivati: 1080, inAttesa: 60, nonAllocato: false, scostamento: { minuti: -4200, percentuale: -80 } }),
          expect.objectContaining({ progetto: 'PY — Interno Y', percentuale: 25, pianificati: 2640, consuntivati: 480, inAttesa: 0 }),
        ]);
        expect(rita.pianificati).toBe(7920);
        const tito = di(b, 'tito tito');
        expect(tito.mesi[0].giorniLavorativi).toBe(11);
        expect(tito.mesi[0].progetti).toEqual([
          expect.objectContaining({ progetto: 'PE — Progetto EVM', pianificati: 5280, consuntivati: 0, scostamento: { minuti: -5280, percentuale: -100 } }),
          expect.objectContaining({ progetto: 'PX — Portale X', percentuale: null, pianificati: 0, consuntivati: 240, inAttesa: 120, nonAllocato: true, scostamento: { minuti: 240, percentuale: null } }),
        ]);
        expect(b.totali).toMatchObject({ pianificati: 13200, consuntivati: 1800, inAttesa: 180 });
        expect(b.opzioni.risorse.map((x: { etichetta: string }) => x.etichetta)).toEqual(['rita rita', 'tito tito']);
      });

      it('più mesi, filtri, visibilità e errori', async () => {
        const due = (await come('carlo', `${PIAN}?da=202608&a=202609&risorsa=${risorsa.rita.toHexString()}`)).body;
        expect(due.mesi).toEqual(['202608', '202609']);
        expect(due.risorse).toHaveLength(1);
        expect(due.risorse[0].mesi[0].progetti).toEqual([expect.objectContaining({ progetto: 'PE — Progetto EVM', consuntivati: 480, nonAllocato: true })]);
        const pm = (await come('paola', `${PIAN}?da=202609`)).body;
        expect(di(pm, 'rita rita').mesi[0].progetti.map((p: Voce) => p.progetto)).toEqual(['PX — Portale X']);
        expect((await come('carlo', `${PIAN}?da=202609&progetto=${py.toHexString()}`)).body.risorse.map((x: RisorsaT) => x.risorsa)).toEqual(['rita rita']);
        expect((await come('piero', `${PIAN}?da=202609`)).body.risorse).toEqual([]);
        expect((await come('rita', PIAN)).status).toBe(403);
        expect((await come('carlo', `${PIAN}?da=2026-09`)).status).toBe(400);
        expect((await come('carlo', `${PIAN}?da=202609&a=202608`)).status).toBe(400);
        expect((await come('carlo', `${PIAN}?da=202401&a=202609`)).status).toBe(400);
      });
    });

    describe('E3 — andamento nel tempo', () => {
      const d = (x: string) => new Date(`${x}T00:00:00.000Z`);
      const esegui = async (fino: string) => (await (await app.get(AndamentoService).avvia('test', { fino: d(fino) })).completamento);
      const ANDAMENTO = () => `${REP}/${pe.toHexString()}/evm/andamento`;

      it('primo avvio dalla data di inizio più vecchia, poi riparte dal giorno dopo l\'ultimo completato', async () => {
        const prima = await esegui('2026-01-10');
        expect(prima).toMatchObject({ stato: 'completata', avviataDa: 'test', giorniElaborati: 10, motivo: null });
        expect(prima.daGiorno).toEqual(d('2026-01-01'));
        expect(prima.ultimoGiornoCompletato).toEqual(d('2026-01-10'));
        expect(await db.collection('evm_giornalieri').countDocuments({ progettoId: pe })).toBe(10);
        expect(await db.collection('evm_giornalieri').countDocuments({ progettoId: py })).toBe(0);
        const doc = await db.collection('evm_giornalieri').findOne({ progettoId: pe, data: d('2026-01-05') });
        expect(doc).toMatchObject({ creatoDa: 'sistema:evm', approvata: { percentuale: 0 } });

        const seconda = await esegui('2026-07-02');
        expect(seconda.daGiorno).toEqual(d('2026-01-11'));
        expect(seconda.giorniElaborati).toBe(173);
        const g = await db.collection('evm_giornalieri').findOne({ progettoId: pe, data: d('2026-07-02') });
        expect(g!.approvata).toMatchObject({ percentuale: 20, giorni: { ac: 4, ev: 2, spi: 0.4 }, euro: { ac: 160_000 }, statoTempi: 'inForteRitardo' });
        expect(g!.provvisoria.giorni.ac).toBe(4.5);
        expect(await db.collection('evm_giornalieri').countDocuments({ progettoId: pe })).toBe(183);
        // Già aggiornato: nessun giorno da fare.
        expect(await esegui('2026-07-02')).toMatchObject({ stato: 'completata', giorniElaborati: 0 });
      });

      it('una sola esecuzione in corso: 409; oltre un\'ora si considera interrotta', async () => {
        const bloccante = await db.collection('esecuzioni_batch').insertOne({
          procedura: 'evm', inizio: new Date(), fine: null, stato: 'inCorso', avviataDa: 'altro', daGiorno: null, ultimoGiornoCompletato: null, giorniElaborati: 0, avvisi: [], motivo: null,
        });
        expect((await api().post('/api/consuntivazione/report/esecuzioni/evm').set('Cookie', cookie.carlo)).status).toBe(409);
        const s = (await come('carlo', '/api/consuntivazione/report/esecuzioni')).body;
        expect(s.ultima.stato).toBe('inCorso');
        expect(s.avviso).toContain('in corso');
        await db.collection('esecuzioni_batch').updateOne({ _id: bloccante.insertedId }, { $set: { inizio: new Date(Date.now() - 2 * 3600 * 1000) } });
        const e = await esegui('2026-07-05');
        expect(e).toMatchObject({ stato: 'completata', giorniElaborati: 3 });
        expect(e.daGiorno).toEqual(d('2026-07-03'));
        expect(await db.collection('esecuzioni_batch').findOne({ _id: bloccante.insertedId })).toMatchObject({ stato: 'interrotta', motivo: expect.stringContaining('oltre un\'ora') });
        expect((await come('paola', '/api/consuntivazione/report/esecuzioni')).status).toBe(403);
      });

      it('esegui ora dal controller: risponde subito con l\'esecuzione in corso', async () => {
        const r = await api().post('/api/consuntivazione/report/esecuzioni/evm').set('Cookie', cookie.carlo);
        expect(r.status).toBe(202);
        expect(r.body).toMatchObject({ stato: 'inCorso', avviataDa: expect.any(String) });
        // Attende la fine (fino a ieri: pochi mesi di giorni) prima dei test successivi.
        for (let i = 0; i < 200; i++) {
          const e = await db.collection('esecuzioni_batch').findOne({ _id: new mongoose.Types.ObjectId(r.body._id as string) });
          if (e!.stato !== 'inCorso') {
            expect(e!.stato).toBe('completata');
            break;
          }
          await new Promise((ok) => setTimeout(ok, 100));
        }
      }, 60_000);

      it('serie: aggiornata al, euro solo a chi li vede, vista provvisoria, permessi', async () => {
        const r = await come('paola', `${ANDAMENTO()}?da=2026-06-30&a=2026-07-02`);
        expect(r.status).toBe(200);
        expect(r.body.serie).toHaveLength(3);
        expect(r.body.serie[2]).toMatchObject({ percentuale: 20, giorni: { ac: 4, spi: 0.4 }, euro: { ac: 160_000 }, statoTempi: 'inForteRitardo' });
        expect(r.body.aggiornatoAl).toBeTruthy();
        expect(r.body.soglie).toMatchObject({ anticipo: 1.05 });
        const tl = (await come('tito', `${ANDAMENTO()}?da=2026-06-30&a=2026-07-02`)).body;
        expect(JSON.stringify(tl)).not.toMatch(/"euro"/);
        expect((await come('paola', `${ANDAMENTO()}?da=2026-07-02&a=2026-07-02&vista=provvisoria`)).body.serie[0].giorni.ac).toBe(4.5);
        expect((await come('piero', ANDAMENTO())).status).toBe(403);
        expect((await come('carlo', `${ANDAMENTO()}?da=2026-07-02&a=2026-07-01`)).status).toBe(400);
      });
    });
  });
});
