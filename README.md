# ToolPM

Tool di project management per un'azienda di consulenza software (sviluppo prodotti e manutenzione evolutiva).
Il prodotto è diviso in **sezioni**; ognuna ha le proprie pagine (sotto `/<sezione>`) e le proprie API (sotto `/api/<sezione>`).

| Sezione | Frontend | API | Stato |
|---|---|---|---|
| Pianificatore risorse allocate — allocazione delle persone sui progetti nel tempo, in base a skill, importanza strategica e probabilità di allocazione | `/pianificatore` | `/api/pianificatore/...` | disponibile (codice di partenza dal repository `pianificatore-risorse`) |
| altre sezioni | — | — | da definire |

- **frontend/** — Angular: shell ToolPM (home + menu delle sezioni); in `src/app/pianificatore/` griglia di pianificazione, gestione risorse, anagrafiche
- **backend/** — NestJS: API REST su MongoDB
- **db/** — dati di esempio delle collection (`skills`, `rate`, `certificazioni`, `risorse`)
- **docker-compose.yml** — avvio di frontend e backend su Docker Desktop
- **docs/** — documentazione tecnica: [architettura](docs/architettura.md), [frontend](docs/frontend.md), [backend](docs/backend.md), [database](docs/database.md)

## Avvio con Docker Desktop

Prerequisito: MongoDB in esecuzione sulla porta 27017 del PC, con il database `toolpm` (si crea da solo al primo inserimento; il vecchio database `pianificazione` non viene toccato).

```bash
git clone https://github.com/ClaudioAgasi-SI/toolpm.git
cd toolpm
docker compose up -d --build
```

Poi apri:

- applicazione: http://localhost:4201/toolpm (Pianificatore: http://localhost:4201/toolpm/pianificatore); http://localhost:4201 reindirizza lì
- documentazione delle API (Swagger): http://localhost:3001/api/docs
- verifica del backend: http://localhost:3001/api/health (deve rispondere `"mongodb": "connesso"`)

Per aggiornare dopo una modifica al codice: `git pull` e di nuovo `docker compose up -d --build`.
Per fermare: `docker compose down` (MongoDB e i suoi dati non vengono toccati).

### Connessione a MongoDB

Dentro un container `localhost` indica il container stesso, quindi il backend si collega a
`mongodb://host.docker.internal:27017/toolpm`, il nome con cui Docker Desktop espone le porte del PC.
Per usare un indirizzo diverso copia `.env.example` in `.env` e modifica `MONGODB_URI`.

Dalla fase 1 MongoDB deve girare come replica set a un nodo: la procedura è in [docs/mongodb-replica-set.md](docs/mongodb-replica-set.md).
Per verificare connessione, replica set e transazioni: `docker compose exec backend npm run verifica-mongodb`.

### Caricare i dati di esempio

Solo se le collection sono vuote (non sovrascrive niente):

```bash
docker compose exec backend node scripts/seed.mjs
```

Con `--replace` in fondo al comando le collection vengono **svuotate** e reimportate dai file in `db/`.

### Copiare i dati dal vecchio database `pianificazione`

In alternativa ai dati di esempio, per partire dai dati reali del pianificatore (il database `pianificazione` resta intatto):

```bash
mongodump    --uri "mongodb://localhost:27017" --db pianificazione --archive=pianificazione.archive
mongorestore --uri "mongodb://localhost:27017" --archive=pianificazione.archive --nsFrom "pianificazione.*" --nsTo "toolpm.*"
```

Se MongoDB gira in un container, i comandi si possono lanciare al suo interno con `docker exec -it <nome-container> ...`.

### Convivenza con il vecchio pianificatore

ToolPM usa porte diverse da `pianificatore-risorse`, quindi i due progetti possono girare insieme:

| | ToolPM | pianificatore-risorse |
|---|---|---|
| Frontend | 4201 | 4200 |
| Backend | 3001 | 3000 |

## Sviluppo senza Docker

Servono Node.js 22 e MongoDB su `localhost:27017`.

```bash
# terminale 1
cd backend && npm install && npm run start:dev      # http://localhost:3001/api

# terminale 2
cd frontend && npm install && npm start             # http://localhost:4201/toolpm
```

In sviluppo `ng serve` inoltra le chiamate `/api` al backend tramite `frontend/proxy.conf.json`.
Test: `npm test` in `backend/` e in `frontend/`.

## API

Documentazione interattiva Swagger, con la possibilità di provare le chiamate: **http://localhost:3001/api/docs**
(specifica OpenAPI in JSON: http://localhost:3001/api/docs-json).

| Metodo | Percorso | Descrizione |
|---|---|---|
| GET | `/api/health` | Stato del backend, della connessione a MongoDB e del replica set |
| GET | `/api/pianificatore/risorse` | Elenco risorse |
| GET / PUT / DELETE | `/api/pianificatore/risorse/:id` | Lettura, sostituzione, cancellazione di una risorsa |
| POST | `/api/pianificatore/risorse` | Nuova risorsa |
| GET | `/api/pianificatore/pianificazione?da=AAAAMM&a=AAAAMM&tipoSkill=tecnico&skill=j2ee&skill=devOps` | Griglia risorse × mesi (default: 12 mesi dal mese corrente), con filtro facoltativo per una o più skill (in OR) |
| GET / POST / PUT / DELETE | `/api/pianificatore/skills`, `/api/pianificatore/certificazioni`, `/api/pianificatore/rate` | Anagrafiche |

## Regole sui dati

- Le anagrafiche (`skills`, `rate`, `certificazioni`) sono **suggerimenti**: nelle risorse si possono usare anche valori non presenti lì.
- Nelle scale di `rate` l'ordine conta: il primo valore è il livello più alto.
- `planned` è un array di righe, ciascuna con il proprio `mese` (formato `AAAAMM`). Le righe senza percentuale sono segnaposto e indicano un mese libero.
- La **% pesata** moltiplica ogni allocazione per il peso della sua probabilità: sicura 100%, probabile 75%, forse 50%, improbabile 25%, nessuna 0%. I pesi sono in `backend/src/pianificatore/pianificazione/pesi.ts`.
