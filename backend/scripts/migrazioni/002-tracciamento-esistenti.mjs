// Campi di tracciamento sui documenti creati prima della fase 1.
export const descrizione = 'Tracciamento dei salvataggi sui documenti esistenti di risorse, skills, rate e certificazioni';

const COLLECTION = ['risorse', 'skills', 'rate', 'certificazioni'];

export async function esegui(db, { utente, ora }) {
  const aggiornati = {};
  for (const nome of COLLECTION) {
    // Solo i documenti che non hanno ancora i campi: rieseguire non cambia nulla.
    const r = await db
      .collection(nome)
      .updateMany(
        { creatoIl: { $exists: false } },
        { $set: { creatoIl: ora, creatoDa: utente, modificatoIl: ora, modificatoDa: utente } },
      );
    aggiornati[nome] = r.modifiedCount;
  }
  return aggiornati;
}
