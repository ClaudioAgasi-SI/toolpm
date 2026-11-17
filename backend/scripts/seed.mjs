// Importa i file JSON della cartella db/ nelle collection MongoDB.
//
// Uso:
//   node scripts/seed.mjs            -> importa solo nelle collection vuote
//   node scripts/seed.mjs --replace  -> svuota le collection e le reimporta (ATTENZIONE: cancella i dati)
//
// Connessione: variabile MONGODB_URI (default mongodb://localhost:27017/toolpm).
// Cartella dei JSON: variabile SEED_DIR (default ../db rispetto a backend/).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const here = path.dirname(fileURLToPath(import.meta.url));
const seedDir = process.env.SEED_DIR ?? path.resolve(here, '../../db');
const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/toolpm';
const replace = process.argv.includes('--replace');
const collections = ['skills', 'rate', 'certificazioni', 'risorse'];

await mongoose.connect(uri);
const db = mongoose.connection.db;
console.log(`Database: ${db.databaseName} — cartella: ${seedDir}`);

for (const name of collections) {
  const docs = JSON.parse(await readFile(path.join(seedDir, `${name}.json`), 'utf8'));
  const col = db.collection(name);
  const count = await col.countDocuments();
  if (count > 0 && !replace) {
    console.log(`- ${name}: già presenti ${count} documenti, salto (usa --replace per reimportare)`);
    continue;
  }
  if (count > 0) await col.deleteMany({});
  // Gli _id in formato export ({"$oid": ...}) diventano ObjectId.
  // Campi di tracciamento (docs/database.md): lo script scrive direttamente, senza il plugin del backend.
  const ora = new Date();
  for (const d of docs) {
    if (d._id?.$oid) d._id = new mongoose.Types.ObjectId(d._id.$oid);
    Object.assign(d, { creatoIl: ora, creatoDa: 'sistema:seed', modificatoIl: ora, modificatoDa: 'sistema:seed' });
  }
  await col.insertMany(docs);
  console.log(`- ${name}: importati ${docs.length} documenti`);
}

await mongoose.disconnect();
