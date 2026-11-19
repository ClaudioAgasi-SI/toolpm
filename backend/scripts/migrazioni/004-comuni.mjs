// Modulo Comuni (fase 1, blocco B4): validatori $jsonSchema e indici delle nuove collection,
// indice unico (parziale) sull'email delle risorse.
export const descrizione = 'Modulo Comuni: validatori e indici di clienti, centri di costo, ruoli, progetti, attività, avanzamenti; email unica delle risorse';

// Campi di tracciamento presenti in ogni documento (plugin del backend).
const TRACCIAMENTO = {
  creatoIl: { bsonType: 'date' },
  creatoDa: { bsonType: 'string' },
  modificatoIl: { bsonType: 'date' },
  modificatoDa: { bsonType: 'string' },
};
const DATA_O_NULL = { bsonType: ['date', 'null'] };
const testo = { bsonType: 'string', minLength: 1 };
const percentuale = { bsonType: ['int', 'long', 'double'], minimum: 0, maximum: 100 };
const nonNegativo = { bsonType: ['int', 'long', 'double'], minimum: 0 };

const anagrafica = (campo) => ({
  bsonType: 'object',
  required: ['codice', campo, 'attivo'],
  properties: { codice: testo, [campo]: testo, attivo: { bsonType: 'bool' }, ...TRACCIAMENTO },
});

const SCHEMI = {
  clienti: anagrafica('ragioneSociale'),
  centri_costo: anagrafica('descrizione'),
  ruoli: anagrafica('descrizione'),
  progetti: {
    bsonType: 'object',
    required: ['codice', 'titolo', 'centroCostoId', 'stato', 'approvatori', 'percentualeCompletamento'],
    properties: {
      codice: testo,
      titolo: testo,
      descrizione: { bsonType: 'string' },
      clienteId: { bsonType: ['objectId', 'null'] },
      centroCostoId: { bsonType: 'objectId' },
      approvatori: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['risorsaId', 'profilo'],
          properties: { risorsaId: { bsonType: 'objectId' }, profilo: { enum: ['TL', 'PM'] } },
        },
      },
      soloSuAttivita: { bsonType: 'bool' },
      dataInizio: DATA_O_NULL,
      dataFine: DATA_O_NULL,
      stato: { enum: ['inValutazione', 'inCorso', 'chiuso'] },
      percentualeCompletamento: percentuale,
      stime: {
        bsonType: 'object',
        properties: {
          managerialeGiorni: nonNegativo,
          managerialeCentesimi: nonNegativo,
          definitivaGiorni: nonNegativo,
          definitivaCentesimi: nonNegativo,
        },
      },
      ...TRACCIAMENTO,
    },
  },
  attivita: {
    bsonType: 'object',
    required: ['progettoId', 'codice', 'descrizione', 'stato', 'percentualeCompletamento', 'risorseAssegnateIds'],
    properties: {
      progettoId: { bsonType: 'objectId' },
      codice: testo,
      descrizione: testo,
      dataInizio: DATA_O_NULL,
      dataFine: DATA_O_NULL,
      stato: { enum: ['attiva', 'chiusa'] },
      stimaGiorni: nonNegativo,
      percentualeCompletamento: percentuale,
      risorseAssegnateIds: { bsonType: 'array', items: { bsonType: 'objectId' } },
      ...TRACCIAMENTO,
    },
  },
  avanzamenti: {
    bsonType: 'object',
    required: ['progettoId', 'valorePrecedente', 'valoreNuovo', 'il', 'da'],
    properties: {
      progettoId: { bsonType: 'objectId' },
      attivitaId: { bsonType: ['objectId', 'null'] },
      valorePrecedente: percentuale,
      valoreNuovo: percentuale,
      il: { bsonType: 'date' },
      da: { bsonType: 'string' },
      ...TRACCIAMENTO,
    },
  },
};

const INDICI = {
  clienti: [[{ codice: 1 }, { unique: true }]],
  centri_costo: [[{ codice: 1 }, { unique: true }]],
  ruoli: [[{ codice: 1 }, { unique: true }]],
  progetti: [[{ codice: 1 }, { unique: true }], [{ 'approvatori.risorsaId': 1 }], [{ centroCostoId: 1 }]],
  attivita: [[{ progettoId: 1, codice: 1 }, { unique: true }], [{ risorseAssegnateIds: 1 }]],
  avanzamenti: [[{ progettoId: 1, il: -1 }]],
  risorse: [[{ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } }]],
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
