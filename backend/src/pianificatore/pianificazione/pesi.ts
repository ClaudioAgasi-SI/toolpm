/**
 * Peso di ciascun livello di probabilità, usato per il calcolo dell'allocazione pesata
 * (es. 50% "probabile" = 37,5% pesato). Valori non presenti qui pesano 0.
 */
export const PESI_PROBABILITA: Record<string, number> = {
  sicura: 1,
  probabile: 0.75,
  forse: 0.5,
  improbabile: 0.25,
  nessuna: 0,
};

export function pesoProbabilita(valore: string | undefined): number {
  if (!valore) return 1; // probabilità non indicata: si considera certa
  return PESI_PROBABILITA[valore.trim().toLowerCase()] ?? 0;
}
