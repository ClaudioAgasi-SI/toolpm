// Report (fase 4, blocco E3): al massimo un'esecuzione "inCorso" per procedura (decisione 12).
// L'indice unico parziale fa da blocco contro esecuzioni contemporanee (notturna, all'avvio, "Esegui ora").
export const descrizione = 'Esecuzioni batch: una sola esecuzione in corso per procedura';

export async function esegui(db) {
  // Esecuzioni rimaste "inCorso" da prima (non dovrebbero esserci): diventano interrotte, altrimenti l'indice fallisce.
  const ora = new Date();
  const r = await db.collection('esecuzioni_batch').updateMany(
    { stato: 'inCorso' },
    { $set: { stato: 'interrotta', fine: ora, motivo: 'Trovata in corso durante la migrazione 010: considerata interrotta', modificatoIl: ora, modificatoDa: 'sistema:migrazione' } },
  );
  await db.collection('esecuzioni_batch').createIndex(
    { procedura: 1 },
    { name: 'una_in_corso_per_procedura', unique: true, partialFilterExpression: { stato: 'inCorso' } },
  );
  return { interrotte: r.modifiedCount, indici: 1 };
}
