# Backend (NestJS)

Cartella: `backend/`

## Stack

| Componente | Versione | Note |
|---|---|---|
| Node.js | 22 | Immagine Docker `node:22-alpine` |
| NestJS | 12 | `@nestjs/common`, `core`, `platform-express`, `config` |
| Mongoose | 9 | tramite `@nestjs/mongoose` |
| Swagger | `@nestjs/swagger` 12 | Swagger UI e specifica OpenAPI |
| TypeScript | 6 | Moduli **ESM** (`"type": "module"`): gli import interni usano l'estensione `.js` |
| Test | Vitest | `npm test` |

> Il file `backend/.npmrc` contiene `legacy-peer-deps=true`: serve a `npm install` / `npm ci` per risolvere le dipendenze peer dei pacchetti NestJS 12. Va mantenuto.

## Struttura

```
backend/
├── src/
│   ├── main.ts                      avvio: prefisso /api, filtro errori, CORS, Swagger
│   ├── app.module.ts                configurazione, connessione MongoDB, moduli
│   ├── health.controller.ts         GET /api/health
│   ├── mongoose-errors.filter.ts    errori di validazione Mongoose → HTTP 400
│   └── pianificatore/               sezione "Pianificatore risorse" → prefisso /api/pianificatore
│       ├── pianificatore.module.ts  raccoglie i moduli della sezione
│       ├── risorse/
│       │   ├── risorsa.schema.ts       schema Risorsa, SkillValutata, Allocazione (+ annotazioni Swagger)
│       │   ├── risorse.service.ts      CRUD risorse
│       │   ├── risorse.controller.ts   /api/pianificatore/risorse
│       │   └── risorse.module.ts
│       ├── anagrafiche/
│       │   ├── anagrafiche.schema.ts   schemi Skill, Certificazione, Rate
│       │   ├── crud.service.ts         servizio CRUD generico
│       │   ├── anagrafiche.controllers.ts  servizi e controller generati per skills, certificazioni, rate
│       │   └── anagrafiche.module.ts
│       └── pianificazione/
│           ├── pianificazione.service.ts   calcolo della griglia e filtro per skill
│           ├── pianificazione.controller.ts  /api/pianificatore/pianificazione
│           ├── pianificazione.dto.ts       classi per documentare la risposta in Swagger
│           ├── mesi.ts                     utilità sui mesi AAAAMM
│           ├── pesi.ts                     pesi di probabilità
│           ├── mesi.spec.ts                test delle utilità dei mesi
│           └── pianificazione.service.spec.ts  test della griglia e del filtro per skill
├── scripts/seed.mjs                 import dei JSON di db/ (vedi database.md)
├── scripts/verifica-mongodb.mjs     verifica di connessione, replica set e transazioni
├── Dockerfile
└── package.json
```

## Configurazione

Variabili d'ambiente (lette con `@nestjs/config`, anche da un file `.env` nella cartella `backend/`):

| Variabile | Default | Descrizione |
|---|---|---|
| `MONGODB_URI` | `mongodb://localhost:27017/toolpm` | Stringa di connessione; in docker-compose `mongodb://host.docker.internal:27017/toolpm` |
| `PORT` | `3001` | Porta HTTP |
| `CORS_ORIGIN` | tutte le origini | Elenco separato da virgole delle origini ammesse |
| `MONGODB_AUTO_INDEX` | `false` | `true` per far creare a Mongoose gli indici definiti negli schemi |
| `SEED_DIR` | `../db` | Solo per `scripts/seed.mjs` |

## Avvio dell'applicazione (`main.ts`)

1. Prefisso globale `api`: tutte le rotte iniziano con `/api`.
2. Filtro globale `MongooseErrorsFilter`.
3. CORS abilitato (utile in sviluppo).
4. Swagger su `/api/docs`, JSON su `/api/docs-json`.

## Moduli

### RisorseModule — `/api/pianificatore/risorse`

| Metodo | Percorso | Descrizione | Risposte |
|---|---|---|---|
| GET | `/api/pianificatore/risorse` | Elenco, ordinato per cognome e nome | 200 |
| GET | `/api/pianificatore/risorse/:id` | Dettaglio | 200, 404 |
| POST | `/api/pianificatore/risorse` | Crea | 201, 400 |
| PUT | `/api/pianificatore/risorse/:id` | **Sostituisce** l'intero documento (`findOneAndReplace`): i campi non inviati tornano ai default; l'`_id` nel corpo è ignorato | 200, 400, 404 |
| DELETE | `/api/pianificatore/risorse/:id` | Elimina | 200 `{ "deleted": true }`, 404 |

Un `id` non valido come ObjectId restituisce 404.

### AnagraficheModule — `/api/pianificatore/skills`, `/api/pianificatore/certificazioni`, `/api/pianificatore/rate`

I tre controller sono generati dalla funzione `crudController()` sopra un servizio CRUD generico (`CrudService`), con le stesse operazioni:

| Metodo | Percorso | Descrizione |
|---|---|---|
| GET | `/api/pianificatore/{skills,certificazioni,rate}` | Elenco (skills ordinate per tipo e nome; certificazioni per tipo e nome; rate per nome) |
| POST | `/api/pianificatore/{...}` | Crea |
| PUT | `/api/pianificatore/{...}/:id` | Aggiorna i campi inviati (`findByIdAndUpdate`); l'`_id` nel corpo è ignorato |
| DELETE | `/api/pianificatore/{...}/:id` | Elimina |

`RateService` aggiunge una validazione su creazione e modifica:

- `rateType` obbligatorio e **univoco** (400 `Esiste già una scala "..."`);
- valori della scala ripuliti dagli spazi, vuoti scartati;
- **nessun valore ripetuto**, anche con maiuscole diverse (400 `Valori ripetuti nella scala: ...`).

### PianificazioneModule — `/api/pianificatore/pianificazione`

`GET /api/pianificatore/pianificazione`

| Parametro | Obbl. | Default | Descrizione |
|---|---|---|---|
| `da` | no | mese corrente | Primo mese `AAAAMM` |
| `a` | no | `da` + 11 mesi | Ultimo mese `AAAAMM` (massimo 36 mesi nell'intervallo) |
| `tipoSkill` | con `skill` | — | `tecnico`, `funzionale` o `ambito` |
| `skill` | no | — | Ripetibile: `skill=j2ee&skill=devOps` |

Risposta:

```json
{
  "mesi": ["202701", "202702"],
  "righe": [
    {
      "_id": "6ae88b192fcc045f0ca48409",
      "cognome": "Agasi",
      "nome": "Claudio",
      "skillTrovate": [{ "skillName": "devOps", "rate": "sufficiente" }],
      "mesi": {
        "202701": {
          "totale": 70,
          "pesato": 50,
          "allocazioni": [
            { "mese": "202701", "cliente": "TIM", "progetto": "TIMBUFE", "probabilitaAllocazione": "sicura",
              "importanzaStrategica": "imprescindibile", "percentualeAllocazione": 30, "pesato": 30 }
          ]
        }
      }
    }
  ]
}
```

(`skillTrovate` è presente solo quando è attivo un filtro per skill.)

**Algoritmo** (`PianificazioneService.griglia`):

1. Valida `da` e `a` (regex `^\d{4}(0[1-9]|1[0-2])$`, `da <= a`), altrimenti 400.
2. Genera l'elenco dei mesi (`intervalloMesi`, massimo 36).
3. Costruisce la query del filtro per skill (vedi sotto) e legge le risorse ordinate per cognome e nome.
4. Per ogni risorsa crea una cella vuota per ogni mese e scorre `planned`:
   - ignora le righe di mesi fuori intervallo e quelle **senza percentuale o con percentuale 0** (segnaposto);
   - per ogni allocazione calcola `pesato = percentualeAllocazione × peso(probabilitaAllocazione)`, arrotondato a un decimale;
   - accumula `totale` (somma delle percentuali) e `pesato` (somma dei pesati) della cella.
5. Se c'è un filtro per skill aggiunge `skillTrovate`.

**Pesi di probabilità** (`pesi.ts`): sicura 1 · probabile 0,75 · forse 0,5 · improbabile 0,25 · nessuna 0. Valore sconosciuto → 0; probabilità assente → 1. Il confronto ignora maiuscole e spazi.

**Filtro per skill** (`filtroSkill`):

| Parametri | Risorse restituite |
|---|---|
| nessuno | tutte |
| `tipoSkill` | con almeno una skill (non `n.a.`) di quel tipo |
| `tipoSkill` + una o più `skill` | con almeno una delle skill indicate (**OR**), non valutata `n.a.` |
| `skill` senza `tipoSkill`, o tipo sconosciuto | 400 |

Il tipo determina il campo (`tecnico` → `skillTecnici`, `funzionale` → `skillFunzionali`, `ambito` → `skillAmbiti`); il nome è confrontato con una regex esatta, senza distinzione tra maiuscole e minuscole e con i caratteri speciali protetti. In MongoDB la condizione è un `$elemMatch` su `skillName` e `rate ≠ n.a.`.

### Health — `/api/health`

`GET /api/health` → `{ "status": "ok", "database": "toolpm", "mongodb": "connesso" | "non connesso", "replicaSet": "rs0" | null }`. `replicaSet` è il nome del replica set di MongoDB, `null` con un'istanza singola (vedi [mongodb-replica-set.md](mongodb-replica-set.md)).

## Gestione degli errori

| Caso | Stato | Corpo |
|---|---|---|
| Validazione Mongoose (campo obbligatorio, regex del mese, min/max) | 400 | `{ "statusCode": 400, "error": "Dati non validi", "message": ["mese: ..."] }` |
| Cast non valido | 400 | come sopra |
| Parametri non validi (`BadRequestException`) | 400 | `{ "statusCode": 400, "error": "Bad Request", "message": "..." }` |
| Documento non trovato o id non valido | 404 | `{ "statusCode": 404, "message": "Risorsa ... non trovata" }` |

## Swagger / OpenAPI

- UI: **http://localhost:3001/api/docs** (anche "Try it out" per eseguire le chiamate: attenzione, POST/PUT/DELETE modificano davvero il database)
- JSON: http://localhost:3001/api/docs-json (importabile in Postman)

La documentazione è generata dai decoratori: `@ApiProperty` sugli schemi Mongoose (che fanno da modello sia per il database sia per le API), `@ApiOperation`/`@ApiQuery`/`@ApiParam`/`@Api*Response` sui controller. Le risposte con `_id` usano classi derivate (`RisorsaConId`, `SkillConId`, ...); la risposta della griglia è descritta in `pianificazione.dto.ts`.

Quando si aggiunge un campo a uno schema, aggiungere anche `@ApiProperty`/`@ApiPropertyOptional` perché compaia in Swagger.

## Sviluppo

```bash
cd backend
npm install
npm run start:dev     # avvio con ricaricamento automatico, http://localhost:3001/api
npm run build         # compilazione in dist/
npm test              # test Vitest
npm run verifica-mongodb  # connessione, replica set e transazioni di MongoDB
npm run seed          # import dei dati di esempio (solo collection vuote)
```

## Docker

`backend/Dockerfile` (multi-stage):

1. **build**: `npm ci`, `npm run build`, `npm prune --omit=dev`;
2. **esecuzione**: copia `node_modules`, `dist` e `scripts`, utente `node`, `CMD node dist/main.js`, porta 3001.

## Come aggiungere un endpoint

1. Creare (o estendere) un modulo nella cartella della sezione (es. `src/pianificatore/<nome>/`) con service e controller.
2. Usare `@InjectModel(Modello.name)` per accedere a una collection; registrare lo schema con `MongooseModule.forFeature`.
3. Importare i tipi di Mongoose con `import type` (vincolo dovuto a ESM + `emitDecoratorMetadata`) e i valori con `import mongoose from 'mongoose'`.
4. Documentare con i decoratori Swagger e aggiungere il modulo al modulo della sezione (es. `PianificatoreModule`) e ai `children` della sezione in `RouterModule.register` di `app.module.ts`.

## Come aggiungere una sezione del prodotto

1. Creare `src/<sezione>/<sezione>.module.ts` che importa i moduli della sezione.
2. In `app.module.ts` importare il modulo e aggiungere a `RouterModule.register` una voce `{ path: '<sezione>', module: ..., children: [...] }`: le API saranno su `/api/<sezione>/...`.
3. Le collection MongoDB della sezione stanno nello stesso database `toolpm`.
