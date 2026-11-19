// Migrazione dei dati del Pianificatore verso le anagrafiche comuni (fase 1, blocco B7).
// Guida completa: docs/migrazione-dati.md
//
// Uso (in Docker: docker compose exec backend npm run migrazione-dati -- <comando>):
//   npm run migrazione-dati -- esporta [--sovrascrivi]   crea risorse.csv e progetti.csv da compilare
//   npm run migrazione-dati -- importa --prova           controlla i file e mostra cosa farebbe, senza scrivere
//   npm run migrazione-dati -- importa                   controlla e importa (tutto o niente, in una transazione)
//   npm run migrazione-dati -- verifica                  controlli finali
//
// Cartella dei file: variabile MIGRAZIONE_DIR (in Docker /migrazione = cartella "migrazione" del progetto).
// Prima di importare fare un backup (docs/mongodb-replica-set.md, punto 2).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { esporta } from './migrazione-dati/esporta.mjs';
import { importa } from './migrazione-dati/importa.mjs';
import { verifica } from './migrazione-dati/verifica.mjs';

const qui = path.dirname(fileURLToPath(import.meta.url));
const cartella = process.env.MIGRAZIONE_DIR ?? path.resolve(qui, '../../migrazione');
const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/toolpm?directConnection=true';
const [comando] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const opzione = (nome) => process.argv.includes(`--${nome}`);

if (!['esporta', 'importa', 'verifica'].includes(comando)) {
  console.error('Uso: npm run migrazione-dati -- esporta [--sovrascrivi] | importa [--prova] | verifica');
  process.exit(2);
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
const db = mongoose.connection.db;
const client = mongoose.connection.getClient();
console.log(`Database: ${db.databaseName} — cartella: ${cartella}`);
let esito = 0;
try {
  if (comando === 'esporta') {
    const r = await esporta(db, cartella, { sovrascrivi: opzione('sovrascrivi') });
    console.log(`✔ Creati risorse.csv (${r.risorse} righe) e progetti.csv (${r.progetti} righe); fotografia della griglia: ${r.fotografiaGriglia}`);
    console.log('  Compilali (vedi docs/migrazione-dati.md), poi: importa --prova');
  } else if (comando === 'importa') {
    const r = await importa(client, db, cartella, { prova: opzione('prova') });
    for (const a of r.avvisi) console.log(`  avviso: ${a}`);
    if (r.errori.length) {
      for (const e of r.errori) console.error(`  ✘ ${e}`);
      console.error(`\n${r.errori.length} errori: nulla è stato scritto. Correggi i file e riprova.`);
      esito = 1;
    } else if (r.prova) {
      console.log(`✔ Prova riuscita, nulla è stato scritto. Cosa farebbe: ${JSON.stringify(r.conteggi)}`);
    } else {
      console.log(`✔ Importazione completata: ${JSON.stringify(r.conteggi)}`);
      if (r.filePassword) {
        console.log(`  Password provvisorie degli utenti nuovi in ${path.basename(r.filePassword)}:`);
        console.log('  comunicale alle persone e poi cancella il file. Al primo accesso dovranno cambiarla.');
      }
      console.log('  Ora: verifica');
    }
  } else {
    const r = await verifica(db, cartella);
    console.log(JSON.stringify(r.riepilogo, null, 2));
    if (r.problemi.length) {
      for (const p of r.problemi) console.error(`  ✘ ${p}`);
      esito = 1;
    } else console.log('✔ Nessun problema');
  }
} catch (err) {
  console.error(`✘ ${err.message}`);
  esito = 1;
}
await mongoose.disconnect();
process.exit(esito);
