// Password per gli utenti creati dalla migrazione: stesso formato di backend/src/auth/password.ts
// ("scrypt$N$r$p$sale$hash"), così il backend le riconosce. Un test controlla che restino compatibili.
import { randomBytes, randomInt, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const N = 16384;
const R = 8;
const P = 1;

export async function cifraPassword(password) {
  const sale = randomBytes(16);
  const hash = await scrypt(password, sale, 64, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return ['scrypt', N, R, P, sale.toString('base64'), hash.toString('base64')].join('$');
}

/** Password provvisoria di 12 caratteri, senza caratteri facili da confondere (0/O, 1/l/I). */
export function passwordProvvisoria() {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => alfabeto[randomInt(alfabeto.length)]).join('');
}
