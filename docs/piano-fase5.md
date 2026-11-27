# ToolPM — Piano della fase 5: offerte e preventivi

26/11/2026 · Claudio Agasi

> Piano di lavoro della fase 5, confermato il 26/11/2026 con le quattro scelte tecniche proposte: realizza la sezione **Offerte e preventivi** come descritta in [analisi-offerte.md](analisi-offerte.md), con le dodici decisioni confermate il 26/11/2026. Versione di lavoro con commenti: [documento su Claude](https://claude.ai/artifact/F1wqqffv2ytt7zzNzBBj9j). Il modo di lavorare è quello delle fasi [2](piano-fase2.md), [3](piano-fase3.md) e [4](piano-fase4.md): un blocco alla volta, prova sul PC e ok prima del successivo.

## Avanzamento

| Blocco | Stato | Note |
| --- | --- | --- |
| F0 — Preparazione | Fatto | Migrazione `011-offerte` (offerte, revisioni, listino, contatori con validatori e indici; indice `offertaId` su progetti; parametro `offerte`, validato quando lo modifica il controller); ruolo globale `commerciale` (anche nella pagina Utenti); permessi `vedereOfferte`, `creareOfferte`, `vedereListino`, `gestireListino` e regole per offerta con test; `src/offerte/calcoli.ts` con test sull'esempio "Portale ordini" (al centesimo); modulo vuoto sotto `/api/offerte`; sezione **Offerte e preventivi** nel menu con la pagina iniziale. Test: 285 backend (nuovo `test/offerte.integrazione.spec.ts`), 27 frontend. Sul PC: migrazione 011. |
| F1 — Listino di vendita | Fatto | API `/api/offerte/listino` (elenco, creazione, modifica, cancellazione, storico; 409 per periodi sovrapposti, ruolo e cliente non modificabili) e `/applicabili` (vendita del cliente o standard alla data, costo della tipologia ordinaria × ore del giorno, visibile a chi legge il listino: deciso il 27/11/2026); `ListinoService.tariffePerStima` per F2; pagina **Listino di vendita** con scelta di listino e data, costo (con il periodo della tariffa di costo usata e, per il controller, il collegamento a Consuntivazione › Tariffe) e margine della giornata per ruolo, avvisi per i ruoli senza tariffa, periodi modificabili da PMSenior e controller; voci del listino leggibili nella pagina Storico. Test: 294 backend, 29 frontend. Nessuna migrazione. |
| F2 — Offerta e stima | Da fare | |
| F3 — Approvazione, invio, revisioni, esito | Da fare | |
| F4 — Dall'offerta al progetto | Da fare | |
| F5 — Elenco, pipeline ed esportazioni | Da fare | |
| F6 — Test e documentazione | Da fare | |

## Obiettivo e perimetro

Alla fine della fase un PM o un commerciale prepara un'offerta con la stima per ruolo e vede subito costo, prezzo e margine. Un PMSenior la approva, il responsabile la invia e ne registra l'esito; se è vinta, ne nasce il progetto con attività e stime.

Dentro: i requisiti RO-1…RO-14 dell'analisi, cioè anagrafica e stimatori, stima con contingenza, costo e prezzo, revisioni e approvazione, invio ed esito, progetto dall'offerta vinta, elenco con pipeline, listino di vendita, esportazioni in Excel e Word, storico. Fuori: le sezioni Fatturazione e SAL e Richieste evolutive, che avranno ciascuna la propria fase.

## Punto di partenza

Gran parte di quello che serve c'è già e si riusa; la fase aggiunge soprattutto il modulo `src/offerte/` e le sue pagine.

| Già presente | Dove | Uso nella fase 5 |
| --- | --- | --- |
| Clienti, ruoli, centri di costo, progetti con attività e stime | Anagrafiche (`src/comuni/`) | Cliente dell'offerta, ruoli delle voci, progetto creato dall'offerta vinta |
| Tariffe standard di costo per ruolo e tipologia, con validità; `periodiSovrapposti`, `inPeriodo` | Consuntivazione (`tariffe/`) | Costo stimato; stesse regole di validità per il listino di vendita |
| Parametri (`oreGiorno`), `AuditService`, tracciamento, migrazioni | `src/infrastruttura/` | Ore di una giornata, storico delle modifiche, nuova migrazione 011 |
| Utenti con abilitazione (TL, PM, PMSenior) e ruoli globali (risorsa, controller, admin) | `src/auth/`, `src/permessi/` | Nuovo ruolo globale `commerciale` e nuovi permessi |
| Versione sui documenti e conflitto 409 | giornate di consuntivo | Stesso schema per offerte e revisioni |
| Esportazioni Excel e CSV (`esporta.ts`, exceljs), pulsante Scarica | report della fase 4 | Stima in Excel, elenco in Excel e CSV |
| Prove nel browser con dati preparati | `e2e/`, `scripts/e2e-prepara.mjs` | Nuova prova `e2e/offerte.py` |

## Ordine dei lavori

I blocchi vanno in fila perché ognuno usa il precedente: il listino serve ai prezzi della stima, la stima al ciclo di vita, l'offerta vinta al progetto.

F0 Preparazione → F1 Listino → F2 Offerta e stima → F3 Ciclo di vita → F4 Progetto → F5 Pipeline ed esportazioni → F6 Test e documentazione

Dopo F2 la sezione è già usabile per preparare stime interne; dopo F4 copre tutto il percorso fino al progetto.

## Blocchi di lavoro

Ogni blocco finisce con test verdi, documentazione aggiornata (GitHub e documenti su Claude), commit e istruzioni per la prova sul PC.

### F0 — Preparazione

- Migrazione `011-offerte`: collection `offerte`, `offerte_revisioni`, `listino_vendita`, `contatori` con validazione e indici; parametro `offerte` (margine minimo 25%, validità 60 giorni, motivi di perdita); campo `offertaId` su `progetti`; ruolo `commerciale` ammesso tra i ruoli degli utenti.
- Ruolo `commerciale` in `RUOLI` e nella pagina Utenti delle Anagrafiche; permessi globali `vedereOfferte`, `creareOfferte`, `gestireListino` e regole per offerta (`vedeOfferta`, `vedeEuroOfferta`, `modificaOfferta`, `puoApprovare`) con test.
- `src/offerte/calcoli.ts`: funzioni pure per giorni con contingenza, costo, prezzo da listino, sconto, prezzo a corpo, margine; test sull'esempio "Portale ordini" dell'analisi (18.867,20 €, 32.274,00 €, 30.660,30 €, margine 37,1% a 30.000 €).
- Modulo `OfferteModule` vuoto e voce **Offerte** nel menu ("in preparazione").

**Fatto quando:** la migrazione gira sul PC, l'amministratore assegna il ruolo commerciale, i calcoli dell'esempio tornano al centesimo.

### F1 — Listino di vendita

- API `/api/offerte/listino`: elenco, creazione, modifica, eliminazione; standard e per cliente; validità senza sovrapposizioni per ruolo e cliente; storico.
- Risoluzione delle tariffe alla data: vendita (listino del cliente, altrimenti standard) e costo (tariffa standard del ruolo, tipologia ordinaria × `oreGiorno`), con i ruoli senza tariffa.
- Pagina `/offerte/listino` con filtro per cliente e segnalazione dei ruoli senza tariffa.

**Fatto quando:** controller e PMSenior gestiscono il listino, commerciali e PM lo leggono, sovrapposizioni rifiutate.

### F2 — Offerta e stima

- `POST /api/offerte`: numero OFF-AAAA-NNNN dal contatore, nella stessa transazione che crea offerta e revisione 1 in bozza.
- Testata (`GET/PUT /api/offerte/:id`) con stimatori; salvataggio della bozza (`PUT …/revisioni/:n`) con gruppi, voci, contingenza, sconto, prezzo a corpo, condizioni e versione (409 se superata).
- Totali ricalcolati a ogni salvataggio con le tariffe alla data; euro tolti a chi non li vede; stimatori limitati a gruppi e voci.
- Elenco semplice e pagine **Offerta** e **Stima**: griglia gruppi × voci con aggiunta, riordino ed eliminazione, totali per gruppo e ruolo, riquadro di costo, prezzo e margine con l'avviso sotto il minimo.

**Fatto quando:** l'esempio "Portale ordini" inserito dalla pagina dà gli stessi numeri dell'analisi; un TL stimatore non vede euro in pagina né nelle risposte.

### F3 — Approvazione, invio, revisioni, esito

- Invio in approvazione con i controlli (tariffe, prezzo) e la fotografia di tariffe e totali; approvazione o rifiuto di un PMSenior non autore, nota obbligatoria sotto il margine minimo.
- Invio al cliente con la data; validità e segnalazione delle scadute; nuova revisione come copia, la precedente superata; esito vinta, persa (motivo dai parametri) o ritirata.
- Barra di stato con le sole azioni possibili, storico delle revisioni e confronto di due revisioni; ogni passaggio nello storico (`AuditService`).

**Fatto quando:** il ciclo di vita dell'analisi funziona tutto, compresi i casi rifiutati (autore che approva, revisione congelata modificata, invio senza tariffe).

### F4 — Dall'offerta al progetto

- `GET /api/offerte/:id/progetto` (anteprima) e `POST` (creazione in una transazione): progetto In valutazione con cliente, centro di costo, PM, attività dai gruppi, stime manageriali; `offertaId` e `progettoId` collegati.
- Pagina di anteprima da correggere e confermare; nella scheda costi del progetto (Consuntivazione) collegamento all'offerta con ricavo e margine previsti, solo a chi vede gli euro.

**Fatto quando:** l'offerta vinta dell'esempio crea un progetto con 77 giorni e 18.867,20 € di stima manageriale e tre attività; un secondo tentativo è rifiutato.

### F5 — Elenco, pipeline ed esportazioni

- Elenco con filtri (stato, cliente, responsabile, tipo, periodo, testo) e riquadro della pipeline: valore aperto per stato, offerte in scadenza, tasso di successo per numero e per valore nel periodo.
- Excel e CSV dell'elenco; Excel della stima (costi e margini solo a chi li vede); documento d'offerta in Word dalla revisione inviata, senza costi né margini.

**Fatto quando:** i file si aprono in Excel e Word, il documento d'offerta non contiene costi, il TL scarica solo giorni.

### F6 — Test e documentazione

- Prova nel browser `e2e/offerte.py`: dalla nuova offerta alla stima di un TL, approvazione, invio, nuova revisione, vinta, progetto creato, esportazioni.
- Guida per gli utenti `docs/offerte.md`; `backend.md`, `frontend.md`, `database.md`, `architettura.md`, README aggiornati; criteri di completamento spuntati.

**Fatto quando:** tutte le prove passano, comprese quelle delle fasi precedenti.

## Criteri di completamento

- [ ] Un commerciale o un PM crea un'offerta con numero progressivo dell'anno, senza numeri doppi anche con due creazioni contemporanee.
- [ ] La stima dell'esempio "Portale ordini" dà al centesimo costo, prezzo da listino, prezzo scontato e margine dell'analisi.
- [ ] Un ruolo senza tariffa di costo o di vendita è segnalato e blocca l'invio in approvazione.
- [ ] I TL stimatori e chi non è responsabile non vedono costi, prezzi né margini in nessuna pagina, risposta o file.
- [ ] Nessuna offerta arriva a Inviata senza l'approvazione di un PMSenior diverso dall'autore; sotto il margine minimo l'approvazione ha una nota.
- [ ] Una revisione inviata non si modifica più; la nuova revisione la rende superata e il confronto mostra le differenze.
- [ ] Un cambio di listino non modifica le revisioni già approvate.
- [ ] L'offerta vinta crea una sola volta il progetto In valutazione con attività e stime manageriali, collegato all'offerta.
- [ ] Elenco e pipeline mostrano valore aperto per stato, scadenze e tasso di successo.
- [ ] Stima in Excel e documento d'offerta in Word si aprono e il documento non contiene costi né margini.
- [ ] Ogni passaggio di stato e ogni modifica di prezzo, sconto, contingenza e listino è nello storico.
- [ ] Documentazione in `docs/` e Swagger aggiornati; `docker compose up` sul PC con la migrazione 011 eseguita.

## Rischi

| Rischio | Effetto | Come lo gestiamo |
| --- | --- | --- |
| Tariffe di costo o di vendita mancanti per qualche ruolo | Costi e prezzi incompleti, offerte sbagliate | Ruoli senza tariffa segnalati in stima e nel listino; invio in approvazione bloccato |
| Riservatezza degli euro con tanti profili (commerciale, PM, TL stimatore) | Un TL vede costi o margini | Regole pure con test per profilo; euro tolti nel backend, non solo nascosti in pagina; criterio verificato anche sui file |
| Due persone modificano la stessa bozza | Una modifica si perde | Versione sulla revisione e conflitto 409 con ricarica, come per le giornate di consuntivo |
| Arrotondamenti tra giorni, ore e centesimi | Totali che non tornano con il documento d'offerta | Arrotondamento per ruolo in un solo punto (`calcoli.ts`), test sull'esempio dell'analisi |
| Documento Word poco curato | Va rifatto a mano ogni volta | Modello semplice e pulito, pensato per essere rifinito; formato da rivedere con chi scrive le offerte dopo F5 |
| Creazione del progetto a metà | Progetto senza attività o offerta senza collegamento | Tutto in una transazione; un secondo tentativo è rifiutato se il collegamento esiste già |

## Decisioni

Le dodici decisioni funzionali sono quelle dell'analisi, confermate il 26/11/2026: tre tipi di offerta; gruppi e voci con contingenza; costo dalle tariffe standard; listino di vendita con sconto o prezzo a corpo; ruolo commerciale; euro solo a responsabile, PMSenior e controller; approvazione sempre di un PMSenior non autore; revisioni congelate dopo l'invio; progetto In valutazione dall'offerta vinta; numerazione OFF-AAAA-NNNN; documento in Word; motivi di perdita nei parametri.

Le quattro scelte tecniche del piano, confermate il 26/11/2026:

| N. | Scelta | Decisione |
| --- | --- | --- |
| 1 | Nome e numero della fase | Fase 5 della roadmap di ToolPM, blocchi F0–F6 |
| 2 | Libreria per il documento Word | `docx` (npm), come exceljs per l'Excel: nessun servizio esterno, file generato dal backend |
| 3 | Calcolo dei totali | Nel backend a ogni salvataggio; la pagina ricalcola subito i giorni e mostra gli euro dopo il salvataggio automatico (un secondo di ritardo) |
| 4 | Ordine F4 / F5 | F4 (progetto) prima di F5 (pipeline ed esportazioni), per chiudere subito il collegamento con la Consuntivazione |
