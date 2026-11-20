# Prove nel browser (Playwright)

Prove automatiche dei percorsi principali, eseguite in Chrome con Playwright per Python. Lavorano su un database di prova
separato (`toolpm_e2e`), che lo script di preparazione cancella e ricrea ogni volta: non toccano mai il database `toolpm`.

| Prova | Cosa controlla |
|---|---|
| `consuntivazione.py` | Consuntivazione (fase 2): il controller crea una tipologia e sposta la predefinita, inserisce le tariffe standard del ruolo (con il rifiuto di un periodo sovrapposto) e una personalizzata; rita compila la settimana scorsa con le righe proposte, un'attività assegnata, uno straordinario e una nota, salva e non vede importi; copia della settimana; luca, senza ruolo, salva ore che restano da valorizzare; il controller controlla costi e totali in "Consuntivi delle risorse", vede luca tra le righe da valorizzare, corregge una tariffa e applica il ricalcolo con anteprima |

## Requisiti

- MongoDB raggiungibile come replica set (quello di Docker Desktop va bene) e Node.js 22.
- Python 3 con Playwright: `pip install playwright` e Chrome installato (oppure `python -m playwright install chromium` e `CHROME` vuoto nello script).

## Esecuzione

Da tre terminali, nella cartella del repository (comandi per PowerShell; in bash usa `export VAR=...`).

1. Prepara il database di prova e avvia il backend su di esso:

   ```powershell
   cd backend
   $env:MONGODB_URI = "mongodb://localhost:27017/toolpm_e2e?replicaSet=rs0&directConnection=true"
   node scripts/e2e-prepara.mjs
   npm run build
   $env:JWT_SECRET = "e2e"; $env:PORT = "3001"; node dist/main
   ```

   Lo script rifiuta di partire se il nome del database non finisce con `_e2e`. Ferma prima il backend di Docker
   (`docker compose stop backend frontend`) per liberare le porte 3001 e 4201.

2. Avvia il frontend: `cd frontend; npx ng serve --port 4201`.

3. Lancia la prova: `python e2e/consuntivazione.py`. Variabili facoltative: `BASE` (default `http://localhost:4201/toolpm`),
   `CHROME` (percorso di Chrome), `SCREENSHOT` (cartella delle catture, default `/tmp`).

Per ripetere la prova rilancia prima `node scripts/e2e-prepara.mjs`: la prova si aspetta un database appena preparato.

## Dati preparati

Utenti con password `Password-e2e-1`: `carlo@prova.it` (risorsa e controller), `rita@prova.it` (ruolo SVS dal primo gennaio
dell'anno scorso), `luca@prova.it` (senza ruolo). Progetti: ALFA (attività SVI assegnata a rita, TEST non assegnata),
BETA (rita e luca allocati al 50% nel Pianificatore), GAMMA (chiuso). La prova lavora sulla settimana scorsa.
