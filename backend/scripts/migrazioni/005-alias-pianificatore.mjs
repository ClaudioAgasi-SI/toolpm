// Indice per collegare le allocazioni scritte a testo ai progetti (fase 1, blocco B7).
export const descrizione = 'Indice sui testi cliente/progetto del Pianificatore associati ai progetti (aliasPianificatore)';

export async function esegui(db) {
  await db.collection('progetti').createIndex({ 'aliasPianificatore.cliente': 1, 'aliasPianificatore.progetto': 1 });
  return { indice: 'progetti.aliasPianificatore' };
}
