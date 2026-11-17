// Logica di scelta delle migrazioni, separata dallo script per poterla provare con i test.

/**
 * Divide i file di migrazione (NNN-nome.mjs) in già eseguiti e da eseguire, in ordine di numero.
 * @param {string[]} file nomi dei file nella cartella
 * @param {Set<string>} fatte nomi (senza estensione) registrati nella collection "migrazioni"
 */
export function daEseguire(file, fatte) {
  const nomi = file
    .filter((f) => /^\d{3}-.+\.mjs$/.test(f))
    .map((f) => f.replace(/\.mjs$/, ''))
    .sort();
  const numeri = nomi.map((n) => n.slice(0, 3));
  const doppio = numeri.find((n, i) => numeri.indexOf(n) !== i);
  if (doppio) throw new Error(`Due migrazioni con lo stesso numero: ${doppio}`);
  return {
    eseguite: nomi.filter((n) => fatte.has(n)),
    mancanti: nomi.filter((n) => !fatte.has(n)),
  };
}
