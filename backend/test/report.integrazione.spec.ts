/**
 * Test di integrazione della fase 4 (Report) contro un MongoDB vero (replica set).
 * E0: migrazione 009 (evm_giornalieri, esecuzioni_batch), aggregazioni nelle due viste, permesso vedereReport.
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
});
