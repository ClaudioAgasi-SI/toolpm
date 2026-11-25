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
│   ├── mongoose-errors.filter.ts    errori di Mongoose/MongoDB → HTTP 400 (validazione), 409 (chiave duplicata)
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
│   ├── comuni/                      dati comuni a tutte le sezioni (fase 1, blocco B4) → /api/comuni
│   │   ├── schemi/                     Risorsa, Cliente, CentroCosto, Ruolo, Progetto, Attivita, Avanzamento
│   │   ├── comuni-dati.module.ts       modelli Mongoose, modulo globale (li usano anche le altre sezioni)
│   │   ├── comuni.module.ts            controller e servizi del modulo
│   │   ├── validazione.ts              lettura e controllo dei campi in ingresso (messaggi 400)
│   │   ├── anagrafiche.ts              clienti, centri-costo, ruoli: servizio e controller generici
│   │   ├── risorse/                    anagrafica delle risorse
│   │   └── progetti/                   progetti (stato, approvatori, percentuale) e attività
│   ├── consuntivazione/             sezione "Consuntivazione" (fase 2) → prefisso /api/consuntivazione
│   │   ├── consuntivazione.module.ts  modulo della sezione
│   │   ├── tipologie/                 tipologie di costo (blocco C1): schema, servizio, controller
│   │   ├── tariffe/                   tariffe (blocco C2): risoluzione.ts (regole pure), schemi, servizio, controller
│   │   ├── consuntivi/                consuntivi giornalieri (blocco C3): regole-giornata.ts (regole pure), schema, servizio, controller
│   │   └── valorizzazione/            righe da valorizzare e ricalcolo dei costi (blocco C6)
│   ├── permessi/                    permessi su profili e ruoli (fase 1, blocco B3)
│   │   ├── regole.ts                   regole pure: permessi globali, progetto, attività, risorse
│   │   ├── permessi.service.ts         PermessiService: le regole per i servizi, verifica() → 401/403
│   │   ├── permessi.module.ts          modulo globale
│   │   └── permessi.spec.ts            test delle regole per ogni profilo
│   └── pianificatore/               sezione "Pianificatore risorse" → prefisso /api/pianificatore
│       ├── pianificatore.module.ts  raccoglie i moduli della sezione
│       ├── risorse/
│       │   ├── risorsa.schema.ts       rimando allo schema Risorsa, spostato in comuni/schemi/ (B4)
│       │   ├── risorse.service.ts      caratteristiche delle risorse (skill, certificazioni, allocazioni), con i permessi
│       │   ├── allocazioni.service.ts  allocazioni ↔ progetti: progettoId in scrittura, codice e cliente in risposta
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
├── scripts/migrazione-dati.mjs      migrazione dei dati del Pianificatore, blocco B7 (vedi migrazione-dati.md)
├── scripts/migrazione-dati/         esporta, importa, verifica, CSV, password provvisorie
├── test/                            test di integrazione contro MongoDB vero (MONGODB_URI_TEST) e test degli script
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
| `EVM_RECUPERO_ALL_AVVIO` | `true` | `false` per non far recuperare all'avvio i giorni mancanti dell'andamento EVM (fase 4, E3); nei test non parte mai |
| `SEED_DIR` | `../db` | Solo per `scripts/seed.mjs` |
| `JWT_SECRET` | casuale a ogni avvio | Segreto per firmare i token di accesso; senza, gli accessi scadono a ogni riavvio |
| `JWT_DURATA` | `8h` | Durata dell'accesso (token e cookie) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD_INIZIALE` | — | Primo amministratore, creato all'avvio se non esiste nessun utente admin |
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
- **Storico delle modifiche** (fase 3, blocco D0). `AuditService` (modulo globale `InfrastrutturaModule`) scrive nella collection `audit_log` una voce per azione: `collezione`, `documentoId`, `righeIds` (per i consuntivi, le righe toccate), `operazione`, `utente` (dal contesto della richiesta), `il`, `prima`, `dopo`, `motivazione`. Si chiama `registra(voci, session)` dentro la stessa transazione della modifica, così modifica e storico si salvano insieme o per niente (decisione 9 della fase 3); `cronologia(collezione, documentoId, rigaId?)` legge le voci dalla più recente. Le voci non si modificano né si cancellano.
- **Migrazioni.** `npm run migra` esegue in ordine gli script `scripts/migrazioni/NNN-nome.mjs` non ancora eseguiti e li registra nella collection `migrazioni`; `npm run migra -- --elenco` mostra lo stato senza eseguire nulla. In Docker: `docker compose exec backend npm run migra`. Prima di eseguirle serve un backup ([mongodb-replica-set.md](mongodb-replica-set.md#2-backup)).

## Autenticazione (fase 1)

Modulo `src/auth/`. Il nome utente è l'email; le password sono cifrate con **scrypt** (incluso in Node.js, nessun modulo nativo da compilare nell'immagine Docker) nel formato `scrypt$N$r$p$sale$hash`.

- **Accesso.** `POST /api/auth/login` con `{ email, password }` verifica le credenziali e imposta il cookie `toolpm_token` (httpOnly, SameSite=Lax, durata `JWT_DURATA`), con dentro un token JWT che contiene solo l'id dell'utente. Il messaggio d'errore è lo stesso per email sconosciuta, password errata e utente disattivato. `POST /api/auth/logout` cancella il cookie; `GET /api/auth/me` restituisce il profilo; `POST /api/auth/cambia-password` cambia la propria password (almeno 10 caratteri).
- **Guard globale.** `AutenticazioneGuard` legge il token dal cookie o da `Authorization: Bearer`, carica l'utente (se esiste ed è attivo) e lo scrive nella richiesta e nel contesto, così il tracciamento dei salvataggi registra chi modifica. Gli endpoint `@Pubblica()` (login, logout, health) passano sempre; tutti gli altri richiedono l'accesso (401); quelli `@Ruoli(...)` anche uno dei ruoli indicati e quelli `@Permesso(...)` tutti i permessi globali indicati (403 altrimenti).
- **Accesso obbligatorio (dal blocco B6).** Ogni API che non è `@Pubblica()` risponde 401 senza accesso. La variabile `AUTH_OBBLIGATORIA` del periodo di transizione è stata tolta: se è ancora nel `.env` viene ignorata.
- **Gestione utenti.** `/api/utenti`, solo per il ruolo `admin`: elenco, creazione con password provvisoria, modifica di email, nome, risorsa collegata, abilitazione (TL, PM, PMSenior o nessuna), ruoli (`risorsa`, `controller`, `admin`) e stato attivo, reimpostazione della password. Gli utenti non si cancellano: si disattivano. Un amministratore non può disattivare se stesso né togliersi il ruolo admin. Chi riceve una password provvisoria deve cambiarla al primo accesso (`deveCambiarePassword`).
- **Primo amministratore.** All'avvio, se non esiste nessun utente con ruolo `admin` e sono impostati `ADMIN_EMAIL` e `ADMIN_PASSWORD_INIZIALE`, il backend lo crea.

## Permessi (fase 1)

Modulo globale `src/permessi/`, con le regole decise nell'analisi. Le regole sono funzioni pure in `regole.ts`: ricevono chi agisce e i dati che servono e rispondono sì o no, senza leggere il database.

- **Due livelli.** L'abilitazione generale dell'utente (TL, PM, PMSenior o nessuna) e il profilo sul singolo progetto (approvatore TL o PM, in `progetto.approvatori`), indipendenti tra loro: un utente abilitato TL può essere PM su un progetto. Se è assegnato in entrambi i modi, vale PM. I diritti da approvatore valgono solo con un'abilitazione: se l'amministratore la toglie, la persona non gestisce più i suoi progetti.
- **Permessi globali** (non dipendono da un progetto): `gestireClienti` e `gestireCentriDiCosto` → PMSenior; `creareProgetto` → TL, PM, PMSenior; `gestireRisorse` (anagrafica, ruolo professionale, orario) e `gestireCaratteristicheTutteLeRisorse` → PM, PMSenior; `gestireParametri`, `gestireTipologieCosto` e `gestireTariffe` → ruolo `controller`; `consuntivare` → chi è collegato a una risorsa (fase 2; l'amministratore senza risorsa no); `approvare` → chi ha un'abilitazione TL, PM o PMSenior, `gestirePeriodi` → ruolo `controller` e `consultareStorico` → controller e PMSenior (fase 3); `vedereReport` → abilitazione TL, PM, PMSenior o controller (fase 4); `gestireRuoli` (ruoli professionali) e `gestireUtenti` → ruolo `admin`. Sui controller si dichiarano con `@Permesso('gestireClienti')`; `@Permesso()` senza argomenti richiede solo l'accesso, come ogni endpoint non pubblico. `POST /api/auth/login` e `GET /api/auth/me` li restituiscono nel campo `permessi`, per il menu del frontend.
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
| `motivoNegatoModificaRisorsa` (modifica dal Pianificatore, confronto prima/dopo) | PM e PMSenior tutto; TL: alloca qualsiasi risorsa sui propri progetti e ne modifica o toglie quelle allocazioni, non tocca le allocazioni su altri progetti né i mesi liberi, skill e certificazioni solo se la risorsa lavora su un suo progetto: allocata (prima o dopo la modifica) o con ore consuntivate (fase 2; `GET /api/pianificatore/risorse/:id` porta `progettiConsuntivati`). Chiunque sulla propria risorsa: skill e certificazioni sì (voci nuove dal catalogo, controllo in `RisorseService`), allocazioni no; certificazioni nel formato `{ certName, conseguitaIl, scadenza?, ente?, codice?, link? }` (conseguimento obbligatorio, `validaCertificazioni`) |

- **Elenchi.** `filtroProgettiGestibili(utente)` dà il filtro MongoDB dei progetti che l'utente può gestire: tutti per il PMSenior, quelli in cui è approvatore per TL e PM, nessuno (`null`) per gli altri.
- Le regole controllano solo chi può agire. Se un passaggio di stato è ammesso (date, almeno un PM) lo controlla il modulo Comuni (blocco B4). Il collegamento ai dati veri (progetti, attività, allocazioni) arriva con i blocchi B4 e B5.

## Modulo Comuni (fase 1)

Modulo `src/comuni/`, registrato su `/api/comuni`: i dati condivisi da tutte le sezioni. I modelli Mongoose sono in `ComuniDatiModule` (globale), così Pianificatore e Consuntivazione li usano senza registrarli di nuovo. Tutte le API richiedono l'accesso; i permessi sono quelli del blocco B3.

| Metodo | Percorso | Chi | Note |
|---|---|---|---|
| GET | `/clienti`, `/centri-costo`, `/ruoli` (`?attivi=true`), `/:id` | Chi ha fatto l'accesso | Per codice |
| POST, PUT `/:id` | `/clienti`, `/centri-costo` | PMSenior | Codice unico e non modificabile; non si cancellano, `attivo: false` |
| POST, PUT `/:id` | `/ruoli` | Amministratore | Come sopra |
| GET | `/risorse` (`?attive=true`), `/risorse/:id` | Chi ha fatto l'accesso | Solo i dati anagrafici |
| POST, PUT `/:id` | `/risorse` | PM, PMSenior | Email obbligatoria e unica; `storicoRuoli` sostituisce lo storico |
| GET | `/progetti` (`?gestibili=true&stato=&clienteId=`), `/progetti/:id` | Chi ha fatto l'accesso | Stime in euro solo a chi gestisce il progetto e al controller |
| POST | `/progetti` | TL, PM, PMSenior | Nasce In valutazione; chi lo crea diventa approvatore (TL se abilitato TL, altrimenti PM) |
| PUT | `/progetti/:id` | TL e PM del progetto, PMSenior | Titolo, descrizione, cliente, centro di costo, date, stime, `soloSuAttivita`. Il centro di costo non cambia più dopo il primo consuntivo (409); il dettaglio `GET /progetti/:id` porta `conConsuntivi` |
| POST | `/progetti/:id/stato` | TL e PM del progetto, PMSenior; riapertura PM e PMSenior | `{ stato }`; In corso richiede data di inizio e un PM, Chiuso la data di fine |
| PUT | `/progetti/:id/approvatori` | PM del progetto, PMSenior | `{ approvatori: [{ risorsaId, profilo }] }`; almeno un PM se In corso o Chiuso |
| PUT | `/progetti/:id/completamento` | TL e PM del progetto, PMSenior | `{ percentuale }` 0–100, registrata in `avanzamenti` |
| GET | `/progetti/:id/avanzamenti` (`?attivitaId=`) | Chi ha fatto l'accesso | Dal più recente |
| GET | `/progetti/:id/attivita`, `/progetti/:id/attivita/:aid` | Chi ha fatto l'accesso | |
| POST, PUT `/:aid` | `/progetti/:id/attivita` | TL e PM del progetto, PMSenior | Codice unico nel progetto, non modificabile |
| PUT | `/progetti/:id/attivita/:aid/risorse` | TL e PM del progetto, PMSenior | `{ risorseAssegnateIds }` |
| PUT | `/progetti/:id/attivita/:aid/completamento` | Risorse assegnate, TL e PM del progetto, PMSenior | `{ percentuale }`, registrata in `avanzamenti` |

Convenzioni: le date si inviano come `AAAA-MM-GG`; nei PUT si aggiornano solo i campi presenti e `null` svuota un campo facoltativo; i riferimenti (cliente, centro di costo, ruolo, risorse) devono esistere, e cliente e centro di costo devono essere attivi quando si assegnano. Il cambio di stato e quello di percentuale sono condizionati al valore letto: se un altro utente l'ha cambiato nel frattempo la risposta è 409. Percentuale e storico si scrivono nella stessa transazione (serve il replica set).

## Modulo Consuntivazione (fase 2)

Sezione `src/consuntivazione/`, registrata con `RouterModule` su `/api/consuntivazione` (piano in [piano-fase2.md](piano-fase2.md)). Tutte le API richiedono l'accesso.

### Tipologie di costo — `/api/consuntivazione/tipologie-costo` (blocco C1)

| Metodo | Percorso | Permesso | Note |
|---|---|---|---|
| GET | `/tipologie-costo?attive=true` | accesso | In ordine di `ordine`, poi `codice`; `attive=true` solo le attive |
| GET | `/tipologie-costo/:id` | accesso | 404 se non esiste |
| POST | `/tipologie-costo` | `gestireTipologieCosto` | `codice` (unico, 409 se usato), `descrizione`, `categoria` (`ordinaria`/`straordinaria`), `ordine` (facoltativo: dopo l'ultima), `attiva`, `predefinita` |
| PUT | `/tipologie-costo/:id` | `gestireTipologieCosto` | Modifica parziale; il codice non cambia (409) |

Regole (`TipologieService`): nessuna cancellazione, si disattiva; c'è sempre **una sola tipologia predefinita**, ed è attiva. Per cambiarla si manda `predefinita: true` sulla nuova: la precedente perde il segno nella stessa transazione. Togliere il segno alla predefinita o disattivarla dà 400 ("scegli prima un'altra predefinita"); l'indice unico parziale `una_sola_predefinita` lo garantisce anche nel database. `TipologieService.predefinita()` serve al consuntivo (blocco C3) per le righe senza tipologia.

### Tariffe — blocco C2

Tutte con il permesso `gestireTariffe` (controller), in lettura e scrittura. Importi in `centesimiOra` (intero, 0–1.000.000); date `AAAA-MM-GG`, `validoAl` null = senza fine.

| Metodo | Percorso | Note |
|---|---|---|
| GET | `/tariffe-standard?ruolo=&tipologia=` | Ordinate per ruolo, tipologia e periodo più recente |
| POST | `/tariffe-standard` | `ruoloId`, `tipologiaId` (devono esistere), `validoDal`, `validoAl`, `centesimiOra` |
| PUT | `/tariffe-standard/:id` | Solo `validoDal`, `validoAl`, `centesimiOra`; ruolo e tipologia non cambiano (409) |
| DELETE | `/tariffe-standard/:id` | Per gli errori di inserimento: 409 se la tariffa è già usata in un consuntivo (`righe.tariffaId`) |
| GET / POST | `/risorse/:risorsaId/tariffe-personalizzate` | Come le standard, per la risorsa (404 se non esiste) |
| PUT / DELETE | `/risorse/:risorsaId/tariffe-personalizzate/:id` | La tariffa deve appartenere a quella risorsa (altrimenti 404) |
| GET | `/risorse/:risorsaId/tariffe-applicabili?data=` | Per ogni tipologia: `fonte` (`personalizzata`, `standard` o null), `tariffaId`, `centesimiOra`; più il ruolo della risorsa alla data. Senza data: oggi |

Regole: periodi della stessa coppia (ruolo + tipologia, risorsa + tipologia) mai sovrapposti, estremi compresi (409, controllo in transazione); `validoAl` non prima di `validoDal` (400). Una correzione di importo si fa chiudendo il periodo e aprendone un altro. La risoluzione sta in `tariffe/risoluzione.ts` (funzioni pure, `risoluzione.spec.ts`): ruolo alla data dall'ultima voce di `storicoRuoli` con decorrenza non successiva; prima la personalizzata, poi la standard di quel ruolo, altrimenti nessuna ("da valorizzare"); costo = `round(minuti × centesimiOra / 60)`. `TariffeService.risolutore(risorsaId, da, a)` carica in tre query tutto ciò che serve a un intervallo di date e restituisce la funzione di risoluzione che userà il consuntivo (blocco C3).

### Consuntivi — `/api/consuntivazione/consuntivi` (blocco C3)

| Metodo | Percorso | Permesso | Note |
|---|---|---|---|
| GET | `/consuntivi?da=&a=&risorsa=` | accesso | Al massimo 62 giorni. Senza `risorsa`: le proprie giornate; con `risorsa` di un altro: solo il controller (`gestireTariffe`). Per ogni giornata `data`, `versione`, `totaleMinuti`, righe con codici e titoli di progetto e attività |
| GET | `/consuntivi/voci?da=&a=` | `consuntivare` | Progetti non chiusi su cui la risorsa lavora nel periodo (default: il mese corrente), con `soloSuAttivita`, e le loro attività attive; `assegnata: true` sulle attività a cui la risorsa è assegnata, che stanno in testa (e prima i progetti che ne hanno, `conAttivitaAssegnate`) |
| GET | `/consuntivi/proposte?settimana=` | `consuntivare` | Righe proposte per la settimana: progetti allocati nel Pianificatore nei mesi della settimana (tipologia predefinita) e righe della settimana precedente; solo voci ancora consuntivabili |
| PUT | `/consuntivi/:data` | `consuntivare` | `{ versione, righe }`: le righe della giornata (sostituiscono le precedenti in bozza) |
| PUT | `/consuntivi` | `consuntivare` | `{ giornate: [{ data, versione, righe }] }`: tutte in una transazione, o nessuna |
| POST | `/consuntivi/invio` | `consuntivare` | Fase 3, blocco D1. `{ giornate: [{ data, versione }] }`: tutte le righe in bozza o respinte di quei giorni passano a `inviata` (non si inviano righe singole) e perdono via libera e rifiuto; i giorni senza righe da inviare si saltano. Una transazione, condizionata sulla versione di ogni giornata (409); una voce di storico `invio` per giornata, con stato, minuti, tipologia e rifiuto delle righe prima dell'invio. Risposta `{ giornate, righe, giorni }` |
| POST | `/consuntivi/ritiro` | `consuntivare` | Stesso corpo: le righe ancora `inviata` (nessun approvatore le ha toccate) tornano in bozza; storico `ritiro` |
| GET | `/consuntivi/da-inviare` | `consuntivare` | `{ bozza, respinte, primaData }`: righe proprie dei giorni fino a oggi ancora da inviare, per il contatore della pagina |

Ogni riga in ingresso: `_id` (per le righe esistenti), `attivitaId` oppure `progettoId`, `tipologiaId` (se manca, la predefinita), `minuti`, `nota`. Regole (`ConsuntiviService` e le funzioni pure di `regole-giornata.ts`):

- si consuntiva solo per sé (utente collegato a una risorsa), mai nel futuro (data di oggi in Italia), dentro le date di ingresso e uscita della risorsa;
- minuti a passi di 15, almeno 15, totale della giornata al massimo 24 ore; una sola riga per progetto o attività e tipologia;
- solo sui progetti su cui la risorsa lavora (decisione 5 del piano): assegnata ad almeno un'attività del progetto, approvatrice del progetto, oppure allocata sul progetto nel Pianificatore nel mese della riga con percentuale maggiore di zero; il controllo vale per le righe nuove o cambiate;
- con l'attività il progetto si ricava (un progetto diverso è un errore); niente righe nuove o cambiate su progetti chiusi, attività chiuse, tipologie disattivate, né direttamente su un progetto "solo su attività";
- per ogni riga nuova o cambiata: centro di costo copiato dal progetto, tariffa risolta con `TariffeService.risolutore()` e costo fotografato (`fonteTariffa`, `tariffaId`, `tariffaCentesimiOra`, `costoCentesimi`; null = da valorizzare), `modificatoIl` e `modificatoDa` della riga; le righe invariate restano come sono, e il costo si ricalcola solo se cambiano tipologia o minuti;
- le righe non in bozza o respinte (inviate, con via libera, approvate, chiuse) non si cambiano né si tolgono (409); accanto a loro si aggiungono righe nuove in bozza; una riga respinta corretta resta `respinta`, con il suo `rifiuto` (`{ da, il, motivazione }`), finché non viene inviata di nuovo;
- salvataggio condizionato sulla `versione` letta (0 per una giornata nuova): se è cambiata, 409 "ricarica la pagina";
- la risposta porta gli `avvisi`: ore ordinarie oltre l'orario contrattuale (o oltre il parametro `oreGiorno` se manca) e righe nuove o cambiate su attività a cui la risorsa non è assegnata (permesse, decisione 10 del piano); gli errori iniziano con la data della giornata;
- riservatezza: tariffe, importi, fonte e centro di costo compaiono solo nelle risposte al controller.

La copia del giorno o della settimana precedente si fa nella pagina (blocco C5): le righe copiate si vedono e si correggono prima di salvarle.

### Righe da valorizzare e ricalcolo (blocco C6)

Permesso `gestireTariffe` (controller). Periodo al massimo di un anno.

| Metodo | Percorso | Note |
|---|---|---|
| GET | `/da-valorizzare?da=&a=` | Righe senza costo (escluse quelle chiuse), con risorsa, data, voce, tipologia, minuti, stato, ruolo alla data e `motivo`: `ruoloMancante`, `tariffaMancante` oppure `tariffaDisponibile` (la tariffa ora c'è: basta ricalcolare) |
| POST | `/ricalcolo` | `{ da, a, risorsaId?, conferma }`. Risolve di nuovo la tariffa di ogni riga del periodo (escluse le chiuse) e tiene solo quelle il cui valore cambia (fonte, tariffa, importo orario o costo). Con `conferma: false` restituisce l'anteprima (totali e fino a 1000 righe con prima e dopo); con `conferma: true` aggiorna le giornate in una transazione, ciascuna condizionata sulla versione (409 se nel frattempo è cambiata: rifare l'anteprima), con `modificatoIl`/`modificatoDa` del controller sulle righe toccate |

## Modulo Consuntivazione: controllo (fase 3)

Regole dell'approvazione in `src/permessi/regole.ts` (funzioni pure, provate in `permessi.spec.ts`):

- `profiloDiApprovazione(soggetto, progetto)` → `TL`, `PM` o null: il PMSenior approva come PM su tutti i progetti, chi è TL e PM sullo stesso progetto come PM, chi non ha più un'abilitazione non approva.
- `motivoNegatoApprovazione(soggetto, progetto, riga, azione)` per `viaLibera`, `approva`, `respingi`: motivo del no oppure null. Nessuno agisce sulle proprie ore (decisione 3); TL: via libera o rifiuto delle righe `inviata`; PM: approvazione delle righe `inviata` o `approvataTL`, rifiuto anche delle `approvata`; righe `chiusa` mai.

### Approvazioni — `/api/consuntivazione/approvazioni` (blocco D2)

Permesso `approvare` (chi ha un'abilitazione TL, PM o PMSenior). Servizio `ApprovazioniService`.

| Metodo | Percorso | Note |
|---|---|---|
| GET | `/approvazioni?da=&a=&progetto=&attivita=&risorsa=&stato=` | Righe dei progetti di cui l'utente è approvatore (tutti per il PMSenior), **mai le proprie**. Senza `stato`: quelle che aspettano una sua azione (TL: `inviata`; PM: `inviata` e `approvataTL`); con `stato` (uno o più tra `inviata`, `approvataTL`, `approvata`, `respinta`, `chiusa`, separati da virgola) quelle chieste. Periodo facoltativo, al massimo un anno; al massimo 2000 righe (`troncato`). Per ogni riga: data, risorsa, progetto e attività, `attivitaNonAssegnata` (decisione 10 della fase 2, calcolata in lettura), tipologia, minuti, nota, stato, `profilo` dell'utente sul progetto, `azioni` possibili, `viaLiberaTL` e `approvazionePM` (`{ da, nome, il }`), `rifiuto` (con la motivazione); `fonteTariffa`, `tariffaCentesimiOra` e `costoCentesimi` solo al PM del progetto, al PMSenior e al controller (decisione 6). `totali`: righe, minuti e, se tutti visibili, costo |
| GET | `/approvazioni/in-attesa` | `{ righe }`: quante aspettano un'azione dell'utente, per il contatore del menu |
| POST | `/approvazioni` | `{ azione: 'viaLibera' \| 'approva' \| 'respingi', righe: [rigaId], motivazione? }`, fino a 1000 righe. Regole di `motivoNegatoApprovazione`; motivazione obbligatoria per respingere (max 500). In una transazione: ogni riga si aggiorna solo se è ancora nello stato letto (`$elemMatch` su `_id` e `stato`), con firma `{ da, il }` in `approvazioneTL` o `approvazionePM`, oppure `rifiuto` `{ da, il, motivazione }` (che azzera via libera e approvazione); la versione della giornata cresce, così un salvataggio della risorsa nel frattempo riceve 409; una voce di storico per giornata (`viaLibera`, `approvazione`, `rifiuto`). Risposta `{ azione, fatte, saltate, esiti: [{ rigaId, esito: 'fatta' \| 'saltata', motivo? }] }`: le righe non trovate, non permesse o cambiate nel frattempo sono "saltate" con il motivo, senza fermare le altre |

### Periodi — `/api/consuntivazione/periodi` (blocco D4)

Chiusura e riapertura dei mesi (RF-12), servizio `PeriodiService`, collection `periodi` (un documento per mese, creato alla prima chiusura).

| Metodo | Percorso | Permesso | Note |
|---|---|---|---|
| GET | `/periodi` | `gestirePeriodi` | Mesi dal primo con ore a quello corrente, dal più recente: `stato`, `conteggi` delle righe per stato, `nonApprovate`, `chiusura` (`il`, `da`, `forzata`, `motivazione`), `riapertura`, `chiudibile`, `riapribile`; più `progettiSenzaPM` (righe in attesa e nessun PM tra gli approvatori: le approva solo un PMSenior) |
| GET | `/periodi/chiusi?da=&a=` | accesso | Mesi chiusi (`AAAAMM`) nel periodo, per le pagine |
| GET | `/periodi/:mese/anteprima` | `gestirePeriodi` | Righe per stato, righe non approvate (al massimo 200, con giorno, risorsa, progetto, stato, minuti), `bloccoOrdine` |
| POST | `/periodi/:mese/chiusura` | `gestirePeriodi` | `{ forzata?, motivazione? }`. In ordine (decisione 5): 409 se un mese precedente con ore è aperto o uno successivo è chiuso; niente mesi futuri. Con righe non approvate (bozza, inviata, via libera, respinta) 409, salvo `forzata: true` con la motivazione (decisione 4): quelle righe restano nel loro stato. In una transazione: righe `approvata` → `chiusa` (`updateMany` con `arrayFilters`) e versione di tutte le giornate del mese +1, periodo chiuso, storico `chiusura` |
| POST | `/periodi/:mese/riapertura` | `gestirePeriodi` | `{ motivazione }` obbligatoria; solo l'ultimo mese chiuso. Righe `chiusa` → `approvata`, versione +1, storico `riapertura` |

**Mese chiuso.** `PeriodiService.chiusi()` / `verificaAperti()` li usano gli altri servizi: il salvataggio delle giornate e l'invio/ritiro rispondono 409 ("il mese di … è chiuso") già prima della convalida delle righe e di nuovo dentro la transazione; le approvazioni saltano le righe del mese chiuso ("La riga è in un mese chiuso") e l'elenco le mostra con `meseChiuso: true` e nessuna azione; il ricalcolo esclude le giornate dei mesi chiusi (decisione 7).

### Storico — `/api/consuntivazione/storico` (blocco D5)

Chi scrive nello storico (`AuditService.registra` nella stessa transazione della modifica, decisione 9):

| Dato (`collezione`) | Operazioni |
|---|---|
| `consuntivi` | `invio`, `ritiro` (D1); `viaLibera`, `approvazione`, `rifiuto` (D2); `correzione` e `cancellazione` di una riga respinta (salvataggio della risorsa, con i valori prima e il rifiuto); `ricalcolo` (con fonte, tariffa e costo prima e dopo, una voce per giornata) |
| `periodi` | `chiusura`, `riapertura` (D4) |
| `progetti` | `creazione`, `modifica` (solo i campi cambiati), `stato`, `approvatori` |
| `attivita` | `creazione`, `modifica`, `assegnazioni` |
| `tipologie_costo` | `creazione`, `modifica` |
| `tariffe_standard`, `tariffe_personalizzate` | `creazione`, `modifica`, `cancellazione` |

La funzione `differenze(prima, dopo, tolti)` di `audit.service.ts` tiene i soli campi cambiati. Le percentuali di completamento hanno già il loro storico (`avanzamenti`).

| Metodo | Percorso | Permesso | Note |
|---|---|---|---|
| GET | `/storico?collezione=&documento=&riga=&operazione=&utente=&da=&a=&limite=` | `consultareStorico` (controller e PMSenior) | Voci dalla più recente (predefinite 200, al massimo 1000; `troncato`), con `nomeUtente` e `documento` leggibile (risorsa e giorno, codice del progetto, progetto › attività, codice della tipologia, nome del mese) |
| GET | `/storico/riga/:rigaId` | accesso | Cronologia di una riga di consuntivo, dalla più vecchia, per la risorsa, gli approvatori del progetto, controller e PMSenior; delle voci su più righe resta l'elemento della riga; i `ricalcolo` (con importi) solo a controller, PMSenior e PM del progetto. 404 se la riga non esiste, 403 per gli altri |

## Modulo Consuntivazione: report (fase 4)

Piano in [piano-fase4.md](piano-fase4.md). Blocco E0: basi comuni dei report; blocco E1: scheda costi del progetto; blocco E2: indicatori EVM; blocco E3: andamento nel tempo; blocco E4: report dei costi; blocco E5: pianificato e consuntivato.

- **Due viste** (`report/viste.ts`, decisione 11): `approvata` (predefinita, ufficiale: righe `approvata` e `chiusa`) e `provvisoria` (anche `bozza`, `inviata`, `approvataTL`; mai `respinta`); `leggiVista()` per il parametro `vista` delle API; `STATI_IN_ATTESA` per le righe da segnalare a parte; `giorni(minuti, oreGiorno)` (un giorno = parametro `oreGiorno`, decisione 9); `senzaEuro()` per togliere i costi a chi non li vede.
- **Aggregazioni** (`ReportService`): `totali(filtro, vista, chiavi)` somma righe, minuti, costo (fotografato, mai ricalcolato) e righe da valorizzare per una o più chiavi (`progettoId`, `attivitaId`, `centroCostoId`, `tipologiaId`, `risorsaId`, `mese`); filtro per periodo, progetti, centri di costo, risorse. Ogni riga si conta una volta per gruppo (RF-21). `inAttesa(filtro, chiavi)` conta le righe non approvate.
- **Permessi**: `vedereReport` (globale: abilitazione TL, PM, PMSenior o controller) per il menu; per ogni progetto `puoVedereReportProgetto` (approvatori del progetto, PMSenior, controller) e `vedeEuroProgetto` (PM del progetto, PMSenior, controller; mai il TL, decisione 4).
- **EVM** (`report/evm.ts`, blocco E2, funzioni pure con test sull'esempio TIMBUFE): `quotaTrascorsa` (giorni dall'inizio / giorni tra inizio e fine, tra 0 e 1), `calcolaEvm` (BAC, PV, EV, AC, SV, CV, SPI, CPI, EAC, ETC, VAC, TCPI di una grandezza; indici a due decimali, euro in centesimi interi, giorni a due decimali; null dove non calcolabile), `statoTempi`/`statoCosti` con le soglie del parametro `soglieEvm` (confini allo stato migliore), `percentualeAllIstante` (dallo storico `avanzamenti`), `fineGiornoInItalia`, `evmProgetto` (euro e giorni, BAC dalla stima definitiva altrimenti manageriale, In valutazione e senza stime non calcolabili; stato dei costi dal CPI in euro, altrimenti in giorni: `costiDa`), `evmSenzaEuro`. `ReportService.soglieEvm()`. `EvmService` calcola al momento della richiesta.
- **Andamento** (`AndamentoService`, blocco E3; regole pure in `report/andamento-regole.ts` con test): procedura `evm` pianificata con `@nestjs/schedule` (`ScheduleModule.forRoot()` in `app.module.ts`) ogni notte alle 2:00 ora italiana e, 10 secondi dopo l'avvio, per recuperare i giorni mancanti. Come utente tecnico `sistema:evm`: segna `interrotta` un'esecuzione in corso da oltre un'ora, crea la nuova (409 se ce n'è già una in corso, grazie all'indice unico parziale della migrazione 010), parte dal giorno dopo l'ultimo completato (primo avvio: data di inizio più vecchia dei progetti In corso, al massimo un anno indietro) e arriva a ieri. Per ogni giorno: totali dei progetti In corso fino al giorno nelle due viste, percentuale del giorno dallo storico, `evmProgetto`; scrive `evm_giornalieri` (upsert) e fa avanzare il registro nella stessa transazione. Un errore su un progetto diventa un avviso; un errore generale chiude l'esecuzione come `fallita` con il motivo, e la successiva riparte dal primo giorno non concluso.
- **Report dei costi** (`CostiReportService`, blocco E4; albero in `report/costi-albero.ts` con test): `leggiLivelli` (da 1 a 4 tra `cdc`, `progetto`, `attivita`, `risorsa`, `ruolo`, `tipologia`, `mese`, senza ripetizioni), `costruisciAlbero` (ogni gruppo di righe sommato una volta per livello, RF-21). Il servizio aggrega con le chiavi che servono ai livelli (il ruolo dal ruolo della risorsa alla data di ogni giornata), costruisce l'albero, aggiunge le etichette (attività con il codice del progetto se il progetto non è un livello sopra; "senza attività" in fondo) e ordina (mesi nel tempo, tipologie per ordine, il resto per nome). Gli euro solo se l'utente li vede su tutti i progetti compresi (`euroNascostiInParte` quando ne vedrebbe solo una parte).
- **Pianificato e consuntivato** (`PianificatoReportService`, blocco E5; regole pure in `report/pianificato-regole.ts` con test): `pasqua`, `festivita` (Capodanno, Epifania, Pasqua e Pasquetta, 25 aprile, 1° maggio, 2 giugno, Ferragosto, San Francesco dal 2026 per la legge 151/2025, Ognissanti, Immacolata, Natale, Santo Stefano; non i patroni locali), `giorniLavorativi(mese, ingresso, uscita)`, `minutiPianificati`, `scostamento`, `mesiTra`. Il servizio legge le allocazioni (`risorse.planned` con percentuale > 0) dei progetti visibili e le somma per risorsa, progetto e mese; aggiunge ore approvate e in attesa (`ReportService` per `risorsaId`, `progettoId`, `mese`); ore contrattuali della risorsa o `oreGiorno`. Usa `CostiReportService.progettiVisibili`.
- **Progetti** (`ProgettiReportService`, blocco E1): elenco e scheda costi; dal blocco E2 l'elenco porta per ogni progetto `evm` (stati di tempi e costi a oggi con SPI e CPI). Le chiavi di `ReportService` comprendono anche `data` (per il ruolo alla data).

### Report dei progetti — `/api/consuntivazione/report/progetti` (blocco E1)

| Metodo | Percorso | Permesso | Note |
|---|---|---|---|
| GET | `/report/progetti?vista=&stato=&testo=&cliente=&centroCosto=` | `vedereReport` | Progetti visibili (controller e PMSenior: tutti; TL e PM: quelli di cui sono approvatori), ciascuno con `stime`, `consuntivato` dall'inizio e `inAttesa` (righe non approvate), `vedeEuro`. Gli euro (`managerialeCentesimi`, `definitivaCentesimi`, `costoCentesimi`) solo a chi li vede. Risposta `{ vista, calcolatoIl, opzioni, progetti }`; dal blocco E4 filtri `cliente` e `centroCosto` e in `opzioni` i centri di costo e i clienti dei progetti visibili |
| GET | `/report/progetti/:id/evm?al=&vista=` | `vedereReport` + approvatore del progetto, PMSenior o controller | Blocco E2. Indicatori alla data (predefinita oggi, non oltre; 400 altrimenti): `evm` con `percentuale` alla data (storico avanzamenti), `trascorso` (%), `euro` e `giorni` (`IndicatoriEvm`), fonti del BAC, `statoTempi`, `statoCosti`, `costiDa`, `daValorizzare` (righe fino alla data senza costo); `attivita` con stima in giorni: indicatori in giorni (SPI solo con le date), stati. AC dalle righe della vista fino alla data. Progetti In valutazione: `calcolabile: false`, `motivo`. Al TL senza `euro`. Anche `soglie`, `oreGiorno`, `vedeEuro`, `calcolatoIl` |
| GET | `/report/progetti/:id/evm/andamento?da=&a=&vista=` | `vedereReport` + approvatore del progetto, PMSenior o controller | Blocco E3. Serie giornaliera da `evm_giornalieri` (periodo predefinito: l'ultimo anno, non prima dell'inizio del progetto, fino all'ultimo giorno elaborato; al massimo cinque anni): per giorno `percentuale`, `trascorso`, stati e PV, EV, AC, SPI, CPI in `giorni` e (a chi li vede) in `euro`. Con `aggiornatoAl` (ultimo giorno completato), `avviso` (ultima esecuzione fallita, interrotta o in corso, oppure dati che non arrivano a ieri), `soglie` |
| GET | `/report/costi?da=&a=&raggruppa=&centroCosto=&cliente=&progetto=&vista=` | `vedereReport` | Blocco E4. Periodo predefinito: dal primo del mese a oggi (al massimo cinque anni). `raggruppa` predefinito `cdc,progetto`. Progetti: controller e PMSenior tutti, gli altri quelli di cui sono approvatori, ristretti dai filtri (id separati da virgola). Risposta: `livelli`, `periodo`, `vedeEuro`, `euroNascostiInParte`, `oreGiorno`, `opzioni` (centri di costo, clienti, progetti visibili), `totali`, `inAttesa` (righe non approvate del periodo), `righe` (nodi `{ livello, chiave, etichetta, progettoId?, righe, minuti, giorni, costoCentesimi?, daValorizzare, minutiDaValorizzare, figli }`) |
| GET | `/report/pianificato?da=AAAAMM&a=AAAAMM&risorsa=&progetto=` | `vedereReport` | Blocco E5. Predefinito il mese corrente; al massimo 24 mesi. Per risorsa (`risorsa`, `oreGiorno`, totali) e mese (`giorniLavorativi`, totali) i progetti con `percentuale` di allocazione, `pianificati`, `consuntivati` (approvati), `inAttesa`, `scostamento { minuti, percentuale }` e `nonAllocato` (ore su un progetto senza allocazione nel mese). Solo minuti, niente euro. Anche `mesi`, `totali`, `opzioni` (progetti visibili, risorse del risultato) |
| GET | `/report/esecuzioni` | `gestirePeriodi` (controller) | Blocco E3. Procedura dell'andamento: `aggiornatoAl`, `ultima` esecuzione, le dieci `recenti`, `avviso` |
| POST | `/report/esecuzioni/evm` | `gestirePeriodi` (controller) | Blocco E3. "Esegui ora": crea l'esecuzione e risponde subito (202) mentre elabora i giorni mancanti; 409 se una è già in corso |
| GET | `/report/progetti/:id?da=&a=&vista=` | `vedereReport` + approvatore del progetto, PMSenior o controller | Scheda: `periodo` (predefinito dal 1° gennaio a oggi, al massimo 5 anni; 400 se `a` < `da`), `progetto` (con `percentualeAttivitaPesata`, media delle attività pesata sulla stima), `stime`, `dallInizio`, `nelPeriodo`, `inAttesa { dallInizio, nelPeriodo }`, `perAttivita` (con "Senza attività", `attivitaId` null), `perRisorsa`, `perRuolo` (ruolo della risorsa alla data di ogni riga), `perTipologia`, `perMese`; `oreGiorno`, `vedeEuro`, `vista`, `calcolatoIl`. 403 se non si vede il progetto, 404 se non esiste |

## Moduli

### RisorseModule — `/api/pianificatore/risorse`

Le risorse sono quelle del modulo Comuni: qui si gestiscono le **caratteristiche** (skill, certificazioni, allocazioni). L'anagrafica (email, cellulare, ruolo, orario) è di `/api/comuni/risorse`.

| Metodo | Percorso | Descrizione | Chi | Risposte |
|---|---|---|---|---|
| GET | `/api/pianificatore/risorse` | Elenco, ordinato per cognome e nome | Chi ha fatto l'accesso | 200 |
| GET | `/api/pianificatore/risorse/:id` | Dettaglio | Chi ha fatto l'accesso | 200, 404 |
| POST | `/api/pianificatore/risorse` | Crea (**mantenuto per un rilascio**, senza email obbligatoria; la creazione completa è `POST /api/comuni/risorse`) | PM, PMSenior | 201, 400, 403 |
| PUT | `/api/pianificatore/risorse/:id` | **Sostituisce** skill, certificazioni e allocazioni: quelle non inviate tornano vuote. Cognome e nome si cambiano solo con il permesso `gestireRisorse`; l'anagrafica non si tocca | PM e PMSenior su tutte; TL: allocazioni solo sui propri progetti (anche di risorse nuove per il progetto), skill e certificazioni delle risorse che lavorano sui suoi progetti | 200, 400, 403, 404 |
| DELETE | `/api/pianificatore/risorse/:id` | Elimina (**mantenuto per un rilascio**), se la risorsa non è approvatore di un progetto né assegnata a un'attività | PM, PMSenior | 200 `{ "deleted": true }`, 403, 404, 409 |

Un `id` non valido come ObjectId restituisce 404.

**Allocazioni e progetti (blocco B5).** Nel database ogni allocazione punta al progetto con `progettoId`; il cliente si ricava dal progetto (`AllocazioniService`).

- In **risposta** (risorse e griglia) ogni allocazione con `progettoId` ha anche `progetto` (codice), `progettoTitolo`, `cliente` (codice) e `clienteRagioneSociale`, in sola lettura.
- In **scrittura** il progetto si indica con `progettoId` oppure con il suo **codice** nel campo `progetto` (senza distinzione tra maiuscole e minuscole); valgono anche i vecchi testi importati dalla migrazione B7 (`aliasPianificatore`). Il codice prevale su `progettoId`, così nel frontend di oggi si cambia progetto scrivendone il codice. Un campo `progetto` vuoto toglie il progetto dalla riga (mese libero). Un progetto inesistente dà 400 con l'elenco delle righe da correggere. Si salvano solo `progettoId` e, se c'erano, `clienteTesto` e `progettoTesto`.

Come tutte le API, anche quelle del Pianificatore richiedono l'accesso (dal blocco B6).

### AnagraficheModule — `/api/pianificatore/skills`, `/api/pianificatore/certificazioni`, `/api/pianificatore/rate`

I tre controller sono generati dalla funzione `crudController()` sopra un servizio CRUD generico (`CrudService`), con le stesse operazioni:

| Metodo | Percorso | Descrizione |
|---|---|---|
| GET | `/api/pianificatore/{skills,certificazioni,rate}` | Elenco (skills ordinate per tipo e nome; certificazioni per tipo e nome; rate per nome) |
| POST | `/api/pianificatore/{...}` | Crea |
| PUT | `/api/pianificatore/{...}/:id` | Aggiorna i campi inviati (`findByIdAndUpdate`); l'`_id` nel corpo è ignorato |
| DELETE | `/api/pianificatore/{...}/:id` | Elimina |

Creazione, modifica ed eliminazione: PM e PMSenior (`@Permesso('gestireCaratteristicheTutteLeRisorse')`); la lettura a chiunque abbia fatto l'accesso.

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
            { "mese": "202701", "progettoId": "6740a1c2e1f0a1b2c3d4e501", "cliente": "TIM", "progetto": "TIMBUFE", "probabilitaAllocazione": "sicura",
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
| Accesso mancante / permesso negato | 401 / 403 | `{ "statusCode": 403, "message": "Non hai il permesso di ..." }` |
| Valore già usato (codice, email) o dato cambiato nel frattempo | 409 | `{ "statusCode": 409, "message": "..." }` |
| Documento rifiutato dal validatore `$jsonSchema` | 400 | `{ "statusCode": 400, "error": "Dati non validi", ... }` |

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
npm test              # test Vitest (quelli di integrazione si saltano senza MONGODB_URI_TEST)
MONGODB_URI_TEST="mongodb://localhost:27017/?directConnection=true" npm test   # anche i test di integrazione
npm run verifica-mongodb  # connessione, replica set e transazioni di MongoDB
npm run migra         # migrazioni dei dati non ancora eseguite (--elenco per vederle)
npm run seed          # import dei dati di esempio (solo collection vuote)
npm run migrazione-dati -- esporta | importa [--prova] | verifica   # migrazione B7, vedi migrazione-dati.md
```

I **test di integrazione** (`test/*.integrazione.spec.ts`) avviano l'applicazione completa contro un MongoDB vero in replica set: creano un database `toolpm_test_<numero>`, eseguono le migrazioni, fanno l'accesso con utenti di prova di ogni profilo e lo cancellano alla fine. Non toccano il database `toolpm`.

| File | Cosa verifica |
|---|---|
| `comuni.integrazione.spec.ts` | Modulo Comuni: anagrafiche, risorse, progetti (stati, approvatori, stime in euro), attività, avanzamenti, validatori |
| `pianificatore.integrazione.spec.ts` | Pianificatore: allocazioni su `progettoId`, permessi sulle caratteristiche (anche il TL che alloca sui suoi progetti), migrazione 006 |
| `migrazione-dati.integrazione.spec.ts` | Migrazione B7 sui dati di esempio: esporta, errori per riga, prova, importazione, verifica, ripetibilità |
| `consuntivazione.integrazione.spec.ts` | Consuntivazione (fase 2): migrazione 007 (tipologie iniziali con ORDINARIA predefinita, ripetibilità, validatori di tipologie, tariffe e consuntivi, indici unici); API delle tipologie di costo (permessi, codice, una sola predefinita sempre attiva); API delle tariffe (permessi, sovrapposizioni, modifica, risoluzione con cambio di ruolo a metà mese, cancellazione bloccata se usata); consuntivi (progetti su cui si lavora, costo fotografato e riservatezza, versione e 409, ricalcolo solo se cambiano tipologia o minuti, regole su progetti, attività, tipologie, minuti, futuro e date della risorsa, avvisi, transazione su più giornate, righe non in bozza, voci e proposte); vincoli del blocco C4 (centro di costo bloccato, TL e risorse con ore sui suoi progetti); competenze personali e certificazioni; righe da valorizzare e ricalcolo (motivi, anteprima, applicazione, righe chiuse escluse) |
| `profili.integrazione.spec.ts` | Criteri di completamento della fase 1: 401 su tutte le API elencate da Swagger, 15 operazioni per ognuno dei 7 profili, tracciamento dell'utente giusto |

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
