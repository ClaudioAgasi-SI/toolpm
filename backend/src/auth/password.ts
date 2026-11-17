import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

/** Parametri di scrypt (memoria ~16 MB per calcolo). Restano scritti nell'hash, quindi si possono alzare in futuro. */
const N = 16384;
const R = 8;
const P = 1;
const LUNGHEZZA = 64;

/** Lunghezza minima delle password. */
export const PASSWORD_MIN = 10;

/** Cifra una password: "scrypt$N$r$p$sale$hash" (sale e hash in base64). */
export async function cifraPassword(password: string): Promise<string> {
  const sale = randomBytes(16);
  const hash = await scrypt(password, sale, LUNGHEZZA, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return ['scrypt', N, R, P, sale.toString('base64'), hash.toString('base64')].join('$');
}

/** Confronta una password con l'hash salvato, in tempo costante. */
export async function verificaPassword(password: string, salvato: string | undefined | null): Promise<boolean> {
  const parti = (salvato ?? '').split('$');
  if (parti.length !== 6 || parti[0] !== 'scrypt') return false;
  const [, n, r, p, sale, hash] = parti;
  const atteso = Buffer.from(hash, 'base64');
  const calcolato = await scrypt(password, Buffer.from(sale, 'base64'), atteso.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return calcolato.length === atteso.length && timingSafeEqual(calcolato, atteso);
}

/** Motivo per cui una nuova password non va bene, oppure null. */
export function problemaPassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return `La password deve avere almeno ${PASSWORD_MIN} caratteri`;
  }
  return null;
}
