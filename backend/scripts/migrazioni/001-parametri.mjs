// Parametri iniziali di sistema (collection "parametri").
export const descrizione = 'Parametri iniziali: ore per giorno e soglie degli stati EVM';

const PARAMETRI = [
  {
    chiave: 'oreGiorno',
    valore: 8,
    descrizione: 'Ore lavorative che fanno un giorno (confronto tra ore consuntivate e stime in giorni)',
  },
  {
    chiave: 'soglieEvm',
    valore: { anticipo: 1.05, ritardo: 0.95, fortementeInRitardo: 0.85 },
    descrizione:
      'Soglie di SPI e CPI: >= anticipo "In anticipo"/"Sotto budget"; >= ritardo "In linea"; >= fortementeInRitardo "In ritardo"/"Sopra budget"; sotto "In forte ritardo"/"Fortemente sopra budget"',
  },
];

export async function esegui(db, { utente, ora }) {
  const parametri = db.collection('parametri');
  await parametri.createIndex({ chiave: 1 }, { unique: true });
  let creati = 0;
  for (const p of PARAMETRI) {
    // Un parametro già presente (magari modificato) non viene toccato.
    const r = await parametri.updateOne(
      { chiave: p.chiave },
      { $setOnInsert: { ...p, creatoIl: ora, creatoDa: utente, modificatoIl: ora, modificatoDa: utente } },
      { upsert: true },
    );
    creati += r.upsertedCount;
  }
  return { creati };
}
