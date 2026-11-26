// Offerte e preventivi (fase 5, blocco F0): offerte, revisioni, listino di vendita, contatori dei numeri,
// parametro "offerte", indice del collegamento progetto → offerta.
export const descrizione = 'Offerte: offerte, offerte_revisioni, listino_vendita, contatori, parametro offerte';

const TRACCIAMENTO = {
  creatoIl: { bsonType: 'date' },
  creatoDa: { bsonType: 'string' },
  modificatoIl: { bsonType: 'date' },
  modificatoDa: { bsonType: 'string' },
};
const testo = { bsonType: 'string', minLength: 1 };
const testoONull = { bsonType: ['string', 'null'] };
const id = { bsonType: 'objectId' };
const idONull = { bsonType: ['objectId', 'null'] };
const dataONull = { bsonType: ['date', 'null'] };
const intero = { bsonType: ['int', 'long'] };
const interoONull = { bsonType: ['int', 'long', 'null'] };
const numero = { bsonType: ['int', 'long', 'double', 'decimal'] };
const numeroONull = { bsonType: ['int', 'long', 'double', 'decimal', 'null'] };
const firma = { bsonType: ['object', 'null'], required: ['da', 'il'], properties: { da: testo, il: { bsonType: 'date' }, nota: testoONull, motivo: testoONull } };

export const STATI_OFFERTA = ['bozza', 'inApprovazione', 'approvata', 'inviata', 'vinta', 'persa', 'ritirata'];
export const STATI_REVISIONE = ['bozza', 'inApprovazione', 'approvata', 'respinta', 'inviata', 'superata'];
export const TIPI_OFFERTA = ['corpo', 'consuntivo', 'pacchetto'];

const SCHEMI = {
  offerte: {
    bsonType: 'object',
    required: ['numero', 'clienteId', 'titolo', 'tipo', 'stato', 'responsabile', 'stimatori', 'revisioneCorrente', 'versione'],
    properties: {
      numero: { bsonType: 'string', pattern: '^OFF-\\d{4}-\\d{4,}$' },
      clienteId: id,
      titolo: testo,
      descrizione: testoONull,
      tipo: { enum: TIPI_OFFERTA },
      stato: { enum: STATI_OFFERTA },
      responsabile: { bsonType: 'object', required: ['utenteId'], properties: { utenteId: id } },
      stimatori: { bsonType: 'array', items: id },
      centroCostoId: idONull,
      dataRichiesta: dataONull,
      scadenzaRisposta: dataONull,
      validitaGiorni: interoONull,
      inviataIl: dataONull,
      revisioneCorrente: intero,
      esito: {
        bsonType: ['object', 'null'],
        required: ['stato', 'data'],
        properties: { stato: { enum: ['vinta', 'persa', 'ritirata'] }, data: { bsonType: 'date' }, motivo: testoONull, nota: testoONull, da: testoONull },
      },
      progettoId: idONull,
      versione: intero,
      ...TRACCIAMENTO,
    },
  },
  offerte_revisioni: {
    bsonType: 'object',
    required: ['offertaId', 'numero', 'stato', 'gruppi', 'contingenzaPercento', 'scontoPercento', 'versione'],
    properties: {
      offertaId: id,
      numero: intero,
      stato: { enum: STATI_REVISIONE },
      gruppi: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['_id', 'nome', 'voci'],
          properties: {
            _id: id,
            nome: testo,
            voci: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                required: ['_id', 'ruoloId', 'giorni'],
                properties: { _id: id, ruoloId: id, giorni: { ...numero, minimum: 0 }, descrizione: testoONull },
              },
            },
          },
        },
      },
      contingenzaPercento: { ...numero, minimum: 0, maximum: 100 },
      scontoPercento: { ...numero, minimum: 0, maximum: 100 },
      prezzoACorpoCentesimi: interoONull,
      dataRiferimento: dataONull,
      tariffe: {
        bsonType: ['array', 'null'],
        items: {
          bsonType: 'object',
          required: ['ruoloId'],
          properties: { ruoloId: id, costoCentesimiGiorno: interoONull, venditaCentesimiGiorno: interoONull, fonteVendita: { enum: ['cliente', 'standard', null] } },
        },
      },
      totali: { bsonType: ['object', 'null'] },
      condizioni: testoONull,
      preparataDa: testoONull,
      approvazione: firma,
      rifiuto: firma,
      inviataIl: dataONull,
      versione: intero,
      ...TRACCIAMENTO,
    },
  },
  listino_vendita: {
    bsonType: 'object',
    required: ['ruoloId', 'clienteId', 'validoDal', 'centesimiGiorno'],
    properties: {
      ruoloId: id,
      clienteId: idONull,
      validoDal: { bsonType: 'date' },
      validoAl: dataONull,
      centesimiGiorno: { ...intero, minimum: 0 },
      ...TRACCIAMENTO,
    },
  },
  contatori: {
    bsonType: 'object',
    required: ['_id', 'valore'],
    properties: { _id: testo, valore: intero, ...TRACCIAMENTO },
  },
};

const INDICI = {
  offerte: [
    [{ numero: 1 }, { unique: true }],
    [{ stato: 1, scadenzaRisposta: 1 }],
    [{ clienteId: 1 }],
    [{ 'responsabile.utenteId': 1 }],
    [{ stimatori: 1 }],
  ],
  offerte_revisioni: [[{ offertaId: 1, numero: 1 }, { unique: true }]],
  listino_vendita: [[{ ruoloId: 1, clienteId: 1, validoDal: 1 }, { unique: true }]],
  progetti: [[{ offertaId: 1 }, { sparse: true }]],
};

const PARAMETRO = {
  chiave: 'offerte',
  valore: { margineMinimoPercento: 25, validitaGiorni: 60, motiviPerdita: ['Prezzo', 'Tempi', 'Concorrente', 'Rinuncia del cliente', 'Altro'] },
  descrizione: 'Offerte: margine minimo sotto il quale l\'approvazione chiede una nota, giorni di validità predefiniti dall\'invio, motivi di perdita',
};

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
  // Il parametro già presente (magari modificato) non viene toccato.
  const r = await db.collection('parametri').updateOne(
    { chiave: PARAMETRO.chiave },
    { $setOnInsert: { ...PARAMETRO, creatoIl: ora, creatoDa: utente, modificatoIl: ora, modificatoDa: utente } },
    { upsert: true },
  );
  return { validatori, indici, parametri: r.upsertedCount };
}
