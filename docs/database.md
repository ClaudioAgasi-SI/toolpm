# Database (MongoDB)

- **Database**: `toolpm` (stessa istanza MongoDB del vecchio database `pianificazione`)
- **Connessione**: variabile `MONGODB_URI` del backend (default in Docker: `mongodb://host.docker.internal:27017/toolpm`; default fuori da Docker: `mongodb://localhost:27017/toolpm`)
- **Collection**: `risorse`, `skills`, `rate`, `certificazioni`
- **Accesso**: solo tramite il backend (Mongoose). Gli schemi sono in `backend/src/pianificatore/risorse/risorsa.schema.ts` e `backend/src/pianificatore/anagrafiche/anagrafiche.schema.ts`.

## Modello dei dati

```
skills ─┐                 (suggerimenti per l'inserimento, nessun vincolo)
rate ───┼─ ─ ─ ─ ─ ─ ─ ─► risorse
certificazioni ┘            ├── skillTecnici[]     { skillName, rate }
                            ├── skillFunzionali[]  { skillName, rate }
                            ├── skillAmbiti[]      { skillName, rate }
                            ├── certificazioni[]   (struttura libera)
                            └── planned[]          { mese, cliente, progetto, ..., percentualeAllocazione }
```

Le anagrafiche non sono collegate alle risorse da riferimenti: le risorse contengono i **valori** (testo), non gli `_id` delle anagrafiche.

## Collection `risorse`

Un documento per persona, con skill e pianificazione incorporate.

| Campo | Tipo | Obbl. | Descrizione |
|---|---|---|---|
| `_id` | ObjectId | sì | Generato da MongoDB |
| `cognome` | string | sì | Spazi iniziali/finali rimossi |
| `nome` | string | sì | Spazi iniziali/finali rimossi |
| `skillTecnici` | array di `SkillValutata` | no (default `[]`) | Skill di tipo `tecnico` |
| `skillFunzionali` | array di `SkillValutata` | no (default `[]`) | Skill di tipo `funzionale` |
| `skillAmbiti` | array di `SkillValutata` | no (default `[]`) | Skill di tipo `ambito` |
| `certificazioni` | array di oggetti | no (default `[]`) | Struttura libera, oggi non usata |
| `planned` | array di `Allocazione` | no (default `[]`) | Pianificazione mese per mese |

### `SkillValutata`

| Campo | Tipo | Obbl. | Descrizione |
|---|---|---|---|
| `skillName` | string | sì | Nome della skill, di norma uno dei valori di `skills` |
| `rate` | string | no | Livello, di norma un valore della scala `rate` con lo stesso nome del campo (es. `skillTecnici`) |

### `Allocazione` (elemento di `planned`)

| Campo | Tipo | Obbl. | Vincoli / scala di riferimento |
|---|---|---|---|
| `mese` | string | sì | Formato `AAAAMM` (regex `^\d{6}$`) |
| `cliente` | string | no | Testo libero |
| `progetto` | string | no | Testo libero |
| `competenzaTecnica` | string | no | Scala `rate.competenzaTecnica` |
| `conoscenzaAmbito` | string | no | Scala `rate.conoscenzaAmbito` |
| `conoscenzaFunzionale` | string | no | Scala `rate.conoscenzaFunzionale` |
| `importanzaStrategica` | string | no | Scala `rate.importanzaStrategica` |
| `probabilitaAllocazione` | string | no | Scala `rate.probabilitaAllocazione` |
| `percentualeAllocazione` | number | no | 0–100 |

Più righe con lo stesso `mese` rappresentano più progetti nello stesso mese. Una riga **senza `percentualeAllocazione`** (o con 0) è un *segnaposto*: indica solo che la risorsa è libera e viene ignorata nei calcoli.

Esempio:

```json
{
  "cognome": "Agasi",
  "nome": "Claudio",
  "skillTecnici": [
    { "skillName": "j2ee", "rate": "ottimo" },
    { "skillName": "devOps", "rate": "sufficiente" }
  ],
  "skillAmbiti": [],
  "skillFunzionali": [],
  "certificazioni": [],
  "planned": [
    {
      "mese": "202701", "cliente": "TIM", "progetto": "TIMBUFE",
      "competenzaTecnica": "buono", "conoscenzaAmbito": "buono", "conoscenzaFunzionale": "buono",
      "importanzaStrategica": "imprescindibile", "probabilitaAllocazione": "sicura",
      "percentualeAllocazione": 30
    }
  ]
}
```

## Collection `skills`

Anagrafica delle skill, usata per popolare tendine e suggerimenti.

| Campo | Tipo | Obbl. | Descrizione |
|---|---|---|---|
| `skillName` | string | sì | Nome della skill |
| `skillType` | string | sì | `tecnico`, `funzionale` o `ambito` |

Corrispondenza tra `skillType` e campo della risorsa: `tecnico` → `skillTecnici`, `funzionale` → `skillFunzionali`, `ambito` → `skillAmbiti` (costante `CAMPO_PER_TIPO` nel backend).

## Collection `rate`

Scale di valutazione: un documento per scala.

| Campo | Tipo | Obbl. | Descrizione |
|---|---|---|---|
| `rateType` | string | sì | Nome della scala, **univoco**; coincide con il nome del campo valutato |
| `rate` | array di string | sì | Valori **ordinati dal livello più alto al più basso**, senza duplicati |

Scale presenti:

| `rateType` | Valori (dal più alto) |
|---|---|
| `skillTecnici`, `skillFunzionali`, `skillAmbiti` | ottimo, buono, sufficiente, elementare, n.a. |
| `competenzaTecnica`, `conoscenzaAmbito`, `conoscenzaFunzionale` | ottimo, buono, sufficiente, elementare, n.a. |
| `importanzaStrategica` | imprescindibile, importante, utile, sostituibile, non idoneo |
| `probabilitaAllocazione` | sicura, probabile, forse, improbabile, nessuna |

Univocità del nome e assenza di duplicati sono verificate dal backend (`RateService`), non da un indice.

## Collection `certificazioni`

| Campo | Tipo | Obbl. | Descrizione |
|---|---|---|---|
| `certName` | string | sì | Nome della certificazione |
| `certType` | string | no | Categoria (es. `developer`, `project management`) |

## Regole sui dati

1. **Le anagrafiche sono suggerimenti, non vincoli.** Una risorsa può avere skill, livelli, clienti o progetti non presenti nelle anagrafiche; il backend non li rifiuta. Rinominare o eliminare un valore di anagrafica **non** modifica le risorse che lo usano.
2. **L'ordine nelle scale conta**: il primo valore è il livello più alto. È la base per confronti tra livelli.
3. **`n.a.`** significa "non applicabile/non valutato": nei filtri per skill una skill valutata `n.a.` non conta come posseduta.
4. **Pesi di probabilità**: la percentuale pesata usa i pesi definiti nel codice del backend (`backend/src/pianificatore/pianificazione/pesi.ts`), legati ai nomi dei valori: sicura 1, probabile 0,75, forse 0,5, improbabile 0,25, nessuna 0; un valore sconosciuto pesa 0, una probabilità assente pesa 1. Rinominare questi valori nella scala `rate.probabilitaAllocazione` richiede di aggiornare anche `pesi.ts`.
5. **Confronto dei nomi di skill** nei filtri: senza distinzione tra maiuscole e minuscole.

## Indici

Definiti nello schema di `risorse`:

| Indice | Uso |
|---|---|
| `{ "planned.mese": 1 }` | Ricerche per mese |
| `{ "skillTecnici.skillName": 1 }` | Filtro per skill tecnica |

Il backend **non crea gli indici automaticamente** (`autoIndex` disattivato) per non modificare un database esistente. Per crearli all'avvio impostare `MONGODB_AUTO_INDEX=true` nell'ambiente del backend, oppure crearli a mano:

```js
use toolpm
db.risorse.createIndex({ "planned.mese": 1 })
db.risorse.createIndex({ "skillTecnici.skillName": 1 })
```

Con i volumi attuali (decine di risorse) gli indici non sono necessari; diventano utili con migliaia di documenti.

## Dati di esempio e import

La cartella `db/` contiene un file JSON per collection (`risorse.json`, `skills.json`, `rate.json`, `certificazioni.json`), nel formato di export di MongoDB (gli `_id` in forma `{"$oid": "..."}` sono convertiti in ObjectId).

Script: `backend/scripts/seed.mjs`

| Comando | Effetto |
|---|---|
| `docker compose exec backend node scripts/seed.mjs` | Importa solo nelle collection **vuote** |
| `docker compose exec backend node scripts/seed.mjs --replace` | **Svuota** le 4 collection e le reimporta dai file |
| `cd backend && npm run seed` | Come il primo, fuori da Docker (usa `MONGODB_URI` o `localhost`) |

Variabili: `MONGODB_URI` (connessione), `SEED_DIR` (cartella dei JSON; in Docker `/db`).

## Backup e ripristino

Con gli strumenti standard di MongoDB (dal container di MongoDB o da un PC con i MongoDB Database Tools):

```bash
mongodump  --uri "mongodb://localhost:27017/toolpm" --out ./backup-AAAAMMGG
mongorestore --uri "mongodb://localhost:27017" ./backup-AAAAMMGG
```
