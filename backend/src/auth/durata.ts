/** Converte una durata come "8h", "30m", "7d", "45s" (o un numero di secondi) in millisecondi. */
export function durataInMs(durata: string | number): number {
  if (typeof durata === 'number') return durata * 1000;
  const m = /^(\d+)\s*([smhd])$/.exec(durata.trim());
  if (!m) throw new Error(`Durata non valida: "${durata}" (esempi: 30m, 8h, 7d)`);
  const unita = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 's' | 'm' | 'h' | 'd'];
  return Number(m[1]) * unita;
}
