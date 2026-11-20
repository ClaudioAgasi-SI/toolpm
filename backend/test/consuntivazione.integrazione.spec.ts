/**
 * Test di integrazione della sezione Consuntivazione (fase 2) contro un MongoDB vero (replica set).
 * C0: migrazione 007 (validatori, indici, tipologie iniziali con ORDINARIA predefinita).
 * C1: API delle tipologie di costo (permessi, codice, predefinita sempre una e attiva).
 *
 * Si esegue solo se è impostata MONGODB_URI_TEST, es.:
 *   MONGODB_URI_TEST="mongodb://localhost:27017/?directConnection=true" npm test
 * Ogni esecuzione usa un database nuovo (toolpm_test_<numero>) e lo cancella alla fine.
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
const NOME_DB = `toolpm_test_${Date.now()}_cons`;
const CARTELLA = join(import.meta.dirname, '../scripts/migrazioni');
const CONTESTO = () => ({ utente: 'sistema:test', ora: new Date() });

describe.skipIf(!URI_BASE)('Consuntivazione con MongoDB vero', () => {
  let app: INestApplication;
  let client: mongoose.mongo.MongoClient;
  let db: mongoose.mongo.Db;
  const cookie: Record<string, string> = {};

  const PERSONE = [
    { nome: 'paola', abilitazione: 'PM', ruoli: ['risorsa'] },
    { nome: 'rita', abilitazione: null, ruoli: ['risorsa'] },
    { nome: 'carlo', abilitazione: null, ruoli: ['risorsa', 'controller'] },
  ];

  const api = () => request(app.getHttpServer());
  const come = (chi: string) => ({
    get: (url: string) => api().get(url).set('Cookie', cookie[chi]),
    post: (url: string, body?: object) => api().post(url).set('Cookie', cookie[chi]).send(body ?? {}),
    put: (url: string, body?: object) => api().put(url).set('Cookie', cookie[chi]).send(body ?? {}),
  });

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
      const risorsaId = (await db.collection('risorse').insertOne({ cognome: p.nome, nome: p.nome, email: `${p.nome}@prova.it` })).insertedId;
      await db.collection('utenti').insertOne({
        email: `${p.nome}@prova.it`,
        passwordHash: hash,
        abilitazione: p.abilitazione,
        ruoli: p.ruoli,
        attivo: true,
        deveCambiarePassword: false,
        risorsaId,
      });
    }

    const { AppModule } = await import('../src/app.module.js');
    const { MongooseErrorsFilter } = await import('../src/mongoose-errors.filter.js');
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new MongooseErrorsFilter());
    await app.init();

    for (const p of PERSONE) {
      const r = await api().post('/api/auth/login').send({ email: `${p.nome}@prova.it`, password: 'password-di-prova' });
      expect(r.status).toBe(200);
      cookie[p.nome] = String(r.headers['set-cookie']).split(';')[0];
    }
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.dropDatabase();
    await client?.close();
  });

  describe('migrazione 007-consuntivazione', () => {
    const migrazione = () => import(pathToFileURL(join(CARTELLA, '007-consuntivazione.mjs')).href);

    it('crea le quattro tipologie iniziali, con ORDINARIA unica predefinita', async () => {
      const tipologie = await db.collection('tipologie_costo').find({}, { sort: { ordine: 1 } }).toArray();
      expect(tipologie.map((t) => t.codice)).toEqual(['ORDINARIA', 'STRAORDINARIA', 'STRAORD_NOTTURNA', 'STRAORD_FESTIVA']);
      expect(tipologie.filter((t) => t.predefinita).map((t) => t.codice)).toEqual(['ORDINARIA']);
      expect(tipologie.every((t) => t.attiva && t.creatoDa === 'sistema:test')).toBe(true);
    });

    it('si può rieseguire: non duplica e non tocca le tipologie modificate', async () => {
      await db.collection('tipologie_costo').updateOne({ codice: 'STRAORDINARIA' }, { $set: { descrizione: 'Straordinario diurno' } });
      const esito = await (await migrazione()).esegui(db, CONTESTO());
      expect(esito.tipologieCreate).toBe(0);
      expect(await db.collection('tipologie_costo').countDocuments()).toBe(4);
      const s = await db.collection('tipologie_costo').findOne({ codice: 'STRAORDINARIA' });
      expect(s?.descrizione).toBe('Straordinario diurno');
    });

    it('rispetta una predefinita scelta dal controller', async () => {
      const t = db.collection('tipologie_costo');
      await t.updateOne({ codice: 'ORDINARIA' }, { $set: { predefinita: false } });
      await t.updateOne({ codice: 'STRAORDINARIA' }, { $set: { predefinita: true } });
      await t.deleteOne({ codice: 'ORDINARIA' });
      await (await migrazione()).esegui(db, CONTESTO());
      expect((await t.find({ predefinita: true }).toArray()).map((x) => x.codice)).toEqual(['STRAORDINARIA']);
      // Ripristino per i test successivi.
      await t.updateOne({ codice: 'STRAORDINARIA' }, { $set: { predefinita: false } });
      await t.updateOne({ codice: 'ORDINARIA' }, { $set: { predefinita: true } });
    });

    it('una sola tipologia predefinita e codici unici', async () => {
      const t = db.collection('tipologie_costo');
      await expect(t.updateOne({ codice: 'STRAORD_FESTIVA' }, { $set: { predefinita: true } })).rejects.toMatchObject({ code: 11000 });
      const base = { descrizione: 'x', ordine: 9, categoria: 'ordinaria', attiva: true, predefinita: false };
      await expect(t.insertOne({ codice: 'ORDINARIA', ...base })).rejects.toMatchObject({ code: 11000 });
      await expect(t.insertOne({ codice: 'ALTRA', ...base, categoria: 'notturna' })).rejects.toMatchObject({ code: 121 });
    });

    it('tariffe: importo intero non negativo, riferimenti obbligatori', async () => {
      const id = () => new mongoose.Types.ObjectId();
      const ok = { ruoloId: id(), tipologiaId: id(), validoDal: new Date('2027-01-01'), validoAl: null, centesimiOra: 3900 };
      await db.collection('tariffe_standard').insertOne(ok);
      await expect(db.collection('tariffe_standard').insertOne({ ...ok, centesimiOra: 39.5 })).rejects.toMatchObject({ code: 121 });
      await expect(db.collection('tariffe_standard').insertOne({ ...ok, centesimiOra: -1 })).rejects.toMatchObject({ code: 121 });
      const { ruoloId: _, ...senzaRuolo } = ok;
      await expect(db.collection('tariffe_personalizzate').insertOne(senzaRuolo)).rejects.toMatchObject({ code: 121 });
      await db.collection('tariffe_personalizzate').insertOne({ ...senzaRuolo, risorsaId: id() });
    });

    it('consuntivi: una giornata per risorsa, minuti a passi di 15, stati ammessi', async () => {
      const id = () => new mongoose.Types.ObjectId();
      const risorsaId = id();
      const riga = (extra: object = {}) => ({
        _id: id(),
        progettoId: id(),
        attivitaId: null,
        centroCostoId: id(),
        tipologiaId: id(),
        tipologiaCodice: 'ORDINARIA',
        minuti: 360,
        stato: 'bozza',
        fonteTariffa: null,
        tariffaCentesimiOra: null,
        costoCentesimi: null,
        approvazioneTL: null,
        approvazionePM: null,
        ...extra,
      });
      const giornata = (data: string, righe: object[]) => ({ risorsaId, data: new Date(data), mese: data.slice(0, 7).replace('-', ''), versione: 0, righe });
      const c = db.collection('consuntivi');
      await c.insertOne(giornata('2027-01-12', [riga(), riga({ fonteTariffa: 'personalizzata', tariffaCentesimiOra: 3200, costoCentesimi: 19200 })]));
      await expect(c.insertOne(giornata('2027-01-12', [riga()]))).rejects.toMatchObject({ code: 11000 });
      await expect(c.insertOne(giornata('2027-01-13', [riga({ minuti: 10 })]))).rejects.toMatchObject({ code: 121 });
      await expect(c.insertOne(giornata('2027-01-13', [riga({ minuti: 1455 })]))).rejects.toMatchObject({ code: 121 });
      await expect(c.insertOne(giornata('2027-01-13', [riga({ stato: 'pronta' })]))).rejects.toMatchObject({ code: 121 });
      await expect(c.insertOne({ ...giornata('2027-01-13', []), mese: '2027-01' })).rejects.toMatchObject({ code: 121 });
      await c.insertOne(giornata('2027-01-13', []));
    });
  });

  describe('tipologie di costo (C1)', () => {
    const URL_T = '/api/consuntivazione/tipologie-costo';
    const per = async (codice: string) => (await come('rita').get(URL_T)).body.find((t: { codice: string }) => t.codice === codice);
    const predefinite = async () => (await come('rita').get(URL_T)).body.filter((t: { predefinita: boolean }) => t.predefinita).map((t: { codice: string }) => t.codice);

    it('lettura per chi ha accesso, in ordine; senza accesso 401', async () => {
      expect((await api().get(URL_T)).status).toBe(401);
      const r = await come('rita').get(URL_T);
      expect(r.status).toBe(200);
      expect(r.body.map((t: { codice: string }) => t.codice)).toEqual(['ORDINARIA', 'STRAORDINARIA', 'STRAORD_NOTTURNA', 'STRAORD_FESTIVA']);
      expect(await predefinite()).toEqual(['ORDINARIA']);
      const ordinaria = await per('ORDINARIA');
      expect((await come('rita').get(`${URL_T}/${ordinaria._id}`)).body.codice).toBe('ORDINARIA');
      expect((await come('rita').get(`${URL_T}/non-esiste`)).status).toBe(404);
    });

    it('solo il controller crea e modifica', async () => {
      const nuova = { codice: 'REPERIBILITA', descrizione: 'Reperibilità', categoria: 'straordinaria' };
      expect((await come('rita').post(URL_T, nuova)).status).toBe(403);
      expect((await come('paola').post(URL_T, nuova)).status).toBe(403);
      const r = await come('carlo').post(URL_T, nuova);
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ codice: 'REPERIBILITA', ordine: 5, attiva: true, predefinita: false });
      expect(r.body.creatoDa).toBeTruthy();
      expect(r.body.creatoDa).not.toBe('sistema:test');
      expect((await come('paola').put(`${URL_T}/${r.body._id}`, { descrizione: 'x' })).status).toBe(403);
    });

    it('codice unico e non modificabile, campi controllati', async () => {
      expect((await come('carlo').post(URL_T, { codice: 'REPERIBILITA', descrizione: 'Doppia', categoria: 'ordinaria' })).status).toBe(409);
      expect((await come('carlo').post(URL_T, { codice: 'ALTRA', descrizione: 'x', categoria: 'notturna' })).status).toBe(400);
      expect((await come('carlo').post(URL_T, { codice: 'CON SPAZI', descrizione: 'x', categoria: 'ordinaria' })).status).toBe(400);
      expect((await come('carlo').post(URL_T, { codice: 'ALTRA', categoria: 'ordinaria' })).status).toBe(400);
      expect((await come('carlo').post(URL_T, { codice: 'ALTRA', descrizione: 'x', categoria: 'ordinaria', ordine: 1.5 })).status).toBe(400);
      const rep = await per('REPERIBILITA');
      expect((await come('carlo').put(`${URL_T}/${rep._id}`, { codice: 'REPER' })).status).toBe(409);
      const m = await come('carlo').put(`${URL_T}/${rep._id}`, { descrizione: 'Reperibilità notturna', ordine: 9 });
      expect(m.status).toBe(200);
      expect(m.body).toMatchObject({ codice: 'REPERIBILITA', descrizione: 'Reperibilità notturna', ordine: 9 });
    });

    it('la predefinita è sempre una, attiva, e si cambia scegliendo la nuova', async () => {
      const ordinaria = await per('ORDINARIA');
      const rep = await per('REPERIBILITA');
      expect((await come('carlo').put(`${URL_T}/${ordinaria._id}`, { predefinita: false })).status).toBe(400);
      expect((await come('carlo').put(`${URL_T}/${ordinaria._id}`, { attiva: false })).status).toBe(400);
      expect((await come('carlo').put(`${URL_T}/${rep._id}`, { predefinita: true, attiva: false })).status).toBe(400);
      expect(await predefinite()).toEqual(['ORDINARIA']);

      const r = await come('carlo').put(`${URL_T}/${rep._id}`, { predefinita: true });
      expect(r.status).toBe(200);
      expect(await predefinite()).toEqual(['REPERIBILITA']);
      // Ora ORDINARIA si può disattivare, la nuova predefinita no.
      expect((await come('carlo').put(`${URL_T}/${rep._id}`, { attiva: false })).status).toBe(400);

      expect((await come('carlo').put(`${URL_T}/${ordinaria._id}`, { predefinita: true })).status).toBe(200);
      expect(await predefinite()).toEqual(['ORDINARIA']);
    });

    it('una nuova tipologia può nascere predefinita (solo se attiva)', async () => {
      expect((await come('carlo').post(URL_T, { codice: 'PROVA', descrizione: 'Prova', categoria: 'ordinaria', predefinita: true, attiva: false })).status).toBe(400);
      const r = await come('carlo').post(URL_T, { codice: 'PROVA', descrizione: 'Prova', categoria: 'ordinaria', predefinita: true });
      expect(r.status).toBe(201);
      expect(await predefinite()).toEqual(['PROVA']);
      const ordinaria = await per('ORDINARIA');
      await come('carlo').put(`${URL_T}/${ordinaria._id}`, { predefinita: true });
      expect((await come('carlo').put(`${URL_T}/${r.body._id}`, { attiva: false })).status).toBe(200);
    });

    it('disattivare toglie la tipologia dall\'elenco delle attive, senza cancellarla', async () => {
      const notturna = await per('STRAORD_NOTTURNA');
      expect((await come('carlo').put(`${URL_T}/${notturna._id}`, { attiva: false })).status).toBe(200);
      const attive = (await come('rita').get(`${URL_T}?attive=true`)).body.map((t: { codice: string }) => t.codice);
      expect(attive).not.toContain('STRAORD_NOTTURNA');
      expect(attive).not.toContain('PROVA');
      expect((await come('rita').get(URL_T)).body.map((t: { codice: string }) => t.codice)).toContain('STRAORD_NOTTURNA');
      expect((await come('carlo').put(`${URL_T}/${notturna._id}`, { attiva: true })).status).toBe(200);
    });
  });
});
