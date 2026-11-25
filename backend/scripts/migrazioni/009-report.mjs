// Report (fase 4, blocco E0): indicatori EVM giornalieri, registro delle esecuzioni delle procedure
// pianificate, indice per i report di periodo.
export const descrizione = 'Report: evm_giornalieri, esecuzioni_batch, indice dei consuntivi per stato e data';

const TRACCIAMENTO = {
  creatoIl: { bsonType: 'date' },
  creatoDa: { bsonType: 'string' },
  modificatoIl: { bsonType: 'date' },
  modificatoDa: { bsonType: 'string' },
};
const testo = { bsonType: 'string', minLength: 1 };
const indicatori = { bsonType: ['object', 'null'] };

const SCHEMI = {
  // Un documento per progetto e giorno, con gli indicatori nelle due viste (decisione 11 della fase 4).
  evm_giornalieri: {
    bsonType: 'object',
    required: ['progettoId', 'data', 'approvata', 'provvisoria'],
    properties: {
      progettoId: { bsonType: 'objectId' },
      data: { bsonType: 'date' },
      approvata: indicatori,
      provvisoria: indicatori,
      ...TRACCIAMENTO,
    },
  },
  // Registro delle esecuzioni delle procedure pianificate (decisione 12 della fase 4).
  esecuzioni_batch: {
    bsonType: 'object',
    required: ['procedura', 'inizio', 'stato'],
    properties: {
      procedura: testo,
      inizio: { bsonType: 'date' },
      fine: { bsonType: ['date', 'null'] },
      stato: { enum: ['inCorso', 'completata', 'completataConAvvisi', 'fallita', 'interrotta'] },
      avviataDa: { bsonType: 'string' },
      daGiorno: { bsonType: ['date', 'null'] },
      ultimoGiornoCompletato: { bsonType: ['date', 'null'] },
      giorniElaborati: { bsonType: 'int' },
      avvisi: { bsonType: 'array', items: { bsonType: 'string' } },
      motivo: { bsonType: ['string', 'null'] },
      ...TRACCIAMENTO,
    },
  },
};

const INDICI = {
  evm_giornalieri: [[{ progettoId: 1, data: 1 }, { unique: true }], [{ data: 1 }]],
  esecuzioni_batch: [[{ procedura: 1, inizio: -1 }], [{ procedura: 1, stato: 1 }]],
  consuntivi: [[{ 'righe.stato': 1, data: 1 }]],
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
