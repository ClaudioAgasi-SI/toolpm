# Documentazione tecnica — ToolPM

Tool di project management organizzato in sezioni. La prima sezione è il **Pianificatore risorse allocate**
(frontend `/pianificatore`, API `/api/pianificatore`): allocazione delle risorse (persone) sui progetti, mese per mese,
tenendo conto di skill, importanza strategica e probabilità di allocazione.

| Documento | Contenuto |
|---|---|
| [architettura.md](architettura.md) | Visione d'insieme, componenti, flussi, deploy con Docker, convenzioni del repository |
| [frontend.md](frontend.md) | Applicazione Angular: struttura, pagine, componenti, servizi, stile, build e test |
| [backend.md](backend.md) | API NestJS: moduli, endpoint, regole di calcolo, validazione, Swagger, configurazione |
| [database.md](database.md) | MongoDB: collection, schema dei documenti, regole sui dati, indici, import dei dati |

## In breve

```
Browser ──► frontend (Angular, nginx :4200) ──/api──► backend (NestJS :3000) ──► MongoDB :27017 (db "toolpm"    )
```

- **Frontend**: Angular 22, componenti standalone, signals. In Docker è servito da nginx, che inoltra `/api` al backend.
- **Backend**: NestJS 12 su Node.js 22, Mongoose 9, documentazione OpenAPI/Swagger su `/api/docs`.
- **Database**: MongoDB, database `toolpm`; la sezione Pianificatore usa 4 collection (`risorse`, `skills`, `rate`, `certificazioni`).

## Indirizzi utili (avvio con Docker Desktop)

| Cosa | URL |
|---|---|
| Applicazione | http://localhost:4200 |
| Swagger UI | http://localhost:3000/api/docs |
| Specifica OpenAPI (JSON) | http://localhost:3000/api/docs-json |
| Stato del backend | http://localhost:3000/api/health |

Per l'installazione e l'avvio vedi il [README principale](../README.md).
