// Aggiunge al database delle prove nel browser le ore già approvate che servono alla prova dei report (fase 4, blocco E7).
//
// Uso (dalla cartella backend, DOPO scripts/e2e-prepara.mjs, sullo stesso database di prova):
//   MONGODB_URI="mongodb://localhost:27017/toolpm_e2e?directConnection=true" node scripts/e2e-report.mjs
//
// Dati (date relative a oggi, da 60 a 14 giorni fa, da lunedì a venerdì):
// - rita: 8 ore al giorno su ALFA › SVI, approvate da pina, tariffa 40 €/h (320 € al giorno);
// - tito: 4 ore al giorno su ALFA senza attività, approvate da pina, tariffa 50 €/h (200 € al giorno);
// - due righe di rita ancora inviate (in attesa) negli ultimi due giorni del periodo;
// - storico della percentuale di ALFA: 0 → 10% 50 giorni fa, 10 → 25% 20 giorni fa.
// La prova e2e/report.py ricalcola gli stessi numeri.
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Imposta MONGODB_URI (database di prova che finisce con _e2e)');
await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
const db = mongoose.connection.db;
if (!db.databaseName.endsWith('_e2e')) throw new Error(`Il database ${db.databaseName} non finisce con _e2e`);

const oggi = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date())}T00:00:00Z`);
const giorno = (n) => new Date(oggi.getTime() - n * 86_400_000);
const giorniLavorativi = [];
for (let n = 60; n >= 14; n--) {
  const d = giorno(n);
  if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) giorniLavorativi.push(d);
}

const alfa = await db.collection('progetti').findOne({ codice: 'ALFA' });
const svi = await db.collection('attivita').findOne({ progettoId: alfa._id, codice: 'SVI' });
const ordinaria = await db.collection('tipologie_costo').findOne({ codice: 'ORDINARIA' });
const persona = async (nome) => {
  const u = await db.collection('utenti').findOne({ email: `${nome}@prova.it` });
  return { risorsaId: u.risorsaId, utente: String(u._id) };
};
const [rita, tito, pina] = await Promise.all(['rita', 'tito', 'pina'].map(persona));

const riga = (attivitaId, minuti, euroOra, stato, d) => ({
  _id: new mongoose.Types.ObjectId(),
  progettoId: alfa._id,
  attivitaId,
  centroCostoId: alfa.centroCostoId,
  tipologiaId: ordinaria._id,
  tipologiaCodice: 'ORDINARIA',
  minuti,
  nota: null,
  stato,
  fonteTariffa: 'standard',
  tariffaId: null,
  tariffaCentesimiOra: euroOra * 100,
  costoCentesimi: (minuti / 60) * euroOra * 100,
  approvazioneTL: null,
  approvazionePM: stato === 'approvata' ? { da: pina.utente, il: new Date(d.getTime() + 86_400_000) } : null,
  rifiuto: null,
  modificatoIl: new Date(),
  modificatoDa: 'sistema:e2e',
});
const giornata = (chi, d, righe) => ({
  risorsaId: chi.risorsaId,
  data: d,
  mese: d.toISOString().slice(0, 7).replace('-', ''),
  versione: 1,
  righe,
  creatoIl: new Date(),
  creatoDa: 'sistema:e2e',
  modificatoIl: new Date(),
  modificatoDa: 'sistema:e2e',
});
const ultimi = giorniLavorativi.slice(-2).map((d) => d.getTime());
await db.collection('consuntivi').insertMany([
  ...giorniLavorativi.map((d) => giornata(rita, d, [riga(svi._id, 480, 40, ultimi.includes(d.getTime()) ? 'inviata' : 'approvata', d)])),
  ...giorniLavorativi.map((d) => giornata(tito, d, [riga(null, 240, 50, 'approvata', d)])),
]);
await db.collection('avanzamenti').insertMany([
  { progettoId: alfa._id, valorePrecedente: 0, valoreNuovo: 10, il: new Date(giorno(50).getTime() + 10 * 3600_000), da: pina.utente },
  { progettoId: alfa._id, valorePrecedente: 10, valoreNuovo: 25, il: new Date(giorno(20).getTime() + 10 * 3600_000), da: pina.utente },
]);
console.log(`Ore dei report aggiunte: ${giorniLavorativi.length} giorni lavorativi (da ${giorniLavorativi[0].toISOString().slice(0, 10)} a ${giorniLavorativi.at(-1).toISOString().slice(0, 10)})`);
await mongoose.disconnect();
