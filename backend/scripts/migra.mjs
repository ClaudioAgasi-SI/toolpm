// Esegue gli script di migrazione di scripts/migrazioni/ (fase 1, blocco B1).
//
// Uso:
//   npm run migra                 esegue in ordine le migrazioni non ancora eseguite
//   npm run migra -- --elenco     mostra quali sono state eseguite e quali no, senza eseguire nulla
//   docker compose exec backend npm run migra
//
// Ogni file NNN-nome.mjs esporta `descrizione` (testo) ed `esegui(db, contesto)`, dove `db` è il
// database MongoDB (driver nativo) e `contesto` contiene { utente: 'sistema:migrazione', ora }.
// Le migrazioni eseguite sono registrate nella collection "migrazioni": rieseguire il comando non
// le ripete. Ogni migrazione deve comunque essere scritta in modo da poter essere ripetuta senza danni.
// Prima di eseguire, fare un backup (docs/mongodb-replica-set.md, punto 2).
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { daEseguire } from './migrazioni/elenco.mjs';

const cartella = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrazioni');
const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/toolpm?directConnection=true';
const soloElenco = process.argv.includes('--elenco');

await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
const db = mongoose.connection.db;
const registro = db.collection('migrazioni');

const file = (await readdir(cartella)).filter((f) => /^\d{3}-.+\.mjs$/.test(f));
const fatte = new Set((await registro.find({}, { projection: { _id: 1 } }).toArray()).map((d) => d._id));
const { eseguite, mancanti } = daEseguire(file, fatte);

console.log(`Database: ${db.databaseName}`);
for (const nome of eseguite) console.log(`  già eseguita  ${nome}`);
for (const nome of mancanti) console.log(`  da eseguire   ${nome}`);

let esito = 0;
if (!soloElenco) {
  for (const nome of mancanti) {
    const modulo = await import(pathToFileURL(path.join(cartella, `${nome}.mjs`)).href);
    const inizio = Date.now();
    const contesto = { utente: 'sistema:migrazione', ora: new Date() };
    try {
      const risultato = await modulo.esegui(db, contesto);
      await registro.insertOne({
        _id: nome,
        descrizione: modulo.descrizione,
        eseguitaIl: new Date(),
        durataMs: Date.now() - inizio,
        risultato: risultato ?? null,
        creatoIl: contesto.ora,
        creatoDa: contesto.utente,
        modificatoIl: contesto.ora,
        modificatoDa: contesto.utente,
      });
      console.log(`✔ ${nome}: ${modulo.descrizione}${risultato ? ` — ${JSON.stringify(risultato)}` : ''}`);
    } catch (err) {
      console.error(`✘ ${nome}: ${err.message}`);
      esito = 1;
      break; // le migrazioni successive possono dipendere da questa
    }
  }
  if (!mancanti.length) console.log('Nessuna migrazione da eseguire.');
}

await mongoose.disconnect();
process.exit(esito);
