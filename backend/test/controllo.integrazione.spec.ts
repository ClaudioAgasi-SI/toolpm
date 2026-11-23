/**
 * Test di integrazione della fase 3 (Controllo) contro un MongoDB vero (replica set).
 * D0: migrazione 008 (periodi, audit_log), storico delle modifiche dentro le transazioni, permessi.
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

  const PERSONE = [
    { nome: 'paola', abilitazione: 'PM', ruoli: ['risorsa'] },
    { nome: 'rita', abilitazione: null, ruoli: ['risorsa'] },
    { nome: 'carlo', abilitazione: null, ruoli: ['risorsa', 'controller'] },
    { nome: 'tito', abilitazione: 'TL', ruoli: ['risorsa'] },
  ];

  const api = () => request(app.getHttpServer());
  const come = (chi: string) => ({
    get: (url: string) => api().get(url).set('Cookie', cookie[chi]),
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
});
