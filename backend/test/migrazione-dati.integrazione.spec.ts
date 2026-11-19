/**
 * Test di integrazione della migrazione dei dati del Pianificatore (fase 1, blocco B7) sui dati di
 * esempio (db/risorse.json: 13 risorse, 5 coppie cliente/progetto), contro un MongoDB vero.
 * Si esegue solo con MONGODB_URI_TEST (vedi comuni.integrazione.spec.ts).
 */
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BadRequestException } from '@nestjs/common';
import mongoose from 'mongoose';
import { verificaPassword } from '../src/auth/password.js';
import { Cliente, ClienteSchema } from '../src/comuni/schemi/anagrafiche.schema.js';
import { Attivita, AttivitaSchema, Progetto, ProgettoSchema } from '../src/comuni/schemi/progetto.schema.js';
import { Risorsa, RisorsaSchema } from '../src/comuni/schemi/risorsa.schema.js';
import { PermessiService } from '../src/permessi/permessi.service.js';
import { AllocazioniService } from '../src/pianificatore/risorse/allocazioni.service.js';
import { RisorseService } from '../src/pianificatore/risorse/risorse.service.js';
import { leggiCsv, scriviCsv } from '../scripts/migrazione-dati/csv.mjs';
import { COLONNE_PROGETTI, COLONNE_RISORSE } from '../scripts/migrazione-dati/comune.mjs';
import { esporta } from '../scripts/migrazione-dati/esporta.mjs';
import { importa } from '../scripts/migrazione-dati/importa.mjs';
import { verifica } from '../scripts/migrazione-dati/verifica.mjs';

const URI_BASE = process.env.MONGODB_URI_TEST;
/** Utente PMSenior di prova: modifica tutte le risorse. */
const PMSENIOR = { id: 'u-test', email: 'pmsenior@prova.it', abilitazione: 'PMSenior' as const, ruoli: ['risorsa' as const], deveCambiarePassword: false };
const NOME_DB = `toolpm_test_b7_${Date.now()}`;

describe.skipIf(!URI_BASE)('Migrazione dei dati del Pianificatore con MongoDB vero', () => {
  let client: mongoose.mongo.MongoClient;
  let db: mongoose.mongo.Db;
  let cartella: string;

  type Riga = Record<string, string> & { _riga: number };
  const leggi = async (nome: string) => leggiCsv(await readFile(join(cartella, nome), 'utf8')).righe as Riga[];
  const scrivi = (nome: string, colonne: string[], righe: Riga[]) => writeFile(join(cartella, nome), scriviCsv(colonne, righe));

  beforeAll(async () => {
    const url = new URL(URI_BASE!);
    url.pathname = `/${NOME_DB}`;
    client = await mongoose.mongo.MongoClient.connect(url.toString());
    db = client.db(NOME_DB);
    const migrazioni = join(import.meta.dirname, '../scripts/migrazioni');
    for (const f of (await readdir(migrazioni)).filter((n) => /^\d{3}-.+\.mjs$/.test(n)).sort()) {
      await (await import(pathToFileURL(join(migrazioni, f)).href)).esegui(db, { utente: 'sistema:test', ora: new Date() });
    }
    const risorse = JSON.parse(await readFile(join(import.meta.dirname, '../../db/risorse.json'), 'utf8')) as object[];
    await db.collection('risorse').insertMany(risorse);
    // Amministratore già esistente, senza risorsa: verrà collegato alla risorsa con la sua email.
    await db.collection('utenti').insertOne({ email: 'claudio.agasi@prova.it', passwordHash: 'x', ruoli: ['admin'], abilitazione: null, attivo: true });
    cartella = await mkdtemp(join(tmpdir(), 'migrazione-'));
  }, 60_000);

  afterAll(async () => {
    await db?.dropDatabase();
    await client?.close();
  });

  it('esporta: una riga per risorsa e per coppia cliente/progetto; non sovrascrive i file compilati', async () => {
    const r = await esporta(db, cartella);
    expect(r).toEqual({ risorse: 13, progetti: 5, fotografiaGriglia: 'creata' });
    const progetti = await leggi('progetti.csv');
    expect(progetti.map((p) => `${p.clienteTesto}/${p.progettoTesto}`)).toEqual([
      'Agocm/Reigegnerizzazione ROC',
      'Ebitemp/PortaleWeb',
      'TIM/TIMBUFE',
      'TIM/TIMBUSINESS',
      'TIM/TIMENTFE',
    ]);
    expect(progetti[0]).toMatchObject({ codice: 'Reigegnerizzazione-ROC', clienteCodice: 'Agocm', stato: 'inValutazione', allocazioni: expect.stringMatching(/^9 allocazioni/) });
    await expect(esporta(db, cartella)).rejects.toThrow(/esistono già/);
  });

  it('importa rifiuta file con errori senza scrivere nulla', async () => {
    const risorse = await leggi('risorse.csv');
    risorse[0].email = 'non-valida';
    risorse[1].abilitazione = 'capo';
    await scrivi('risorse.csv', COLONNE_RISORSE, risorse);
    const progetti = await leggi('progetti.csv');
    progetti[0].progettoTesto = 'Reingegnerizzazione ROC'; // testo originale modificato: non va
    progetti[1].stato = 'inCorso'; // senza data di inizio né PM
    await scrivi('progetti.csv', COLONNE_PROGETTI, progetti);

    const r = await importa(client, db, cartella);
    expect(r.errori).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/risorse.csv riga 2: email "non-valida" non valida/),
        expect.stringMatching(/risorse.csv riga 3: abilitazione "capo" non valida/),
        expect.stringMatching(/progetti.csv riga 2: la coppia .* non c'è nelle allocazioni/),
        expect.stringMatching(/progetti.csv riga 3: stato inCorso: serve dataInizio/),
        expect.stringMatching(/progetti.csv riga 3: stato inCorso: serve almeno un PM/),
        expect.stringMatching(/manca la riga per "Agocm" \/ "Reigegnerizzazione ROC"/),
      ]),
    );
    expect(await db.collection('progetti').countDocuments()).toBe(0);
  });

  it('prova, importazione, verifica: tutto collegato e griglia invariata; ripetibile', async () => {
    // Compilazione: email per tutti tranne una risorsa; due abilitazioni; un ruolo nuovo.
    const risorse = await leggi('risorse.csv');
    const emailDi = (r: Riga) => `${r.nome}.${r.cognome}@prova.it`.toLowerCase().replace(/\s/g, '');
    for (const r of risorse) Object.assign(r, { email: emailDi(r), accesso: 'si', abilitazione: '' });
    risorse.at(-1)!.email = '';
    const agasi = risorse.find((r) => r.cognome === 'Agasi')!;
    Object.assign(agasi, { abilitazione: 'PMSenior', ruoloCodice: 'RESP', ruoloDescrizione: 'Responsabile', ruoloDal: '01/03/2020', oreContrattualiGiorno: '7,5' });
    const pm = risorse.find((r) => r !== agasi && r.email)!;
    pm.abilitazione = 'pm';
    await scrivi('risorse.csv', COLONNE_RISORSE, risorse);

    // Progetti: TIMBUSINESS confluisce in TIMBUFE (stesso codice e stessi dati); ROC con il codice corretto.
    const progetti = await leggi('progetti.csv');
    progetti[0].progettoTesto = 'Reigegnerizzazione ROC'; // ripristina il testo alterato nel test precedente
    for (const p of progetti) Object.assign(p, { centroCostoCodice: 'CDC-SVIL', centroCostoDescrizione: 'Sviluppo', pm: pm.email, stato: 'inCorso', dataInizio: '2027-01-01' });
    const tim = progetti.filter((p) => p.progettoTesto === 'TIMBUFE' || p.progettoTesto === 'TIMBUSINESS');
    for (const p of tim) Object.assign(p, { codice: 'TIMBUFE', titolo: 'TIM — front end Business', tl: agasi.email });
    Object.assign(progetti[0], { codice: 'ROC', titolo: 'Reingegnerizzazione ROC', stato: 'inValutazione', pm: '', dataInizio: '' });
    await scrivi('progetti.csv', COLONNE_PROGETTI, progetti);

    const prova = await importa(client, db, cartella, { prova: true });
    expect(prova.errori).toEqual([]);
    expect(prova.conteggi).toMatchObject({ progettiCreati: 4, utentiCreati: 11, utentiAggiornati: 1, allocazioniCollegate: 32 });
    expect(await db.collection('progetti').countDocuments()).toBe(0);
    expect(await db.collection('utenti').countDocuments()).toBe(1);

    const r = await importa(client, db, cartella);
    expect(r.errori).toEqual([]);
    expect(r.avvisi).toEqual(expect.arrayContaining([expect.stringMatching(/senza email/), expect.stringMatching(/ROC senza PM/)]));
    expect(r.conteggi).toEqual({
      ruoliCreati: 1,
      risorseAggiornate: 13,
      utentiCreati: 11,
      utentiAggiornati: 1,
      clientiCreati: 3,
      centriCreati: 1,
      progettiCreati: 4,
      progettiAggiornati: 0,
      allocazioniCollegate: 32,
    });

    // Utenti: l'amministratore esistente è collegato e diventa PMSenior; i nuovi entrano con la password provvisoria.
    const admin = await db.collection('utenti').findOne({ email: agasi.email });
    expect(admin).toMatchObject({ ruoli: ['admin', 'risorsa'], abilitazione: 'PMSenior', risorsaId: new mongoose.Types.ObjectId(agasi.id) });
    const password = leggiCsv(await readFile(r.filePassword!, 'utf8')).righe;
    expect(password).toHaveLength(11);
    const nuovo = await db.collection('utenti').findOne({ email: pm.email });
    expect(nuovo).toMatchObject({ abilitazione: 'PM', deveCambiarePassword: true });
    expect(await verificaPassword(password.find((p) => p.email === pm.email)!.passwordProvvisoria, nuovo!.passwordHash as string)).toBe(true);

    const risorsaAgasi = await db.collection('risorse').findOne({ _id: new mongoose.Types.ObjectId(agasi.id) });
    expect(risorsaAgasi).toMatchObject({ oreContrattualiGiorno: 7.5, storicoRuoli: [{ dal: new Date('2020-03-01T00:00:00Z') }], modificatoDa: 'sistema:migrazione' });
    const timbufe = await db.collection('progetti').findOne({ codice: 'TIMBUFE' });
    expect(timbufe?.aliasPianificatore).toHaveLength(2);
    expect(timbufe?.approvatori).toEqual([
      { risorsaId: new mongoose.Types.ObjectId(pm.id), profilo: 'PM' },
      { risorsaId: new mongoose.Types.ObjectId(agasi.id), profilo: 'TL' },
    ]);

    const v = await verifica(db, cartella);
    expect(v.problemi).toEqual([]);
    expect(v.riepilogo).toMatchObject({ risorse: 13, risorseSenzaEmail: [expect.any(String)], allocazioniConTesto: 32, allocazioniCollegate: 32, griglia: 'uguale a prima' });

    // Ripetibile: nessun doppione, nessun utente nuovo.
    const ancora = await importa(client, db, cartella);
    expect(ancora.conteggi).toMatchObject({ progettiCreati: 0, progettiAggiornati: 4, utentiCreati: 0, ruoliCreati: 0, clientiCreati: 0 });
    expect(ancora.filePassword).toBeUndefined();
    expect(await db.collection('progetti').countDocuments()).toBe(4);
  });

  it('il Pianificatore conserva il collegamento e risolve le nuove allocazioni scritte con il vecchio testo', async () => {
    const url = new URL(URI_BASE!);
    url.pathname = `/${NOME_DB}`;
    const conn = await mongoose.createConnection(url.toString()).asPromise();
    try {
      const progettiModel = conn.model(Progetto.name, ProgettoSchema);
      const servizio = new RisorseService(
        conn.model(Risorsa.name, RisorsaSchema) as never,
        progettiModel as never,
        conn.model(Attivita.name, AttivitaSchema) as never,
        new AllocazioniService(progettiModel as never, conn.model(Cliente.name, ClienteSchema) as never),
        new PermessiService(),
      );
      const risorsa = await db.collection('risorse').findOne({ 'planned.progettoTesto': 'TIMBUFE' });
      // Come il frontend: JSON in andata e ritorno, più una riga nuova scritta con il vecchio testo.
      const dalBrowser = JSON.parse(JSON.stringify(await servizio.findOne(String(risorsa!._id)))) as { planned: Record<string, unknown>[] };
      dalBrowser.planned.push({ mese: '209912', cliente: 'TIM', progetto: 'TIMBUSINESS', percentualeAllocazione: 10 });
      const salvata = await servizio.update(PMSENIOR, String(risorsa!._id), dalBrowser as never);
      const timbufe = await db.collection('progetti').findOne({ codice: 'TIMBUFE' });
      expect(salvata.planned.find((a) => a.mese === '209912')).toMatchObject({ progetto: 'TIMBUFE', progettoId: timbufe!._id });
      const salvataNelDb = await db.collection('risorse').findOne({ _id: risorsa!._id });
      expect(salvataNelDb!.planned.every((a: Record<string, unknown>) => a.cliente === undefined && a.progetto === undefined)).toBe(true);

      dalBrowser.planned.push({ mese: '209912', cliente: 'Nuovo', progetto: 'Sconosciuto', percentualeAllocazione: 5 });
      await expect(servizio.update(PMSENIOR, String(risorsa!._id), dalBrowser as never)).rejects.toThrow(BadRequestException);
    } finally {
      await conn.close();
    }
  });
});
