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
│   ├── auth/                        autenticazione (fase 1, blocco B2) → /api/auth, /api/utenti
│   │   ├── utente.schema.ts            schema Utente (collection utenti), abilitazioni e ruoli
│   │   ├── password.ts                 cifratura e verifica delle password (scrypt)
│   │   ├── auth.service.ts             accesso, token, profilo, cambio password, primo amministratore
│   │   ├── autenticazione.guard.ts     guard globale: utente dal token, @Pubblica, @Ruoli, @Permesso
│   │   ├── decoratori.ts               @Pubblica(), @Ruoli(...), @Permesso(...), @UtenteRichiesta()
│   │   ├── auth.controller.ts          /api/auth/login, logout, me (con i permessi globali), cambia-password
│   │   ├── utenti.service.ts / utenti.controller.ts  /api/utenti (solo admin)
│   │   ├── auth.module.ts
│   │   └── auth.spec.ts                test di password, token, accesso e guard
│   ├── infrastruttura/              servizi tecnici condivisi (fase 1, blocco B1)
│   │   ├── contesto-utente.ts          utente corrente per richiesta (AsyncLocalStorage)
│   │   ├── contesto-utente.middleware.ts  apre il contesto a ogni richiesta HTTP
│   │   ├── tracciamento.plugin.ts      plugin Mongoose: creatoIl, creatoDa, modificatoIl, modificatoDa
│   │   ├── parametro.schema.ts         schema dei parametri di sistema (collection parametri)
│   │   ├── parametri.service.ts        lettura e scrittura dei parametri
│   │   ├── parametri.controller.ts     /api/parametri: lettura con accesso, modifica solo controller (blocco B3)
│   │   ├── infrastruttura.module.ts    modulo globale
│   │   ├── tracciamento.spec.ts        test di contesto, tracciamento e scelta delle migrazioni
│   │   └── parametri.controller.spec.ts  test delle API dei parametri
│   ├── permessi/                    permessi su profili e ruoli (fase 1, blocco B3)
│   │   ├── regole.ts                   regole pure: permessi globali, progetto, attività, risorse
│   │   ├── permessi.service.ts         PermessiService: le regole per i servizi, verifica() → 401/403
│   │   ├── permessi.module.ts          modulo globale
│   │   └── permessi.spec.ts            test delle regole per ogni profilo
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
├── scripts/migra.mjs                esecuzione delle migrazioni dei dati (npm run migra)
├── scripts/migrazioni/              migrazioni numerate NNN-nome.mjs (vedi database.md)
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
| `JWT_SECRET` | casuale a ogni avvio | Segreto per firmare i token di accesso; senza, gli accessi scadono a ogni riavvio |
| `JWT_DURATA` | `8h` | Durata dell'accesso (token e cookie) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD_INIZIALE` | — | Primo amministratore, creato all'avvio se non esiste nessun utente admin |
| `AUTH_OBBLIGATORIA` | `false` | `true`: ogni API tranne login e health richiede l'accesso (da attivare con il blocco B6) |
| `COOKIE_SECURE` | `false` | `true` se ToolPM è servito in HTTPS |

## Avvio dell'applicazione (`main.ts`)

1. Prefisso globale `api`: tutte le rotte iniziano con `/api`.
2. Filtro globale `MongooseErrorsFilter`.
3. CORS abilitato (utile in sviluppo).
4. Swagger su `/api/docs`, JSON su `/api/docs-json`.

## Infrastruttura comune (fase 1)

Servizi tecnici usati da tutte le sezioni, nella cartella `src/infrastruttura/`.

- **Contesto dell'utente.** `ContestoUtenteMiddleware` apre per ogni richiesta un contesto (AsyncLocalStorage) con l'utente che sta lavorando; `utenteCorrente()` lo legge da qualsiasi punto del codice. Finché non c'è l'autenticazione (blocco B2) l'utente è `anonimo`; script e procedure usano utenti tecnici `sistema:...` con `eseguiCome()`.
- **Tracciamento dei salvataggi.** `tracciamentoPlugin` è registrato sulla connessione Mongoose in `app.module.ts` e vale per ogni schema che dichiara `collection` (gli schemi incorporati, come skill e allocazioni, ne restano fuori). Aggiunge `creatoIl`, `creatoDa`, `modificatoIl`, `modificatoDa` e li valorizza in `save`, `insertMany`, `updateOne`, `updateMany`, `findOneAndUpdate`, `findOneAndReplace` e `replaceOne`. I valori mandati dal client vengono ignorati; in una sostituzione (PUT delle risorse) la creazione del documento esistente si conserva. **Regola:** ogni nuovo schema di primo livello deve dichiarare `collection` in `@Schema({ collection: ... })`.
- **Parametri.** `ParametriService` (modulo globale `InfrastrutturaModule`) legge e scrive la collection `parametri`. API: `GET /api/parametri` per chi ha fatto l'accesso; `PUT /api/parametri/:chiave` con `{ valore }` solo per il ruolo `controller`. Si modificano solo i parametri creati dalle migrazioni, con un controllo sul valore: `oreGiorno` intero tra 1 e 24, `soglieEvm` con anticipo > ritardo > fortementeInRitardo.
- **Migrazioni.** `npm run migra` esegue in ordine gli script `scripts/migrazioni/NNN-nome.mjs` non ancora eseguiti e li registra nella collection `migrazioni`; `npm run migra -- --elenco` mostra lo stato senza eseguire nulla. In Docker: `docker compose exec backend npm run migra`. Prima di eseguirle serve un backup ([mongodb-replica-set.md](mongodb-replica-set.md#2-backup)).

## Autenticazione (fase 1)

Modulo `src/auth/`. Il nome utente è l'email; le password sono cifrate con **scrypt** (incluso in Node.js, nessun modulo nativo da compilare nell'immagine Docker) nel formato `scrypt$N$r$p$sale$hash`.

- **Accesso.** `POST /api/auth/login` con `{ email, password }` verifica le credenziali e imposta il cookie `toolpm_token` (httpOnly, SameSite=Lax, durata `JWT_DURATA`), con dentro un token JWT che contiene solo l'id dell'utente. Il messaggio d'errore è lo stesso per email sconosciuta, password errata e utente disattivato. `POST /api/auth/logout` cancella il cookie; `GET /api/auth/me` restituisce il profilo; `POST /api/auth/cambia-password` cambia la propria password (almeno 10 caratteri).
- **Guard globale.** `AutenticazioneGuard` legge il token dal cookie o da `Authorization: Bearer`, carica l'utente (se esiste ed è attivo) e lo scrive nella richiesta e nel contesto, così il tracciamento dei salvataggi registra chi modifica. Gli endpoint `@Pubblica()` (login, logout, health) passano sempre; quelli `@Ruoli(...)` richiedono l'accesso e uno dei ruoli indicati (403 altrimenti).
- **Periodo di transizione.** Finché il frontend non ha la pagina di accesso (blocco B6), `AUTH_OBBLIGATORIA` vale `false`: le altre API accettano anche richieste anonime, registrate come `anonimo`. Con il blocco B6 il valore diventa `true` e ogni API senza accesso risponde 401.
- **Gestione utenti.** `/api/utenti`, solo per il ruolo `admin`: elenco, creazione con password provvisoria, modifica di email, nome, risorsa collegata, abilitazione (TL, PM, PMSenior o nessuna), ruoli (`risorsa`, `controller`, `admin`) e stato attivo, reimpostazione della password. Gli utenti non si cancellano: si disattivano. Un amministratore non può disattivare se stesso né togliersi il ruolo admin. Chi riceve una password provvisoria deve cambiarla al primo accesso (`deveCambiarePassword`).
- **Primo amministratore.** All'avvio, se non esiste nessun utente con ruolo `admin` e sono impostati `ADMIN_EMAIL` e `ADMIN_PASSWORD_INIZIALE`, il backend lo crea.

## Permessi (fase 1)

Modulo globale `src/permessi/`, con le regole decise nell'analisi. Le regole sono funzioni pure in `regole.ts`: ricevono chi agisce e i dati che servono e rispondono sì o no, senza leggere il database.

- **Due livelli.** L'abilitazione generale dell'utente (TL, PM, PMSenior o nessuna) e il profilo sul singolo progetto (approvatore TL o PM, in `progetto.approvatori`), indipendenti tra loro: un utente abilitato TL può essere PM su un progetto. Se è assegnato in entrambi i modi, vale PM. I diritti da approvatore valgono solo con un'abilitazione: se l'amministratore la toglie, la persona non gestisce più i suoi progetti.
- **Permessi globali** (non dipendono da un progetto): `gestireClienti` e `gestireCentriDiCosto` → PMSenior; `creareProgetto` → TL, PM, PMSenior; `gestireRisorse` (anagrafica, ruolo professionale, orario) e `gestireCaratteristicheTutteLeRisorse` → PM, PMSenior; `gestireParametri` → ruolo `controller`; `gestireUtenti` → ruolo `admin`. Sui controller si dichiarano con `@Permesso('gestireClienti')`; `@Permesso()` senza argomenti richiede solo l'accesso, anche con `AUTH_OBBLIGATORIA=false`. `POST /api/auth/login` e `GET /api/auth/me` li restituiscono nel campo `permessi`, per il menu del frontend.
- **Permessi su progetto, attività e risorsa**, controllati dai servizi con `PermessiService` (`verifica(utente, consentito, 'azione')` risponde 401 senza accesso e 403 con "Non hai il permesso di …"):

| Regola | Chi può |
| --- | --- |
| `puoModificareProgetto`, `puoModificarePercentualeProgetto`, `puoGestireAttivita` | TL e PM del progetto, PMSenior |
| `puoCambiareStatoProgetto` in avanti (In valutazione → In corso → Chiuso) | TL e PM del progetto, PMSenior |
| `puoCambiareStatoProgetto` da Chiuso (riapertura) | PM del progetto, PMSenior |
| `puoGestireApprovatori` (chi è TL e chi è PM sul progetto) | PM del progetto, PMSenior; il TL no |
| `puoModificarePercentualeAttivita` | risorse assegnate all'attività, TL e PM del progetto, PMSenior |
| `puoGestireRisorse` | PM, PMSenior |
| `puoModificareCaratteristicheRisorsa` | PM e PMSenior su tutte; TL sulle risorse che lavorano su un suo progetto (fase 1: allocate nel Pianificatore) |

- **Elenchi.** `filtroProgettiGestibili(utente)` dà il filtro MongoDB dei progetti che l'utente può gestire: tutti per il PMSenior, quelli in cui è approvatore per TL e PM, nessuno (`null`) per gli altri.
- Le regole controllano solo chi può agire. Se un passaggio di stato è ammesso (date, almeno un PM) lo controlla il modulo Comuni (blocco B4). Il collegamento ai dati veri (progetti, attività, allocazioni) arriva con i blocchi B4 e B5.

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
npm run migra         # migrazioni dei dati non ancora eseguite (--elenco per vederle)
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
