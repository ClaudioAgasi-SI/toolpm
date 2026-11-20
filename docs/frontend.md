# Frontend (Angular)

Cartella: `frontend/`

## Stack

| Componente | Versione / scelta |
|---|---|
| Angular | 22, **componenti standalone** (nessun NgModule) |
| Stato | **signals** (`signal`, `computed`, `input`, `model`, `effect`) |
| Template | nuova sintassi di controllo (`@if`, `@for`, `@let`) |
| Form | `FormsModule` (`ngModel`), template-driven |
| HTTP | `HttpClient` (`provideHttpClient`) |
| Stili | SCSS; variabili CSS globali in `src/styles.scss` |
| Build | `@angular/build` (application builder) |
| Test | Vitest (`ng test`) |

## Struttura

```
frontend/src/
├── index.html, main.ts, styles.scss
└── app/
    ├── app.ts / app.html / app.scss   shell ToolPM: barra con sezioni, utente, "Password" ed "Esci" + <router-outlet>
    ├── app.config.ts                  provider: router (con input binding), HttpClient con interceptor 401, lettura della sessione all'avvio
    ├── app.routes.ts                  rotte di primo livello: accesso + (dietro l'accesso) home, cambio password, sezioni (lazy)
    ├── sezioni.ts                     elenco delle sezioni (menu e home)
    ├── core/                          sessione e accesso (fase 1, blocco B6)
    │   ├── sessione.service.ts        SessioneService: utente, permessi globali, login, logout, cambio password
    │   ├── accesso.ts                 interceptor401, guard accessoRichiesto, permessoRichiesto(), ruoloRichiesto()
    │   └── errori.ts                  messaggioErrore()
    ├── accesso/                       pagine Accesso e Cambia password
    ├── home/                          pagina iniziale con le schede delle sezioni
    ├── comuni/                        sezione "Anagrafiche" (modulo Comuni del backend)
    │   ├── comuni.routes.ts, comuni-layout.ts
    │   ├── comuni-api.service.ts      chiamate a /api/comuni e /api/utenti
    │   ├── modelli.ts                 tipi: progetti, attività, risorse, voci, utenti, avanzamenti
    │   ├── permessi.ts                regole sui progetti per mostrare i comandi (come il backend)
    │   ├── anagrafica-semplice.ts     clienti, centri di costo, ruoli (configurati dalla rotta)
    │   ├── progetti/                  elenco e scheda del progetto
    │   ├── risorse/                   elenco e scheda anagrafica delle risorse
    │   └── utenti/                    gestione utenti (solo amministratore)
    ├── consuntivazione/               sezione "Consuntivazione" (fase 2)
    │   ├── consuntivazione.routes.ts, consuntivazione-layout.ts
    │   ├── consuntivazione-api.service.ts  chiamate a /api/consuntivazione
    │   ├── modelli.ts                 tipi: tipologie di costo, tariffe; euroOra(), tariffaValida()
    │   ├── consuntivazione-inizio.ts  pagina iniziale: funzioni del profilo, con link a quelle già disponibili
    │   ├── mio-consuntivo.ts/.html/.scss  "Il mio consuntivo": griglia righe × giorni (vista settimana o giorno), salvataggio delle giornate cambiate, copia, proposte, avanzamento delle mie attività
    │   ├── da-valorizzare.ts          righe senza costo raggruppate per risorsa, ruolo, tipologia e motivo; ricalcolo con anteprima e conferma (controller)
    │   ├── ore.ts                     funzioni pure: lettura delle ore (8, 7,5, 7:30), date della settimana, oggi in Italia (ore.spec.ts)
    │   ├── tipologie-costo.ts         tipologie di costo (controller)
    │   ├── tariffe.ts                 tariffe standard (matrice ruolo × tipologia alla data) e personalizzate (con tariffe applicabili)
    │   └── elenco-tariffe.ts          elenco dei periodi di un ruolo o di una risorsa, con inserimento e modifica in riga
    └── pianificatore/                 sezione "Pianificatore risorse allocate"
        ├── pianificatore.routes.ts    rotte della sezione (sotto /pianificatore)
        ├── pianificatore-layout.ts    sotto-menu della sezione + <router-outlet>
        ├── api.service.ts             chiamate REST a /api/pianificatore + messaggioErrore()
        ├── models.ts                  interfacce TypeScript dei dati
        ├── mesi.ts                    utilità sui mesi AAAAMM
        ├── multi-select.ts            componente tendina a selezione multipla
        ├── pianificazione/            pagina Pianificazione (griglia)
        ├── risorse/                   elenco e scheda risorsa
        └── anagrafiche/               pagina Anagrafiche + editor delle scale
```

## Rotte

Tutte le rotte, tranne `/accesso`, sono dietro la guardia `accessoRichiesto`: senza accesso portano alla pagina di accesso (con `?ritorno=` per tornare alla pagina richiesta), con una password provvisoria al cambio password.

| Percorso | Componente | Descrizione |
|---|---|---|
| `/accesso` | `Accesso` | email e password |
| `/cambia-password` | `CambiaPassword` | cambio della propria password; obbligatorio dopo una password provvisoria |
| `/` | `Home` | elenco delle sezioni di ToolPM |
| `/comuni` | `ComuniLayout` | sezione Anagrafiche; reindirizza a `/comuni/progetti` |
| `/comuni/progetti`, `/comuni/progetti/:id` (`nuovo`) | `ProgettiElenco`, `ProgettoDettaglio` | progetti |
| `/comuni/risorse`, `/comuni/risorse/:id` (`nuova`) | `RisorseAnagrafica`, `RisorsaAnagraficaDettaglio` | dati anagrafici delle risorse |
| `/comuni/clienti`, `/comuni/centri-costo`, `/comuni/ruoli` | `AnagraficaSemplice` | anagrafiche semplici (configurazione in `data.definizione`) |
| `/comuni/utenti` | `Utenti` | gestione utenti, solo ruolo `admin` (`ruoloRichiesto('admin')`) |
| `/consuntivazione` | `ConsuntivazioneLayout`, `ConsuntivazioneInizio` | sezione Consuntivazione (fase 2): pagina iniziale con le funzioni del profilo |
| `/consuntivazione/settimana` | `MioConsuntivo` | Il mio consuntivo: `?vista=settimana|giorno&data=AAAA-MM-GG`; solo chi ha una risorsa (`consuntivare`). Righe = progetto o attività + tipologia (predefinita sulle nuove, modificabile), colonne = giorni; giorni futuri e righe non in bozza in sola lettura; salva insieme le sole giornate cambiate (PUT multiplo con versione; 409 → "Ricarica"); copia della settimana o del giorno precedente nei giorni vuoti, senza salvare; righe proposte (dal Pianificatore e dalla settimana prima) aggiunte da sole quando il periodo è vuoto; avvisi del salvataggio; nota per cella; percentuale delle attività assegnate. Nessun importo |
| `/consuntivazione/da-valorizzare` | `DaValorizzare` | solo controller (`gestireTariffe`): righe senza costo per gruppo con collegamento a dove si sistemano (ruolo in Anagrafiche, tariffe del ruolo o della risorsa), ricalcolo del periodo (tutte le risorse o una) con anteprima prima/dopo in euro e conferma |
| `/consuntivazione/tariffe` | `Tariffe`, `ElencoTariffe` | tariffe standard e personalizzate; `?vista=personalizzate&risorsa=<id>`; solo controller (`gestireTariffe`) |
| `/consuntivazione/tipologie` | `TipologieCosto` | tipologie di costo con modifica in riga e scelta della predefinita; solo controller (`permessoRichiesto('gestireTipologieCosto')`) |
| `/pianificatore` | `PianificatoreLayout` | sezione Pianificatore; reindirizza a `/pianificatore/pianificazione` |
| `/pianificatore/pianificazione` | `Pianificazione` | griglia risorse × mesi |
| `/pianificatore/risorse` | `RisorseElenco` | elenco con ricerca |
| `/pianificatore/risorse/nuova` | — | reindirizza a `/comuni/risorse/nuova` (le risorse nuove si creano nell'anagrafica, con l'email) |
| `/pianificatore/risorse/:id` | `RisorsaDettaglio` | skill, certificazioni e allocazioni; la propria scheda si apre da "Le mie competenze" nel sottomenu del Pianificatore (skill e certificazioni modificabili da tutti sulla propria risorsa, allocazioni no) |
| `/pianificatore/anagrafiche` | `Anagrafiche` | skill, certificazioni, scale di valutazione |
| `/pianificazione`, `/risorse[/:id]`, `/anagrafiche` | — | vecchi indirizzi: reindirizzano sotto `/pianificatore` |
| `**` | — | reindirizza alla home |

Per aggiungere una sezione: cartella `app/<sezione>/` con il proprio file di rotte, voce `loadChildren` in `app.routes.ts` e voce in `sezioni.ts`.

I componenti sono caricati in modo lazy (`loadComponent`). Con `withComponentInputBinding()` il parametro `:id` arriva al componente come `input` (`id = input.required<string>()`).

## Accesso e permessi (fase 1, blocco B6)

- **Sessione.** Il backend mette il token in un cookie httpOnly: il frontend non lo vede e non lo salva. All'avvio (`provideAppInitializer`) `SessioneService.carica()` chiama `GET /api/auth/me`; il profilo (abilitazione, ruoli, `permessi` globali, `deveCambiarePassword`) sta nel signal `utente`.
- **Scadenza.** `interceptor401` intercetta le risposte 401 delle API (tranne login e profilo): chiude la sessione e porta alla pagina di accesso, ricordando la pagina in cui si era.
- **Comandi secondo i permessi.** Le pagine mostrano o disabilitano i comandi con `sessione.puo('...')` (permessi globali) e con le funzioni di `comuni/permessi.ts` (TL e PM del progetto, PMSenior), che rispecchiano `backend/src/permessi/regole.ts`. È solo comodità: il controllo vero è sempre nel backend, e i suoi messaggi 403 vengono mostrati.

## Comunicazione con il backend

`ApiService` (`api.service.ts`) e `ComuniApiService` (`comuni/comuni-api.service.ts`) usano l'URL **relativo** `/api`:

- in sviluppo il proxy di `ng serve` (`proxy.conf.json`) inoltra a `http://localhost:3001`;
- in Docker nginx (`nginx.conf`) inoltra a `http://backend:3001`.

| Metodo | Chiamata |
|---|---|
| `risorse()`, `risorsa(id)` | `GET /api/pianificatore/risorse[/:id]` |
| `creaRisorsa(r)`, `aggiornaRisorsa(id, r)`, `eliminaRisorsa(id)` | `POST`, `PUT`, `DELETE` |
| `pianificazione(da, a, tipoSkill?, skill[])` | `GET /api/pianificatore/pianificazione` (skill ripetute come parametri multipli) |
| `skills()`, `creaSkill()`, `eliminaSkill()` | `/api/pianificatore/skills` |
| `certificazioni()`, `creaCertificazione()`, `eliminaCertificazione()` | `/api/pianificatore/certificazioni` |
| `rate()`, `creaRate()`, `aggiornaRate()`, `eliminaRate()` | `/api/pianificatore/rate` |

`messaggioErrore(err)` trasforma un errore HTTP in testo leggibile (usa il campo `message` del backend; stato 0 → "Backend non raggiungibile.").

I tipi sono in `models.ts` e rispecchiano le API: `Risorsa`, `SkillValutata`, `Allocazione`, `Skill`, `Certificazione`, `Rate`, `Pianificazione`, `CellaMese`, `AllocazioneGriglia` (allocazione + `pesato`). `TIPI_SKILL` collega i campi della risorsa ai tipi dell'anagrafica.

## Pagine

### Pianificazione (`pianificazione/`)

Griglia con una riga per risorsa e una colonna per mese.

**Filtri** (in testata):

| Filtro | Applicazione |
|---|---|
| Da / A (mese) | con **Aggiorna** (chiamata al backend) |
| Tipo skill (tendina) | con **Aggiorna**; popolata con i `skillType` dell'anagrafica (ordine: tecnico, funzionale, ambito, poi gli altri) |
| Skill (multiselezione) | con **Aggiorna**; popolata con le skill del tipo scelto, disabilitata senza tipo, azzerata al cambio di tipo; più skill = **OR** |
| Filtra per nome | immediato, lato client, su cognome e nome |

Con un filtro per skill attivo compaiono una barra con il riepilogo e il pulsante **Rimuovi filtro**, e sotto il nome di ogni risorsa le skill trovate con il livello.

**Contenuto delle celle**:

- **0 progetti**: una riga grigia `0 | 0`.
- **1 progetto**: una riga con nome del progetto, % allocata, % pesata.
- **più progetti**: prima riga **"N progetti"** con i totali del mese; i singoli progetti sono in un **accordion** chiuso, che si apre cliccando la riga del totale.

Ogni riga di progetto ha un tooltip (cliente, progetto, probabilità, pesata, importanza) e, cliccata, apre sotto la griglia il **dettaglio del mese** (tabella con tutti i campi delle allocazioni).

**Colori dei valori** (`livello()`; classi su `.valore`), applicati sia alla % allocata sia alla % pesata:

| Valore | Classe | Sfondo |
|---|---|---|
| 0 | `libero` | `#f1f3f5` (grigio) |
| > 0 e < 50 | `basso` | `#dff3fe` (azzurro chiaro) |
| = 50 | `meta` | `#a2dbfb` |
| > 50 e < 100 | `medio` | `#a2fbdb` |
| = 100 | `pieno` | `#82fb8b` |
| > 100 | `sovra` | `#ffc9c9` (rosso, grassetto) |

**Bordo del progetto** (`importanza()`; classi su `.attivita`): `oro` (`#d4af37`) se `importanzaStrategica` = imprescindibile, `argento` (`#a8a9ad`) se importante, nessuno altrimenti. Il bordo è sulla singola attività, non sul mese.

**Accordion**: lo stato è un `signal<Set<string>>` con chiavi `idRisorsa|mese`. Il pulsante nella legenda (**Mostra tutti i progetti / Chiudi tutti i progetti**) apre o chiude con un click tutti gli accordion delle risorse visibili (`celleMultiple`, `tutteEspanse`, `alternaTutti()`).

La riga di un progetto è definita una sola volta come `<ng-template #riga>` e riusata con `NgTemplateOutlet`.

### Risorse (`risorse/`)

- **`RisorseElenco`**: tabella con nome, skill tecniche, skill funzionali/ambito e numero di mesi pianificati (esclusi i segnaposto); ricerca immediata per nome o skill; "Nuova risorsa" (PM e PMSenior) apre la scheda anagrafica in `/comuni/risorse/nuova`.
- **`RisorsaDettaglio`**: tre gruppi di skill (nome + livello) e tabella delle allocazioni (mese, progetto, cliente, %, probabilità, importanza, competenze). Nome e cognome si mostrano soltanto: si modificano in "Dati anagrafici".
  - Il **progetto si sceglie da un elenco** (`/api/comuni/progetti`, "codice — titolo", con "(chiuso)" per i progetti chiusi); "— mese libero —" lascia la riga senza progetto. Il **cliente** si ricava dal progetto e si mostra soltanto.
  - Skill e scale usano `<datalist>`: suggeriscono i valori delle anagrafiche ma accettano testo libero.
  - **Permessi.** PM e PMSenior modificano tutto. Il TL vede nell'elenco solo i propri progetti, può aggiungere righe sui suoi progetti e modificare quelle; le righe su progetti altrui sono bloccate (in grigio). Le skill il TL le modifica solo se la risorsa lavora su un suo progetto. Gli altri vedono la scheda in sola lettura.
  - "Aggiungi allocazione" copia mese e progetto dell'ultima riga modificabile.
  - Al salvataggio le skill senza nome vengono scartate, le allocazioni ordinate per mese e inviate con il solo `progettoId` (senza i campi ricavati); PUT `/api/pianificatore/risorse/:id`.

### Anagrafiche del Pianificatore (`anagrafiche/`)

Il catalogo lo modificano PM e PMSenior; per gli altri la pagina è in sola lettura (un `fieldset` disabilitato blocca tutti i comandi).

- **Skill**: elenco raggruppato per tipo, aggiunta (nome + tipo) ed eliminazione.
- **Certificazioni**: elenco, aggiunta (nome + tipo) ed eliminazione.
- **Scale di valutazione**: un componente **`ScalaEditor`** per scala. Permette di rinominare, riordinare (↑ ↓), aggiungere e rimuovere valori; le modifiche restano in bozza (riquadro giallo) finché non si preme **Salva** o **Annulla**. "Nuova scala" crea una scala vuota con nome. Gli errori del backend (nome duplicato, valori ripetuti) sono mostrati nel riquadro.

### Sezione Anagrafiche (`comuni/`)

- **Progetti** (`ProgettiElenco`): codice, titolo, cliente, centro di costo, stato, completamento, PM e TL; filtri per stato, testo e "solo quelli che gestisco" (`?gestibili=true`); "Nuovo progetto" per chi ha `creareProgetto`.
- **Scheda progetto** (`ProgettoDettaglio`), a blocchi:
  - *Dati*: titolo, cliente (anche "progetto interno"), centro di costo, date, descrizione, stime in giorni e, per chi le vede, in euro (convertite da/in centesimi); il codice si sceglie solo alla creazione.
  - *Stato e completamento*: pulsanti dei soli passaggi ammessi e consentiti (Avvia, Chiudi, Riapri per PM e PMSenior); percentuale del progetto.
  - *Approvatori*: modificabili dal PM del progetto e dai PMSenior.
  - *Attività*: aggiunta, modifica (descrizione, stato, stima), risorse assegnate (elenco con caselle), percentuale (anche per le risorse assegnate).
  - *Storico del completamento*: i cambi di percentuale del progetto e delle attività.
- **Risorse** (`RisorseAnagrafica`, `RisorsaAnagraficaDettaglio`): email (o "da completare"), cellulare, ruolo attuale, ore al giorno, uscita; scheda con i dati della persona e lo storico dei ruoli. Modifica: PM e PMSenior.
- **Clienti, centri di costo, ruoli** (`AnagraficaSemplice`): elenco con aggiunta e modifica in riga, filtro "solo attivi". Il codice non cambia; le voci si disattivano invece di cancellarle. Modifica: PMSenior (clienti, centri di costo), amministratore (ruoli).
- **Utenti** (`Utenti`, solo amministratore): creazione con password provvisoria generata (proposta email e nome dalla risorsa scelta), modifica di email, nome, risorsa, abilitazione, ruoli e stato attivo, nuova password provvisoria. La password provvisoria si mostra una sola volta, da comunicare alla persona.

## Componenti riutilizzabili

### `MultiSelect` (`multi-select.ts`)

Tendina con caselle di spunta.

```html
<app-multi-select [opzioni]="elenco" [(selezionate)]="scelte" [disabilitata]="false" vuota="Qualsiasi" />
```

| Input/model | Tipo | Descrizione |
|---|---|---|
| `opzioni` | `string[]` | voci disponibili |
| `selezionate` | `model<string[]>` | voci scelte (two-way binding) |
| `disabilitata` | `boolean` | disabilita il pulsante |
| `vuota` | `string` | testo quando non c'è selezione (default "Qualsiasi") |

Comandi "Tutte" / "Nessuna"; si chiude con click esterno o Esc; il riepilogo mostra fino a due voci, poi "N selezionate".

### `ScalaEditor` (`anagrafiche/scala-editor.ts`)

Input `scala: Rate` (senza `_id` = scala nuova), output `salvata` (emesso dopo salvataggio, eliminazione o annullamento di una scala nuova). Si riallinea ai dati salvati ogni volta che cambia l'input (`effect`).

## Utilità sui mesi (`mesi.ts`)

`meseCorrente()`, `aggiungiMesi(mese, n)`, `etichettaMese("202701") → "gen 2027"`, `aInputMese`/`daInputMese` per convertire tra `AAAAMM` e il formato `AAAA-MM` degli `<input type="month">`.

## Stile

Variabili in `styles.scss`: `--sfondo`, `--testo`, `--testo-tenue`, `--bordo`, `--accento` (#1c7ed6), `--pericolo`. Classi globali: `.primario`, `.pericolo`, `.errore`, `.etichetta`, e dal blocco B6 `.testata`, `.azioni`, `.ok`, `.nota`, `table.elenco`, `.modulo` (griglia dei form), `section.blocco`, `.stato` (In valutazione, In corso, Chiuso), `.barra-percentuale`. Ogni componente ha il proprio SCSS incapsulato.

## Sviluppo

```bash
cd frontend
npm install
npm start          # ng serve su http://localhost:4201/toolpm (richiede il backend su :3001)
npm run build      # build di produzione in dist/frontend/browser
npm test           # test Vitest
```

I test coprono la barra con e senza accesso, la guardia e l'interceptor 401, i messaggi d'errore e le regole sui progetti di `comuni/permessi.ts`. Il percorso completo (accesso, progetti, Pianificatore, profili TL e risorsa semplice, password provvisoria) è stato provato nel browser contro backend e MongoDB veri.

## Docker

`frontend/Dockerfile` (multi-stage):

1. **build** su `node:22-alpine`: `npm ci`, `ng build --configuration production`;
2. **esecuzione** su `nginx:1.27-alpine`: copia `dist/frontend/browser` in `/usr/share/nginx/html/toolpm` e `nginx.conf`.

`nginx.conf`:

- `location /api/` → `proxy_pass http://backend:3001`;
- `location = /` → redirect a `/toolpm/`; `location = /toolpm` → redirect a `/toolpm/`;
- `location /toolpm/` → `try_files $uri $uri/ /toolpm/index.html` (necessario perché le rotte Angular funzionino anche ricaricando la pagina).

### Percorso di pubblicazione `/toolpm/`

L'app risponde su `http://localhost:4201/toolpm`. Il percorso è definito da `baseHref: "/toolpm/"` in `angular.json`
(vale sia per `ng build` sia per `ng serve`) e va tenuto allineato con `nginx.conf` e con la cartella di destinazione nel `Dockerfile`.
I `routerLink` assoluti del codice (es. `/pianificatore/risorse`) sono relativi al base href, quindi non contengono `/toolpm`.
Le API restano su `/api/...` (indirizzo assoluto, non influenzato dal base href).
