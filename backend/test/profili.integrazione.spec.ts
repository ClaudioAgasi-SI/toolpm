/**
 * Criteri di completamento della fase 1 (blocco B8), contro un MongoDB vero:
 * - senza accesso ogni API risponde 401, tranne login, logout e /api/health (elenco preso da Swagger,
 *   così anche le API aggiunte in futuro sono controllate);
 * - per ogni profilo (risorsa, TL, PM, PMSenior, controller, admin) cosa può e cosa non può fare su
 *   progetti, attività, risorse, caratteristiche e anagrafiche;
 * - il tracciamento registra l'utente giusto.
 * Si esegue solo con MONGODB_URI_TEST (vedi comuni.integrazione.spec.ts).
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import mongoose from 'mongoose';
import request from 'supertest';
import { cifraPassword } from '../src/auth/password.js';

const URI_BASE = process.env.MONGODB_URI_TEST;
const NOME_DB = `toolpm_test_b8_${Date.now()}`;

/** I profili della fase 1. "pmEsterno" è PM ma non del progetto P. */
const PROFILI = ['risorsa', 'tl', 'pm', 'pmEsterno', 'pmSenior', 'controller', 'admin'] as const;
type Profilo = (typeof PROFILI)[number];

const PERSONE: Record<Profilo, { abilitazione: string | null; ruoli: string[]; senzaRisorsa?: boolean }> = {
  risorsa: { abilitazione: null, ruoli: ['risorsa'] },
  tl: { abilitazione: 'TL', ruoli: ['risorsa'] },
  pm: { abilitazione: 'PM', ruoli: ['risorsa'] },
  pmEsterno: { abilitazione: 'PM', ruoli: ['risorsa'] },
  pmSenior: { abilitazione: 'PMSenior', ruoli: ['risorsa'] },
  controller: { abilitazione: null, ruoli: ['risorsa', 'controller'] },
  admin: { abilitazione: null, ruoli: ['admin'], senzaRisorsa: true },
};

describe.skipIf(!URI_BASE)('Criteri di completamento della fase 1 con MongoDB vero', () => {
  let app: INestApplication;
  let client: mongoose.mongo.MongoClient;
  let db: mongoose.mongo.Db;
  const cookie = {} as Record<Profilo, string>;
  const utenteId = {} as Record<Profilo, string>;
  const risorsaId = {} as Record<string, string>;
  let progetto: string;
  let attivita: string;
  let cdc: string;

  const api = () => request(app.getHttpServer());
  const chiama = (chi: Profilo, metodo: 'get' | 'post' | 'put', url: string, body?: object) =>
    api()[metodo](url).set('Cookie', cookie[chi]).send(body ?? {});

  beforeAll(async () => {
    const url = new URL(URI_BASE!);
    url.pathname = `/${NOME_DB}`;
    process.env.MONGODB_URI = url.toString();
    process.env.JWT_SECRET = 'segreto-dei-test';
    delete process.env.ADMIN_EMAIL;
    client = await mongoose.mongo.MongoClient.connect(url.toString());
    db = client.db(NOME_DB);
    const cartella = join(import.meta.dirname, '../scripts/migrazioni');
    for (const f of readdirSync(cartella).filter((n) => /^\d{3}-.+\.mjs$/.test(n)).sort()) {
      await (await import(pathToFileURL(join(cartella, f)).href)).esegui(db, { utente: 'sistema:test', ora: new Date() });
    }
    const hash = await cifraPassword('password-di-prova');
    for (const p of PROFILI) {
      const persona = PERSONE[p];
      let rid: mongoose.Types.ObjectId | undefined;
      if (!persona.senzaRisorsa) {
        rid = (await db.collection('risorse').insertOne({ cognome: p, nome: p, email: `${p.toLowerCase()}@prova.it`, planned: [] })).insertedId;
        risorsaId[p] = String(rid);
      }
      utenteId[p] = String(
        (
          await db.collection('utenti').insertOne({
            email: `${p.toLowerCase()}@prova.it`,
            passwordHash: hash,
            abilitazione: persona.abilitazione,
            ruoli: persona.ruoli,
            attivo: true,
            deveCambiarePassword: false,
            ...(rid ? { risorsaId: rid } : {}),
          })
        ).insertedId,
      );
    }
    // Due risorse senza utente: una allocata sul progetto P, l'altra no.
    for (const nome of ['allocataSuP', 'altrove']) {
      risorsaId[nome] = String((await db.collection('risorse').insertOne({ cognome: nome, nome, planned: [] })).insertedId);
    }
    cdc = String((await db.collection('centri_costo').insertOne({ codice: 'CDC', descrizione: 'Sviluppo', attivo: true })).insertedId);
    await db.collection('ruoli').insertOne({ codice: 'R-TARIFFE', descrizione: 'Ruolo per le tariffe', attivo: true });

    const { AppModule } = await import('../src/app.module.js');
    const { MongooseErrorsFilter } = await import('../src/mongoose-errors.filter.js');
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new MongooseErrorsFilter());
    await app.init();
    for (const p of PROFILI) {
      const r = await api().post('/api/auth/login').send({ email: `${p.toLowerCase()}@prova.it`, password: 'password-di-prova' });
      cookie[p] = String(r.headers['set-cookie']).split(';')[0];
    }

    // Progetto P: TL "tl", PM "pm"; attività A con la risorsa semplice assegnata; "allocataSuP" allocata su P.
    progetto = (await chiama('pm', 'post', '/api/comuni/progetti', { codice: 'P', titolo: 'Progetto P', centroCostoId: cdc })).body._id;
    await chiama('pm', 'put', `/api/comuni/progetti/${progetto}/approvatori`, {
      approvatori: [
        { risorsaId: risorsaId.pm, profilo: 'PM' },
        { risorsaId: risorsaId.tl, profilo: 'TL' },
      ],
    });
    attivita = (await chiama('pm', 'post', `/api/comuni/progetti/${progetto}/attivita`, { codice: 'A', descrizione: 'Attività A' })).body._id;
    await chiama('pm', 'put', `/api/comuni/progetti/${progetto}/attivita/${attivita}/risorse`, { risorseAssegnateIds: [risorsaId.risorsa] });
    await db
      .collection('risorse')
      .updateOne({ _id: new mongoose.Types.ObjectId(risorsaId.allocataSuP) }, { $set: { planned: [{ mese: '202701', progettoId: new mongoose.Types.ObjectId(progetto), percentualeAllocazione: 50 }] } });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.dropDatabase();
    await client?.close();
  });

  it('senza accesso ogni API risponde 401, tranne login, logout e health', async () => {
    const documento = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    const pubbliche = new Set(['POST /api/auth/login', 'POST /api/auth/logout', 'GET /api/health']);
    const idFinto = new mongoose.Types.ObjectId().toHexString();
    const controllate: string[] = [];
    for (const [percorso, metodi] of Object.entries(documento.paths)) {
      for (const metodo of ['get', 'post', 'put', 'patch', 'delete'] as const) {
        if (!(metodi as Record<string, unknown>)[metodo]) continue;
        const chiave = `${metodo.toUpperCase()} ${percorso}`;
        if (pubbliche.has(chiave)) continue;
        const url = percorso.replace(/\{[^}]+\}/g, (p) => (p === '{chiave}' ? 'oreGiorno' : idFinto));
        const r = await api()[metodo](url).send({});
        expect({ api: chiave, stato: r.status }).toEqual({ api: chiave, stato: 401 });
        controllate.push(chiave);
      }
    }
    // Tutte le sezioni sono coperte.
    for (const prefisso of ['/api/comuni/', '/api/pianificatore/', '/api/consuntivazione/', '/api/utenti', '/api/parametri', '/api/auth/me']) {
      expect(controllate.some((c) => c.includes(prefisso))).toBe(true);
    }
    expect(controllate.length).toBeGreaterThan(40);
    expect((await api().get('/api/health')).status).toBe(200);
    expect((await api().post('/api/auth/logout')).status).toBe(200);
  });

  /** Operazione da provare con ogni profilo: chi deve riuscire, gli altri ricevono 403. */
  interface Caso {
    nome: string;
    consentito: Profilo[];
    esegui: (chi: Profilo) => Promise<request.Response>;
  }
  const casi: Caso[] = [
    {
      nome: 'creare un cliente',
      consentito: ['pmSenior'],
      esegui: (chi) => chiama(chi, 'post', '/api/comuni/clienti', { codice: `CLI-${chi}`, ragioneSociale: `Cliente ${chi}` }),
    },
    {
      nome: 'creare un centro di costo',
      consentito: ['pmSenior'],
      esegui: (chi) => chiama(chi, 'post', '/api/comuni/centri-costo', { codice: `CDC-${chi}`, descrizione: `Centro ${chi}` }),
    },
    {
      nome: 'creare un ruolo professionale',
      consentito: ['admin'],
      esegui: (chi) => chiama(chi, 'post', '/api/comuni/ruoli', { codice: `RUOLO-${chi}`, descrizione: `Ruolo ${chi}` }),
    },
    {
      nome: 'creare un progetto',
      consentito: ['tl', 'pm', 'pmEsterno', 'pmSenior'],
      esegui: (chi) => chiama(chi, 'post', '/api/comuni/progetti', { codice: `PRJ-${chi}`, titolo: `Progetto di ${chi}`, centroCostoId: cdc }),
    },
    {
      nome: 'modificare il progetto P',
      consentito: ['tl', 'pm', 'pmSenior'],
      esegui: (chi) => chiama(chi, 'put', `/api/comuni/progetti/${progetto}`, { descrizione: `modificato da ${chi}` }),
    },
    {
      nome: 'assegnare gli approvatori di P',
      consentito: ['pm', 'pmSenior'],
      esegui: (chi) =>
        chiama(chi, 'put', `/api/comuni/progetti/${progetto}/approvatori`, {
          approvatori: [
            { risorsaId: risorsaId.pm, profilo: 'PM' },
            { risorsaId: risorsaId.tl, profilo: 'TL' },
          ],
        }),
    },
    {
      nome: 'aggiornare la percentuale di P',
      consentito: ['tl', 'pm', 'pmSenior'],
      esegui: (chi) => chiama(chi, 'put', `/api/comuni/progetti/${progetto}/completamento`, { percentuale: PROFILI.indexOf(chi) + 1 }),
    },
    {
      nome: 'creare un\'attività di P',
      consentito: ['tl', 'pm', 'pmSenior'],
      esegui: (chi) => chiama(chi, 'post', `/api/comuni/progetti/${progetto}/attivita`, { codice: `ATT-${chi}`, descrizione: `Attività di ${chi}` }),
    },
    {
      nome: 'aggiornare la percentuale dell\'attività A (la risorsa è assegnata)',
      consentito: ['risorsa', 'tl', 'pm', 'pmSenior'],
      esegui: (chi) => chiama(chi, 'put', `/api/comuni/progetti/${progetto}/attivita/${attivita}/completamento`, { percentuale: 10 + PROFILI.indexOf(chi) }),
    },
    {
      nome: 'creare una risorsa (anagrafica)',
      consentito: ['pm', 'pmEsterno', 'pmSenior'],
      esegui: (chi) => chiama(chi, 'post', '/api/comuni/risorse', { cognome: 'Nuova', nome: chi, email: `nuova.${chi.toLowerCase()}@prova.it` }),
    },
    {
      nome: 'modificare le skill di una risorsa allocata su P',
      consentito: ['tl', 'pm', 'pmEsterno', 'pmSenior'],
      esegui: async (chi) => {
        const r = (await chiama('pmSenior', 'get', `/api/pianificatore/risorse/${risorsaId.allocataSuP}`)).body;
        return chiama(chi, 'put', `/api/pianificatore/risorse/${risorsaId.allocataSuP}`, { ...r, skillTecnici: [{ skillName: `skill-${chi}` }] });
      },
    },
    {
      nome: 'modificare le skill di una risorsa che non lavora su P',
      consentito: ['pm', 'pmEsterno', 'pmSenior'],
      esegui: async (chi) => {
        const r = (await chiama('pmSenior', 'get', `/api/pianificatore/risorse/${risorsaId.altrove}`)).body;
        return chiama(chi, 'put', `/api/pianificatore/risorse/${risorsaId.altrove}`, { ...r, skillTecnici: [{ skillName: `skill-${chi}` }] });
      },
    },
    {
      nome: 'modificare il catalogo delle skill',
      consentito: ['pm', 'pmEsterno', 'pmSenior'],
      esegui: (chi) => chiama(chi, 'post', '/api/pianificatore/skills', { skillName: `skill-${chi}`, skillType: 'tecnico' }),
    },
    {
      nome: 'modificare i parametri di sistema',
      consentito: ['controller'],
      esegui: (chi) => chiama(chi, 'put', '/api/parametri/oreGiorno', { valore: 8 }),
    },
    {
      nome: 'vedere gli utenti',
      consentito: ['admin'],
      esegui: (chi) => chiama(chi, 'get', '/api/utenti'),
    },
    // Consuntivazione (fase 2, blocco C4)
    {
      nome: 'leggere le tipologie di costo',
      consentito: [...PROFILI],
      esegui: (chi) => chiama(chi, 'get', '/api/consuntivazione/tipologie-costo'),
    },
    {
      nome: 'creare una tipologia di costo',
      consentito: ['controller'],
      esegui: (chi) => chiama(chi, 'post', '/api/consuntivazione/tipologie-costo', { codice: `TIP-${chi}`, descrizione: `Tipologia ${chi}`, categoria: 'straordinaria' }),
    },
    {
      nome: 'leggere le tariffe standard',
      consentito: ['controller'],
      esegui: (chi) => chiama(chi, 'get', '/api/consuntivazione/tariffe-standard'),
    },
    {
      nome: 'creare una tariffa standard',
      consentito: ['controller'],
      esegui: async (chi) => {
        const ruolo = (await db.collection('ruoli').findOne({ codice: 'R-TARIFFE' }))!._id;
        const tipologia = (await db.collection('tipologie_costo').findOne({ codice: 'ORDINARIA' }))!._id;
        const anno = 2030 + PROFILI.indexOf(chi);
        return chiama(chi, 'post', '/api/consuntivazione/tariffe-standard', {
          ruoloId: String(ruolo),
          tipologiaId: String(tipologia),
          validoDal: `${anno}-01-01`,
          validoAl: `${anno}-12-31`,
          centesimiOra: 3000,
        });
      },
    },
    {
      nome: 'vedere le tariffe applicabili a una risorsa',
      consentito: ['controller'],
      esegui: (chi) => chiama(chi, 'get', `/api/consuntivazione/risorse/${risorsaId.altrove}/tariffe-applicabili`),
    },
    {
      nome: 'consuntivare (salvare una propria giornata)',
      consentito: ['risorsa', 'tl', 'pm', 'pmEsterno', 'pmSenior', 'controller'],
      esegui: (chi) => chiama(chi, 'put', '/api/consuntivazione/consuntivi/2026-01-05', { versione: 0, righe: [] }),
    },
    {
      nome: 'leggere le proprie voci consuntivabili',
      consentito: ['risorsa', 'tl', 'pm', 'pmEsterno', 'pmSenior', 'controller'],
      esegui: (chi) => chiama(chi, 'get', '/api/consuntivazione/consuntivi/voci'),
    },
    {
      nome: 'leggere i consuntivi di un\'altra risorsa',
      consentito: ['controller'],
      esegui: (chi) => chiama(chi, 'get', `/api/consuntivazione/consuntivi?da=2026-01-01&a=2026-01-31&risorsa=${risorsaId.altrove}`),
    },
  ];

  it.each(casi)('$nome: consentito a $consentito', async (caso) => {
    const esiti: Record<string, number> = {};
    const attesi: Record<string, number> = {};
    for (const chi of PROFILI) {
      const r = await caso.esegui(chi);
      esiti[chi] = r.status < 300 ? 200 : r.status;
      attesi[chi] = caso.consentito.includes(chi) ? 200 : 403;
    }
    expect(esiti).toEqual(attesi);
  });

  it('tutti i profili leggono progetti, risorse e griglia', async () => {
    for (const chi of PROFILI) {
      expect((await chiama(chi, 'get', '/api/comuni/progetti')).status).toBe(200);
      expect((await chiama(chi, 'get', '/api/comuni/risorse')).status).toBe(200);
      expect((await chiama(chi, 'get', '/api/pianificatore/pianificazione?da=202701&a=202701')).status).toBe(200);
    }
  });

  it('il tracciamento registra chi ha creato e chi ha modificato per ultimo', async () => {
    const creato = (await chiama('tl', 'post', '/api/comuni/progetti', { codice: 'TRACCIA', titolo: 'Tracciamento', centroCostoId: cdc })).body;
    expect(creato).toMatchObject({ creatoDa: utenteId.tl, modificatoDa: utenteId.tl });
    await chiama('pmSenior', 'put', `/api/comuni/progetti/${creato._id}`, { titolo: 'Tracciamento (rivisto)' });
    const doc = await db.collection('progetti').findOne({ _id: new mongoose.Types.ObjectId(creato._id) });
    expect(doc).toMatchObject({ creatoDa: utenteId.tl, modificatoDa: utenteId.pmSenior });
    expect(doc!.modificatoIl.getTime()).toBeGreaterThanOrEqual(doc!.creatoIl.getTime());
    // anche lo storico degli avanzamenti e le risorse modificate dal Pianificatore
    const ultimo = await db.collection('avanzamenti').find().sort({ il: -1 }).limit(1).next();
    expect(ultimo!.creatoDa).toBe(ultimo!.da);
    const risorsa = await db.collection('risorse').findOne({ _id: new mongoose.Types.ObjectId(risorsaId.allocataSuP) });
    expect(Object.values(utenteId)).toContain(risorsa!.modificatoDa);
  });
});
