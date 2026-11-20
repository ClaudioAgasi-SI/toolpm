// Consuntivazione (fase 2, blocco C0): validatori $jsonSchema e indici delle collection della
// sezione, quattro tipologie di costo iniziali con ORDINARIA predefinita.
export const descrizione =
  'Consuntivazione: validatori e indici di tipologie_costo, tariffe_standard, tariffe_personalizzate, consuntivi; tipologie iniziali';

// Campi di tracciamento presenti in ogni documento (plugin del backend).
const TRACCIAMENTO = {
  creatoIl: { bsonType: 'date' },
  creatoDa: { bsonType: 'string' },
  modificatoIl: { bsonType: 'date' },
  modificatoDa: { bsonType: 'string' },
};
const testo = { bsonType: 'string', minLength: 1 };
// Mongoose salva i numeri come double: si accettano tutti i tipi numerici, interi per valore.
const intero = (minimo, massimo) => ({
  bsonType: ['int', 'long', 'double'],
  multipleOf: 1,
  minimum: minimo,
  ...(massimo === undefined ? {} : { maximum: massimo }),
});
const ID = { bsonType: 'objectId' };
const ID_O_NULL = { bsonType: ['objectId', 'null'] };
const DATA = { bsonType: 'date' };
const DATA_O_NULL = { bsonType: ['date', 'null'] };
const approvazione = {
  bsonType: ['object', 'null'],
  required: ['da', 'il'],
  properties: { da: { bsonType: 'string' }, il: DATA },
};

const tariffa = (chiave) => ({
  bsonType: 'object',
  required: [chiave, 'tipologiaId', 'validoDal', 'centesimiOra'],
  properties: {
    [chiave]: ID,
    tipologiaId: ID,
    validoDal: DATA,
    validoAl: DATA_O_NULL,
    centesimiOra: intero(0),
    ...TRACCIAMENTO,
  },
});

export const STATI_RIGA = ['bozza', 'inviata', 'approvataTL', 'approvata', 'respinta', 'chiusa'];

const SCHEMI = {
  tipologie_costo: {
    bsonType: 'object',
    required: ['codice', 'descrizione', 'ordine', 'categoria', 'attiva', 'predefinita'],
    properties: {
      codice: testo,
      descrizione: testo,
      ordine: intero(0),
      categoria: { enum: ['ordinaria', 'straordinaria'] },
      attiva: { bsonType: 'bool' },
      // Una sola tipologia è la predefinita delle righe nuove (indice unico parziale qui sotto).
      predefinita: { bsonType: 'bool' },
      ...TRACCIAMENTO,
    },
  },
  tariffe_standard: tariffa('ruoloId'),
  tariffe_personalizzate: tariffa('risorsaId'),
  consuntivi: {
    bsonType: 'object',
    required: ['risorsaId', 'data', 'mese', 'versione', 'righe'],
    properties: {
      risorsaId: ID,
      data: DATA,
      mese: { bsonType: 'string', pattern: '^\\d{6}$' },
      versione: intero(0),
      righe: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['_id', 'progettoId', 'centroCostoId', 'tipologiaId', 'tipologiaCodice', 'minuti', 'stato'],
          properties: {
            _id: ID,
            progettoId: ID,
            attivitaId: ID_O_NULL,
            centroCostoId: ID,
            tipologiaId: ID,
            tipologiaCodice: testo,
            // Passi di 15 minuti, almeno 15, al massimo un giorno intero.
            minuti: { ...intero(15, 1440), multipleOf: 15 },
            nota: { bsonType: ['string', 'null'] },
            stato: { enum: STATI_RIGA },
            fonteTariffa: { enum: ['personalizzata', 'standard', null] },
            tariffaId: ID_O_NULL,
            tariffaCentesimiOra: { bsonType: ['int', 'long', 'double', 'null'], minimum: 0 },
            costoCentesimi: { bsonType: ['int', 'long', 'double', 'null'], minimum: 0 },
            approvazioneTL: approvazione,
            approvazionePM: approvazione,
            modificatoIl: DATA,
            modificatoDa: { bsonType: 'string' },
          },
        },
      },
      ...TRACCIAMENTO,
    },
  },
};

const INDICI = {
  tipologie_costo: [
    [{ codice: 1 }, { unique: true }],
    [{ predefinita: 1 }, { unique: true, partialFilterExpression: { predefinita: true }, name: 'una_sola_predefinita' }],
  ],
  tariffe_standard: [[{ ruoloId: 1, tipologiaId: 1, validoDal: -1 }]],
  tariffe_personalizzate: [[{ risorsaId: 1, tipologiaId: 1, validoDal: -1 }]],
  consuntivi: [
    [{ risorsaId: 1, data: 1 }, { unique: true }],
    [{ 'righe.progettoId': 1, 'righe.stato': 1, data: 1 }],
    [{ 'righe.attivitaId': 1, data: 1 }],
    [{ 'righe.centroCostoId': 1, data: 1 }],
    [{ 'righe.tipologiaId': 1 }],
    [{ mese: 1 }],
    [{ modificatoIl: 1 }],
  ],
};

export const TIPOLOGIE_INIZIALI = [
  { codice: 'ORDINARIA', descrizione: 'Ordinaria', ordine: 1, categoria: 'ordinaria', predefinita: true },
  { codice: 'STRAORDINARIA', descrizione: 'Straordinaria', ordine: 2, categoria: 'straordinaria', predefinita: false },
  { codice: 'STRAORD_NOTTURNA', descrizione: 'Straordinaria notturna', ordine: 3, categoria: 'straordinaria', predefinita: false },
  { codice: 'STRAORD_FESTIVA', descrizione: 'Straordinaria festiva', ordine: 4, categoria: 'straordinaria', predefinita: false },
];

export async function esegui(db, { utente, ora }) {
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
  // Tipologie iniziali: una già presente (magari modificata dal controller) non viene toccata.
  // La predefinita si imposta solo se nessuna tipologia lo è già.
  const tipologie = db.collection('tipologie_costo');
  const cePredefinita = (await tipologie.countDocuments({ predefinita: true })) > 0;
  let tipologieCreate = 0;
  for (const t of TIPOLOGIE_INIZIALI) {
    const r = await tipologie.updateOne(
      { codice: t.codice },
      {
        $setOnInsert: {
          ...t,
          predefinita: t.predefinita && !cePredefinita,
          attiva: true,
          creatoIl: ora,
          creatoDa: utente,
          modificatoIl: ora,
          modificatoDa: utente,
        },
      },
      { upsert: true },
    );
    tipologieCreate += r.upsertedCount;
  }
  return { validatori, indici, tipologieCreate };
}
