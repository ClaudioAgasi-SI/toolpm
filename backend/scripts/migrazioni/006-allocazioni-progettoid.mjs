// Blocco B5 della fase 1: le allocazioni collegate a un progetto (progettoId) non salvano più i testi
// cliente e progetto, che il backend ricava dal progetto. I testi originali restano in clienteTesto e
// progettoTesto (copiati dalla migrazione B7). Le allocazioni non ancora collegate non vengono toccate.
export const descrizione = 'Allocazioni: tolti i testi cliente e progetto dove c\'è progettoId';

export async function esegui(db, { utente, ora }) {
  const risorse = db.collection('risorse');
  let risorseModificate = 0;
  let allocazioniPulite = 0;
  let nonCollegate = 0;
  for await (const r of risorse.find({ 'planned.0': { $exists: true } })) {
    let cambiata = false;
    const planned = r.planned.map((a) => {
      const haTesto = 'cliente' in a || 'progetto' in a;
      if (!a.progettoId) {
        if ((a.cliente ?? '').trim() || (a.progetto ?? '').trim()) nonCollegate++;
        return a;
      }
      if (!haTesto) return a;
      const { cliente, progetto, ...resto } = a;
      cambiata = true;
      allocazioniPulite++;
      return {
        ...resto,
        clienteTesto: resto.clienteTesto ?? (cliente ?? '').trim(),
        progettoTesto: resto.progettoTesto ?? (progetto ?? '').trim(),
      };
    });
    if (cambiata) {
      await risorse.updateOne({ _id: r._id }, { $set: { planned, modificatoIl: ora, modificatoDa: utente } });
      risorseModificate++;
    }
  }
  return { risorseModificate, allocazioniPulite, nonCollegate };
}
