// Indice unico sull'email degli utenti (fase 1, blocco B2).
export const descrizione = 'Indice unico sull\'email degli utenti';

export async function esegui(db) {
  await db.collection('utenti').createIndex({ email: 1 }, { unique: true });
  return { indice: 'utenti.email' };
}
