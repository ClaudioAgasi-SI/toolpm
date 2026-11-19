import type mongoose from 'mongoose';
type Db = mongoose.mongo.Db;
export function esporta(
  db: Db,
  cartella: string,
  opzioni?: { sovrascrivi?: boolean },
): Promise<{ risorse: number; progetti: number; fotografiaGriglia: 'creata' | 'già presente' }>;
