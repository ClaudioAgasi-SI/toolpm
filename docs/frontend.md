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
    ├── app.ts / app.html / app.scss   shell ToolPM: barra con le sezioni + <router-outlet>
    ├── app.config.ts                  provider: router (con input binding), HttpClient
    ├── app.routes.ts                  rotte di primo livello: home + una rotta per sezione (lazy)
    ├── sezioni.ts                     elenco delle sezioni (menu e home)
    ├── home/                          pagina iniziale con le schede delle sezioni
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

| Percorso | Componente | Descrizione |
|---|---|---|
| `/` | `Home` | elenco delle sezioni di ToolPM |
| `/pianificatore` | `PianificatoreLayout` | sezione Pianificatore; reindirizza a `/pianificatore/pianificazione` |
| `/pianificatore/pianificazione` | `Pianificazione` | griglia risorse × mesi |
| `/pianificatore/risorse` | `RisorseElenco` | elenco con ricerca |
| `/pianificatore/risorse/nuova` | `RisorsaDettaglio` | inserimento |
| `/pianificatore/risorse/:id` | `RisorsaDettaglio` | modifica |
| `/pianificatore/anagrafiche` | `Anagrafiche` | skill, certificazioni, scale di valutazione |
| `/pianificazione`, `/risorse[/:id]`, `/anagrafiche` | — | vecchi indirizzi: reindirizzano sotto `/pianificatore` |
| `**` | — | reindirizza alla home |

Per aggiungere una sezione: cartella `app/<sezione>/` con il proprio file di rotte, voce `loadChildren` in `app.routes.ts` e voce in `sezioni.ts`.

I componenti sono caricati in modo lazy (`loadComponent`). Con `withComponentInputBinding()` il parametro `:id` arriva al componente come `input` (`id = input.required<string>()`).

## Comunicazione con il backend

`ApiService` (`api.service.ts`) usa l'URL **relativo** `/api`:

- in sviluppo il proxy di `ng serve` (`proxy.conf.json`) inoltra a `http://localhost:3000`;
- in Docker nginx (`nginx.conf`) inoltra a `http://backend:3000`.

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

- **`RisorseElenco`**: tabella con nome, skill tecniche, skill funzionali/ambito e numero di mesi pianificati (esclusi i segnaposto); ricerca immediata per nome o skill; pulsante "Nuova risorsa".
- **`RisorsaDettaglio`**: form per cognome e nome, tre gruppi di skill (nome + livello) e tabella delle allocazioni (mese, cliente, progetto, %, probabilità, importanza, competenze).
  - I campi usano `<datalist>`: suggeriscono i valori delle anagrafiche (skill per tipo, scale `rate`, clienti e progetti già usati dalla risorsa) ma **accettano testo libero**.
  - "Aggiungi allocazione" copia mese, cliente e progetto dell'ultima riga.
  - Al salvataggio le skill senza nome vengono scartate e le allocazioni ordinate per mese; POST per una risorsa nuova (poi naviga alla scheda), PUT per una esistente.

### Anagrafiche (`anagrafiche/`)

- **Skill**: elenco raggruppato per tipo, aggiunta (nome + tipo) ed eliminazione.
- **Certificazioni**: elenco, aggiunta (nome + tipo) ed eliminazione.
- **Scale di valutazione**: un componente **`ScalaEditor`** per scala. Permette di rinominare, riordinare (↑ ↓), aggiungere e rimuovere valori; le modifiche restano in bozza (riquadro giallo) finché non si preme **Salva** o **Annulla**. "Nuova scala" crea una scala vuota con nome. Gli errori del backend (nome duplicato, valori ripetuti) sono mostrati nel riquadro.

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

Variabili in `styles.scss`: `--sfondo`, `--testo`, `--testo-tenue`, `--bordo`, `--accento` (#1c7ed6), `--pericolo`. Classi globali: `.primario`, `.pericolo`, `.errore`, `.etichetta`. Ogni componente ha il proprio SCSS incapsulato.

## Sviluppo

```bash
cd frontend
npm install
npm start          # ng serve su http://localhost:4200/toolpm (richiede il backend su :3000)
npm run build      # build di produzione in dist/frontend/browser
npm test           # test Vitest
```

## Docker

`frontend/Dockerfile` (multi-stage):

1. **build** su `node:22-alpine`: `npm ci`, `ng build --configuration production`;
2. **esecuzione** su `nginx:1.27-alpine`: copia `dist/frontend/browser` in `/usr/share/nginx/html/toolpm` e `nginx.conf`.

`nginx.conf`:

- `location /api/` → `proxy_pass http://backend:3000`;
- `location = /` → redirect a `/toolpm/`; `location = /toolpm` → redirect a `/toolpm/`;
- `location /toolpm/` → `try_files $uri $uri/ /toolpm/index.html` (necessario perché le rotte Angular funzionino anche ricaricando la pagina).

### Percorso di pubblicazione `/toolpm/`

L'app risponde su `http://localhost:4200/toolpm`. Il percorso è definito da `baseHref: "/toolpm/"` in `angular.json`
(vale sia per `ng build` sia per `ng serve`) e va tenuto allineato con `nginx.conf` e con la cartella di destinazione nel `Dockerfile`.
I `routerLink` assoluti del codice (es. `/pianificatore/risorse`) sono relativi al base href, quindi non contengono `/toolpm`.
Le API restano su `/api/...` (indirizzo assoluto, non influenzato dal base href).
