/**
 * Test di integrazione della fase 3 (Controllo) contro un MongoDB vero (replica set).
 * D0: migrazione 008 (periodi, audit_log), storico delle modifiche dentro le transazioni, permessi.
 * D1: invio e ritiro delle giornate, righe non modificabili dopo l'invio, righe respinte, storico.
 *
 * Si esegue solo se è impostata MONGODB_URI_TEST, es.:
 *   MONGODB_URI_TEST="mongodb://localhost:27017/?directConnection=true" npm test
 * Ogni esecuzione usa un database nuovo (toolpm_test_<numero>) e lo cancella alla fine.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';
import request from 'supertest';
import { cifraPassword } from '../src/auth/password.js';
import { AuditService } from '../src/infrastruttura/audit.service.js';
import { eseguiCome } from '../src/infrastruttura/contesto-utente.js';

const URI_BASE = process.env.MONGODB_URI_TEST;
const NOME_DB = `toolpm_test_${Date.now()}_ctrl`;
const CARTELLA = join(import.meta.dirname, '../scripts/migrazioni');
const CONTESTO = () => ({ utente: 'sistema:test', ora: new Date() });

describe.skipIf(!URI_BASE)('Controllo (fase 3) con MongoDB vero', () => {
  let app: INestApplication;
  let client: mongoose.mongo.MongoClient;
  let db: mongoose.mongo.Db;
  const cookie: Record<string, string> = {};
  const risorsa: Record<string, string> = {};
  const oid = (x: string) => new mongoose.Types.ObjectId(x);

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
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
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

  describe('D0 — migrazione 008-controllo', () => {
    it('crea periodi e audit_log con i validatori', async () => {
      const nomi = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
      expect(nomi).toEqual(expect.arrayContaining(['periodi', 'audit_log']));
      await expect(db.collection('periodi').insertOne({ mese: '2026-11', stato: 'chiuso' })).rejects.toThrow(/validation/);
      await expect(db.collection('periodi').insertOne({ mese: '202611', stato: 'sospeso' })).rejects.toThrow(/validation/);
      await expect(db.collection('audit_log').insertOne({ collezione: 'consuntivi', operazione: 'invio' })).rejects.toThrow(/validation/);
    });

    it('un solo documento per mese', async () => {
      await db.collection('periodi').insertOne({ mese: '202001', stato: 'aperto' });
      await expect(db.collection('periodi').insertOne({ mese: '202001', stato: 'chiuso' })).rejects.toThrow(/duplicate key/);
      await db.collection('periodi').deleteMany({});
    });

    it('si può rieseguire', async () => {
      const m = await import(pathToFileURL(join(CARTELLA, '008-controllo.mjs')).href);
      const esito = await m.esegui(db, CONTESTO());
      expect(esito.validatori).toEqual(['periodi', 'audit_log']);
    });
  });

  describe('D0 — storico delle modifiche', () => {
    it('registra utente, data, prima e dopo, con i campi di tracciamento', async () => {
      const audit = app.get(AuditService);
      await eseguiCome('sistema:prova', () =>
        audit.registra({ collezione: 'consuntivi', documentoId: 'g1', righeIds: ['r1', 'r2'], operazione: 'invio', prima: { stato: 'bozza' }, dopo: { stato: 'inviata' } }),
      );
      const [voce] = await audit.cronologia('consuntivi', 'g1', 'r2');
      expect(voce).toMatchObject({ utente: 'sistema:prova', operazione: 'invio', righeIds: ['r1', 'r2'], prima: { stato: 'bozza' }, dopo: { stato: 'inviata' }, creatoDa: 'sistema:prova' });
      expect(voce.il).toBeInstanceOf(Date);
      expect(await audit.cronologia('consuntivi', 'g1', 'r3')).toHaveLength(0);
    });

    it('nella transazione: se la modifica fallisce, lo storico non resta', async () => {
      const audit = app.get(AuditService);
      const connessione = app.get<mongoose.Connection>(getConnectionToken());
      await expect(
        connessione.transaction(async (session) => {
          await audit.registra({ collezione: 'tariffe_standard', documentoId: 't1', operazione: 'modifica' }, session);
          throw new Error('modifica fallita');
        }),
      ).rejects.toThrow('modifica fallita');
      expect(await audit.cronologia('tariffe_standard', 't1')).toHaveLength(0);
    });
  });

  describe('D0 — permessi', () => {
    it('approvare a chi ha un\'abilitazione, gestirePeriodi al controller', async () => {
      const permessi = async (chi: string) => (await come(chi).get('/api/auth/me')).body.permessi as Record<string, boolean>;
      expect((await permessi('paola')).approvare).toBe(true);
      expect((await permessi('tito')).approvare).toBe(true);
      expect((await permessi('rita')).approvare).toBe(false);
      expect((await permessi('carlo')).gestirePeriodi).toBe(true);
      expect((await permessi('paola')).gestirePeriodi).toBe(false);
    });
  });

  describe('D1 — invio e ritiro', () => {
    const URL = '/api/consuntivazione/consuntivi';
    const LUN = '2026-03-02';
    const MAR = '2026-03-03';
    const MER = '2026-03-04';
    let svi = '';
    let straordinaria = '';
    const giornata = async (data: string) => (await come('rita').get(`${URL}?da=${data}&a=${data}`)).body[0];
    const salva = async (data: string, righe: object[]) => {
      const g = await giornata(data);
      return come('rita').put(`${URL}/${data}`, { versione: g?.versione ?? 0, righe });
    };
    const rif = async (...date: string[]) => Promise.all(date.map(async (d) => ({ data: d, versione: (await giornata(d))?.versione ?? 0 })));

    beforeAll(async () => {
      for (const t of (await come('rita').get('/api/consuntivazione/tipologie-costo')).body) {
        if (t.codice === 'STRAORDINARIA') straordinaria = t._id;
      }
      const cdc = (await db.collection('centri_costo').insertOne({ codice: 'CDC1', descrizione: 'Sviluppo', attivo: true })).insertedId;
      const pa = (
        await db.collection('progetti').insertOne({
          codice: 'PA',
          titolo: 'Progetto PA',
          centroCostoId: cdc,
          stato: 'inCorso',
          dataInizio: new Date('2026-01-01'),
          approvatori: [{ risorsaId: oid(risorsa.paola), profilo: 'PM' }, { risorsaId: oid(risorsa.tito), profilo: 'TL' }],
          percentualeCompletamento: 0,
          soloSuAttivita: false,
        })
      ).insertedId;
      svi = String(
        (
          await db.collection('attivita').insertOne({
            progettoId: pa,
            codice: 'SVI',
            descrizione: 'Sviluppo',
            stato: 'attiva',
            percentualeCompletamento: 0,
            risorseAssegnateIds: [oid(risorsa.rita)],
          })
        ).insertedId,
      );
      for (const d of [LUN, MAR]) expect((await salva(d, [{ attivitaId: svi, minuti: 480 }])).status).toBe(200);
      expect((await salva(MER, [{ attivitaId: svi, minuti: 420 }, { attivitaId: svi, tipologiaId: straordinaria, minuti: 60 }])).status).toBe(200);
    });

    it('invia le giornate indicate: tutte le righe in bozza passano a inviata, con lo storico', async () => {
      const r = await come('rita').post(`${URL}/invio`, { giornate: await rif(LUN, MER) });
      expect(r.status).toBe(200);
      expect(r.body.righe).toBe(3);
      expect(r.body.giorni).toEqual([LUN, MER]);
      expect(r.body.giornate.flatMap((g: { righe: { stato: string }[] }) => g.righe.map((x) => x.stato))).toEqual(['inviata', 'inviata', 'inviata']);
      expect((await giornata(MAR)).righe[0].stato).toBe('bozza');
      const voci = await db.collection('audit_log').find({ collezione: 'consuntivi', operazione: 'invio', documentoId: { $ne: 'g1' } }).toArray();
      expect(voci).toHaveLength(2);
      expect(voci.find((v) => v.righeIds.length === 2)).toMatchObject({ utente: expect.any(String), dopo: { stato: 'inviata' } });
    });

    it('le righe inviate non si modificano né si cancellano; se ne aggiungono di nuove in bozza', async () => {
      const g = await giornata(LUN);
      const inviata = g.righe[0];
      const cambiata = await come('rita').put(`${URL}/${LUN}`, { versione: g.versione, righe: [{ _id: inviata._id, attivitaId: svi, minuti: 240 }] });
      expect(cambiata.status).toBe(409);
      expect(cambiata.body.message).toMatch(/inviata e non si modifica/);
      const tolta = await come('rita').put(`${URL}/${LUN}`, { versione: g.versione, righe: [] });
      expect(tolta.status).toBe(409);
      const aggiunta = await come('rita').put(`${URL}/${LUN}`, {
        versione: g.versione,
        righe: [{ _id: inviata._id, attivitaId: svi, minuti: 480 }, { attivitaId: svi, tipologiaId: straordinaria, minuti: 60 }],
      });
      expect(aggiunta.status).toBe(200);
      expect((await giornata(LUN)).righe.map((x: { stato: string }) => x.stato)).toEqual(['inviata', 'bozza']);
    });

    it('versione cambiata: 409 e non parte nulla', async () => {
      const r = await come('rita').post(`${URL}/invio`, { giornate: [{ data: MAR, versione: 99 }, ...(await rif(LUN))] });
      expect(r.status).toBe(409);
      expect((await giornata(LUN)).righe[1].stato).toBe('bozza');
      expect((await giornata(MAR)).righe[0].stato).toBe('bozza');
    });

    it('giorni senza righe da inviare si saltano; dati non validi: 400', async () => {
      const r = await come('rita').post(`${URL}/invio`, { giornate: [{ data: '2026-03-05', versione: 0 }] });
      expect(r.status).toBe(200);
      expect(r.body.righe).toBe(0);
      expect((await come('rita').post(`${URL}/invio`, { giornate: [] })).status).toBe(400);
      expect((await come('rita').post(`${URL}/invio`, { giornate: [{ data: LUN }] })).status).toBe(400);
      expect((await come('rita').post(`${URL}/invio`, { giornate: [{ data: LUN, versione: 1 }, { data: LUN, versione: 1 }] })).status).toBe(400);
    });

    it('ritiro: le righe ancora inviate tornano in bozza, quelle con via libera no', async () => {
      // Il via libera arriva con il blocco D2: qui lo simulo sul database.
      const g = await db.collection('consuntivi').findOne({ risorsaId: oid(risorsa.rita), data: new Date(MER) });
      await db.collection('consuntivi').updateOne(
        { _id: g!._id },
        { $set: { 'righe.0.stato': 'approvataTL', 'righe.0.approvazioneTL': { da: 'u-tito', il: new Date() } }, $inc: { versione: 1 } },
      );
      const r = await come('rita').post(`${URL}/ritiro`, { giornate: await rif(LUN, MER) });
      expect(r.status).toBe(200);
      expect(r.body.righe).toBe(2);
      expect((await giornata(LUN)).righe.map((x: { stato: string }) => x.stato)).toEqual(['bozza', 'bozza']);
      expect((await giornata(MER)).righe.map((x: { stato: string }) => x.stato)).toEqual(['approvataTL', 'bozza']);
      expect(await db.collection('audit_log').countDocuments({ operazione: 'ritiro' })).toBe(2);
    });

    it('riga respinta: si corregge restando respinta con la motivazione; al nuovo invio la perde, lo storico la conserva', async () => {
      const g = await db.collection('consuntivi').findOne({ risorsaId: oid(risorsa.rita), data: new Date(MAR) });
      await db.collection('consuntivi').updateOne(
        { _id: g!._id },
        { $set: { 'righe.0.stato': 'respinta', 'righe.0.rifiuto': { da: 'u-paola', il: new Date(), motivazione: 'Erano 7 ore' } }, $inc: { versione: 1 } },
      );
      const letta = await giornata(MAR);
      expect(letta.righe[0]).toMatchObject({ stato: 'respinta', rifiuto: { motivazione: 'Erano 7 ore' } });
      expect((await come('rita').put(`${URL}/${MAR}`, { versione: letta.versione, righe: [{ _id: letta.righe[0]._id, attivitaId: svi, minuti: 420 }] })).status).toBe(200);
      expect((await giornata(MAR)).righe[0]).toMatchObject({ stato: 'respinta', minuti: 420, rifiuto: { motivazione: 'Erano 7 ore' } });

      expect((await come('rita').get(`${URL}/da-inviare`)).body).toEqual({ bozza: 3, respinte: 1, primaData: LUN });
      const r = await come('rita').post(`${URL}/invio`, { giornate: await rif(MAR) });
      expect(r.body.righe).toBe(1);
      expect((await giornata(MAR)).righe[0]).toMatchObject({ stato: 'inviata', rifiuto: null });
      const voce = await db.collection('audit_log').findOne({ operazione: 'invio', righeIds: letta.righe[0]._id });
      expect(voce?.prima[0]).toMatchObject({ stato: 'respinta', minuti: 420, rifiuto: { motivazione: 'Erano 7 ore' } });
    });

    it('solo chi ha una risorsa, per sé: le righe sono sempre quelle dell\'utente', async () => {
      const r = await come('paola').post(`${URL}/invio`, { giornate: [{ data: LUN, versione: 0 }] });
      expect(r.status).toBe(200);
      expect(r.body.righe).toBe(0);
      expect((await giornata(LUN)).righe[0].stato).toBe('bozza');
    });
  });
});
