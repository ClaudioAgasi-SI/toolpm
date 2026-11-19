# Migrazione dei dati del Pianificatore (fase 1, blocco B7)

Oggi nel Pianificatore le risorse non hanno email, e cliente e progetto delle allocazioni sono testo libero. La migrazione trasforma questi dati nelle anagrafiche comuni: risorse con email e utente per l'accesso, clienti, centri di costo e progetti veri, con le allocazioni collegate ai progetti. Il database `pianificazione` del vecchio pianificatore non viene toccato.

Il lavoro si fa con un solo comando, `migrazione-dati`, in quattro passi: **esporta**, compilazione dei file, **importa** (prima in prova), **verifica**.

## 1. Preparazione

In PowerShell, nella cartella `toolpm`:

```powershell
git pull
docker exec mongodb mongodump --db toolpm --gzip --archive=/tmp/backup-toolpm-pre-b7.gz
docker cp mongodb:/tmp/backup-toolpm-pre-b7.gz .
docker compose up -d --build
docker compose exec backend npm run migra
```

`migra` deve terminare senza errori (le ultime sono `004-comuni` e `005-alias-pianificatore`).

## 2. Esportazione

```powershell
docker compose exec backend npm run migrazione-dati -- esporta
```

Nella cartella `migrazione` del progetto compaiono tre file:

| File | Contenuto |
|---|---|
| `risorse.csv` | Una riga per risorsa, con cognome e nome già scritti |
| `progetti.csv` | Una riga per ogni coppia cliente/progetto trovata nelle allocazioni, con codice e titolo proposti |
| `controllo-griglia.json` | Fotografia della griglia di oggi, usata dalla verifica finale; non va toccato |

I file si aprono con Excel (separatore `;`, accenti corretti). La cartella `migrazione` è esclusa da Git: i file contengono dati personali e non finiscono su GitHub.

Se i CSV esistono già, il comando si ferma per non cancellare un lavoro già fatto: spostali, oppure usa `esporta --sovrascrivi`. La fotografia della griglia non viene mai riscritta.

## 3. Compilazione

Regole generali: non modificare le colonne `id`, `clienteTesto`, `progettoTesto` e `allocazioni`; le date si scrivono `AAAA-MM-GG` (va bene anche `GG/MM/AAAA`); una cella vuota lascia il dato com'è.

### `risorse.csv`

| Colonna | Cosa scrivere |
|---|---|
| `id`, `cognome`, `nome` | Già compilati (`id` non va modificato) |
| `email` | Email aziendale: sarà il nome utente per l'accesso. Unica. Senza email la risorsa resta "da completare" e non può accedere |
| `cellulare`, `matricola` | Facoltativi |
| `ruoloCodice` | Codice del ruolo professionale (es. `SVIL-SR`); lettere, cifre, `.` `-` `_`, senza spazi |
| `ruoloDescrizione` | Obbligatoria se il ruolo non esiste ancora (es. "Sviluppatore senior"); basta scriverla una volta per codice |
| `ruoloDal` | Data da cui vale il ruolo; obbligatoria con il ruolo |
| `oreContrattualiGiorno` | Orario contrattuale (es. `8` o `7,5`) |
| `abilitazione` | `TL`, `PM`, `PMSenior` oppure vuota per una risorsa semplice |
| `accesso` | `si` (predefinito) per creare l'utente, `no` per non crearlo |

### `progetti.csv`

Più righe possono confluire nello stesso progetto: basta dare loro lo **stesso codice** e gli **stessi dati** (utile per testi scritti in modi diversi, per esempio "TIMBUSINESS" che in realtà è "TIMBUFE"). È anche il momento di correggere i refusi, per esempio "Reigegnerizzazione ROC" in codice e titolo.

| Colonna | Cosa scrivere |
|---|---|
| `clienteTesto`, `progettoTesto`, `allocazioni` | Già compilati, non modificare: servono a collegare le allocazioni |
| `codice` | Codice univoco del progetto (proposto dal testo); lettere, cifre, `.` `-` `_`, max 40 caratteri |
| `titolo` | Titolo leggibile; obbligatorio |
| `descrizione` | Facoltativa |
| `clienteCodice` | Codice del cliente; vuoto per un progetto interno |
| `clienteRagioneSociale` | Obbligatoria se il cliente non esiste ancora |
| `centroCostoCodice` | Obbligatorio |
| `centroCostoDescrizione` | Obbligatoria se il centro di costo non esiste ancora |
| `pm`, `tl` | Email delle risorse approvatrici, separate da spazio o virgola; devono essere email presenti in `risorse.csv` o già nel database |
| `stato` | `inValutazione` (predefinito), `inCorso` o `chiuso` |
| `dataInizio`, `dataFine` | Facoltative, ma `inCorso` richiede data di inizio e almeno un PM, `chiuso` anche la data di fine |

## 4. Importazione

Prima la prova, che controlla tutto e mostra cosa farebbe **senza scrivere nulla**:

```powershell
docker compose exec backend npm run migrazione-dati -- importa --prova
```

Gli errori indicano file e riga (es. `progetti.csv riga 4: centroCostoCodice obbligatorio`). Basta un errore perché non venga scritto nulla: si correggono i file e si ripete. Gli **avvisi** (risorse senza email, progetti senza PM) non bloccano.

Quando la prova è pulita:

```powershell
docker compose exec backend npm run migrazione-dati -- importa
```

L'importazione avviene in un'unica transazione: o va a buon fine tutta, o non cambia nulla. Nell'ordine:

1. crea i ruoli nuovi e aggiorna le risorse (email, cellulare, matricola, orario, ruolo con la sua data);
2. crea gli utenti delle risorse con email, con l'abilitazione indicata e una **password provvisoria**. Se esiste già un utente con quella email (per esempio l'amministratore), lo collega alla risorsa e gli assegna l'abilitazione, senza toccare password e ruoli;
3. crea i clienti e i centri di costo nuovi, e crea o aggiorna i progetti con gli approvatori;
4. collega le allocazioni ai progetti: ogni allocazione riceve il `progettoId` e conserva i testi originali in `clienteTesto` e `progettoTesto`.

Le password provvisorie degli utenti nuovi sono nel file `migrazione/utenti-creati-<data>.csv`. Comunicale alle persone e poi **cancella il file**. Al primo accesso ognuno dovrà cambiare la propria password.

Il comando si può ripetere: aggiorna i dati con quelli dei file, senza creare doppioni né utenti nuovi per chi li ha già. Attenzione però: i progetti vengono riportati ai valori del file, quindi le modifiche fatte nel frattempo dall'applicazione su quei progetti si perdono.

## 5. Verifica

```powershell
docker compose exec backend npm run migrazione-dati -- verifica
```

Controlla che:

- ogni allocazione scritta a testo sia collegata a un progetto esistente;
- nessun progetto In corso o Chiuso sia senza PM;
- la griglia del Pianificatore sia **uguale a prima**, cioè per ogni risorsa e mese ci siano le stesse righe e la stessa somma delle percentuali.

Mostra anche il riepilogo: risorse senza email, utenti collegati, progetti per stato. Se tutto è a posto termina con "Nessun problema".

## Dopo la migrazione

- Finché il Pianificatore non sceglie i progetti da un elenco (blocco B5), le allocazioni si scrivono ancora a testo. Il backend collega in automatico quelle il cui testo cliente/progetto è uno di quelli importati. Le altre restano senza progetto e la verifica le segnala.
- I campi `cliente` e `progetto` delle allocazioni restano per ora: li rimuove il blocco B5, insieme a `clienteTesto` e `progettoTesto` dopo un rilascio.
- Per tornare indietro: ripristinare il backup del passo 1 (vedi [mongodb-replica-set.md](mongodb-replica-set.md#2-backup)).
