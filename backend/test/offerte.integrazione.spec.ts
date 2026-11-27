/**
 * Test di integrazione della fase 5 (Offerte e preventivi) contro un MongoDB vero (replica set).
 * F0: migrazione 011 (collection, validatori, indici, parametro "offerte"), parametro modificabile dal controller,
 * ruolo globale commerciale assegnato dall'amministratore e permessi della sezione in /api/auth/me.
 * F1: listino di vendita (permessi, sovrapposizioni, storico) e tariffe applicabili alla data.
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
  describe('F1 — listino di vendita', () => {
    const ruolo: Record<string, mongoose.Types.ObjectId> = {};
    const cliente: Record<string, mongoose.Types.ObjectId> = {};
    const invia = (chi: string, metodo: 'post' | 'put' | 'delete', url: string, corpo?: unknown) =>
      api()[metodo](url).set('Cookie', cookie[chi]).send(corpo as object);

    beforeAll(async () => {
      for (const [k, codice, descrizione] of [['svil', 'SVIL-SR', 'Sviluppatore senior'], ['pm', 'PM', 'Project manager'], ['tester', 'TEST', 'Tester']]) {
        ruolo[k] = (await db.collection('ruoli').insertOne({ codice, descrizione, attivo: true })).insertedId;
      }
      for (const [k, codice] of [['acme', 'ACME'], ['beta', 'BETA']]) {
        cliente[k] = (await db.collection('clienti').insertOne({ codice, ragioneSociale: `${codice} S.p.A.`, attivo: true })).insertedId;
      }
      const ordinaria = await db.collection('tipologie_costo').findOne({ codice: 'ORDINARIA' });
      const straord = await db.collection('tipologie_costo').findOne({ codice: 'STRAORDINARIA' });
      await db.collection('tariffe_standard').insertMany([
        { ruoloId: ruolo.svil, tipologiaId: ordinaria!._id, validoDal: new Date('2026-01-01'), validoAl: null, centesimiOra: 3500 },
        { ruoloId: ruolo.pm, tipologiaId: straord!._id, validoDal: new Date('2026-01-01'), validoAl: null, centesimiOra: 6000 },
      ]);
    });

    it('PMSenior e controller gestiscono il listino; commerciali e PM lo leggono; gli altri no', async () => {
      const voce = { ruoloId: ruolo.svil.toHexString(), clienteId: null, validoDal: '2026-01-01', validoAl: '2026-12-31', centesimiGiorno: 45000 };
      expect((await invia('cora', 'post', '/api/offerte/listino', voce)).status).toBe(403);
      expect((await invia('paola', 'post', '/api/offerte/listino', voce)).status).toBe(403);
      const r = await invia('sara', 'post', '/api/offerte/listino', voce);
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ clienteId: null, centesimiGiorno: 45000 });
      expect((await invia('carlo', 'post', '/api/offerte/listino', { ...voce, ruoloId: ruolo.pm.toHexString(), validoAl: null, centesimiGiorno: 60000 })).status).toBe(201);
      for (const chi of ['cora', 'paola', 'sara', 'carlo']) expect((await come(chi, '/api/offerte/listino')).body).toHaveLength(2);
      expect((await come('tito', '/api/offerte/listino')).status).toBe(403);
      expect((await come('adele', '/api/offerte/listino')).status).toBe(403);
    });

    it('controlla dati e sovrapposizioni per ruolo e cliente; ruolo e cliente non cambiano', async () => {
      const base = { ruoloId: ruolo.svil.toHexString(), clienteId: null, validoDal: '2026-06-01', validoAl: null, centesimiGiorno: 47000 };
      const conflitto = await invia('sara', 'post', '/api/offerte/listino', base);
      expect(conflitto.status).toBe(409);
      expect(conflitto.body.message).toMatch(/sovrapposto.*listino standard/);
      expect((await invia('sara', 'post', '/api/offerte/listino', { ...base, validoDal: '2027-01-01' })).status).toBe(201);
      const acme = await invia('sara', 'post', '/api/offerte/listino', { ...base, clienteId: cliente.acme.toHexString(), validoAl: '2026-12-31', centesimiGiorno: 42000 });
      expect(acme.status).toBe(201);
      expect((await invia('sara', 'post', '/api/offerte/listino', { ...base, clienteId: cliente.acme.toHexString(), validoDal: '2026-12-01' })).status).toBe(409);
      expect((await invia('sara', 'post', '/api/offerte/listino', { ...base, validoDal: '2028-01-01', validoAl: '2027-12-31' })).status).toBe(400);
      expect((await invia('sara', 'post', '/api/offerte/listino', { ...base, validoDal: '2028-01-01', centesimiGiorno: 12.5 })).status).toBe(400);
      expect((await invia('sara', 'post', '/api/offerte/listino', { ...base, validoDal: '2028-01-01', clienteId: new mongoose.Types.ObjectId().toHexString() })).status).toBe(400);
      expect((await invia('sara', 'post', '/api/offerte/listino', { ...base, validoDal: '2028-01-01', ruoloId: new mongoose.Types.ObjectId().toHexString() })).status).toBe(400);
      const id = acme.body._id as string;
      expect((await invia('sara', 'put', `/api/offerte/listino/${id}`, { clienteId: cliente.beta.toHexString() })).status).toBe(409);
      expect((await invia('paola', 'put', `/api/offerte/listino/${id}`, { centesimiGiorno: 1 })).status).toBe(403);
      const m = await invia('carlo', 'put', `/api/offerte/listino/${id}`, { centesimiGiorno: 43000, clienteId: cliente.acme.toHexString() });
      expect(m.status).toBe(200);
      expect(m.body.centesimiGiorno).toBe(43000);
      expect((await come('paola', `/api/offerte/listino?cliente=${cliente.acme.toHexString()}`)).body).toHaveLength(1);
      expect((await come('paola', '/api/offerte/listino?cliente=standard')).body).toHaveLength(3);
      expect((await come('paola', `/api/offerte/listino?ruolo=${ruolo.svil.toHexString()}`)).body).toHaveLength(3);
      const storico = await db.collection('audit_log').find({ collezione: 'listino_vendita', documentoId: id }).toArray();
      expect(storico.map((v) => v.operazione as string).sort((a, b) => a.localeCompare(b))).toEqual(['creazione', 'modifica']);
    });

    it('tariffe applicabili alla data: cliente, poi standard; costo giornaliero a chi legge il listino', async () => {
      const url = (c: string, d: string) => `/api/offerte/listino/applicabili?cliente=${c}&data=${d}`;
      const r = await come('sara', url(cliente.acme.toHexString(), '2026-07-15'));
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ data: '2026-07-15', clienteId: cliente.acme.toHexString(), oreGiorno: 8, senzaVendita: 1, senzaCosto: 2 });
      const per = (b: { ruoli: { ruoloCodice: string }[] }, c: string) => b.ruoli.find((x) => x.ruoloCodice === c) as Record<string, unknown>;
      expect(per(r.body, 'SVIL-SR')).toMatchObject({ vendita: { fonte: 'cliente', centesimiGiorno: 43000 }, costoPresente: true, costoCentesimiGiorno: 28000, costoValidoDal: '2026-01-01', costoValidoAl: null });
      expect(per(r.body, 'PM')).toMatchObject({ vendita: { fonte: 'standard', centesimiGiorno: 60000 }, costoPresente: false, costoCentesimiGiorno: null, costoValidoDal: null });
      expect(per(r.body, 'TEST')).toMatchObject({ vendita: { fonte: null, centesimiGiorno: null }, costoPresente: false });
      const beta = await come('cora', url(cliente.beta.toHexString(), '2027-02-01'));
      expect(per(beta.body, 'SVIL-SR')).toMatchObject({ vendita: { fonte: 'standard', centesimiGiorno: 47000 }, costoPresente: true, costoCentesimiGiorno: 28000 });
      expect(per((await come('paola', url(cliente.acme.toHexString(), '2026-07-15'))).body, 'SVIL-SR')).toMatchObject({ costoCentesimiGiorno: 28000 });
      expect((await come('paola', url('standard', '2026-07-15'))).body.clienteId).toBeNull();
      expect((await come('paola', url(new mongoose.Types.ObjectId().toHexString(), '2026-07-15'))).status).toBe(404);
      expect((await come('tito', url('standard', '2026-07-15'))).status).toBe(403);
    });

    it('cancella una voce con traccia nello storico', async () => {
      const voci = (await come('sara', `/api/offerte/listino?ruolo=${ruolo.pm.toHexString()}`)).body as { _id: string }[];
      expect((await invia('paola', 'delete', `/api/offerte/listino/${voci[0]._id}`)).status).toBe(403);
      expect((await invia('sara', 'delete', `/api/offerte/listino/${voci[0]._id}`)).status).toBe(204);
      expect((await invia('sara', 'delete', `/api/offerte/listino/${voci[0]._id}`)).status).toBe(404);
      expect(await db.collection('audit_log').countDocuments({ collezione: 'listino_vendita', operazione: 'cancellazione' })).toBe(1);
      const storico = await come('sara', '/api/consuntivazione/storico?collezione=listino_vendita');
      expect(storico.status).toBe(200);
      const documenti = (storico.body.voci ?? storico.body) as { documento: string; operazione: string }[];
      expect(documenti.find((v) => v.operazione === 'cancellazione')?.documento).toBe('PM · standard · dal 01/01/2026');
      expect(documenti.map((v) => v.documento)).toContain('SVIL-SR · ACME · dal 01/06/2026');
    });
  });
});
