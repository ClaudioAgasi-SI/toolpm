/**
 * Test di integrazione della sezione Consuntivazione (fase 2) contro un MongoDB vero (replica set).
 * C0: migrazione 007 (validatori, indici, tipologie iniziali con ORDINARIA predefinita).
 * C1: API delle tipologie di costo (permessi, codice, predefinita sempre una e attiva).
 * C2: API delle tariffe (permessi, sovrapposizioni, risoluzione con cambio di ruolo, cancellazione).
 * C3: consuntivi giornalieri (regole della giornata, costo fotografato, versione, riservatezza, proposte).
 * C4: vincoli su Comuni e permessi (centro di costo bloccato, TL e risorse con ore sui suoi progetti).
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
  const risorsa: Record<string, string> = {};

  const PERSONE = [
    { nome: 'paola', abilitazione: 'PM', ruoli: ['risorsa'] },
    { nome: 'rita', abilitazione: null, ruoli: ['risorsa'] },
    { nome: 'carlo', abilitazione: null, ruoli: ['risorsa', 'controller'] },
    { nome: 'tito', abilitazione: 'TL', ruoli: ['risorsa'] },
  ];

  const api = () => request(app.getHttpServer());
  const come = (chi: string) => ({
    get: (url: string) => api().get(url).set('Cookie', cookie[chi]),
    post: (url: string, body?: object) => api().post(url).set('Cookie', cookie[chi]).send(body ?? {}),
    put: (url: string, body?: object) => api().put(url).set('Cookie', cookie[chi]).send(body ?? {}),
    delete: (url: string) => api().delete(url).set('Cookie', cookie[chi]),
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
      risorsa[p.nome] = String(risorsaId);
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

  describe('tariffe (C2)', () => {
    const URL_S = '/api/consuntivazione/tariffe-standard';
    const URL_P = (r: string) => `/api/consuntivazione/risorse/${r}/tariffe-personalizzate`;
    const URL_A = (r: string) => `/api/consuntivazione/risorse/${r}/tariffe-applicabili`;
    const tip: Record<string, string> = {};
    let junior: string;
    let senior: string;

    beforeAll(async () => {
      for (const t of (await come('rita').get('/api/consuntivazione/tipologie-costo')).body) tip[t.codice] = t._id;
      const ruoli = db.collection('ruoli');
      junior = String((await ruoli.insertOne({ codice: 'SVJ', descrizione: 'Sviluppatore junior', attivo: true })).insertedId);
      senior = String((await ruoli.insertOne({ codice: 'SVS', descrizione: 'Sviluppatore senior', attivo: true })).insertedId);
      // rita: junior fino al 15 gennaio 2027, senior dal 16 (cambio di ruolo a metà mese).
      await db.collection('risorse').updateOne(
        { _id: new mongoose.Types.ObjectId(risorsa.rita) },
        {
          $set: {
            storicoRuoli: [
              { ruoloId: new mongoose.Types.ObjectId(junior), dal: new Date('2025-01-01') },
              { ruoloId: new mongoose.Types.ObjectId(senior), dal: new Date('2027-01-16') },
            ],
          },
        },
      );
    });

    it('solo il controller legge e scrive le tariffe', async () => {
      expect((await api().get(URL_S)).status).toBe(401);
      expect((await come('rita').get(URL_S)).status).toBe(403);
      expect((await come('paola').get(URL_S)).status).toBe(403);
      expect((await come('paola').get(URL_P(risorsa.rita))).status).toBe(403);
      expect((await come('rita').get(URL_A(risorsa.rita))).status).toBe(403);
      expect((await come('carlo').get(URL_S)).status).toBe(200);
    });

    it('tariffe standard: dati controllati, periodi senza sovrapposizioni', async () => {
      const base = { ruoloId: senior, tipologiaId: tip.ORDINARIA, validoDal: '2027-01-01', centesimiOra: 3000 };
      const r = await come('carlo').post(URL_S, base);
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ centesimiOra: 3000, validoAl: null });
      for (const [tipologia, euro] of [['STRAORDINARIA', 39], ['STRAORD_NOTTURNA', 45], ['STRAORD_FESTIVA', 51]] as const) {
        expect((await come('carlo').post(URL_S, { ...base, tipologiaId: tip[tipologia], centesimiOra: euro * 100 })).status).toBe(201);
      }
      expect((await come('carlo').post(URL_S, { ...base, validoDal: '2027-06-01' })).status).toBe(409);
      expect((await come('carlo').post(URL_S, { ...base, validoDal: '2026-01-01', validoAl: '2027-01-01' })).status).toBe(409);
      expect((await come('carlo').post(URL_S, { ...base, validoDal: '2026-01-01', validoAl: '2026-12-31' })).status).toBe(201);
      expect((await come('carlo').post(URL_S, { ...base, centesimiOra: 30.5, validoDal: '2020-01-01', validoAl: '2020-12-31' })).status).toBe(400);
      expect((await come('carlo').post(URL_S, { ...base, centesimiOra: -1, validoDal: '2020-01-01', validoAl: '2020-12-31' })).status).toBe(400);
      expect((await come('carlo').post(URL_S, { ...base, validoDal: '2020-02-01', validoAl: '2020-01-01' })).status).toBe(400);
      expect((await come('carlo').post(URL_S, { ...base, ruoloId: risorsa.rita, validoDal: '2020-01-01' })).status).toBe(400);
      expect((await come('carlo').post(URL_S, { ...base, tipologiaId: junior, validoDal: '2020-01-01' })).status).toBe(400);
      expect((await come('carlo').post(URL_S, { ...base, validoDal: '01/01/2020' })).status).toBe(400);
      // Junior: solo ordinaria.
      expect((await come('carlo').post(URL_S, { ...base, ruoloId: junior, centesimiOra: 2500 })).status).toBe(201);
      const senior2027 = (await come('carlo').get(`${URL_S}?ruolo=${senior}&tipologia=${tip.ORDINARIA}`)).body;
      expect(senior2027.map((t: { validoDal: string }) => t.validoDal.slice(0, 10))).toEqual(['2027-01-01', '2026-01-01']);
    });

    it('modifica: chiudere un periodo e aprirne un altro; ruolo e tipologia non cambiano', async () => {
      const [ordinaria] = (await come('carlo').get(`${URL_S}?ruolo=${senior}&tipologia=${tip.ORDINARIA}`)).body;
      expect((await come('carlo').put(`${URL_S}/${ordinaria._id}`, { tipologiaId: tip.STRAORDINARIA })).status).toBe(409);
      expect((await come('carlo').put(`${URL_S}/${ordinaria._id}`, { validoDal: '2026-12-01' })).status).toBe(409);
      expect((await come('carlo').put(`${URL_S}/${ordinaria._id}`, { validoAl: '2027-06-30' })).status).toBe(200);
      const nuova = await come('carlo').post(URL_S, { ruoloId: senior, tipologiaId: tip.ORDINARIA, validoDal: '2027-07-01', centesimiOra: 3100 });
      expect(nuova.status).toBe(201);
      // Riaprire senza fine il vecchio periodo ora si sovrappone.
      expect((await come('carlo').put(`${URL_S}/${ordinaria._id}`, { validoAl: null })).status).toBe(409);
    });

    it('personalizzate: solo per risorse esistenti, stesse regole sui periodi', async () => {
      expect((await come('carlo').get(URL_P(senior))).status).toBe(404);
      const r = await come('carlo').post(URL_P(risorsa.rita), { tipologiaId: tip.ORDINARIA, validoDal: '2027-01-01', centesimiOra: 3200 });
      expect(r.status).toBe(201);
      expect(r.body.risorsaId).toBe(risorsa.rita);
      expect((await come('carlo').post(URL_P(risorsa.rita), { tipologiaId: tip.ORDINARIA, validoDal: '2027-05-01', centesimiOra: 3300 })).status).toBe(409);
      expect((await come('carlo').get(URL_P(risorsa.rita))).body).toHaveLength(1);
      expect((await come('carlo').get(URL_P(risorsa.paola))).body).toHaveLength(0);
      // Una tariffa di rita non si raggiunge passando da un'altra risorsa.
      expect((await come('carlo').put(`${URL_P(risorsa.paola)}/${r.body._id}`, { centesimiOra: 1 })).status).toBe(404);
    });

    it('applicabili: personalizzata, standard del ruolo alla data, nessuna', async () => {
      const prima = (await come('carlo').get(`${URL_A(risorsa.rita)}?data=2027-01-15`)).body;
      expect(prima.ruolo).toMatchObject({ codice: 'SVJ' });
      const p = (codice: string, corpoRisposta: { tariffe: { tipologiaCodice: string }[] }) => corpoRisposta.tariffe.find((t) => t.tipologiaCodice === codice);
      expect(p('ORDINARIA', prima)).toMatchObject({ fonte: 'personalizzata', centesimiOra: 3200 });
      expect(p('STRAORDINARIA', prima)).toMatchObject({ fonte: null, centesimiOra: null });

      const dopo = (await come('carlo').get(`${URL_A(risorsa.rita)}?data=2027-01-16`)).body;
      expect(dopo.ruolo).toMatchObject({ codice: 'SVS' });
      expect(p('ORDINARIA', dopo)).toMatchObject({ fonte: 'personalizzata', centesimiOra: 3200 });
      expect(p('STRAORDINARIA', dopo)).toMatchObject({ fonte: 'standard', centesimiOra: 3900 });
      expect(p('STRAORD_FESTIVA', dopo)).toMatchObject({ fonte: 'standard', centesimiOra: 5100 });
      expect(p('REPERIBILITA', dopo)).toMatchObject({ fonte: null });

      // paola non ha ruolo: nessuna tariffa standard.
      const paola = (await come('carlo').get(`${URL_A(risorsa.paola)}?data=2027-03-01`)).body;
      expect(paola.ruolo).toBeNull();
      expect(paola.tariffe.every((t: { fonte: string | null }) => t.fonte === null)).toBe(true);
      expect((await come('carlo').get(`${URL_A(risorsa.rita)}?data=2027-13-01`)).status).toBe(400);
      expect((await come('carlo').get(URL_A(risorsa.rita))).status).toBe(200);
    });

    it('cancellazione: solo se la tariffa non è usata nei consuntivi', async () => {
      const [personalizzata] = (await come('carlo').get(URL_P(risorsa.rita))).body;
      await db.collection('consuntivi').insertOne({
        risorsaId: new mongoose.Types.ObjectId(risorsa.rita),
        data: new Date('2027-02-01'),
        mese: '202702',
        versione: 0,
        righe: [
          {
            _id: new mongoose.Types.ObjectId(),
            progettoId: new mongoose.Types.ObjectId(),
            attivitaId: null,
            centroCostoId: new mongoose.Types.ObjectId(),
            tipologiaId: new mongoose.Types.ObjectId(tip.ORDINARIA),
            tipologiaCodice: 'ORDINARIA',
            minuti: 60,
            stato: 'bozza',
            fonteTariffa: 'personalizzata',
            tariffaId: new mongoose.Types.ObjectId(personalizzata._id),
            tariffaCentesimiOra: 3200,
            costoCentesimi: 3200,
          },
        ],
      });
      expect((await come('carlo').delete(`${URL_P(risorsa.rita)}/${personalizzata._id}`)).status).toBe(409);
      const [junior2027] = (await come('carlo').get(`${URL_S}?ruolo=${junior}`)).body;
      expect((await come('paola').delete(`${URL_S}/${junior2027._id}`)).status).toBe(403);
      expect((await come('carlo').delete(`${URL_S}/${junior2027._id}`)).status).toBe(204);
      expect((await come('carlo').get(`${URL_S}?ruolo=${junior}`)).body).toHaveLength(0);
      await db.collection('consuntivi').deleteMany({ mese: '202702' });
    });
  });

  describe('consuntivi (C3)', () => {
    const URL_C = '/api/consuntivazione/consuntivi';
    const oid = (s: string) => new mongoose.Types.ObjectId(s);
    const tip: Record<string, string> = {};
    const prog: Record<string, string> = {};
    const att: Record<string, string> = {};
    let cdc: string;
    // Giorni passati (non si consuntiva nel futuro), dopo il passaggio di rita a senior (16/01/2027): uso il 2025?
    // rita è junior dal 2025-01-01 e senior dal 2027-01-16; le tariffe standard senior valgono dal 2027.
    // Per avere date passate e tariffe in vigore uso giorni del 2026 con tariffe standard del ruolo junior aggiunte qui.
    const LUN = '2026-03-02';
    const MAR = '2026-03-03';
    const MER = '2026-03-04';

    beforeAll(async () => {
      for (const t of (await come('rita').get('/api/consuntivazione/tipologie-costo')).body) tip[t.codice] = t._id;
      cdc = String((await db.collection('centri_costo').insertOne({ codice: 'CDC1', descrizione: 'Sviluppo', attivo: true })).insertedId);
      const progetto = async (codice: string, extra: object = {}) =>
        String(
          (
            await db.collection('progetti').insertOne({
              codice,
              titolo: `Progetto ${codice}`,
              centroCostoId: oid(cdc),
              stato: 'inCorso',
              dataInizio: new Date('2026-01-01'),
              approvatori: [],
              percentualeCompletamento: 0,
              soloSuAttivita: false,
              ...extra,
            })
          ).insertedId,
        );
      prog.A = await progetto('PA');
      prog.B = await progetto('PB', { stato: 'inValutazione' });
      prog.C = await progetto('PC', { stato: 'chiuso' });
      prog.S = await progetto('PS', { soloSuAttivita: true });
      prog.D = await progetto('PD');
      const attivita = async (progettoId: string, codice: string, stato = 'attiva') =>
        String(
          (
            await db.collection('attivita').insertOne({
              progettoId: oid(progettoId),
              codice,
              descrizione: `Attività ${codice}`,
              stato,
              percentualeCompletamento: 0,
              risorseAssegnateIds: [],
            })
          ).insertedId,
        );
      att.SVI = await attivita(prog.A, 'SVI');
      att.OLD = await attivita(prog.A, 'OLD', 'chiusa');
      att.COL = await attivita(prog.B, 'COL');
      att.SS = await attivita(prog.S, 'SS1');
      // Tariffe del ruolo junior di rita nel 2026: ordinaria 25, straordinaria 30. La personalizzata ordinaria di
      // rita vale dal 2027, quindi nel 2026 vale la standard.
      const junior = (await db.collection('ruoli').findOne({ codice: 'SVJ' }))!._id;
      await db.collection('tariffe_standard').insertMany([
        { ruoloId: junior, tipologiaId: oid(tip.ORDINARIA), validoDal: new Date('2026-01-01'), validoAl: new Date('2026-12-31'), centesimiOra: 2500 },
        { ruoloId: junior, tipologiaId: oid(tip.STRAORDINARIA), validoDal: new Date('2026-01-01'), validoAl: new Date('2026-12-31'), centesimiOra: 3000 },
      ]);
      // Dove lavorano (decisione 5): rita allocata a marzo 2026 su PA e PS e approvatrice di PB; PC chiuso;
      // su PD nessuno. paola allocata su PA a marzo; non ha un ruolo e la sua uscita è il 31/03/2026.
      await db.collection('risorse').updateOne(
        { _id: oid(risorsa.rita) },
        { $set: { planned: [{ mese: '202603', progettoId: oid(prog.A), percentualeAllocazione: 60 }, { mese: '202603', progettoId: oid(prog.S), percentualeAllocazione: 20 }] } },
      );
      await db.collection('progetti').updateOne({ _id: oid(prog.B) }, { $set: { approvatori: [{ risorsaId: oid(risorsa.rita), profilo: 'TL' }] } });
      await db.collection('risorse').updateOne(
        { _id: oid(risorsa.paola) },
        { $set: { dataUscita: new Date('2026-03-31'), oreContrattualiGiorno: 4, planned: [{ mese: '202603', progettoId: oid(prog.A), percentualeAllocazione: 100 }] } },
      );
    });

    const leggi = async (chi: string, da: string, a: string, extra = '') => (await come(chi).get(`${URL_C}?da=${da}&a=${a}${extra}`));

    it('salva una giornata: progetto dall\'attività, tipologia predefinita, costo fotografato visibile solo al controller', async () => {
      const r = await come('rita').put(`${URL_C}/${LUN}`, {
        versione: 0,
        righe: [
          { attivitaId: att.SVI, minuti: 360, nota: 'API' },
          { progettoId: prog.A, tipologiaId: tip.STRAORDINARIA, minuti: 120 },
          { attivitaId: att.COL, minuti: 120 },
        ],
      });
      expect(r.status).toBe(200);
      const [g] = r.body.giornate;
      expect(g).toMatchObject({ data: LUN, versione: 1, totaleMinuti: 600 });
      expect(g.righe[0]).toMatchObject({ progettoId: prog.A, attivitaId: att.SVI, tipologiaCodice: 'ORDINARIA', stato: 'bozza', nota: 'API' });
      expect(g.righe[0].progetto).toMatchObject({ codice: 'PA' });
      expect(g.righe[0].attivita).toMatchObject({ codice: 'SVI' });
      // Riservatezza: nessuna tariffa né importo alla risorsa.
      for (const riga of g.righe) {
        expect(riga).not.toHaveProperty('costoCentesimi');
        expect(riga).not.toHaveProperty('tariffaCentesimiOra');
        expect(riga).not.toHaveProperty('fonteTariffa');
      }
      expect(JSON.stringify((await leggi('rita', LUN, LUN)).body)).not.toMatch(/costo|tariffa/i);
      // Nel database: costo fotografato, centro di costo copiato.
      const doc = await db.collection('consuntivi').findOne({ risorsaId: oid(risorsa.rita), data: new Date(LUN) });
      expect(doc!.righe.map((x: { costoCentesimi: number }) => x.costoCentesimi)).toEqual([15000, 6000, 5000]);
      expect(doc!.righe.every((x: { centroCostoId: unknown }) => String(x.centroCostoId) === cdc)).toBe(true);
      expect(doc!.mese).toBe('202603');
      // Il controller vede i costi delle righe di rita.
      const c = await leggi('carlo', LUN, LUN, `&risorsa=${risorsa.rita}`);
      expect(c.status).toBe(200);
      expect(c.body[0].righe.map((x: { costoCentesimi: number; fonteTariffa: string }) => [x.costoCentesimi, x.fonteTariffa])).toEqual([
        [15000, 'standard'],
        [6000, 'standard'],
        [5000, 'standard'],
      ]);
      // Gli altri no.
      expect((await leggi('paola', LUN, LUN, `&risorsa=${risorsa.rita}`)).status).toBe(403);
    });

    it('versione: chi salva con una versione vecchia riceve 409 e non perde nulla', async () => {
      const prima = (await leggi('rita', LUN, LUN)).body[0];
      const righe = prima.righe.map((x: { _id: string; attivitaId: string | null; progettoId: string; tipologiaId: string; minuti: number }) => ({
        _id: x._id,
        attivitaId: x.attivitaId,
        progettoId: x.progettoId,
        tipologiaId: x.tipologiaId,
        minuti: x.minuti,
      }));
      righe[0].minuti = 420;
      expect((await come('rita').put(`${URL_C}/${LUN}`, { versione: 1, righe })).status).toBe(200);
      righe[0].minuti = 300;
      const r = await come('rita').put(`${URL_C}/${LUN}`, { versione: 1, righe });
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/ricarica/);
      const dopo = (await leggi('rita', LUN, LUN)).body[0];
      expect(dopo.versione).toBe(2);
      expect(dopo.righe[0].minuti).toBe(420);
      // Giornata nuova con versione diversa da 0: 409.
      expect((await come('rita').put(`${URL_C}/${MAR}`, { versione: 3, righe: [{ progettoId: prog.A, minuti: 60 }] })).status).toBe(409);
    });

    it('costo: ricalcolato solo se cambiano tipologia o minuti; righe invariate intatte', async () => {
      const doc0 = await db.collection('consuntivi').findOne({ risorsaId: oid(risorsa.rita), data: new Date(LUN) });
      // Prima riga: 420 minuti × 25 €/h = 175 €.
      expect(doc0!.righe[0].costoCentesimi).toBe(17500);
      expect(doc0!.righe[1].modificatoIl).toEqual(doc0!.righe[1].modificatoIl);
      const g = (await leggi('rita', LUN, LUN)).body[0];
      const righe = g.righe.map((x: { _id: string; progettoId: string; attivitaId: string | null; tipologiaId: string; minuti: number; nota: string | null }) => ({
        _id: x._id,
        progettoId: x.progettoId,
        attivitaId: x.attivitaId,
        tipologiaId: x.tipologiaId,
        minuti: x.minuti,
        nota: x.nota,
      }));
      righe[0].nota = 'API e test';
      expect((await come('rita').put(`${URL_C}/${LUN}`, { versione: g.versione, righe })).status).toBe(200);
      const doc1 = await db.collection('consuntivi').findOne({ risorsaId: oid(risorsa.rita), data: new Date(LUN) });
      expect(doc1!.righe[0].nota).toBe('API e test');
      expect(doc1!.righe[0].costoCentesimi).toBe(17500);
      // La seconda riga non è cambiata: stesso istante di modifica di prima.
      expect(doc1!.righe[1].modificatoIl).toEqual(doc0!.righe[1].modificatoIl);
      expect(String(doc1!.righe[1]._id)).toBe(String(doc0!.righe[1]._id));
    });

    it('regole: progetto chiuso, attività chiusa, solo su attività, tipologia disattivata, attività di un altro progetto', async () => {
      const prova = async (riga: object) => come('rita').put(`${URL_C}/${MER}`, { versione: 0, righe: [riga] });
      expect((await prova({ progettoId: prog.C, minuti: 60 })).body.message).toMatch(/PC è chiuso/);
      expect((await prova({ attivitaId: att.OLD, minuti: 60 })).body.message).toMatch(/OLD è chiusa/);
      expect((await prova({ progettoId: prog.S, minuti: 60 })).body.message).toMatch(/solo sulle attività/);
      expect((await prova({ attivitaId: att.SVI, progettoId: prog.B, minuti: 60 })).body.message).toMatch(/non appartiene/);
      const notturna = tip.STRAORD_NOTTURNA;
      await db.collection('tipologie_costo').updateOne({ _id: oid(notturna) }, { $set: { attiva: false } });
      const r = await come('rita').put(`${URL_C}/2026-03-05`, { versione: 0, righe: [{ progettoId: prog.A, tipologiaId: notturna, minuti: 60 }] });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/^2026-03-05: riga 1: la tipologia STRAORD_NOTTURNA è disattivata/);
      await db.collection('tipologie_costo').updateOne({ _id: oid(notturna) }, { $set: { attiva: true } });
      expect((await prova({ minuti: 60 })).body.message).toMatch(/progetto o l'attività/);
      expect((await prova({ attivitaId: att.SS, minuti: 60 })).status).toBe(200);
    });

    it('regole: minuti, 24 ore, righe doppie, futuro, date della risorsa', async () => {
      const prova = (chi: string, giorno: string, righe: object[]) => come(chi).put(`${URL_C}/${giorno}`, { versione: 0, righe });
      expect((await prova('rita', '2026-03-06', [{ progettoId: prog.A, minuti: 50 }])).status).toBe(400);
      expect((await prova('rita', '2026-03-06', [{ progettoId: prog.A, minuti: 900 }, { progettoId: prog.B, minuti: 600 }])).body.message).toMatch(/oltre 24 ore/);
      expect((await prova('rita', '2026-03-06', [{ progettoId: prog.A, minuti: 60 }, { progettoId: prog.A, minuti: 60 }])).body.message).toMatch(/uniscile/);
      expect((await prova('rita', '2099-01-01', [{ progettoId: prog.A, minuti: 60 }])).body.message).toMatch(/futuri/);
      expect((await prova('paola', '2026-04-01', [{ progettoId: prog.A, minuti: 60 }])).body.message).toMatch(/uscita/);
      expect((await prova('rita', '2026-3-6', [{ progettoId: prog.A, minuti: 60 }])).status).toBe(400);
    });

    it('avviso sulle ore ordinarie oltre l\'orario contrattuale; senza tariffa la riga è da valorizzare', async () => {
      // paola: orario 4 ore, nessun ruolo → nessuna tariffa.
      const r = await come('paola').put(`${URL_C}/2026-03-02`, { versione: 0, righe: [{ progettoId: prog.A, minuti: 300 }] });
      expect(r.status).toBe(200);
      expect(r.body.avvisi).toEqual([{ data: '2026-03-02', messaggio: "ore ordinarie (5:00) oltre l'orario contrattuale di 4:00" }]);
      const doc = await db.collection('consuntivi').findOne({ risorsaId: oid(risorsa.paola) });
      expect(doc!.righe[0]).toMatchObject({ fonteTariffa: null, tariffaCentesimiOra: null, costoCentesimi: null });
    });

    it('più giornate in una transazione: un errore annulla tutto', async () => {
      const r = await come('rita').put(URL_C, {
        giornate: [
          { data: '2026-03-09', versione: 0, righe: [{ progettoId: prog.A, minuti: 480 }] },
          { data: '2026-03-10', versione: 0, righe: [{ progettoId: prog.C, minuti: 480 }] },
        ],
      });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/^2026-03-10/);
      expect((await leggi('rita', '2026-03-09', '2026-03-10')).body).toEqual([]);
      const ok = await come('rita').put(URL_C, {
        giornate: [
          { data: '2026-03-09', versione: 0, righe: [{ progettoId: prog.A, minuti: 480 }] },
          { data: '2026-03-10', versione: 0, righe: [{ attivitaId: att.SVI, minuti: 240 }, { progettoId: prog.B, minuti: 240 }] },
        ],
      });
      expect(ok.status).toBe(200);
      expect(ok.body.giornate.map((g: { data: string; totaleMinuti: number }) => [g.data, g.totaleMinuti])).toEqual([
        ['2026-03-09', 480],
        ['2026-03-10', 480],
      ]);
      // Una giornata svuotata resta con zero righe.
      const g = ok.body.giornate[0];
      expect((await come('rita').put(`${URL_C}/2026-03-09`, { versione: g.versione, righe: [] })).body.giornate[0]).toMatchObject({ totaleMinuti: 0, righe: [] });
    });

    it('righe non più in bozza (fase 3) non si modificano né si tolgono', async () => {
      await db.collection('consuntivi').updateOne({ risorsaId: oid(risorsa.rita), data: new Date('2026-03-10') }, { $set: { 'righe.0.stato': 'inviata' } });
      const g = (await leggi('rita', '2026-03-10', '2026-03-10')).body[0];
      const [inviata, bozza] = g.righe;
      const base = (x: typeof inviata) => ({ _id: x._id, progettoId: x.progettoId, attivitaId: x.attivitaId, tipologiaId: x.tipologiaId, minuti: x.minuti });
      expect((await come('rita').put(`${URL_C}/2026-03-10`, { versione: g.versione, righe: [base(bozza)] })).status).toBe(409);
      expect((await come('rita').put(`${URL_C}/2026-03-10`, { versione: g.versione, righe: [{ ...base(inviata), minuti: 60 }, base(bozza)] })).status).toBe(409);
      const ok = await come('rita').put(`${URL_C}/2026-03-10`, { versione: g.versione, righe: [base(inviata), { ...base(bozza), minuti: 300 }] });
      expect(ok.status).toBe(200);
    });

    it('voci e proposte: progetti non chiusi, attività attive, allocazioni e settimana precedente', async () => {
      const voci = (await come('rita').get(`${URL_C}/voci?da=2026-03-01&a=2026-03-31`)).body;
      expect(voci.map((p: { codice: string }) => p.codice)).toEqual(['PA', 'PB', 'PS']);
      expect(voci[0].attivita.map((a: { codice: string }) => a.codice)).toEqual(['SVI']);
      // carlo non lavora su nessun progetto: nessuna voce.
      expect((await come('carlo').get(`${URL_C}/voci?da=2026-03-01`)).body).toEqual([]);

      await db.collection<{ planned: Record<string, unknown>[] }>('risorse').updateOne(
        { _id: oid(risorsa.rita) },
        { $push: { planned: { $each: [{ mese: '202603', progettoId: oid(prog.B), percentualeAllocazione: 50 }, { mese: '202603', progettoId: oid(prog.C), percentualeAllocazione: 50 }] } } },
      );
      const p = (await come('rita').get(`${URL_C}/proposte?settimana=2026-03-11`)).body;
      expect(p.settimana).toBe('2026-03-09');
      // Settimana precedente (2-6 marzo): PA/SVI ord., PA straord., PB/COL ord., PS/SS1 ord.; poi PB dal Pianificatore. PC è chiuso.
      const chiavi = p.righe.map((r: { progetto: { codice: string }; attivita: { codice: string } | null; tipologiaCodice: string; origine: string }) =>
        `${r.progetto.codice}/${r.attivita?.codice ?? '-'}/${r.tipologiaCodice}/${r.origine}`,
      );
      expect(chiavi).toEqual(
        expect.arrayContaining(['PA/SVI/ORDINARIA/settimanaPrecedente', 'PA/-/STRAORDINARIA/settimanaPrecedente', 'PB/COL/ORDINARIA/settimanaPrecedente', 'PB/-/ORDINARIA/pianificatore']),
      );
      expect(chiavi.some((k: string) => k.startsWith('PC/'))).toBe(false);
    });

    it('attività non assegnate: si consuntiva con un avviso; le assegnate stanno in testa alle voci', async () => {
      await db.collection('attivita').updateOne({ _id: oid(att.COL) }, { $set: { risorseAssegnateIds: [oid(risorsa.rita)] } });
      const voci = (await come('rita').get(`${URL_C}/voci?da=2026-03-09&a=2026-03-15`)).body;
      expect(voci[0]).toMatchObject({ codice: 'PB', conAttivitaAssegnate: true });
      expect(voci[0].attivita[0]).toMatchObject({ codice: 'COL', assegnata: true });
      expect(voci.find((p: { codice: string }) => p.codice === 'PA').attivita[0]).toMatchObject({ codice: 'SVI', assegnata: false });
      // Per paola COL non è assegnata.
      expect((await come('paola').get(`${URL_C}/voci?da=2026-03-09`)).body.map((p: { codice: string }) => p.codice)).toEqual(['PA']);

      const r = await come('rita').put(`${URL_C}/2026-03-11`, {
        versione: 0,
        righe: [
          { attivitaId: att.COL, minuti: 240 },
          { attivitaId: att.SVI, minuti: 120 },
          { progettoId: prog.A, tipologiaId: tip.STRAORDINARIA, minuti: 60 },
        ],
      });
      expect(r.status).toBe(200);
      expect(r.body.avvisi).toEqual([{ data: '2026-03-11', messaggio: 'attività SVI del progetto PA: non risulti tra le risorse assegnate' }]);
      // Righe invariate: nessun nuovo avviso.
      const g = r.body.giornate[0];
      const righe = g.righe.map((x: { _id: string; progettoId: string; attivitaId: string | null; tipologiaId: string; minuti: number }) => ({
        _id: x._id,
        progettoId: x.progettoId,
        attivitaId: x.attivitaId,
        tipologiaId: x.tipologiaId,
        minuti: x.minuti,
      }));
      righe[2].minuti = 90;
      const r2 = await come('rita').put(`${URL_C}/2026-03-11`, { versione: g.versione, righe });
      expect(r2.status).toBe(200);
      expect(r2.body.avvisi).toEqual([]);
    });

    it('solo sui progetti su cui si lavora: attività assegnata, allocazione nel mese, approvatrice', async () => {
      const prova = (giorno: string, riga: object) => come('rita').put(`${URL_C}/${giorno}`, { versione: 0, righe: [riga] });
      const r = await prova('2026-03-12', { progettoId: prog.D, minuti: 60 });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/non lavori sul progetto PD/);
      // L'allocazione vale solo nel suo mese.
      await db.collection<{ planned: Record<string, unknown>[] }>('risorse').updateOne({ _id: oid(risorsa.rita) }, { $push: { planned: { mese: '202604', progettoId: oid(prog.D), percentualeAllocazione: 50 } } });
      expect((await prova('2026-03-12', { progettoId: prog.D, minuti: 60 })).status).toBe(400);
      expect((await prova('2026-04-01', { progettoId: prog.D, minuti: 60 })).status).toBe(200);
      // Un mese libero (percentuale assente) non conta.
      await db.collection<{ planned: Record<string, unknown>[] }>('risorse').updateOne({ _id: oid(risorsa.rita) }, { $push: { planned: { mese: '202603', progettoId: oid(prog.D) } } });
      expect((await prova('2026-03-12', { progettoId: prog.D, minuti: 60 })).status).toBe(400);
      // Assegnata a un'attività di PD: vale sempre, anche per le ore sul progetto.
      const altra = String(
        (await db.collection('attivita').insertOne({ progettoId: oid(prog.D), codice: 'D1', descrizione: 'D1', stato: 'attiva', percentualeCompletamento: 0, risorseAssegnateIds: [oid(risorsa.rita)] })).insertedId,
      );
      expect((await prova('2026-03-12', { progettoId: prog.D, minuti: 60 })).status).toBe(200);
      expect((await come('rita').get(`${URL_C}/voci?da=2026-03-12`)).body.map((p: { codice: string }) => p.codice)).toContain('PD');
      await db.collection('attivita').deleteOne({ _id: oid(altra) });
      // Le righe già salvate restano valide anche se il legame cade, finché non si cambiano.
      const g = (await leggi('rita', '2026-03-12', '2026-03-12')).body[0];
      const riga = g.righe[0];
      const base = { _id: riga._id, progettoId: riga.progettoId, attivitaId: riga.attivitaId, tipologiaId: riga.tipologiaId, minuti: riga.minuti };
      expect((await come('rita').put(`${URL_C}/2026-03-12`, { versione: g.versione, righe: [base] })).status).toBe(200);
      expect((await come('rita').put(`${URL_C}/2026-03-12`, { versione: g.versione + 1, righe: [{ ...base, minuti: 120 }] })).body.message).toMatch(/non lavori/);
    });


    describe('vincoli su Comuni e permessi (C4)', () => {
      beforeAll(async () => {
        // PA: tito TL e paola PM. rita ha ore su PA (2 marzo) ma da qui non vi è più allocata.
        await db.collection('progetti').updateOne(
          { _id: oid(prog.A) },
          { $set: { approvatori: [{ risorsaId: oid(risorsa.tito), profilo: 'TL' }, { risorsaId: oid(risorsa.paola), profilo: 'PM' }] } },
        );
        await db.collection('risorse').updateOne(
          { _id: oid(risorsa.rita) },
          { $set: { planned: [{ mese: '202603', progettoId: oid(prog.S), percentualeAllocazione: 20 }] } },
        );
      });

      it('il centro di costo di un progetto con ore consuntivate non cambia più', async () => {
        const nuovo = String((await db.collection('centri_costo').insertOne({ codice: 'CDC2', descrizione: 'Manutenzione', attivo: true })).insertedId);
        expect((await come('paola').get(`/api/comuni/progetti/${prog.A}`)).body.conConsuntivi).toBe(true);
        const r = await come('paola').put(`/api/comuni/progetti/${prog.A}`, { centroCostoId: nuovo });
        expect(r.status).toBe(409);
        expect(r.body.message).toMatch(/ore consuntivate/);
        // Lo stesso centro di costo si può rimandare (la pagina manda sempre tutto il progetto).
        const ok = await come('paola').put(`/api/comuni/progetti/${prog.A}`, { centroCostoId: cdc, descrizione: 'ok' });
        expect(ok.status).toBe(200);
        // Un progetto senza ore lo cambia ancora.
        const pe = String(
          (
            await db.collection('progetti').insertOne({
              codice: 'PE',
              titolo: 'Progetto PE',
              centroCostoId: oid(cdc),
              stato: 'inCorso',
              dataInizio: new Date('2026-01-01'),
              approvatori: [{ risorsaId: oid(risorsa.paola), profilo: 'PM' }],
              percentualeCompletamento: 0,
            })
          ).insertedId,
        );
        expect((await come('paola').get(`/api/comuni/progetti/${pe}`)).body.conConsuntivi).toBe(false);
        expect((await come('paola').put(`/api/comuni/progetti/${pe}`, { centroCostoId: nuovo })).status).toBe(200);
      });

      it('ognuno cura le proprie skill e certificazioni, dal catalogo; non le proprie allocazioni', async () => {
        await db.collection('skills').insertMany([{ skillName: 'NestJS', skillType: 'tecnico' }, { skillName: 'Banche', skillType: 'ambito' }]);
        await db.collection('certificazioni').insertOne({ certName: 'PMP', certType: 'project management' });
        const url = (r: string) => `/api/pianificatore/risorse/${r}`;
        const io = (await come('carlo').get(url(risorsa.carlo))).body;
        const ok = await come('carlo').put(url(risorsa.carlo), {
          ...io,
          skillTecnici: [{ skillName: 'NestJS', rate: 'buono' }],
          skillAmbiti: [{ skillName: 'Banche' }],
          certificazioni: [{ certName: 'PMP', conseguitaIl: '2024-05-10', scadenza: '2027-05-10' }],
        });
        expect(ok.status).toBe(200);
        expect(ok.body.certificazioni).toEqual([{ certName: 'PMP', conseguitaIl: '2024-05-10', scadenza: '2027-05-10' }]);
        // Livello cambiato e cancellazione: sì.
        expect((await come('carlo').put(url(risorsa.carlo), { ...ok.body, skillTecnici: [{ skillName: 'NestJS', rate: 'ottimo' }], skillAmbiti: [] })).status).toBe(200);
        // Voci fuori catalogo: no (per PM e PMSenior il catalogo resta un suggerimento).
        const r1 = await come('carlo').put(url(risorsa.carlo), { ...ok.body, skillTecnici: [{ skillName: 'Cobol' }] });
        expect(r1.status).toBe(400);
        expect(r1.body.message).toMatch(/Cobol non è nel catalogo/);
        expect((await come('carlo').put(url(risorsa.carlo), { ...ok.body, certificazioni: [{ certName: 'ITIL' }] })).status).toBe(400);
        expect((await come('carlo').put(url(risorsa.carlo), { ...ok.body, certificazioni: [{ certName: 'PMP', scadenza: '10/05/2027' }] })).status).toBe(400);
        // Le proprie allocazioni no; le competenze degli altri no.
        const r2 = await come('carlo').put(url(risorsa.carlo), { ...ok.body, planned: [{ mese: '202701', progettoId: prog.A, percentualeAllocazione: 50 }] });
        expect(r2.status).toBe(403);
        expect(r2.body.message).toMatch(/tue allocazioni/);
        const altra = (await come('carlo').get(url(risorsa.paola))).body;
        expect((await come('carlo').put(url(risorsa.paola), { ...altra, skillTecnici: [{ skillName: 'NestJS' }] })).status).toBe(403);
      });

      it('il TL modifica le skill delle risorse con ore sui suoi progetti, anche se non allocate', async () => {
        const url = (r: string) => `/api/pianificatore/risorse/${r}`;
        const r = (await come('tito').get(url(risorsa.rita))).body;
        expect(r.progettiConsuntivati).toContain(prog.A);
        expect((await come('tito').put(url(risorsa.rita), { ...r, skillTecnici: [{ skillName: 'NestJS' }] })).status).toBe(200);
        // carlo non ha ore né allocazioni sui progetti di tito.
        const c = (await come('tito').get(url(risorsa.carlo))).body;
        expect(c.progettiConsuntivati).toEqual([]);
        expect((await come('tito').put(url(risorsa.carlo), { ...c, skillTecnici: [{ skillName: 'NestJS' }] })).status).toBe(403);
      });
    });

    it('chi non ha una risorsa non consuntiva; senza accesso 401', async () => {
      expect((await api().get(`${URL_C}?da=${LUN}&a=${LUN}`)).status).toBe(401);
      expect((await api().put(`${URL_C}/${LUN}`).send({ versione: 0, righe: [] })).status).toBe(401);
      expect((await leggi('rita', '2026-01-01', '2026-06-30')).status).toBe(400);
    });
  });
});
