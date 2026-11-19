/**
 * Test di integrazione del modulo Comuni (fase 1, blocco B4) con permessi (B3) e autenticazione (B2),
 * contro un MongoDB vero (replica set: servono le transazioni).
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
const NOME_DB = `toolpm_test_${Date.now()}`;

/** URI con il nome del database di prova al posto di quello indicato. */
function uriDiProva(base: string) {
  const url = new URL(base);
  url.pathname = `/${NOME_DB}`;
  return url.toString();
}

describe.skipIf(!URI_BASE)('Modulo Comuni con MongoDB vero', () => {
  let app: INestApplication;
  let db: mongoose.mongo.Db;
  let client: mongoose.mongo.MongoClient;
  const cookie: Record<string, string> = {};
  const risorsa: Record<string, string> = {};

  const PERSONE = [
    { nome: 'sara', abilitazione: 'PMSenior', ruoli: ['risorsa'] },
    { nome: 'paola', abilitazione: 'PM', ruoli: ['risorsa'] },
    { nome: 'piero', abilitazione: 'PM', ruoli: ['risorsa'] },
    { nome: 'tullio', abilitazione: 'TL', ruoli: ['risorsa'] },
    { nome: 'rita', abilitazione: null, ruoli: ['risorsa'] },
    { nome: 'carlo', abilitazione: null, ruoli: ['risorsa', 'controller'] },
    { nome: 'ada', abilitazione: null, ruoli: ['admin'], senzaRisorsa: true },
  ];

  const api = () => request(app.getHttpServer());
  const come = (chi: string) => ({
    get: (url: string) => api().get(url).set('Cookie', cookie[chi]),
    post: (url: string, body?: object) => api().post(url).set('Cookie', cookie[chi]).send(body ?? {}),
    put: (url: string, body?: object) => api().put(url).set('Cookie', cookie[chi]).send(body ?? {}),
    delete: (url: string) => api().delete(url).set('Cookie', cookie[chi]),
  });

  beforeAll(async () => {
    process.env.MONGODB_URI = uriDiProva(URI_BASE!);
    process.env.JWT_SECRET = 'segreto-dei-test';
    delete process.env.ADMIN_EMAIL;

    // Migrazioni vere (indici e validatori), come con npm run migra.
    client = await mongoose.mongo.MongoClient.connect(process.env.MONGODB_URI);
    db = client.db(NOME_DB);
    const cartella = join(import.meta.dirname, '../scripts/migrazioni');
    for (const f of readdirSync(cartella).filter((n) => /^\d{3}-.+\.mjs$/.test(n)).sort()) {
      const m = await import(pathToFileURL(join(cartella, f)).href);
      await m.esegui(db, { utente: 'sistema:test', ora: new Date() });
    }

    // Persone di prova: risorsa + utente con password.
    const hash = await cifraPassword('password-di-prova');
    for (const p of PERSONE) {
      let risorsaId: mongoose.Types.ObjectId | undefined;
      if (!p.senzaRisorsa) {
        risorsaId = (await db.collection('risorse').insertOne({ cognome: p.nome, nome: p.nome, email: `${p.nome}@prova.it` })).insertedId;
        risorsa[p.nome] = String(risorsaId);
      }
      await db.collection('utenti').insertOne({
        email: `${p.nome}@prova.it`,
        passwordHash: hash,
        abilitazione: p.abilitazione,
        ruoli: p.ruoli,
        attivo: true,
        deveCambiarePassword: false,
        ...(risorsaId ? { risorsaId } : {}),
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

  it('senza accesso le API dei Comuni rispondono 401; /api/auth/me riporta i permessi', async () => {
    expect((await api().get('/api/comuni/progetti')).status).toBe(401);
    expect((await api().get('/api/comuni/clienti')).status).toBe(401);
    const me = await come('paola').get('/api/auth/me');
    expect(me.body.permessi).toMatchObject({ creareProgetto: true, gestireRisorse: true, gestireClienti: false });
  });

  let cdc: string;
  let cliente: string;
  let ruolo: string;

  it('clienti e centri di costo: solo PMSenior; codice unico e non modificabile', async () => {
    expect((await come('paola').post('/api/comuni/clienti', { codice: 'TIM', ragioneSociale: 'TIM' })).status).toBe(403);
    const c = await come('sara').post('/api/comuni/clienti', { codice: 'TIM', ragioneSociale: 'Telecom Italia' });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ codice: 'TIM', attivo: true, creatoDa: expect.any(String) });
    cliente = c.body._id;
    expect((await come('sara').post('/api/comuni/clienti', { codice: 'TIM', ragioneSociale: 'Altro' })).status).toBe(409);
    expect((await come('sara').put(`/api/comuni/clienti/${cliente}`, { codice: 'TIM2' })).status).toBe(409);
    expect((await come('sara').post('/api/comuni/clienti', { codice: 'con spazi', ragioneSociale: 'X' })).status).toBe(400);

    const centro = await come('sara').post('/api/comuni/centri-costo', { codice: 'CDC-SVIL', descrizione: 'Sviluppo' });
    expect(centro.status).toBe(201);
    cdc = centro.body._id;
    expect((await come('rita').get('/api/comuni/centri-costo')).body).toHaveLength(1);
  });

  it('ruoli: solo admin; risorse: PM e PMSenior, email obbligatoria e unica', async () => {
    expect((await come('sara').post('/api/comuni/ruoli', { codice: 'SVIL', descrizione: 'Sviluppatore' })).status).toBe(403);
    const r = await come('ada').post('/api/comuni/ruoli', { codice: 'SVIL', descrizione: 'Sviluppatore' });
    expect(r.status).toBe(201);
    ruolo = r.body._id;

    const nuova = { cognome: 'Rossi', nome: 'Mario', email: 'Mario.Rossi@Prova.it', storicoRuoli: [{ ruoloId: ruolo, dal: '2024-03-01' }] };
    expect((await come('tullio').post('/api/comuni/risorse', nuova)).status).toBe(403);
    const creata = await come('paola').post('/api/comuni/risorse', nuova);
    expect(creata.status).toBe(201);
    expect(creata.body).toMatchObject({ email: 'mario.rossi@prova.it', storicoRuoli: [{ ruoloId: ruolo }] });
    risorsa.mario = creata.body._id;
    expect((await come('paola').post('/api/comuni/risorse', { ...nuova, storicoRuoli: [] })).status).toBe(409);
    expect((await come('paola').post('/api/comuni/risorse', { cognome: 'X', nome: 'Y' })).status).toBe(400);
    expect((await come('paola').post('/api/comuni/risorse', { cognome: 'X', nome: 'Y', email: 'non-valida' })).status).toBe(400);
    const modificata = await come('paola').put(`/api/comuni/risorse/${risorsa.mario}`, { oreContrattualiGiorno: 6, cellulare: '333' });
    expect(modificata.body).toMatchObject({ oreContrattualiGiorno: 6, cellulare: '333', email: 'mario.rossi@prova.it' });
    // L'indice unico vale anche nel database, non solo nel controllo del servizio.
    await expect(db.collection('risorse').insertOne({ cognome: 'Z', nome: 'Z', email: 'mario.rossi@prova.it' })).rejects.toThrow(/duplicate key/);
  });

  it('il PUT del Pianificatore non cancella i dati anagrafici', async () => {
    const r = await come('paola').put(`/api/pianificatore/risorse/${risorsa.mario}`, { cognome: 'Rossi', nome: 'Mario', skillTecnici: [{ skillName: 'java' }] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ email: 'mario.rossi@prova.it', oreContrattualiGiorno: 6, skillTecnici: [{ skillName: 'java' }] });
  });

  let progetto: string;

  it('progetto creato da un TL: diventa approvatore TL; stime in euro solo a chi gestisce il progetto', async () => {
    expect((await come('rita').post('/api/comuni/progetti', { codice: 'P1', titolo: 'P1', centroCostoId: cdc })).status).toBe(403);
    const p = await come('tullio').post('/api/comuni/progetti', {
      codice: 'TIMBUFE',
      titolo: 'TIM — front end Business',
      clienteId: cliente,
      centroCostoId: cdc,
      stime: { managerialeGiorni: 400, managerialeCentesimi: 16000000 },
    });
    expect(p.status).toBe(201);
    expect(p.body).toMatchObject({ stato: 'inValutazione', percentualeCompletamento: 0, approvatori: [{ risorsaId: risorsa.tullio, profilo: 'TL' }] });
    progetto = p.body._id;
    expect((await come('tullio').get(`/api/comuni/progetti/${progetto}`)).body.stime).toEqual({ managerialeGiorni: 400, managerialeCentesimi: 16000000 });
    expect((await come('rita').get(`/api/comuni/progetti/${progetto}`)).body.stime).toEqual({ managerialeGiorni: 400 });
    expect((await come('carlo').get(`/api/comuni/progetti/${progetto}`)).body.stime.managerialeCentesimi).toBe(16000000);
    expect((await come('tullio').get('/api/comuni/progetti?gestibili=true')).body).toHaveLength(1);
    expect((await come('piero').get('/api/comuni/progetti?gestibili=true')).body).toHaveLength(0);
    expect((await come('tullio').post('/api/comuni/progetti', { codice: 'TIMBUFE', titolo: 'X', centroCostoId: cdc })).status).toBe(409);
  });

  it('stato e approvatori: regole su date, PM obbligatorio, riapertura', async () => {
    const url = `/api/comuni/progetti/${progetto}`;
    expect((await come('tullio').post(`${url}/stato`, { stato: 'inCorso' })).body.message).toMatch(/data di inizio/);
    await come('tullio').put(url, { dataInizio: '2027-01-01' });
    expect((await come('tullio').post(`${url}/stato`, { stato: 'inCorso' })).body.message).toMatch(/almeno un approvatore PM/);
    expect((await come('tullio').put(`${url}/approvatori`, { approvatori: [{ risorsaId: risorsa.paola, profilo: 'PM' }] })).status).toBe(403);
    const appr = await come('sara').put(`${url}/approvatori`, {
      approvatori: [
        { risorsaId: risorsa.tullio, profilo: 'TL' },
        { risorsaId: risorsa.paola, profilo: 'TL' },
        { risorsaId: risorsa.paola, profilo: 'PM' },
      ],
    });
    expect(appr.body.approvatori).toEqual([
      { risorsaId: risorsa.tullio, profilo: 'TL' },
      { risorsaId: risorsa.paola, profilo: 'PM' },
    ]);
    expect((await come('piero').post(`${url}/stato`, { stato: 'inCorso' })).status).toBe(403);
    expect((await come('tullio').post(`${url}/stato`, { stato: 'inCorso' })).body.stato).toBe('inCorso');
    expect((await come('paola').put(`${url}/approvatori`, { approvatori: [{ risorsaId: risorsa.tullio, profilo: 'TL' }] })).status).toBe(400);
    expect((await come('tullio').put(url, { dataInizio: null })).status).toBe(400);
    expect((await come('tullio').put(url, { dataFine: '2026-12-31' })).body.message).toMatch(/non può precedere/);
    expect((await come('tullio').post(`${url}/stato`, { stato: 'chiuso' })).body.message).toMatch(/data di fine/);
    await come('tullio').put(url, { dataFine: '2027-12-31' });
    expect((await come('tullio').post(`${url}/stato`, { stato: 'chiuso' })).body.stato).toBe('chiuso');
    expect((await come('tullio').post(`${url}/stato`, { stato: 'inCorso' })).status).toBe(403);
    expect((await come('paola').post(`${url}/stato`, { stato: 'inValutazione' })).status).toBe(400);
    expect((await come('paola').post(`${url}/stato`, { stato: 'inCorso' })).body.stato).toBe('inCorso');
  });

  let attivita: string;

  it('attività e percentuali, con lo storico degli avanzamenti', async () => {
    const base = `/api/comuni/progetti/${progetto}/attivita`;
    expect((await come('rita').post(base, { codice: 'SVIL', descrizione: 'Sviluppo' })).status).toBe(403);
    const a = await come('tullio').post(base, { codice: 'SVIL', descrizione: 'Sviluppo', stimaGiorni: 250 });
    expect(a.status).toBe(201);
    attivita = a.body._id;
    expect((await come('tullio').post(base, { codice: 'SVIL', descrizione: 'Doppia' })).status).toBe(409);

    expect((await come('rita').put(`${base}/${attivita}/completamento`, { percentuale: 30 })).status).toBe(403);
    await come('tullio').put(`${base}/${attivita}/risorse`, { risorseAssegnateIds: [risorsa.rita, risorsa.rita] });
    const pct = await come('rita').put(`${base}/${attivita}/completamento`, { percentuale: 30 });
    expect(pct.body).toMatchObject({ percentualeCompletamento: 30, risorseAssegnateIds: [risorsa.rita] });
    expect((await come('rita').put(`${base}/${attivita}/completamento`, { percentuale: 101 })).status).toBe(400);
    expect((await come('piero').put(`${base}/${attivita}/completamento`, { percentuale: 50 })).status).toBe(403);

    expect((await come('rita').put(`/api/comuni/progetti/${progetto}/completamento`, { percentuale: 10 })).status).toBe(403);
    expect((await come('paola').put(`/api/comuni/progetti/${progetto}/completamento`, { percentuale: 40 })).body.percentualeCompletamento).toBe(40);

    const storico = (await come('rita').get(`/api/comuni/progetti/${progetto}/avanzamenti`)).body;
    expect(storico).toHaveLength(2);
    expect(storico[0]).toMatchObject({ valorePrecedente: 0, valoreNuovo: 40, creatoIl: expect.any(String) });
    expect(storico[1]).toMatchObject({ attivitaId: attivita, valoreNuovo: 30 });
  });

  it('il Pianificatore non elimina una risorsa che è approvatore o assegnata a un\'attività', async () => {
    expect((await come('paola').delete(`/api/pianificatore/risorse/${risorsa.paola}`)).status).toBe(409);
    expect((await come('paola').delete(`/api/pianificatore/risorse/${risorsa.rita}`)).status).toBe(409);
  });

  it('i validatori $jsonSchema bloccano i dati scritti senza passare dal backend', async () => {
    await expect(db.collection('progetti').insertOne({ codice: 'X', titolo: 'X', stato: 'aperto' })).rejects.toThrow(/validation/);
  });

  it('parametri: modifica solo il controller', async () => {
    expect((await come('ada').put('/api/parametri/oreGiorno', { valore: 7 })).status).toBe(403);
    expect((await come('carlo').put('/api/parametri/oreGiorno', { valore: 7 })).body.valore).toBe(7);
  });
});
