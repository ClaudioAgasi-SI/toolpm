/**
 * Test di integrazione del Pianificatore adattato (fase 1, blocco B5), contro un MongoDB vero:
 * allocazioni su progettoId, permessi sulle caratteristiche, periodo di transizione senza accesso,
 * migrazione 006. Si esegue solo con MONGODB_URI_TEST (vedi comuni.integrazione.spec.ts).
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
const NOME_DB = `toolpm_test_b5_${Date.now()}`;
const { ObjectId } = mongoose.Types;

describe.skipIf(!URI_BASE)('Pianificatore adattato con MongoDB vero', () => {
  let app: INestApplication;
  let client: mongoose.mongo.MongoClient;
  let db: mongoose.mongo.Db;
  const cookie: Record<string, string> = {};
  const id: Record<string, mongoose.Types.ObjectId> = {};

  const api = () => request(app.getHttpServer());
  const come = (chi?: string) => {
    const conCookie = (r: request.Test) => (chi ? r.set('Cookie', cookie[chi]) : r);
    return {
      get: (url: string) => conCookie(api().get(url)),
      post: (url: string, body?: object) => conCookie(api().post(url)).send(body ?? {}),
      put: (url: string, body?: object) => conCookie(api().put(url)).send(body ?? {}),
    };
  };
  /** Corpo del PUT come lo manda il frontend: la risorsa letta, con le modifiche indicate. */
  const risorsaDaModificare = async (risorsa: string, modifica: (r: Record<string, unknown> & { planned: Record<string, unknown>[] }) => void) => {
    const r = (await come().get(`/api/pianificatore/risorse/${risorsa}`)).body;
    modifica(r);
    return r as object;
  };

  beforeAll(async () => {
    const url = new URL(URI_BASE!);
    url.pathname = `/${NOME_DB}`;
    process.env.MONGODB_URI = url.toString();
    process.env.JWT_SECRET = 'segreto-dei-test';
    process.env.AUTH_OBBLIGATORIA = 'false';
    delete process.env.ADMIN_EMAIL;
    client = await mongoose.mongo.MongoClient.connect(url.toString());
    db = client.db(NOME_DB);
    const cartella = join(import.meta.dirname, '../scripts/migrazioni');
    // Tutte le migrazioni tranne la 006, che si prova nell'ultimo test.
    for (const f of readdirSync(cartella).filter((n) => /^\d{3}-.+\.mjs$/.test(n) && !n.startsWith('006')).sort()) {
      await (await import(pathToFileURL(join(cartella, f)).href)).esegui(db, { utente: 'sistema:test', ora: new Date() });
    }

    // Persone: risorsa + utente. Rita e Mario sono risorse semplici.
    const hash = await cifraPassword('password-di-prova');
    for (const [nome, abilitazione] of [
      ['sara', 'PMSenior'],
      ['paola', 'PM'],
      ['tullio', 'TL'],
      ['rita', null],
      ['mario', null],
    ] as const) {
      id[nome] = (await db.collection('risorse').insertOne({ cognome: nome, nome, email: `${nome}@prova.it`, planned: [] })).insertedId;
      await db.collection('utenti').insertOne({
        email: `${nome}@prova.it`,
        passwordHash: hash,
        abilitazione,
        ruoli: ['risorsa'],
        attivo: true,
        deveCambiarePassword: false,
        risorsaId: id[nome],
      });
    }
    const cliente = (await db.collection('clienti').insertOne({ codice: 'TIM', ragioneSociale: 'Telecom Italia', attivo: true })).insertedId;
    const cdc = (await db.collection('centri_costo').insertOne({ codice: 'CDC', descrizione: 'Sviluppo', attivo: true })).insertedId;
    const progetto = (codice: string, approvatori: object[]) =>
      db.collection('progetti').insertOne({
        codice,
        titolo: `Progetto ${codice}`,
        clienteId: cliente,
        centroCostoId: cdc,
        approvatori,
        stato: 'inCorso',
        dataInizio: new Date('2027-01-01'),
        percentualeCompletamento: 0,
        soloSuAttivita: false,
        stime: {},
        aliasPianificatore: codice === 'P1' ? [{ cliente: 'TIM', progetto: 'Vecchio nome P1' }] : undefined,
      });
    id.P1 = (await progetto('P1', [{ risorsaId: id.tullio, profilo: 'TL' }, { risorsaId: id.paola, profilo: 'PM' }])).insertedId;
    id.P2 = (await progetto('P2', [{ risorsaId: id.paola, profilo: 'PM' }])).insertedId;
    // Rita lavora su P1 (progetto di Tullio), Mario solo su P2.
    await db.collection('risorse').updateOne({ _id: id.rita }, { $set: { planned: [{ mese: '202701', progettoId: id.P1, percentualeAllocazione: 50, probabilitaAllocazione: 'sicura' }] } });
    await db.collection('risorse').updateOne({ _id: id.mario }, { $set: { planned: [{ mese: '202701', progettoId: id.P2, percentualeAllocazione: 100 }] } });

    const { AppModule } = await import('../src/app.module.js');
    const { MongooseErrorsFilter } = await import('../src/mongoose-errors.filter.js');
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new MongooseErrorsFilter());
    await app.init();
    for (const nome of ['sara', 'paola', 'tullio', 'rita']) {
      const r = await api().post('/api/auth/login').send({ email: `${nome}@prova.it`, password: 'password-di-prova' });
      cookie[nome] = String(r.headers['set-cookie']).split(';')[0];
    }
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.dropDatabase();
    await client?.close();
  });

  it('le risposte riportano progetto e cliente ricavati da progettoId, anche nella griglia', async () => {
    const rita = (await come().get(`/api/pianificatore/risorse/${String(id.rita)}`)).body;
    expect(rita.planned[0]).toMatchObject({ progettoId: String(id.P1), progetto: 'P1', progettoTitolo: 'Progetto P1', cliente: 'TIM', clienteRagioneSociale: 'Telecom Italia' });
    const griglia = (await come().get('/api/pianificatore/pianificazione?da=202701&a=202701')).body;
    const riga = griglia.righe.find((r: { _id: string }) => r._id === String(id.rita));
    expect(riga.mesi['202701']).toMatchObject({ totale: 50, allocazioni: [{ progetto: 'P1', cliente: 'TIM' }] });
  });

  it('in scrittura si accetta il codice del progetto (o il vecchio testo importato); si salva solo progettoId', async () => {
    const corpo = await risorsaDaModificare(String(id.mario), (r) => {
      r.planned.push({ mese: '202702', progetto: 'p1', percentualeAllocazione: 30 });
      r.planned.push({ mese: '202703', cliente: 'TIM', progetto: 'Vecchio nome P1', percentualeAllocazione: 20 });
      r.planned.push({ mese: '202704' }); // mese libero, senza progetto
    });
    const r = await come('paola').put(`/api/pianificatore/risorse/${String(id.mario)}`, corpo);
    expect(r.status).toBe(200);
    expect(r.body.planned.map((a: { progetto?: string }) => a.progetto)).toEqual(['P2', 'P1', 'P1', undefined]);
    const salvata = await db.collection('risorse').findOne({ _id: id.mario });
    expect(salvata!.planned[1]).toEqual({ mese: '202702', progettoId: id.P1, percentualeAllocazione: 30 });
    expect(salvata!.email).toBe('mario@prova.it'); // l'anagrafica non si tocca

    // Progetto svuotato nel frontend: la riga resta senza progetto.
    const svuotato = await risorsaDaModificare(String(id.mario), (r) => (r.planned[1].progetto = ''));
    const r2 = await come('paola').put(`/api/pianificatore/risorse/${String(id.mario)}`, svuotato);
    expect(r2.body.planned[1]).toEqual({ mese: '202702', percentualeAllocazione: 30 });
    await come('paola').put(`/api/pianificatore/risorse/${String(id.mario)}`, corpo);

    const sbagliato = await risorsaDaModificare(String(id.mario), (r) => r.planned.push({ mese: '202705', progetto: 'NON-ESISTE' }));
    const errore = await come('paola').put(`/api/pianificatore/risorse/${String(id.mario)}`, sbagliato);
    expect(errore.status).toBe(400);
    expect(String(errore.body.message)).toMatch(/progetto "NON-ESISTE" inesistente/);
  });

  it('caratteristiche: TL solo sulle risorse dei suoi progetti; cognome e nome solo PM e PMSenior', async () => {
    const skill = (r: Record<string, unknown>) => (r.skillTecnici = [{ skillName: 'Angular', rate: 'buono' }]);
    expect((await come('tullio').put(`/api/pianificatore/risorse/${String(id.rita)}`, await risorsaDaModificare(String(id.rita), skill))).status).toBe(200);
    // Sara non è allocata su progetti di Tullio (Mario sì, dal test precedente: P1).
    expect((await come('tullio').put(`/api/pianificatore/risorse/${String(id.sara)}`, await risorsaDaModificare(String(id.sara), skill))).status).toBe(403);
    expect((await come('tullio').put(`/api/pianificatore/risorse/${String(id.mario)}`, await risorsaDaModificare(String(id.mario), skill))).status).toBe(200);
    expect((await come('rita').put(`/api/pianificatore/risorse/${String(id.rita)}`, await risorsaDaModificare(String(id.rita), skill))).status).toBe(403);
    expect((await come('sara').put(`/api/pianificatore/risorse/${String(id.mario)}`, await risorsaDaModificare(String(id.mario), skill))).status).toBe(200);
    const rinomina = await risorsaDaModificare(String(id.rita), (r) => (r.cognome = 'Rossi'));
    expect((await come('tullio').put(`/api/pianificatore/risorse/${String(id.rita)}`, rinomina)).body.message).toMatch(/cambiare cognome e nome/);
    expect((await come('paola').put(`/api/pianificatore/risorse/${String(id.rita)}`, rinomina)).body.cognome).toBe('Rossi');
  });

  it('creazione ed eliminazione dal Pianificatore: solo PM e PMSenior', async () => {
    expect((await come('tullio').post('/api/pianificatore/risorse', { cognome: 'Nuova', nome: 'Risorsa' })).status).toBe(403);
    const creata = await come('paola').post('/api/pianificatore/risorse', { cognome: 'Nuova', nome: 'Risorsa', planned: [{ mese: '202701', progetto: 'P2', percentualeAllocazione: 10 }] });
    expect(creata.status).toBe(201);
    expect(creata.body.planned[0]).toMatchObject({ progetto: 'P2' });
    expect((await api().delete(`/api/pianificatore/risorse/${String(creata.body._id)}`).set('Cookie', cookie.tullio)).status).toBe(403);
    expect((await api().delete(`/api/pianificatore/risorse/${String(creata.body._id)}`).set('Cookie', cookie.paola)).status).toBe(200);
  });

  it('anagrafiche del Pianificatore (skill, certificazioni, scale): scrivono PM e PMSenior', async () => {
    expect((await come('tullio').post('/api/pianificatore/skills', { skillName: 'Rust', skillType: 'tecnico' })).status).toBe(403);
    expect((await come('paola').post('/api/pianificatore/skills', { skillName: 'Rust', skillType: 'tecnico' })).status).toBe(201);
    expect((await come('tullio').get('/api/pianificatore/skills')).status).toBe(200);
  });

  it('periodo di transizione: senza accesso il Pianificatore funziona come prima (AUTH_OBBLIGATORIA=false)', async () => {
    const corpo = await risorsaDaModificare(String(id.mario), (r) => (r.skillAmbiti = [{ skillName: 'Telco' }]));
    expect((await come().put(`/api/pianificatore/risorse/${String(id.mario)}`, corpo)).status).toBe(200);
    expect((await come().post('/api/pianificatore/skills', { skillName: 'Go', skillType: 'tecnico' })).status).toBe(201);
    // Le API dei Comuni invece richiedono sempre l'accesso.
    expect((await come().get('/api/comuni/progetti')).status).toBe(401);
  });

  it('migrazione 006: toglie i testi cliente e progetto dalle allocazioni collegate', async () => {
    const r = (
      await db.collection('risorse').insertOne({
        cognome: 'Vecchia',
        nome: 'Risorsa',
        planned: [
          { mese: '202701', cliente: 'TIM', progetto: 'Vecchio nome P1', progettoId: id.P1, clienteTesto: 'TIM', progettoTesto: 'Vecchio nome P1' },
          { mese: '202702', cliente: 'Altro', progetto: 'Mai collegato' },
        ],
      })
    ).insertedId;
    const m = await import(pathToFileURL(join(import.meta.dirname, '../scripts/migrazioni/006-allocazioni-progettoid.mjs')).href);
    const esito = await m.esegui(db, { utente: 'sistema:test', ora: new Date() });
    expect(esito).toMatchObject({ allocazioniPulite: 1, nonCollegate: 1 });
    const dopo = await db.collection('risorse').findOne({ _id: r });
    expect(dopo!.planned).toEqual([
      { mese: '202701', progettoId: id.P1, clienteTesto: 'TIM', progettoTesto: 'Vecchio nome P1' },
      { mese: '202702', cliente: 'Altro', progetto: 'Mai collegato' },
    ]);
    expect(dopo!.modificatoDa).toBe('sistema:test');
    expect(new ObjectId(String(dopo!._id))).toEqual(r);
  });
});
