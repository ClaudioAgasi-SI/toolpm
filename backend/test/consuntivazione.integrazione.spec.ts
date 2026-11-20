/**
 * Test di integrazione della sezione Consuntivazione (fase 2) contro un MongoDB vero (replica set).
 * Blocco C0: migrazione 007 (validatori, indici, tipologie iniziali con ORDINARIA predefinita).
 *
 * Si esegue solo se è impostata MONGODB_URI_TEST, es.:
 *   MONGODB_URI_TEST="mongodb://localhost:27017/?directConnection=true" npm test
 * Ogni esecuzione usa un database nuovo (toolpm_test_<numero>) e lo cancella alla fine.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

const URI_BASE = process.env.MONGODB_URI_TEST;
const NOME_DB = `toolpm_test_${Date.now()}_cons`;
const CARTELLA = join(import.meta.dirname, '../scripts/migrazioni');
const CONTESTO = () => ({ utente: 'sistema:test', ora: new Date() });

describe.skipIf(!URI_BASE)('Consuntivazione con MongoDB vero', () => {
  let client: mongoose.mongo.MongoClient;
  let db: mongoose.mongo.Db;

  beforeAll(async () => {
    const url = new URL(URI_BASE!);
    url.pathname = `/${NOME_DB}`;
    client = await mongoose.mongo.MongoClient.connect(url.toString());
    db = client.db(NOME_DB);
    for (const f of readdirSync(CARTELLA).filter((n) => /^\d{3}-.+\.mjs$/.test(n)).sort()) {
      await (await import(pathToFileURL(join(CARTELLA, f)).href)).esegui(db, CONTESTO());
    }
  });

  afterAll(async () => {
    await db?.dropDatabase();
    await client?.close();
  });

  describe('migrazione 007-consuntivazione', () => {
    const migrazione = () => import(pathToFileURL(join(CARTELLA, '007-consuntivazione.mjs')).href);

    it('crea le quattro tipologie iniziali, con ORDINARIA unica predefinita', async () => {
      const tipologie = await db.collection('tipologie_costo').find({}, { sort: { ordine: 1 } }).toArray();
      expect(tipologie.map((t) => t.codice)).toEqual(['ORDINARIA', 'STRAORDINARIA', 'STRAORD_NOTTURNA', 'STRAORD_FESTIVA']);
      expect(tipologie.filter((t) => t.predefinita).map((t) => t.codice)).toEqual(['ORDINARIA']);
      expect(tipologie.every((t) => t.attiva && t.creatoDa === 'sistema:test')).toBe(true);
    });

    it('si può rieseguire: non duplica e non tocca le tipologie modificate', async () => {
      await db.collection('tipologie_costo').updateOne({ codice: 'STRAORDINARIA' }, { $set: { descrizione: 'Straordinario diurno' } });
      const esito = await (await migrazione()).esegui(db, CONTESTO());
      expect(esito.tipologieCreate).toBe(0);
      expect(await db.collection('tipologie_costo').countDocuments()).toBe(4);
      const s = await db.collection('tipologie_costo').findOne({ codice: 'STRAORDINARIA' });
      expect(s?.descrizione).toBe('Straordinario diurno');
    });

    it('rispetta una predefinita scelta dal controller', async () => {
      const t = db.collection('tipologie_costo');
      await t.updateOne({ codice: 'ORDINARIA' }, { $set: { predefinita: false } });
      await t.updateOne({ codice: 'STRAORDINARIA' }, { $set: { predefinita: true } });
      await t.deleteOne({ codice: 'ORDINARIA' });
      await (await migrazione()).esegui(db, CONTESTO());
      expect((await t.find({ predefinita: true }).toArray()).map((x) => x.codice)).toEqual(['STRAORDINARIA']);
      // Ripristino per i test successivi.
      await t.updateOne({ codice: 'STRAORDINARIA' }, { $set: { predefinita: false } });
      await t.updateOne({ codice: 'ORDINARIA' }, { $set: { predefinita: true } });
    });

    it('una sola tipologia predefinita e codici unici', async () => {
      const t = db.collection('tipologie_costo');
      await expect(t.updateOne({ codice: 'STRAORD_FESTIVA' }, { $set: { predefinita: true } })).rejects.toMatchObject({ code: 11000 });
      const base = { descrizione: 'x', ordine: 9, categoria: 'ordinaria', attiva: true, predefinita: false };
      await expect(t.insertOne({ codice: 'ORDINARIA', ...base })).rejects.toMatchObject({ code: 11000 });
      await expect(t.insertOne({ codice: 'ALTRA', ...base, categoria: 'notturna' })).rejects.toMatchObject({ code: 121 });
    });

    it('tariffe: importo intero non negativo, riferimenti obbligatori', async () => {
      const id = () => new mongoose.Types.ObjectId();
      const ok = { ruoloId: id(), tipologiaId: id(), validoDal: new Date('2027-01-01'), validoAl: null, centesimiOra: 3900 };
      await db.collection('tariffe_standard').insertOne(ok);
      await expect(db.collection('tariffe_standard').insertOne({ ...ok, centesimiOra: 39.5 })).rejects.toMatchObject({ code: 121 });
      await expect(db.collection('tariffe_standard').insertOne({ ...ok, centesimiOra: -1 })).rejects.toMatchObject({ code: 121 });
      const { ruoloId: _, ...senzaRuolo } = ok;
      await expect(db.collection('tariffe_personalizzate').insertOne(senzaRuolo)).rejects.toMatchObject({ code: 121 });
      await db.collection('tariffe_personalizzate').insertOne({ ...senzaRuolo, risorsaId: id() });
    });

    it('consuntivi: una giornata per risorsa, minuti a passi di 15, stati ammessi', async () => {
      const id = () => new mongoose.Types.ObjectId();
      const risorsaId = id();
      const riga = (extra: object = {}) => ({
        _id: id(),
        progettoId: id(),
        attivitaId: null,
        centroCostoId: id(),
        tipologiaId: id(),
        tipologiaCodice: 'ORDINARIA',
        minuti: 360,
        stato: 'bozza',
        fonteTariffa: null,
        tariffaCentesimiOra: null,
        costoCentesimi: null,
        approvazioneTL: null,
        approvazionePM: null,
        ...extra,
      });
      const giornata = (data: string, righe: object[]) => ({ risorsaId, data: new Date(data), mese: data.slice(0, 7).replace('-', ''), versione: 0, righe });
      const c = db.collection('consuntivi');
      await c.insertOne(giornata('2027-01-12', [riga(), riga({ fonteTariffa: 'personalizzata', tariffaCentesimiOra: 3200, costoCentesimi: 19200 })]));
      await expect(c.insertOne(giornata('2027-01-12', [riga()]))).rejects.toMatchObject({ code: 11000 });
      await expect(c.insertOne(giornata('2027-01-13', [riga({ minuti: 10 })]))).rejects.toMatchObject({ code: 121 });
      await expect(c.insertOne(giornata('2027-01-13', [riga({ minuti: 1455 })]))).rejects.toMatchObject({ code: 121 });
      await expect(c.insertOne(giornata('2027-01-13', [riga({ stato: 'pronta' })]))).rejects.toMatchObject({ code: 121 });
      await expect(c.insertOne({ ...giornata('2027-01-13', []), mese: '2027-01' })).rejects.toMatchObject({ code: 121 });
      await c.insertOne(giornata('2027-01-13', []));
    });
  });
});
