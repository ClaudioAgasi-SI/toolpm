import type mongoose from 'mongoose';
type Db = mongoose.mongo.Db;
type MongoClient = mongoose.mongo.MongoClient;
export interface EsitoImportazione {
  errori: string[];
  avvisi: string[];
  conteggi?: Record<string, number>;
  filePassword?: string;
  prova?: boolean;
}
export function controlla(db: Db, cartella: string): Promise<{ errori: string[]; avvisi: string[]; piano?: object }>;
export function importa(client: MongoClient, db: Db, cartella: string, opzioni?: { prova?: boolean }): Promise<EsitoImportazione>;
