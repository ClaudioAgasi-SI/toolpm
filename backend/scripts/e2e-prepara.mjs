// Prepara il database delle prove nel browser della Consuntivazione (fase 2, blocco C7): e2e/README.md.
//
// Uso (dalla cartella backend, con un MongoDB di PROVA):
//   MONGODB_URI="mongodb://localhost:27017/toolpm_e2e?directConnection=true" node scripts/e2e-prepara.mjs
//
// ATTENZIONE: cancella il database indicato. Per sicurezza il nome deve finire con "_e2e".
// Poi esegue tutte le migrazioni e crea utenti, ruoli, progetti e allocazioni di prova; tipologie e tariffe
// le crea la prova stessa dalle pagine del controller. Le date sono relative a oggi: la prova lavora sulla
// settimana scorsa, così tutti i giorni sono già passati.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { cifraPassword } from './migrazione-dati/password.mjs';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Imposta MONGODB_URI (database di prova che finisce con _e2e)');
await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
const db = mongoose.connection.db;
if (!db.databaseName.endsWith('_e2e')) throw new Error(`Il database ${db.databaseName} non finisce con _e2e: non lo cancello`);
await db.dropDatabase();

const cartella = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrazioni');
for (const f of readdirSync(cartella).filter((n) => /^\d{3}-.+\.mjs$/.test(n)).sort()) {
  await (await import(pathToFileURL(path.join(cartella, f)).href)).esegui(db, { utente: 'sistema:e2e', ora: new Date() });
}

const oggi = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date())}T00:00:00Z`);
const lunediScorso = new Date(oggi.getTime() - (((oggi.getUTCDay() + 6) % 7) + 7) * 86_400_000);
const mese = (d) => d.toISOString().slice(0, 7).replace('-', '');
const mesi = [...new Set([0, 6].map((n) => mese(new Date(lunediScorso.getTime() + n * 86_400_000))))];
const inizioAnno = new Date(Date.UTC(lunediScorso.getUTCFullYear() - 1, 0, 1));

const ruolo = (await db.collection('ruoli').insertOne({ codice: 'SVS', descrizione: 'Sviluppatore senior', attivo: true })).insertedId;
const cdc = (await db.collection('centri_costo').insertOne({ codice: 'CDC-SVI', descrizione: 'Sviluppo', attivo: true })).insertedId;

const hash = await cifraPassword('Password-e2e-1');
const persone = {};
for (const [nome, ruoli, conRuolo] of [
  ['rita', ['risorsa'], true],
  ['luca', ['risorsa'], false],
  ['carlo', ['risorsa', 'controller'], true],
]) {
  const r = await db.collection('risorse').insertOne({
    cognome: nome.charAt(0).toUpperCase() + nome.slice(1),
    nome: 'Prova',
    email: `${nome}@prova.it`,
    oreContrattualiGiorno: 8,
    storicoRuoli: conRuolo ? [{ ruoloId: ruolo, dal: inizioAnno }] : [],
    skillTecnici: [],
    skillAmbiti: [],
    skillFunzionali: [],
    certificazioni: [],
    planned: [],
  });
  persone[nome] = r.insertedId;
  await db.collection('utenti').insertOne({
    email: `${nome}@prova.it`,
    passwordHash: hash,
    abilitazione: null,
    ruoli,
    attivo: true,
    deveCambiarePassword: false,
    risorsaId: r.insertedId,
  });
}

const progetto = async (codice, titolo, stato = 'inCorso') =>
  (
    await db.collection('progetti').insertOne({
      codice,
      titolo,
      centroCostoId: cdc,
      stato,
      dataInizio: inizioAnno,
      ...(stato === 'chiuso' ? { dataFine: inizioAnno } : {}),
      approvatori: [],
      percentualeCompletamento: 0,
      soloSuAttivita: false,
    })
  ).insertedId;
const alfa = await progetto('ALFA', 'Portale clienti');
const beta = await progetto('BETA', 'Manutenzione evolutiva');
await progetto('GAMMA', 'Progetto chiuso', 'chiuso');
const attivita = (codice, descrizione, assegnate) => ({
  progettoId: alfa,
  codice,
  descrizione,
  stato: 'attiva',
  percentualeCompletamento: 20,
  risorseAssegnateIds: assegnate,
});
await db.collection('attivita').insertMany([attivita('SVI', 'Sviluppo front end', [persone.rita]), attivita('TEST', 'Collaudo', [])]);
// rita e luca allocati su BETA nei mesi della settimana scorsa.
for (const nome of ['rita', 'luca']) {
  await db.collection('risorse').updateOne(
    { _id: persone[nome] },
    { $set: { planned: mesi.map((m) => ({ mese: m, progettoId: beta, percentualeAllocazione: 50 })) } },
  );
}
console.log(`Database ${db.databaseName} pronto: settimana di prova dal ${lunediScorso.toISOString().slice(0, 10)}`);
await mongoose.disconnect();
