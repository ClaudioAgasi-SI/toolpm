import mongoose from 'mongoose';
import { eseguiCome, eseguiNelContesto, UTENTE_ANONIMO, utenteCorrente } from './contesto-utente.js';
import {
  preparaAggiornamento,
  preparaSostituzione,
  senzaTracciamento,
  tracciamentoPlugin,
} from './tracciamento.plugin.js';
import { daEseguire } from '../../scripts/migrazioni/elenco.mjs';

const ORA = new Date('2026-11-17T10:00:00Z');
const PRIMA = new Date('2026-01-01T08:00:00Z');

describe('contesto dell\'utente', () => {
  it('senza contesto l\'utente è anonimo', () => {
    expect(utenteCorrente()).toBe(UTENTE_ANONIMO);
  });

  it('mantiene l\'utente attraverso le chiamate asincrone', async () => {
    const letto = await eseguiCome('sistema:migrazione', async () => {
      await new Promise((r) => setTimeout(r, 1));
      return utenteCorrente();
    });
    expect(letto).toBe('sistema:migrazione');
    expect(utenteCorrente()).toBe(UTENTE_ANONIMO);
  });

  it('l\'utente si può impostare dopo l\'apertura del contesto (come farà la guard di autenticazione)', () => {
    const contesto = { utente: UTENTE_ANONIMO };
    const letto = eseguiNelContesto(contesto, () => {
      contesto.utente = '6740a1c2e1f0a1b2c3d4e099';
      return utenteCorrente();
    });
    expect(letto).toBe('6740a1c2e1f0a1b2c3d4e099');
  });
});

describe('tracciamento dei salvataggi', () => {
  it('ignora i campi di tracciamento mandati dal client', () => {
    expect(senzaTracciamento({ nome: 'Anna', creatoDa: 'x', modificatoIl: PRIMA })).toEqual({ nome: 'Anna' });
  });

  it('in un aggiornamento imposta la modifica e, solo per i documenti nuovi, la creazione', () => {
    const update = preparaAggiornamento(
      { nome: 'Anna', creatoIl: PRIMA, $set: { cognome: 'Rossi', modificatoDa: 'falso' } },
      'u1',
      ORA,
    );
    expect(update).toEqual({
      nome: 'Anna',
      $set: { cognome: 'Rossi', modificatoIl: ORA, modificatoDa: 'u1' },
      $setOnInsert: { creatoIl: ORA, creatoDa: 'u1' },
    });
  });

  it('in una sostituzione conserva la creazione del documento esistente', () => {
    const doc = preparaSostituzione(
      { nome: 'Anna', creatoIl: ORA, creatoDa: 'falso' },
      { creatoIl: PRIMA, creatoDa: 'u0' },
      'u1',
      ORA,
    );
    expect(doc).toEqual({ nome: 'Anna', creatoIl: PRIMA, creatoDa: 'u0', modificatoIl: ORA, modificatoDa: 'u1' });
  });

  it('se il documento esistente non ha la creazione (dati vecchi), la imposta ora', () => {
    const doc = preparaSostituzione({ nome: 'Anna' }, {}, 'u1', ORA);
    expect(doc).toMatchObject({ creatoIl: ORA, creatoDa: 'u1' });
  });

  it('il plugin aggiunge i quattro campi agli schemi con una collection, non a quelli incorporati', () => {
    const conCollection = new mongoose.Schema({ nome: String }, { collection: 'prove' });
    const incorporato = new mongoose.Schema({ nome: String }, { _id: false });
    tracciamentoPlugin(conCollection);
    tracciamentoPlugin(incorporato);
    expect(['creatoIl', 'creatoDa', 'modificatoIl', 'modificatoDa'].every((c) => conCollection.path(c))).toBe(true);
    expect(incorporato.path('creatoIl')).toBeUndefined();
  });
});

describe('scelta delle migrazioni', () => {
  it('ordina per numero e separa quelle già eseguite', () => {
    const r = daEseguire(['002-b.mjs', 'elenco.mjs', '001-a.mjs', '003-c.mjs'], new Set(['001-a']));
    expect(r).toEqual({ eseguite: ['001-a'], mancanti: ['002-b', '003-c'] });
  });

  it('rifiuta due migrazioni con lo stesso numero', () => {
    expect(() => daEseguire(['001-a.mjs', '001-b.mjs'], new Set())).toThrow(/stesso numero/);
  });
});

describe('plugin sui comandi Mongoose', () => {
  /** Modello con la collection intercettata: registra cosa verrebbe mandato a MongoDB. */
  function modelloIntercettato() {
    const conn = mongoose.createConnection();
    conn.plugin(tracciamentoPlugin);
    const Modello = conn.model('Prova', new mongoose.Schema({ nome: String }, { collection: 'prove' }));
    const inviati: Record<string, unknown[]> = {};
    const collection = Modello.collection as unknown as Record<string, unknown>;
    const risposte: Record<string, (a: unknown[]) => unknown> = {
      findOne: () => ({ creatoIl: PRIMA, creatoDa: 'u0' }),
      insertOne: (a) => ({ acknowledged: true, insertedId: (a[0] as { _id: unknown })._id }),
      insertMany: () => ({ acknowledged: true, insertedIds: {} }),
    };
    for (const metodo of ['updateOne', 'findOneAndReplace', 'findOne', 'insertOne', 'insertMany']) {
      collection[metodo] = async (...a: unknown[]) => {
        inviati[metodo] = a;
        return risposte[metodo]?.(a) ?? { acknowledged: true, matchedCount: 1, modifiedCount: 1, value: null };
      };
    }
    return { Modello, inviati };
  }

  it('create, updateOne, findOneAndReplace e insertMany scrivono l\'utente del contesto', async () => {
    const { Modello, inviati } = modelloIntercettato();
    await eseguiCome('u1', async () => {
      await Modello.create({ nome: 'a', creatoDa: 'falso' } as Record<string, unknown>);
      await Modello.updateOne({ nome: 'a' }, { nome: 'b', creatoDa: 'falso' } as Record<string, unknown>).exec();
      await Modello.findOneAndReplace({ nome: 'b' }, { nome: 'c', creatoIl: ORA } as Record<string, unknown>).exec();
      await Modello.insertMany([{ nome: 'd' }]);
    });

    expect(inviati.insertOne[0]).toMatchObject({ nome: 'a', creatoDa: 'u1', modificatoDa: 'u1' });
    expect(inviati.updateOne[1]).toMatchObject({
      $set: { nome: 'b', modificatoDa: 'u1' },
      $setOnInsert: { creatoDa: 'u1' },
    });
    expect(inviati.findOneAndReplace[1]).toMatchObject({ nome: 'c', creatoIl: PRIMA, creatoDa: 'u0', modificatoDa: 'u1' });
    expect((inviati.insertMany[0] as unknown[])[0]).toMatchObject({ nome: 'd', creatoDa: 'u1', modificatoDa: 'u1' });
  });
});
