# Documentazione tecnica — ToolPM

Tool di project management organizzato in sezioni: il **Pianificatore risorse allocate**
(frontend `/toolpm/pianificatore`, API `/api/pianificatore`), allocazione delle risorse (persone) sui progetti mese per mese
tenendo conto di skill, importanza strategica e probabilità di allocazione, la **Consuntivazione** (frontend `/toolpm/consuntivazione`, API `/api/consuntivazione`), ore lavorate delle risorse con tipologie di costo, tariffe e costo del personale per progetto, e le **Anagrafiche** comuni
(frontend `/toolpm/comuni`, API `/api/comuni`): progetti con attività e approvatori, risorse, clienti, centri di costo, ruoli, utenti.
Si accede con email e password; i permessi dipendono dal profilo (TL, PM, PMSenior) e dai ruoli (risorsa, controller, admin).

| Documento | Contenuto |
|---|---|
| [architettura.md](architettura.md) | Visione d'insieme, componenti, flussi, deploy con Docker, convenzioni del repository |
| [frontend.md](frontend.md) | Applicazione Angular: struttura, accesso e permessi, pagine del Pianificatore e delle Anagrafiche, servizi, stile, build e test |
| [backend.md](backend.md) | API NestJS: infrastruttura, autenticazione, permessi, modulo Comuni, Pianificatore, endpoint, errori, Swagger, configurazione, test |
| [database.md](database.md) | MongoDB: collection, schema dei documenti, validatori, tracciamento, migrazioni, regole sui dati, indici, import dei dati |
| [analisi-pianificatore.md](analisi-pianificatore.md) | Sezione Pianificatore risorse allocate: analisi funzionale (requisiti, calcolo della percentuale pesata, regole, limiti attuali) e analisi tecnica di sintesi con le evoluzioni previste |
| [analisi-consuntivazione.md](analisi-consuntivazione.md) | Sezione Consuntivazione (fase 2 realizzata; approvazioni ed EVM nelle fasi successive): analisi funzionale e tecnica, progetti (stati, stime, percentuale di completamento) e attività, indicatori EVM di tempi e costi, profili di approvazione TL, PM e PMSenior, integrazioni con altri sistemi tramite script di estrazione, modello dei dati su MongoDB |
| [consuntivazione.md](consuntivazione.md) | Guida d'uso della Consuntivazione: il mio consuntivo, le mie competenze, preparazione dei progetti per TL e PM, tipologie, tariffe, consuntivi delle risorse, righe da valorizzare e ricalcolo per il controller, domande frequenti |
| [piano-fase1.md](piano-fase1.md) | Piano della fase 1 (fondamenta): autenticazione e profili, modulo Comuni, permessi, adattamento del Pianificatore, migrazione dei dati, criteri di completamento e rischi |
| [piano-fase2.md](piano-fase2.md) | Piano della fase 2 (consuntivazione): tipologie di costo, tariffe standard e personalizzate, consuntivo giornaliero e settimanale, calcolo dei costi, righe da valorizzare e ricalcolo; confermato e completato il 20/11/2026 |
| [mongodb-replica-set.md](mongodb-replica-set.md) | Passaggio di MongoDB a replica set a un nodo (fase 1, blocco B0): backup, nuovo container, inizializzazione, stringa di connessione, verifica |
| [migrazione-dati.md](migrazione-dati.md) | Migrazione dei dati del Pianificatore verso le anagrafiche comuni (fase 1, blocco B7): esportazione dei CSV, come compilarli, importazione in prova e definitiva, verifica |

## In breve

```
Browser ──► frontend (Angular, nginx :4201) ──/api──► backend (NestJS :3001) ──► MongoDB :27017 (db "toolpm")
```

- **Frontend**: Angular 22, componenti standalone, signals. In Docker è servito da nginx, che inoltra `/api` al backend.
- **Backend**: NestJS 12 su Node.js 22, Mongoose 9, documentazione OpenAPI/Swagger su `/api/docs`.
- **Database**: MongoDB, database `toolpm`: collection del Pianificatore, comuni a tutte le sezioni e della Consuntivazione (`tipologie_costo`, `tariffe_standard`, `tariffe_personalizzate`, `consuntivi`); elenco completo in [database.md](database.md).
- **Prove nel browser**: script Playwright in [`e2e/`](../e2e/README.md) su un database di prova separato.
  Tutto ToolPM usa solo MongoDB; le integrazioni con sistemi che usano database relazionali passano da script di estrazione e trasformazione (vedi [analisi-consuntivazione.md](analisi-consuntivazione.md)).

## Indirizzi utili (avvio con Docker Desktop)

| Cosa | URL |
|---|---|
| Applicazione | http://localhost:4201/toolpm |
| Swagger UI | http://localhost:3001/api/docs |
| Specifica OpenAPI (JSON) | http://localhost:3001/api/docs-json |
| Stato del backend | http://localhost:3001/api/health |

Per l'installazione e l'avvio vedi il [README principale](../README.md).
