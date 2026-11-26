/**
 * Test di integrazione della fase 5 (Offerte e preventivi) contro un MongoDB vero (replica set).
 * F0: migrazione 011 (collection, validatori, indici, parametro "offerte"), parametro modificabile dal controller,
 * ruolo globale commerciale assegnato dall'amministratore e permessi della sezione in /api/auth/me.
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

const URI_BASE = process.env.MONGODB_URI_TEST;
const NOME_DB = `toolpm_test_${Date.now()}_off`;
const CARTELLA = join(import.meta.dirname, '../scripts/migrazioni');
const CONTESTO = () => ({ utente: 'sistema:test', ora: new Date() });

describe.skipIf(!URI_BASE)('Offerte (fase 5) con MongoDB vero', () => {
  let app: INestApplication;
  let client: mongoose.mongo.MongoClient;
  let db: mongoose.mongo.Db;
  const cookie: Record<string, string> = {};
  const utente: Record<string, mongoose.Types.ObjectId> = {};
  const PERSONE = [
    { nome: 'adele', abilitazione: null, ruoli: ['admin'] },
    { nome: 'cora', abilitazione: null, ruoli: ['risorsa'] },
    { nome: 'paola', abilitazione: 'PM', ruoli: ['risorsa'] },
    { nome: 'sara', abilitazione: 'PMSenior', ruoli: ['risorsa'] },
    { nome: 'tito', abilitazione: 'TL', ruoli: ['risorsa'] },
    { nome: 'carlo', abilitazione: null, ruoli: ['risorsa', 'controller'] },
  ];
  const api = () => request(app.getHttpServer());
  const come = (chi: string, url: string) => api().get(url).set('Cookie', cookie[chi]);
  const accedi = async (nome: string) => {
    const r = await api().post('/api/auth/login').send({ email: `${nome}@prova.it`, password: 'password-di-prova' });
    cookie[nome] = String(r.headers['set-cookie']).split(';')[0];
  };

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
      utente[p.nome] = (
        await db.collection('utenti').insertOne({
          email: `${p.nome}@prova.it`,
          passwordHash: hash,
          abilitazione: p.abilitazione,
          ruoli: p.ruoli,
          attivo: true,
          deveCambiarePassword: false,
        })
      ).insertedId;
    }
    const { AppModule } = await import('../src/app.module.js');
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    for (const p of PERSONE) await accedi(p.nome);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.dropDatabase();
    await client?.close();
  });

  describe('F0 — migrazione 011-offerte', () => {
    const offerta = (numero: string) => ({
      numero,
      clienteId: new mongoose.Types.ObjectId(),
      titolo: 'Portale ordini',
      tipo: 'corpo',
      stato: 'bozza',
      responsabile: { utenteId: new mongoose.Types.ObjectId() },
      stimatori: [],
      revisioneCorrente: 1,
      versione: 1,
    });

    it('crea le collection con validatori e indici', async () => {
      const nomi = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
      expect(nomi).toEqual(expect.arrayContaining(['offerte', 'offerte_revisioni', 'listino_vendita', 'contatori']));
      await db.collection('offerte').insertOne(offerta('OFF-2026-0001'));
      await expect(db.collection('offerte').insertOne(offerta('OFF-2026-0001'))).rejects.toThrow(/duplicate key/);
      await expect(db.collection('offerte').insertOne(offerta('2026-1'))).rejects.toThrow(/validation/);
      await expect(db.collection('offerte').insertOne({ ...offerta('OFF-2026-0002'), tipo: 'canone' })).rejects.toThrow(/validation/);
      const offertaId = new mongoose.Types.ObjectId();
      const ruoloId = new mongoose.Types.ObjectId();
      const revisione = { offertaId, numero: 1, stato: 'bozza', gruppi: [{ _id: new mongoose.Types.ObjectId(), nome: 'Analisi', voci: [{ _id: new mongoose.Types.ObjectId(), ruoloId, giorni: 2.5 }] }], contingenzaPercento: 10, scontoPercento: 0, versione: 1 };
      await db.collection('offerte_revisioni').insertOne(revisione);
      await expect(db.collection('offerte_revisioni').insertOne({ ...revisione, _id: undefined, numero: 2, stato: 'boh' })).rejects.toThrow(/validation/);
      await expect(db.collection('offerte_revisioni').insertOne({ ...revisione, _id: undefined, numero: 3, contingenzaPercento: 120 })).rejects.toThrow(/validation/);
      await expect(db.collection('offerte_revisioni').insertOne({ ...revisione, _id: undefined })).rejects.toThrow(/duplicate key/);
      const voce = { ruoloId, clienteId: null, validoDal: new Date('2026-01-01'), validoAl: null, centesimiGiorno: 50000 };
      await db.collection('listino_vendita').insertOne(voce);
      await expect(db.collection('listino_vendita').insertOne({ ...voce, _id: undefined })).rejects.toThrow(/duplicate key/);
      await expect(db.collection('listino_vendita').insertOne({ ...voce, _id: undefined, validoDal: new Date('2027-01-01'), centesimiGiorno: -1 })).rejects.toThrow(/validation/);
      const indici = (await db.collection('progetti').indexes()).map((i) => JSON.stringify(i.key));
      expect(indici).toContain(JSON.stringify({ offertaId: 1 }));
      for (const c of ['offerte', 'offerte_revisioni', 'listino_vendita']) await db.collection(c).deleteMany({});
    });

    it('crea il parametro "offerte" senza toccarlo se esiste già, e si può rieseguire', async () => {
      const p = await db.collection('parametri').findOne({ chiave: 'offerte' });
      expect(p!.valore).toEqual({ margineMinimoPercento: 25, validitaGiorni: 60, motiviPerdita: ['Prezzo', 'Tempi', 'Concorrente', 'Rinuncia del cliente', 'Altro'] });
      await db.collection('parametri').updateOne({ chiave: 'offerte' }, { $set: { 'valore.margineMinimoPercento': 30 } });
      const m = await import(pathToFileURL(join(CARTELLA, '011-offerte.mjs')).href);
      const r = await m.esegui(db, CONTESTO());
      expect(r).toMatchObject({ validatori: ['offerte', 'offerte_revisioni', 'listino_vendita', 'contatori'], parametri: 0 });
      expect((await db.collection('parametri').findOne({ chiave: 'offerte' }))!.valore.margineMinimoPercento).toBe(30);
      await db.collection('parametri').updateOne({ chiave: 'offerte' }, { $set: { 'valore.margineMinimoPercento': 25 } });
    });
  });

  describe('F0 — parametro, ruolo commerciale, permessi', () => {
    it('il controller modifica il parametro "offerte" con i controlli', async () => {
      const put = (valore: unknown) => api().put('/api/parametri/offerte').set('Cookie', cookie.carlo).send({ valore });
      expect((await put({ margineMinimoPercento: 120, validitaGiorni: 60, motiviPerdita: ['Prezzo'] })).status).toBe(400);
      expect((await put({ margineMinimoPercento: 25, validitaGiorni: 0, motiviPerdita: ['Prezzo'] })).status).toBe(400);
      expect((await put({ margineMinimoPercento: 25, validitaGiorni: 60, motiviPerdita: [] })).status).toBe(400);
      expect((await put({ margineMinimoPercento: 20, validitaGiorni: 90, motiviPerdita: ['Prezzo', 'Altro'] })).status).toBe(200);
      expect((await api().put('/api/parametri/offerte').set('Cookie', cookie.paola).send({ valore: {} })).status).toBe(403);
    });

    it('l\'amministratore assegna il ruolo commerciale; i permessi della sezione arrivano al frontend', async () => {
      const r = await api().put(`/api/utenti/${utente.cora.toHexString()}`).set('Cookie', cookie.adele).send({ ruoli: ['risorsa', 'commerciale'] });
      expect(r.status).toBe(200);
      expect(r.body.ruoli).toEqual(['risorsa', 'commerciale']);
      expect((await api().put(`/api/utenti/${utente.cora.toHexString()}`).set('Cookie', cookie.adele).send({ ruoli: ['venditore'] })).status).toBe(400);
      await accedi('cora');
      const permessi = async (chi: string) => {
        const p = (await come(chi, '/api/auth/me')).body.permessi as Record<string, boolean>;
        return ['vedereOfferte', 'creareOfferte', 'vedereListino', 'gestireListino'].filter((k) => p[k]);
      };
      expect(await permessi('cora')).toEqual(['vedereOfferte', 'creareOfferte', 'vedereListino']);
      expect(await permessi('paola')).toEqual(['vedereOfferte', 'creareOfferte', 'vedereListino']);
      expect(await permessi('sara')).toEqual(['vedereOfferte', 'creareOfferte', 'vedereListino', 'gestireListino']);
      expect(await permessi('tito')).toEqual(['vedereOfferte']);
      expect(await permessi('carlo')).toEqual(['vedereOfferte', 'vedereListino', 'gestireListino']);
      expect(await permessi('adele')).toEqual([]);
    });
  });
});
