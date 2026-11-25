/**
 * Prova delle prestazioni dei report (fase 4, blocco E7): un anno di dati realistici — 200 risorse, 40 progetti con
 * 3 attività, 4 centri di costo, circa 130.000 righe di consuntivo — e i tempi delle risposte principali.
 *
 * Lenta (prepara i dati in circa 20 secondi): si esegue solo con PRESTAZIONI=1 e MONGODB_URI_TEST, es.:
 *   PRESTAZIONI=1 MONGODB_URI_TEST="mongodb://localhost:27017/?directConnection=true" npx vitest run test/prestazioni.report.spec.ts
 * Stampa i tempi; ogni risposta deve arrivare entro LIMITE_MS.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';
import request from 'supertest';
import { cifraPassword } from '../src/auth/password.js';
import { AndamentoService } from '../src/consuntivazione/report/andamento.service.js';

const URI_BASE = process.env.MONGODB_URI_TEST;
const ATTIVA = !!URI_BASE && process.env.PRESTAZIONI === '1';
const NOME_DB = `toolpm_test_${Date.now()}_perf`;
const CARTELLA = join(import.meta.dirname, '../scripts/migrazioni');
const LIMITE_MS = 5000;
const ANNO = 2026;

describe.skipIf(!ATTIVA)('Prestazioni dei report (fase 4, E7)', () => {
  let app: INestApplication;
  let client: mongoose.mongo.MongoClient;
  let db: mongoose.mongo.Db;
  let cookie = '';
  let righe = 0;
  const progetti: mongoose.Types.ObjectId[] = [];
  const tempi: [string, number][] = [];

  const misura = async (nome: string, url: string, formato?: 'xlsx' | 'csv') => {
    const inizio = performance.now();
    const r = await request(app.getHttpServer()).get(url + (formato ? `${url.includes('?') ? '&' : '?'}formato=${formato}` : '')).set('Cookie', cookie);
    const ms = Math.round(performance.now() - inizio);
    tempi.push([nome, ms]);
    expect(r.status, `${nome}: ${JSON.stringify(r.body).slice(0, 200)}`).toBe(200);
    return { r, ms };
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
      await (await import(pathToFileURL(join(CARTELLA, f)).href)).esegui(db, { utente: 'sistema:test', ora: new Date() });
    }
    const ordinaria = (await db.collection('tipologie_costo').findOne({ codice: 'ORDINARIA' }))!._id;
    const ruoli = (await db.collection('ruoli').insertMany(['JR', 'SR', 'AN', 'PM'].map((c) => ({ codice: c, descrizione: `Ruolo ${c}`, attivo: true })))).insertedIds;
    const centri = Object.values((await db.collection('centri_costo').insertMany([1, 2, 3, 4].map((i) => ({ codice: `CDC-${i}`, descrizione: `Centro ${i}`, attivo: true })))).insertedIds);
    const risorse = Object.values(
      (
        await db.collection('risorse').insertMany(
          Array.from({ length: 200 }, (_, i) => ({
            cognome: `Cognome${String(i).padStart(3, '0')}`,
            nome: 'Prova',
            oreContrattualiGiorno: 8,
            storicoRuoli: [{ ruoloId: ruoli[i % 4], dal: new Date(`${ANNO - 1}-01-01`) }],
            planned: [],
          })),
        )
      ).insertedIds,
    );
    const attivita = new Map<string, mongoose.Types.ObjectId[]>();
    for (let i = 0; i < 40; i++) {
      const id = new mongoose.Types.ObjectId();
      progetti.push(id);
      await db.collection('progetti').insertOne({
        _id: id,
        codice: `P${String(i).padStart(2, '0')}`,
        titolo: `Progetto ${i}`,
        centroCostoId: centri[i % 4],
        stato: 'inCorso',
        dataInizio: new Date(`${ANNO}-01-01`),
        dataFine: new Date(`${ANNO}-12-31`),
        approvatori: [],
        percentualeCompletamento: 40,
        soloSuAttivita: false,
        stime: { managerialeGiorni: 1500, managerialeCentesimi: 60_000_000, definitivaGiorni: 1600, definitivaCentesimi: 64_000_000 },
      });
      const att = Object.values(
        (await db.collection('attivita').insertMany(['ANA', 'SVI', 'TEST'].map((c) => ({ progettoId: id, codice: c, descrizione: c, stato: 'attiva', stimaGiorni: 400, percentualeCompletamento: 40, risorseAssegnateIds: [] })))).insertedIds,
      );
      attivita.set(String(id), att);
    }
    // Ogni risorsa lavora su due progetti (50% + 50%), tre righe al giorno nei giorni feriali.
    const mesi = Array.from({ length: 12 }, (_, m) => `${ANNO}${String(m + 1).padStart(2, '0')}`);
    let lotto: object[] = [];
    for (let i = 0; i < risorse.length; i++) {
      const [pa, pb] = [progetti[i % 40], progetti[(i * 7 + 3) % 40]];
      await db.collection('risorse').updateOne({ _id: risorse[i] }, { $set: { planned: mesi.flatMap((m) => [{ mese: m, progettoId: pa, percentualeAllocazione: 50 }, { mese: m, progettoId: pb, percentualeAllocazione: 50 }]) } });
      for (let d = new Date(Date.UTC(ANNO, 0, 1)); d.getUTCFullYear() === ANNO; d = new Date(d.getTime() + 86_400_000)) {
        if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
        // circa 2,7 righe al giorno: due su un progetto (attività e progetto) e una sull'altro due giorni su tre
        const voci: [mongoose.Types.ObjectId, mongoose.Types.ObjectId | null, number][] = [[pa, attivita.get(String(pa))![d.getUTCDate() % 3], 180], [pa, null, 60]];
        if (d.getUTCDate() % 3 !== 0) voci.push([pb, attivita.get(String(pb))![1], 240]);
        lotto.push({
          risorsaId: risorse[i],
          data: new Date(d),
          mese: d.toISOString().slice(0, 7).replace('-', ''),
          versione: 1,
          righe: voci.map(([progettoId, attivitaId, minuti], k) => ({
            _id: new mongoose.Types.ObjectId(),
            progettoId,
            attivitaId,
            centroCostoId: centri[progetti.findIndex((x) => x.equals(progettoId)) % 4],
            tipologiaId: ordinaria,
            tipologiaCodice: 'ORDINARIA',
            minuti,
            nota: null,
            stato: (i + k + d.getUTCDate()) % 20 === 0 ? 'inviata' : 'approvata',
            fonteTariffa: 'standard',
            tariffaId: null,
            tariffaCentesimiOra: 4000,
            costoCentesimi: (minuti / 60) * 4000,
            approvazioneTL: null,
            approvazionePM: null,
          })),
        });
        righe += voci.length;
        if (lotto.length >= 5000) {
          await db.collection('consuntivi').insertMany(lotto);
          lotto = [];
        }
      }
    }
    if (lotto.length) await db.collection('consuntivi').insertMany(lotto);

    const hash = await cifraPassword('password-di-prova');
    await db.collection('utenti').insertOne({ email: 'carlo@prova.it', passwordHash: hash, abilitazione: null, ruoli: ['controller'], attivo: true, deveCambiarePassword: false });
    const { AppModule } = await import('../src/app.module.js');
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'carlo@prova.it', password: 'password-di-prova' });
    cookie = String(login.headers['set-cookie']).split(';')[0];
  }, 300_000);

  afterAll(async () => {
    process.stdout.write(`\nTempi dei report (${righe} righe):\n${tempi.map(([nome, ms]) => `  ${String(ms).padStart(6)} ms  ${nome}`).join('\n')}\n`);
    await app?.close();
    await db?.dropDatabase();
    await client?.close();
  });

  it('circa 130.000 righe in un anno', () => {
    expect(righe).toBeGreaterThan(125_000);
    expect(righe).toBeLessThan(145_000);
  });

  it('report dei costi annuale, elenco, scheda, pianificato ed esportazioni entro pochi secondi', async () => {
    const A = `da=${ANNO}-01-01&a=${ANNO}-12-31`;
    const costi = await misura('costi: cdc › progetto › attività, anno', `/api/consuntivazione/report/costi?${A}&raggruppa=cdc,progetto,attivita`);
    expect(costi.r.body.totali.righe).toBeGreaterThan(110_000);
    await misura('costi: ruolo › risorsa, anno', `/api/consuntivazione/report/costi?${A}&raggruppa=ruolo,risorsa`);
    await misura('costi: progetto › mese › tipologia, anno, provvisoria', `/api/consuntivazione/report/costi?${A}&raggruppa=progetto,mese,tipologia&vista=provvisoria`);
    await misura('elenco dei progetti', '/api/consuntivazione/report/progetti');
    await misura('scheda di un progetto, anno', `/api/consuntivazione/report/progetti/${progetti[0].toHexString()}?${A}`);
    await misura('indicatori EVM di un progetto', `/api/consuntivazione/report/progetti/${progetti[0].toHexString()}/evm?al=${ANNO}-06-30`);
    await misura('pianificato e consuntivato, 12 mesi', `/api/consuntivazione/report/pianificato?da=${ANNO}01&a=${ANNO}12`);
    await misura('Excel del report dei costi, anno', `/api/consuntivazione/report/costi?${A}&raggruppa=cdc,progetto,attivita`, 'xlsx');
    await misura('CSV delle righe di dettaglio, un mese', `/api/consuntivazione/report/righe?da=${ANNO}-03-01&a=${ANNO}-03-31`, 'csv');
    for (const [nome, ms] of tempi) expect(ms, nome).toBeLessThan(LIMITE_MS);
  }, 120_000);

  it('andamento: la notte (un giorno) è immediata; il recupero di un mese resta breve', async () => {
    const andamento = app.get(AndamentoService);
    let inizio = performance.now();
    const mese = await (await andamento.avvia('test', { fino: new Date(`${ANNO}-01-31`) })).completamento;
    const msMese = Math.round(performance.now() - inizio);
    tempi.push(['andamento: recupero di 31 giorni', msMese]);
    expect(mese).toMatchObject({ stato: 'completata', giorniElaborati: 31 });
    inizio = performance.now();
    const giorno = await (await andamento.avvia('test', { fino: new Date(`${ANNO}-02-01`) })).completamento;
    const msGiorno = Math.round(performance.now() - inizio);
    tempi.push(['andamento: un giorno (la notte)', msGiorno]);
    expect(giorno.giorniElaborati).toBe(1);
    expect(msGiorno).toBeLessThan(LIMITE_MS);
  }, 300_000);
});
