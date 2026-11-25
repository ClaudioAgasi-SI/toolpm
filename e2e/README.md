# Prove nel browser (Playwright)

Prove automatiche dei percorsi principali, eseguite in Chrome con Playwright per Python. Lavorano su un database di prova
separato (`toolpm_e2e`), che lo script di preparazione cancella e ricrea ogni volta: non toccano mai il database `toolpm`.

| Prova | Cosa controlla |
|---|---|
| `consuntivazione.py` | Consuntivazione (fase 2): il controller crea una tipologia e sposta la predefinita, inserisce le tariffe standard del ruolo (con il rifiuto di un periodo sovrapposto) e una personalizzata; rita compila la settimana scorsa con le righe proposte, un'attività assegnata, uno straordinario e una nota, salva e non vede importi; copia della settimana; luca, senza ruolo, salva ore che restano da valorizzare; il controller controlla costi e totali in "Consuntivi delle risorse", vede luca tra le righe da valorizzare, corregge una tariffa e applica il ricalcolo con anteprima |
| `report.py` | Report (fase 4): il controller lancia **Esegui ora** e trova l'andamento calcolato fino a ieri; pina (PM) vede nell'elenco gli stati di tempi e costi di ALFA, apre la scheda con indicatori EVM, spiegazione e i due grafici dell'andamento e scarica l'Excel (fogli e totali controllati); tito (TL) vede scheda e report dei costi senza euro e scarica un CSV senza costi; il controller controlla il report per centro di costo › progetto › attività (totali e righe in attesa), scarica le righe di dettaglio in CSV e vede nel pianificato le ore di rita su ALFA come non allocate. Vuole anche `node scripts/e2e-report.mjs` dopo la preparazione e il backend con `EVM_RECUPERO_ALL_AVVIO=false`; serve `pip install openpyxl` |
| `controllo.py` | Controllo (fase 3): rita compila e salva la settimana scorsa, la invia (celle in sola lettura e colorate), aggiunge una riga accanto a quelle inviate, ritira l'invio e invia di nuovo; tito (TL) vede le righe senza costi e dà il via libera alla settimana; pina (PM) vede via libera e costi, respinge lo straordinario con la motivazione e approva il resto; rita vede il rifiuto, corregge e reinvia; pina approva la riga, che riparte senza via libera; contatore del sottomenu; carlo chiude il mese (tutte le righe approvate), rita lo trova chiuso e non modifica né invia, carlo lo riapre con la motivazione; carlo trova nello Storico riaperture e la correzione di rita; rita apre la cronologia della riga respinta e corretta, senza importi |

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

3. Lancia la prova: `python e2e/consuntivazione.py`, `python e2e/controllo.py` oppure `python e2e/report.py`. Variabili facoltative: `BASE` (default `http://localhost:4201/toolpm`),
   `CHROME` (percorso di Chrome), `SCREENSHOT` (cartella delle catture, default `/tmp`).

Per ripetere la prova rilancia prima `node scripts/e2e-prepara.mjs`: la prova si aspetta un database appena preparato.

Per `report.py`, dopo la preparazione aggiungi le ore approvate dei report e avvia il backend senza il recupero dell'andamento all'avvio:

```powershell
node scripts/e2e-prepara.mjs
node scripts/e2e-report.mjs
$env:EVM_RECUPERO_ALL_AVVIO = "false"; $env:JWT_SECRET = "e2e"; $env:PORT = "3001"; node dist/main
```

## Dati preparati

Utenti con password `Password-e2e-1`: `carlo@prova.it` (risorsa e controller), `rita@prova.it` (ruolo SVS dal primo gennaio
dell'anno scorso), `luca@prova.it` (senza ruolo), `pina@prova.it` (abilitazione PM, PM di ALFA e BETA), `tito@prova.it` (abilitazione TL, TL di ALFA).
Progetti: ALFA (attività SVI assegnata a rita, TEST non assegnata), BETA (rita e luca allocati al 50% nel Pianificatore), GAMMA (chiuso).
Le prove lavorano sulla settimana scorsa e ognuna si aspetta un database appena preparato. `e2e-report.mjs` aggiunge, da 60 a 14 giorni fa nei giorni feriali, 8 ore al giorno di rita su ALFA › SVI (40 €/h) e 4 ore di tito su ALFA (50 €/h) approvate da pina, le ultime due giornate di rita ancora inviate, e lo storico della percentuale di ALFA (10% e poi 25%).
