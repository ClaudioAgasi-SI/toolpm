# Architettura

## Componenti

```
┌─────────────┐      HTTP       ┌──────────────────────┐   /api/*   ┌───────────────────┐   driver   ┌─────────────────────┐
│   Browser   │ ──────────────► │ frontend             │ ─────────► │ backend           │ ─────────► │ MongoDB             │
│  (utente)   │                 │ nginx + Angular      │            │ NestJS + Mongoose │            │ db "toolpm"         │
└─────────────┘                 │ container :80 → 4201 │            │ container :3000   │            │ host :27017         │
                                └──────────────────────┘            └───────────────────┘            └─────────────────────┘
```

| Componente | Tecnologia | Ruolo |
|---|---|---|
| frontend | Angular 22 (standalone components, signals), SCSS | Interfaccia utente: griglia di pianificazione, gestione risorse, anagrafiche |
| web server | nginx 1.27 | Serve i file statici di Angular e fa da reverse proxy verso il backend per i percorsi `/api/` |
| backend | NestJS 12, Node.js 22, TypeScript 6 (ESM) | API REST, calcoli della griglia, validazione, documentazione Swagger |
| ORM | Mongoose 9 (`@nestjs/mongoose`) | Schemi, validazione dei documenti, accesso a MongoDB |
| database | MongoDB (istanza esistente su Docker Desktop) | Persistenza delle 4 collection |

Il frontend chiama sempre l'indirizzo **relativo** `/api/...`: nessun URL del backend è scritto nel codice Angular.

- In **Docker** la richiesta arriva a nginx (`frontend/nginx.conf`), che la inoltra a `http://backend:3000` (nome del servizio nella rete di docker-compose).
- In **sviluppo** (`ng serve`) la inoltra il proxy di Angular (`frontend/proxy.conf.json`) a `http://localhost:3000`.

## Flusso tipico: caricamento della griglia

1. L'utente apre *Pianificazione*, sceglie intervallo di mesi ed eventuali filtri skill e preme **Aggiorna**.
2. Il frontend chiama `GET /api/pianificatore/pianificazione?da=202701&a=202712[&tipoSkill=...&skill=...]`.
3. Il backend legge da `risorse` i documenti che soddisfano il filtro, costruisce per ogni risorsa una cella per mese, somma le percentuali e calcola la percentuale pesata per probabilità.
4. Il frontend colora i valori per fascia, raggruppa i mesi con più progetti in accordion e mostra il bordo oro/argento in base all'importanza strategica di ogni progetto.

## Repository

```
toolpm/
├── backend/              API NestJS            → docs/backend.md
├── frontend/             app Angular           → docs/frontend.md
├── db/                   dati di esempio JSON  → docs/database.md
├── docs/                 questa documentazione
├── docker-compose.yml    avvio di frontend e backend
├── .env.example          esempio di configurazione (MONGODB_URI)
└── README.md             installazione e avvio rapido
```

## Deploy con Docker Desktop

`docker-compose.yml` definisce due servizi; MongoDB **non** è incluso perché è un'istanza già presente sul PC.

| Servizio | Build | Porta | Note |
|---|---|---|---|
| `backend` | `backend/Dockerfile` (multi-stage, `node:22-alpine`) | 3000 → 3000 | `MONGODB_URI` predefinito `mongodb://host.docker.internal:27017/toolpm`; monta `./db` in sola lettura su `/db` per lo script di import |
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
- **Anagrafiche come suggerimenti**: i valori di `skills`, `rate` e `certificazioni` aiutano l'inserimento ma non sono vincoli referenziali (vedi [database.md](database.md#regole-sui-dati)).
- **Versionamento**: Git su GitHub (`ClaudioAgasi-SI/toolpm`), branch `main`.
- **Test**: Vitest in entrambi i progetti (`npm test`).
