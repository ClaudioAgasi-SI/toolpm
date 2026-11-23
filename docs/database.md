# Database (MongoDB)

- **Database**: `toolpm` (stessa istanza MongoDB del vecchio database `pianificazione`)
- **Connessione**: variabile `MONGODB_URI` del backend (default in Docker: `mongodb://host.docker.internal:27017/toolpm?directConnection=true`; default fuori da Docker: `mongodb://localhost:27017/toolpm`)
- **Replica set**: dalla fase 1 MongoDB gira come replica set a un nodo (`rs0`), necessario per le transazioni. Procedura e verifica in [mongodb-replica-set.md](mongodb-replica-set.md); `npm run verifica-mongodb` nel backend controlla connessione, replica set e transazioni.
- **Collection**: del Pianificatore `skills`, `rate`, `certificazioni`; comuni a tutte le sezioni (fase 1, blocco B4) `risorse`, `clienti`, `centri_costo`, `ruoli`, `progetti`, `attivita`, `avanzamenti`; della Consuntivazione (fase 2, migrazione `007-consuntivazione`) `tipologie_costo`, `tariffe_standard`, `tariffe_personalizzate`, `consuntivi`; del controllo (fase 3, migrazione `008-controllo`) `periodi`, `audit_log`; tecniche `utenti`, `parametri`, `migrazioni`
- **Accesso**: solo tramite il backend (Mongoose). Gli schemi sono in `backend/src/comuni/schemi/` (risorse e dati comuni), `backend/src/pianificatore/anagrafiche/anagrafiche.schema.ts`, `backend/src/auth/utente.schema.ts` e `backend/src/infrastruttura/parametro.schema.ts`.
- **Validatori**: le collection del modulo Comuni (tranne `risorse`) hanno un validatore `$jsonSchema` creato dalla migrazione `004-comuni`: anche chi scrive direttamente nel database, senza passare dal backend, non può salvare documenti con campi obbligatori mancanti o di tipo sbagliato.

## Modello dei dati

```
skills ─┐                 (suggerimenti per l'inserimento, nessun vincolo)
rate ───┼─ ─ ─ ─ ─ ─ ─ ─► risorse
certificazioni ┘            ├── skillTecnici[]     { skillName, rate }
                            ├── skillFunzionali[]  { skillName, rate }
                            ├── skillAmbiti[]      { skillName, rate }
                            ├── certificazioni[]   { certName, conseguitaIl, scadenza?, ente?, codice?, link? }
                            └── planned[]          { mese, progettoId ─► progetti, ..., percentualeAllocazione }
```

Le anagrafiche del Pianificatore non sono collegate alle risorse da riferimenti: le risorse contengono i **valori** (testo), non gli `_id` delle anagrafiche.

Dati comuni (fase 1, blocco B4), collegati da riferimenti (`ObjectId`):

```
clienti ◄────────── progetti ──────────► centri_costo
                     │  approvatori[] { risorsaId ─► risorse, profilo TL|PM }
                     │
attivita ─ progettoId┘  risorseAssegnateIds[] ─► risorse
avanzamenti ─ progettoId, attivitaId?          risorse.storicoRuoli[] { ruoloId ─► ruoli, dal }
utenti ─ risorsaId ─► risorse
```

MongoDB non ha chiavi esterne: l'esistenza dei documenti collegati la controlla il backend.

## Campi di tracciamento

Dalla fase 1 ogni documento di ogni collection ha quattro campi, scritti in automatico dal backend (plugin `tracciamentoPlugin`, vedi [backend.md](backend.md#infrastruttura-comune-fase-1)) e mai dal client:

| Campo | Tipo | Significato |
|---|---|---|
| `creatoIl` | Date | Data di creazione del documento |
| `creatoDa` | string | Chi l'ha creato: id dell'utente oppure utente tecnico `sistema:...` (es. `sistema:migrazione`) |
| `modificatoIl` | Date | Data dell'ultimo salvataggio |
| `modificatoDa` | string | Chi ha fatto l'ultimo salvataggio |

Fino all'autenticazione (fase 1, blocco B2) l'autore delle modifiche fatte dall'applicazione è `anonimo`. I documenti creati prima della fase 1 ricevono i campi dalla migrazione `002-tracciamento-esistenti`.

## Collection `risorse`

Un documento per persona, con skill e pianificazione incorporate. Dal blocco B4 appartiene al modulo Comuni: i dati anagrafici si gestiscono con `/api/comuni/risorse`, skill e allocazioni con `/api/pianificatore/risorse`. L'abilitazione (TL, PM, PMSenior) e i ruoli applicativi stanno sull'utente collegato (`utenti.risorsaId`).

| Campo | Tipo | Obbl. | Descrizione |
|---|---|---|---|
| `_id` | ObjectId | sì | Generato da MongoDB |
| `cognome` | string | sì | Spazi iniziali/finali rimossi |
| `nome` | string | sì | Spazi iniziali/finali rimossi |
| `skillTecnici` | array di `SkillValutata` | no (default `[]`) | Skill di tipo `tecnico` |
| `skillFunzionali` | array di `SkillValutata` | no (default `[]`) | Skill di tipo `funzionale` |
| `skillAmbiti` | array di `SkillValutata` | no (default `[]`) | Skill di tipo `ambito` |
| `certificazioni` | array di oggetti | no (default `[]`) | `{ certName, conseguitaIl, scadenza?, ente?, codice?, link? }`: nome (max 200), data di conseguimento obbligatoria e scadenza non precedente (`AAAA-MM-GG`), ente certificatore (max 200), codice identificativo (max 100), link (max 500, di solito un indirizzo web); nome dal catalogo `certificazioni` quando la risorsa le inserisce da sé (dal 20/11/2026; prima struttura libera, mai usata) |
| `planned` | array di `Allocazione` | no (default `[]`) | Pianificazione mese per mese |
| `email` | string | per le nuove | Minuscolo, unica (indice unico parziale: le risorse senza email sono ammesse fino alla migrazione B7); è il nome utente per l'accesso |
| `cellulare` | string | no | |
| `matricola` | string | no | |
| `dataIngresso`, `dataUscita` | Date | no | Le risorse non si cancellano dall'anagrafica: si imposta la data di uscita |
| `oreContrattualiGiorno` | number | no | Orario contrattuale, 0–24 |
| `storicoRuoli` | array di `{ ruoloId, dal }` | no (default `[]`) | Ruolo professionale con data di decorrenza, dal più vecchio |

### `SkillValutata`

| Campo | Tipo | Obbl. | Descrizione |
|---|---|---|---|
| `skillName` | string | sì | Nome della skill, di norma uno dei valori di `skills` |
| `rate` | string | no | Livello, di norma un valore della scala `rate` con lo stesso nome del campo (es. `skillTecnici`) |

### `Allocazione` (elemento di `planned`)

| Campo | Tipo | Obbl. | Vincoli / scala di riferimento |
|---|---|---|---|
| `mese` | string | sì | Formato `AAAAMM` (regex `^\d{6}$`) |
| `progettoId` | ObjectId | no | Progetto della collection `progetti`; il cliente si ricava dal progetto. Assente nei mesi liberi |
| `clienteTesto`, `progettoTesto` | string | no | Testi originali conservati dalla migrazione B7 ([migrazione-dati.md](migrazione-dati.md)) per un rilascio, poi si eliminano |
| `competenzaTecnica` | string | no | Scala `rate.competenzaTecnica` |
| `conoscenzaAmbito` | string | no | Scala `rate.conoscenzaAmbito` |
| `conoscenzaFunzionale` | string | no | Scala `rate.conoscenzaFunzionale` |
| `importanzaStrategica` | string | no | Scala `rate.importanzaStrategica` |
| `probabilitaAllocazione` | string | no | Scala `rate.probabilitaAllocazione` |
| `percentualeAllocazione` | number | no | 0–100 |

Dal blocco B5 i campi `cliente` e `progetto` (testo libero) non si salvano più: le API li restituiscono ricavandoli da `progettoId` (vedi [backend.md](backend.md#risorsemodule--apipianificatorerisorse)). La migrazione `006-allocazioni-progettoid` li toglie dalle allocazioni già collegate; i dati di esempio di `db/` li contengono ancora finché non si esegue la migrazione B7.

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
      "mese": "202701", "progettoId": { "$oid": "6740a1c2e1f0a1b2c3d4e501" },
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

## Collection `clienti`, `centri_costo`, `ruoli`

Anagrafiche semplici del modulo Comuni: un documento per voce, indice unico su `codice`, non si cancellano (si disattivano con `attivo: false`).

| Collection | Campi | Chi le gestisce |
|---|---|---|
| `clienti` | `codice`, `ragioneSociale`, `attivo` | PMSenior |
| `centri_costo` | `codice`, `descrizione`, `attivo` | PMSenior |
| `ruoli` | `codice`, `descrizione`, `attivo` | Amministratore |

Il codice è fatto di lettere, cifre, punto, trattino e trattino basso e non si modifica dopo la creazione.

## Collection `progetti`

| Campo | Tipo | Obbl. | Note |
|---|---|---|---|
| `codice` | string | sì | Unico, non modificabile |
| `titolo` | string | sì | |
| `descrizione` | string | | |
| `clienteId` | ObjectId | | Cliente; assente nei progetti interni |
| `centroCostoId` | ObjectId | sì | Un solo centro di costo; dalla fase 2 bloccato dopo il primo consuntivo |
| `approvatori` | array di `{ risorsaId, profilo }` | sì (anche vuoto) | `profilo`: `TL` o `PM`; una risorsa compare una volta |
| `soloSuAttivita` | boolean | | Default `false` |
| `dataInizio`, `dataFine` | Date | | Inizio obbligatoria per In corso, fine per Chiuso; fine non prima dell'inizio |
| `stato` | string | sì | `inValutazione` (iniziale), `inCorso`, `chiuso` |
| `percentualeCompletamento` | intero 0–100 | sì | Default 0; ogni cambio va in `avanzamenti` |
| `stime` | `{ managerialeGiorni, managerialeCentesimi, definitivaGiorni, definitivaCentesimi }` | | Impostate a mano, mai calcolate; euro in centesimi (interi) |
| `aliasPianificatore` | array di `{ cliente, progetto }` | | Testi delle allocazioni del Pianificatore che corrispondono al progetto (migrazione B7) |

Indici: `{ codice: 1 }` unico, `{ "approvatori.risorsaId": 1 }`, `{ centroCostoId: 1 }`, `{ "aliasPianificatore.cliente": 1, "aliasPianificatore.progetto": 1 }`.

## Collection `attivita`

| Campo | Tipo | Obbl. | Note |
|---|---|---|---|
| `progettoId` | ObjectId | sì | Progetto a cui appartiene |
| `codice` | string | sì | Unico nel progetto, non modificabile |
| `descrizione` | string | sì | |
| `dataInizio`, `dataFine` | Date | | |
| `stato` | string | sì | `attiva` (iniziale) o `chiusa` |
| `stimaGiorni` | number | | Non concorre alle stime del progetto |
| `percentualeCompletamento` | intero 0–100 | sì | Ogni cambio va in `avanzamenti` |
| `risorseAssegnateIds` | ObjectId[] | sì (anche vuoto) | Risorse assegnate |

Indici: `{ progettoId: 1, codice: 1 }` unico, `{ risorseAssegnateIds: 1 }`.

## Collection `avanzamenti`

Storico delle percentuali di completamento: un documento per ogni cambio, scritto nella stessa transazione dell'aggiornamento. Campi: `progettoId`, `attivitaId` (assente per il progetto), `valorePrecedente`, `valoreNuovo`, `il` (data), `da` (id dell'utente). Indice `{ progettoId: 1, il: -1 }`.

## Collection `tipologie_costo`

Tipologie di costo della Consuntivazione (fase 2), gestite dal controller. Non si cancellano: si disattivano. Creata dalla migrazione `007-consuntivazione` con quattro voci iniziali.

| Campo | Tipo | Obbl. | Note |
|---|---|---|---|
| `codice` | string | sì | Unico, non modificabile (`ORDINARIA`, `STRAORDINARIA`, `STRAORD_NOTTURNA`, `STRAORD_FESTIVA`) |
| `descrizione` | string | sì | |
| `ordine` | intero | sì | Ordine di visualizzazione |
| `categoria` | string | sì | `ordinaria` o `straordinaria` (le ore `ordinaria` si confrontano con l'orario contrattuale) |
| `attiva` | boolean | sì | |
| `predefinita` | boolean | sì | Tipologia proposta sulle righe nuove; una sola (indice unico parziale `una_sola_predefinita`), all'inizio ORDINARIA |

Indici: `{ codice: 1 }` unico, `{ predefinita: 1 }` unico dove `predefinita: true`.

## Collection `tariffe_standard` e `tariffe_personalizzate`

Costo orario per tipologia in un periodo: per ruolo (`ruoloId`) nelle standard, per risorsa (`risorsaId`) nelle personalizzate, che prevalgono. Campi: `tipologiaId`, `validoDal`, `validoAl` (null = senza fine), `centesimiOra` (intero, centesimi di euro all'ora), più il tracciamento. I periodi della stessa coppia non si sovrappongono (controllo nel backend, blocco C2). Indici `{ ruoloId: 1, tipologiaId: 1, validoDal: -1 }` e `{ risorsaId: 1, tipologiaId: 1, validoDal: -1 }`.

## Collection `consuntivi`

Un documento per risorsa e giornata (indice unico `{ risorsaId: 1, data: 1 }`), con `mese` (`AAAAMM`), `versione` (cresce a ogni salvataggio, contro le sovrascritture) e le righe incorporate. Ogni riga: `_id`, `progettoId`, `attivitaId` (null = sul progetto), `centroCostoId` (copiato dal progetto), `tipologiaId` e `tipologiaCodice`, `minuti` (da 15 a 1440, multipli di 15), `nota`, `stato` (`bozza`, `inviata`, `approvataTL`, `approvata`, `respinta`, `chiusa`), la tariffa fotografata (`fonteTariffa` `personalizzata`/`standard`/null, `tariffaId`, `tariffaCentesimiOra`, `costoCentesimi`: null = "da valorizzare"), `approvazioneTL` e `approvazionePM` (`{ da, il }`, dalla fase 3), `modificatoIl`, `modificatoDa`. Indici anche su `righe.progettoId + righe.stato + data`, `righe.attivitaId + data`, `righe.centroCostoId + data`, `righe.tipologiaId`, `mese`, `modificatoIl`.

## Collection `periodi`

Un documento per mese (indice unico su `mese`, `AAAAMM`); un mese senza documento è aperto (fase 3). Campi: `stato` (`aperto`, `chiuso`), `chiusoIl`, `chiusoDa`, `forzata` (chiusura con righe non approvate, decisione 4 della fase 3) con `motivazioneChiusura`, `riapertoIl`, `riapertoDa`, `motivazioneRiapertura`, più il tracciamento. Creata dalla migrazione `008-controllo`; la usa la chiusura dei mesi (blocco D4).

## Collection `audit_log`

Storico delle modifiche (fase 3): una voce per azione, scritta da `AuditService` nella stessa transazione della modifica e mai cambiata. Campi: `collezione` e `documentoId` del documento modificato, `righeIds` (per i consuntivi, le righe toccate), `operazione` (es. `invio`, `approvazione`, `rifiuto`, `chiusura`), `utente`, `il`, `prima`, `dopo`, `motivazione`, più il tracciamento. Si conserva senza scadenza. Indici `{ collezione: 1, documentoId: 1, il: -1 }`, `{ righeIds: 1 }`, `{ il: -1 }`, `{ utente: 1, il: -1 }`.

## Collection `utenti`

Utenti che accedono a ToolPM (fase 1, blocco B2). Indice unico su `email` (migrazione `003-indici-utenti`).

| Campo | Tipo | Obbl. | Note |
|---|---|---|---|
| `email` | string | sì | Nome utente; minuscolo, unico |
| `passwordHash` | string | sì | Hash scrypt; mai restituito dalle API |
| `nome` | string | | Nome mostrato |
| `risorsaId` | ObjectId | | Risorsa (persona) collegata |
| `abilitazione` | string \| null | | `TL`, `PM`, `PMSenior` o `null` |
| `ruoli` | string[] | | `risorsa`, `controller`, `admin` (default `["risorsa"]`) |
| `attivo` | boolean | | Default `true`; gli utenti non si cancellano, si disattivano |
| `deveCambiarePassword` | boolean | | `true` dopo una password provvisoria |
| `ultimoAccesso` | Date | | Aggiornato a ogni accesso |

Più i campi di tracciamento.

## Collection `parametri`

Parametri di sistema, un documento per chiave (indice unico su `chiave`). Valori iniziali creati dalla migrazione `001-parametri`.

| Chiave | Valore iniziale | Uso |
|---|---|---|
| `oreGiorno` | `8` | Ore che fanno un giorno, per confrontare ore consuntivate e stime in giorni |
| `soglieEvm` | `{ anticipo: 1.05, ritardo: 0.95, fortementeInRitardo: 0.85 }` | Soglie degli stati di tempi e costi dell'EVM |

Campi: `chiave` (string, unica), `valore` (qualsiasi tipo), `descrizione`, più i campi di tracciamento.

## Collection `migrazioni`

Registro delle migrazioni eseguite da `npm run migra`: `_id` è il nome dello script (es. `001-parametri`), poi `descrizione`, `eseguitaIl`, `durataMs`, `risultato` (riepilogo restituito dallo script) e i campi di tracciamento. Non va modificata a mano: togliere un documento fa rieseguire la migrazione.

| Migrazione | Cosa fa |
|---|---|
| `001-parametri` | Crea la collection `parametri` con indice unico e i valori iniziali (non tocca parametri già presenti) |
| `002-tracciamento-esistenti` | Aggiunge i campi di tracciamento ai documenti di `risorse`, `skills`, `rate`, `certificazioni` che non li hanno, con autore `sistema:migrazione` |
| `003-indici-utenti` | Indice unico su `utenti.email` |
| `004-comuni` | Crea `clienti`, `centri_costo`, `ruoli`, `progetti`, `attivita`, `avanzamenti` con i validatori `$jsonSchema` (o li aggiorna se esistono) e i loro indici; indice unico parziale su `risorse.email` |
| `005-alias-pianificatore` | Indice su `progetti.aliasPianificatore` |
| `006-allocazioni-progettoid` | Toglie i testi `cliente` e `progetto` dalle allocazioni che hanno `progettoId` (conservando `clienteTesto` e `progettoTesto`); non tocca quelle non collegate |
| `007-consuntivazione` | Crea `tipologie_costo`, `tariffe_standard`, `tariffe_personalizzate`, `consuntivi` con i validatori `$jsonSchema` e i loro indici; aggiunge le quattro tipologie iniziali (ORDINARIA predefinita) senza toccare quelle già presenti |
| `008-controllo` | Crea `periodi` e `audit_log` con i validatori `$jsonSchema` e i loro indici (fase 3) |

L'importazione della migrazione dei dati del Pianificatore (blocco B7, `npm run migrazione-dati -- importa`) si registra nella stessa collection con `_id` `B7-importa` e il riepilogo dell'ultima esecuzione.

## Regole sui dati

1. **Le anagrafiche del Pianificatore sono suggerimenti, non vincoli.** Una risorsa può avere skill e livelli non presenti nelle anagrafiche; il backend non li rifiuta. I progetti invece, dal blocco B5, devono esistere nella collection `progetti`. Rinominare o eliminare un valore di anagrafica **non** modifica le risorse che lo usano.
2. **L'ordine nelle scale conta**: il primo valore è il livello più alto. È la base per confronti tra livelli.
3. **`n.a.`** significa "non applicabile/non valutato": nei filtri per skill una skill valutata `n.a.` non conta come posseduta.
4. **Pesi di probabilità**: la percentuale pesata usa i pesi definiti nel codice del backend (`backend/src/pianificatore/pianificazione/pesi.ts`), legati ai nomi dei valori: sicura 1, probabile 0,75, forse 0,5, improbabile 0,25, nessuna 0; un valore sconosciuto pesa 0, una probabilità assente pesa 1. Rinominare questi valori nella scala `rate.probabilitaAllocazione` richiede di aggiornare anche `pesi.ts`.
5. **Confronto dei nomi di skill** nei filtri: senza distinzione tra maiuscole e minuscole.

## Indici

Gli indici delle collection comuni li crea la migrazione `004-comuni`, quelli della Consuntivazione la `007-consuntivazione` e la `008-controllo` (vedi le singole collection). Definiti nello schema di `risorse`:

| Indice | Uso |
|---|---|
| `{ "planned.mese": 1 }` | Ricerche per mese |
| `{ "skillTecnici.skillName": 1 }` | Filtro per skill tecnica |
| `{ email: 1 }` unico, solo dove `email` è un testo | Email unica (creato dalla migrazione `004-comuni`) |

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

Prima di ogni migrazione della fase 1 serve un backup: i comandi da usare con MongoDB in un container sono in [mongodb-replica-set.md](mongodb-replica-set.md#2-backup).

Con gli strumenti standard di MongoDB (dal container di MongoDB o da un PC con i MongoDB Database Tools):

```bash
mongodump  --uri "mongodb://localhost:27017/toolpm" --out ./backup-AAAAMMGG
mongorestore --uri "mongodb://localhost:27017" ./backup-AAAAMMGG
```
