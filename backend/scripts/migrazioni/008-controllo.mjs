// Controllo (fase 3, blocco D0): collection dei periodi (chiusura dei mesi) e dello storico delle
// modifiche, con validatori $jsonSchema e indici.
export const descrizione = 'Controllo: validatori e indici di periodi e audit_log';

const TRACCIAMENTO = {
  creatoIl: { bsonType: 'date' },
  creatoDa: { bsonType: 'string' },
  modificatoIl: { bsonType: 'date' },
  modificatoDa: { bsonType: 'string' },
};
const testo = { bsonType: 'string', minLength: 1 };
const DATA_O_NULL = { bsonType: ['date', 'null'] };
const TESTO_O_NULL = { bsonType: ['string', 'null'] };

const SCHEMI = {
  // Un documento per mese; un mese senza documento è aperto.
  periodi: {
    bsonType: 'object',
    required: ['mese', 'stato'],
    properties: {
      mese: { bsonType: 'string', pattern: '^\\d{6}$' },
      stato: { enum: ['aperto', 'chiuso'] },
      chiusoIl: DATA_O_NULL,
      chiusoDa: TESTO_O_NULL,
      // Chiusura forzata con righe non approvate (decisione 4 della fase 3), con la motivazione.
      forzata: { bsonType: 'bool' },
      motivazioneChiusura: TESTO_O_NULL,
      riapertoIl: DATA_O_NULL,
      riapertoDa: TESTO_O_NULL,
      motivazioneRiapertura: TESTO_O_NULL,
      ...TRACCIAMENTO,
    },
  },
  // Una voce per azione: su un documento e, per i consuntivi, su una o più sue righe.
  audit_log: {
    bsonType: 'object',
    required: ['collezione', 'documentoId', 'operazione', 'utente', 'il'],
    properties: {
      collezione: testo,
      documentoId: testo,
      righeIds: { bsonType: 'array', items: { bsonType: 'string' } },
      operazione: testo,
      utente: testo,
      il: { bsonType: 'date' },
      prima: {},
      dopo: {},
      motivazione: TESTO_O_NULL,
      ...TRACCIAMENTO,
    },
  },
};

const INDICI = {
  periodi: [[{ mese: 1 }, { unique: true }]],
  audit_log: [
    [{ collezione: 1, documentoId: 1, il: -1 }],
    [{ righeIds: 1 }],
    [{ il: -1 }],
    [{ utente: 1, il: -1 }],
  ],
};

export async function esegui(db) {
  const esistenti = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const validatori = [];
  for (const [nome, schema] of Object.entries(SCHEMI)) {
    const opzioni = { validator: { $jsonSchema: schema }, validationLevel: 'strict', validationAction: 'error' };
    if (esistenti.has(nome)) await db.command({ collMod: nome, ...opzioni });
    else await db.createCollection(nome, opzioni);
    validatori.push(nome);
  }
  let indici = 0;
  for (const [nome, elenco] of Object.entries(INDICI)) {
    for (const [chiavi, opzioni] of elenco) {
      await db.collection(nome).createIndex(chiavi, opzioni ?? {});
      indici++;
    }
  }
  return { validatori, indici };
}
