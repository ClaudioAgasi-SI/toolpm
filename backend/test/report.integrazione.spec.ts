/**
 * Test di integrazione della fase 4 (Report) contro un MongoDB vero (replica set).
 * E0: migrazione 009 (evm_giornalieri, esecuzioni_batch), aggregazioni nelle due viste, permesso vedereReport.
 * E1: elenco dei progetti e scheda costi (totali, dettagli, ruolo alla data, viste, riservatezza degli euro).
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
  });
});
