import type mongoose from 'mongoose';
type Db = mongoose.mongo.Db;
export function verifica(db: Db, cartella: string): Promise<{ problemi: string[]; riepilogo: Record<string, unknown> }>;
