# Cartella della migrazione dei dati

Qui il comando `npm run migrazione-dati` (blocco B7 della fase 1) scrive e legge:

- `risorse.csv` e `progetti.csv`, da compilare;
- `controllo-griglia.json`, la fotografia della griglia del Pianificatore prima della migrazione;
- `utenti-creati-<data>.csv`, le password provvisorie degli utenti creati dall'importazione.

Questi file contengono dati personali e password: **Git li ignora** e non vanno pubblicati. Dopo aver
comunicato le password provvisorie, cancella i file `utenti-creati-*.csv`.

Con Docker la cartella è montata nel backend come `/migrazione`. Istruzioni: [docs/migrazione-dati.md](../docs/migrazione-dati.md).
