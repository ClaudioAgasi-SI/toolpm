# Architettura

## Componenti

```
┌─────────────┐      HTTP       ┌──────────────────────┐   /api/*   ┌───────────────────┐   driver   ┌─────────────────────┐
│   Browser   │ ──────────────► │ frontend             │ ─────────► │ backend           │ ─────────► │ MongoDB             │
│  (utente)   │                 │ nginx + Angular      │            │ NestJS + Mongoose │            │ db "toolpm"         │
└─────────────┘                 │ container :80 → 4201 │            │ container :3001   │            │ host :27017         │
                                └──────────────────────┘            └───────────────────┘            └─────────────────────┘
```

| Componente | Tecnologia | Ruolo |
|---|---|---|
| frontend | Angular 22 (standalone components, signals), SCSS | Interfaccia utente: accesso, Pianificatore (griglia, risorse, catalogo), Anagrafiche comuni (progetti, risorse, clienti, centri di costo, ruoli, utenti) |
| web server | nginx 1.27 | Serve i file statici di Angular e fa da reverse proxy verso il backend per i percorsi `/api/` |
| backend | NestJS 12, Node.js 22, TypeScript 6 (ESM) | API REST, autenticazione (JWT in cookie httpOnly), permessi per profilo, tracciamento dei salvataggi, calcoli della griglia, validazione, migrazioni, documentazione Swagger |
| ORM | Mongoose 9 (`@nestjs/mongoose`) | Schemi, validazione dei documenti, accesso a MongoDB |
| database | MongoDB (istanza esistente su Docker Desktop, replica set `rs0`) | Persistenza: collection del Pianificatore, dei dati comuni e tecniche (vedi [database.md](database.md)) |

Il frontend chiama sempre l'indirizzo **relativo** `/api/...`: nessun URL del backend è scritto nel codice Angular.

- In **Docker** la richiesta arriva a nginx (`frontend/nginx.conf`), che la inoltra a `http://backend:3001` (nome del servizio nella rete di docker-compose).
- In **sviluppo** (`ng serve`) la inoltra il proxy di Angular (`frontend/proxy.conf.json`) a `http://localhost:3001`.

## Sezioni e moduli

| Sezione | Frontend | Backend | Note |
|---|---|---|---|
| Pianificatore risorse | `app/pianificatore/` → `/toolpm/pianificatore` | `src/pianificatore/` → `/api/pianificatore` | griglia, skill e allocazioni; legge risorse e progetti dal modulo Comuni |
| Anagrafiche (Comuni) | `app/comuni/` → `/toolpm/comuni` | `src/comuni/` → `/api/comuni`, `src/auth/` → `/api/utenti` | dati condivisi da tutte le sezioni |
| Consuntivazione | `app/consuntivazione/` → `/toolpm/consuntivazione` | `src/consuntivazione/` → `/api/consuntivazione` | fase 2 completata ([piano-fase2.md](piano-fase2.md), guida in [consuntivazione.md](consuntivazione.md)): tipologie di costo, tariffe, consuntivi, costi e ricalcolo |
| Trasversali | `app/core/`, `app/accesso/` | `src/auth/`, `src/permessi/`, `src/infrastruttura/` | accesso, permessi, tracciamento, parametri, migrazioni |

## Flusso tipico: accesso

1. Il browser apre `/toolpm`; il frontend chiama `GET /api/auth/me`. Senza accesso valido la guardia porta alla pagina di accesso.
2. `POST /api/auth/login` con email e password: il backend verifica la password (scrypt) e imposta il cookie httpOnly `toolpm_token` (JWT con l'id dell'utente). Il frontend riceve il profilo con abilitazione, ruoli e permessi globali.
3. A ogni richiesta la guardia globale del backend legge il cookie, carica l'utente e lo mette nel contesto: i permessi decidono cosa può fare (403 altrimenti) e il tracciamento registra chi salva. Senza accesso: 401, e il frontend torna alla pagina di accesso.

## Flusso tipico: caricamento della griglia

1. L'utente apre *Pianificazione*, sceglie intervallo di mesi ed eventuali filtri skill e preme **Aggiorna**.
2. Il frontend chiama `GET /api/pianificatore/pianificazione?da=202701&a=202712[&tipoSkill=...&skill=...]`.
3. Il backend legge da `risorse` i documenti che soddisfano il filtro, costruisce per ogni risorsa una cella per mese, somma le percentuali e calcola la percentuale pesata per probabilità; aggiunge a ogni allocazione codice e titolo del progetto e del cliente, ricavati da `progettoId`.
4. Il frontend colora i valori per fascia, raggruppa i mesi con più progetti in accordion e mostra il bordo oro/argento in base all'importanza strategica di ogni progetto.

## Repository

```
toolpm/
├── backend/              API NestJS            → docs/backend.md
├── frontend/             app Angular           → docs/frontend.md
├── db/                   dati di esempio JSON  → docs/database.md
├── migrazione/           file della migrazione dei dati (esclusi da Git) → docs/migrazione-dati.md
├── docs/                 questa documentazione
├── docker-compose.yml    avvio di frontend e backend
├── .env.example          esempio di configurazione (MONGODB_URI, JWT_SECRET, primo amministratore)
└── README.md             installazione e avvio rapido
```

## Deploy con Docker Desktop

`docker-compose.yml` definisce due servizi; MongoDB **non** è incluso perché è un'istanza già presente sul PC.

| Servizio | Build | Porta | Note |
|---|---|---|---|
| `backend` | `backend/Dockerfile` (multi-stage, `node:22-alpine`) | 3001 → 3001 | `MONGODB_URI` predefinito `mongodb://host.docker.internal:27017/toolpm?directConnection=true`; variabili di accesso da `.env`; monta `./db` in sola lettura su `/db` (dati di esempio) e `./migrazione` su `/migrazione` (migrazione dei dati) |
| `frontend` | `frontend/Dockerfile` (build Angular su `node:22-alpine`, esecuzione su `nginx:1.27-alpine`) | 4201 → 80 | dipende da `backend` |

**Perché `host.docker.internal`**: dentro un container `localhost` indica il container stesso. Docker Desktop espone le porte del PC ai container con il nome `host.docker.internal`; la voce `extra_hosts: host-gateway` lo rende disponibile anche su Docker per Linux.

Comandi:

```bash
docker compose up -d --build      # build e avvio (anche dopo ogni git pull)
docker compose logs -f backend    # log del backend
docker compose down               # arresto (MongoDB non viene toccato)
```

Per cambiare la connessione al database: copiare `.env.example` in `.env` e modificare `MONGODB_URI`.

## Convenzioni

- **Lingua**: nomi di dominio, commenti, messaggi d'errore e interfaccia in italiano (risorsa, allocazione, mese, pesato...).
- **Mesi**: sempre stringhe `AAAAMM` (es. `"202701"`), sia nel database sia nelle API.
- **Catalogo come suggerimento**: i valori di `skills`, `rate` e `certificazioni` aiutano l'inserimento ma non sono vincoli referenziali; i dati comuni (progetti, clienti, centri di costo, ruoli, risorse) invece sono collegati da riferimenti controllati dal backend (vedi [database.md](database.md#regole-sui-dati)).
- **Permessi**: decisi solo nel backend (`src/permessi/regole.ts`); il frontend li rispecchia per mostrare i comandi.
- **Versionamento**: Git su GitHub (`ClaudioAgasi-SI/toolpm`), branch `main`.
- **Test**: Vitest in entrambi i progetti (`npm test`); nel backend i test di integrazione girano contro un MongoDB vero in replica set con `MONGODB_URI_TEST` (vedi [backend.md](backend.md#sviluppo)).
