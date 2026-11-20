# ToolPM

Tool di project management per un'azienda di consulenza software (sviluppo prodotti e manutenzione evolutiva).
Il prodotto è diviso in **sezioni**; ognuna ha le proprie pagine (sotto `/<sezione>`) e le proprie API (sotto `/api/<sezione>`).

| Sezione | Frontend | API | Stato |
|---|---|---|---|
| Pianificatore risorse allocate — allocazione delle persone sui progetti nel tempo, in base a skill, importanza strategica e probabilità di allocazione | `/pianificatore` | `/api/pianificatore/...` | disponibile |
| Anagrafiche — dati comuni a tutte le sezioni: progetti con attività e approvatori, risorse, clienti, centri di costo, ruoli, utenti | `/comuni` | `/api/comuni/...`, `/api/utenti` | disponibile (fase 1) |
| Consuntivazione costi di progetto — ore lavorate, tipologie di costo, tariffe, costo del personale per progetto | `/consuntivazione` | `/api/consuntivazione/...` | fase 2 in corso ([piano-fase2.md](docs/piano-fase2.md)); analisi in [analisi-consuntivazione.md](docs/analisi-consuntivazione.md) |

Si entra con email e password; ogni utente vede e modifica solo ciò che il suo profilo (TL, PM, PMSenior) e i suoi ruoli (risorsa, controller, admin) consentono.

- **frontend/** — Angular: accesso, home e menu delle sezioni; `src/app/pianificatore/` (griglia, risorse, catalogo), `src/app/comuni/` (Anagrafiche)
- **backend/** — NestJS: API REST su MongoDB, autenticazione e permessi, script di migrazione
- **db/** — dati di esempio delle collection (`skills`, `rate`, `certificazioni`, `risorse`)
- **migrazione/** — file della migrazione dei dati del Pianificatore (esclusi da Git, vedi [migrazione-dati.md](docs/migrazione-dati.md))
- **docker-compose.yml** — avvio di frontend e backend su Docker Desktop
- **docs/** — documentazione tecnica: [indice](docs/README.md), [architettura](docs/architettura.md), [frontend](docs/frontend.md), [backend](docs/backend.md), [database](docs/database.md), [piano della fase 1](docs/piano-fase1.md)

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

### Prima installazione (fase 1)

1. **MongoDB come replica set** a un nodo: procedura in [docs/mongodb-replica-set.md](docs/mongodb-replica-set.md). Verifica: `docker compose exec backend npm run verifica-mongodb`.
2. **`.env`**: copia `.env.example` in `.env` e imposta almeno `JWT_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD_INIZIALE`. Al primo avvio il backend crea l'amministratore.
3. **Avvio**: `docker compose up -d --build`.
4. **Migrazioni** (indici, validatori, parametri): `docker compose exec backend npm run migra`, dopo un backup.
5. **Dati del Pianificatore** nelle anagrafiche comuni: [docs/migrazione-dati.md](docs/migrazione-dati.md) (esporta, compilazione dei CSV, importa, verifica).
6. **Primo accesso** da http://localhost:4201/toolpm con `ADMIN_EMAIL` e la password iniziale: ToolPM chiede subito di cambiarla. Poi dalla pagina Anagrafiche → Utenti si gestiscono abilitazioni e ruoli.

Ogni aggiornamento successivo: `git pull`, backup, `docker compose up -d --build`, `docker compose exec backend npm run migra`.

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
| POST | `/api/auth/login`, `/api/auth/logout` | Accesso con email e password (cookie `toolpm_token`), uscita |
| GET | `/api/auth/me` | Profilo dell'utente che ha fatto l'accesso |
| POST | `/api/auth/cambia-password` | Cambio della propria password |
| GET / POST / PUT | `/api/utenti`, `/api/utenti/:id` | Gestione degli utenti (solo amministratore) |
| POST | `/api/utenti/:id/password` | Password provvisoria (solo amministratore) |
| GET / POST / PUT | `/api/comuni/clienti`, `/centri-costo`, `/ruoli`, `/risorse` | Anagrafiche comuni |
| GET / POST / PUT | `/api/comuni/progetti`, `/api/comuni/progetti/:id` | Progetti; in più `POST .../stato`, `PUT .../approvatori`, `PUT .../completamento`, `GET .../avanzamenti` |
| GET / POST / PUT | `/api/comuni/progetti/:id/attivita` | Attività; in più `PUT .../risorse`, `PUT .../completamento` |
| GET / PUT | `/api/parametri`, `/api/parametri/:chiave` | Parametri di sistema (modifica: controller) |
| GET / PUT | `/api/pianificatore/risorse`, `/api/pianificatore/risorse/:id` | Skill, certificazioni e allocazioni delle risorse (POST e DELETE mantenuti per un rilascio) |
| GET | `/api/pianificatore/pianificazione?da=AAAAMM&a=AAAAMM&tipoSkill=tecnico&skill=j2ee&skill=devOps` | Griglia risorse × mesi (default: 12 mesi dal mese corrente), con filtro facoltativo per una o più skill (in OR) |
| GET / POST / PUT / DELETE | `/api/pianificatore/skills`, `/api/pianificatore/certificazioni`, `/api/pianificatore/rate` | Catalogo del Pianificatore |

Tutte le API richiedono l'accesso, tranne login, logout e health (401 senza accesso, 403 senza permesso). Dettagli: [docs/backend.md](docs/backend.md).

## Regole sui dati

- Il catalogo del Pianificatore (`skills`, `rate`, `certificazioni`) dà **suggerimenti**: nelle risorse si possono usare anche valori non presenti lì. I progetti delle allocazioni invece devono esistere (`progettoId`).
- Nelle scale di `rate` l'ordine conta: il primo valore è il livello più alto.
- `planned` è un array di righe, ciascuna con il proprio `mese` (formato `AAAAMM`) e il progetto (`progettoId`; il cliente si ricava dal progetto). Le righe senza percentuale o senza progetto indicano un mese libero.
- La **% pesata** moltiplica ogni allocazione per il peso della sua probabilità: sicura 100%, probabile 75%, forse 50%, improbabile 25%, nessuna 0%. I pesi sono in `backend/src/pianificatore/pianificazione/pesi.ts`.
