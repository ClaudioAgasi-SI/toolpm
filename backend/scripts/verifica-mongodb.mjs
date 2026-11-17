// Verifica la connessione a MongoDB prima e dopo il passaggio a replica set (blocco B0 della fase 1).
//
// Uso:
//   node scripts/verifica-mongodb.mjs          (fuori da Docker: usa MONGODB_URI o localhost)
//   docker compose exec backend node scripts/verifica-mongodb.mjs
//
// Stampa versione, replica set, conteggio dei documenti per collection e prova una transazione
// su una collection temporanea (che viene poi eliminata). Non modifica i dati esistenti.
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/toolpm?directConnection=true';
await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
const db = mongoose.connection.db;
const admin = db.admin();

const info = await admin.command({ buildInfo: 1 });
const hello = await admin.command({ hello: 1 });
console.log(`Database:     ${db.databaseName}`);
console.log(`MongoDB:      ${info.version}`);
console.log(`Replica set:  ${hello.setName ?? 'nessuno (istanza singola)'}`);
if (hello.setName) console.log(`Primario:     ${hello.isWritablePrimary ? 'sì' : 'no'} (${hello.me ?? '?'})`);

console.log('\nCollection:');
for (const { name } of await db.listCollections().toArray()) {
  console.log(`- ${name}: ${await db.collection(name).countDocuments()} documenti`);
}

let esito = 0;
if (!hello.setName) {
  console.log('\nTransazioni: non disponibili (serve un replica set, vedi docs/mongodb-replica-set.md)');
  esito = 1;
} else {
  const nome = `_verifica_transazione_${Date.now()}`;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection(nome).insertOne({ prova: true }, { session });
    });
    console.log('\nTransazioni: disponibili');
  } catch (err) {
    console.log(`\nTransazioni: errore (${err.message})`);
    esito = 1;
  } finally {
    await session.endSession();
    await db.collection(nome).drop().catch(() => {});
  }
}

await mongoose.disconnect();
process.exit(esito);
