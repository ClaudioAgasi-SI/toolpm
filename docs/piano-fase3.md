# ToolPM — Piano della fase 3: controllo

23/11/2026 · Claudio Agasi

> Piano di lavoro della fase 3, confermato il 23/11/2026 e completato il 24/11/2026: blocchi D0–D6 fatti. Versione di lavoro con commenti: [documento su Claude](https://claude.ai/artifact/Ha8p19r8NfxpZZEbqfV2SQ). Le decisioni da cui parte sono in [analisi-consuntivazione.md](analisi-consuntivazione.md); il modo di lavorare è quello delle fasi [1](piano-fase1.md) e [2](piano-fase2.md).

La fase 3 porta il **controllo** sulle ore consuntivate: la risorsa invia le proprie righe, il TL dà un primo via libera facoltativo, il PM approva in modo definitivo o respinge, il controller chiude i mesi. Da qui in avanti solo le righe approvate dal PM contano come costi validi, e ogni modifica ai dati sensibili lascia una traccia nello storico. Report ed EVM restano alla fase 4.

## Avanzamento

| Blocco | Stato | Note |
| --- | --- | --- |
| D0 — Preparazione | Fatto | Commit 9afa07f. Migrazione `008-controllo` (`periodi`, `audit_log` con validatori e indici; l'indice `righe.progettoId + righe.stato + data` c'era già dalla 007), `AuditService` nell'infrastruttura (scrittura nella transazione della modifica, cronologia), permessi `approvare` (TL, PM, PMSenior) e `gestirePeriodi` (controller), regole pure `profiloDiApprovazione` e `motivoNegatoApprovazione` (transizioni per profilo, niente auto-approvazione), pagina iniziale con Approvazioni e Periodi "in preparazione" (le voci del sottomenu arrivano con le pagine, D3 e D4). Test: 181 backend (nuovo `test/controllo.integrazione.spec.ts`), 16 frontend. Da fare sul PC: migrazione 008. |
| D1 — Invio delle ore | Fatto | API `POST consuntivi/invio` e `consuntivi/ritiro` (`{ giornate: [{ data, versione }] }`, transazione con versione, storico per giornata) e `GET consuntivi/da-inviare`; campo `rifiuto` sulle righe (la riga respinta corretta resta respinta con la motivazione fino al nuovo invio). Pagina "Il mio consuntivo": stato delle celle con legenda, riquadro delle respinte, Invia e Ritira con conferma, contatore delle righe da inviare nei giorni passati. Prova nel browser `e2e/controllo.py`. Test: 188 backend, 16 frontend. |
| D2 — Approvazioni (backend) | Fatto | `ApprovazioniService` con `GET /approvazioni` (righe per profilo, mai le proprie, azioni possibili, via libera e rifiuto con il nome, attività non assegnate, costi solo a PM/PMSenior/controller), `GET /approvazioni/in-attesa` e `POST /approvazioni` (via libera, approvazione, rifiuto motivato in blocco; aggiornamento condizionato sullo stato letto, righe "saltate" con il motivo, versione della giornata, storico). Test: 197 backend (concorrenza, auto-approvazione, rifiuto di riga approvata e reinvio). |
| D3 — Pagina Approvazioni | Fatto | Pagina `/consuntivazione/approvazioni` (vista "Da lavorare" o per stato, periodo, filtri per progetto, risorsa, attività non assegnate; gruppi per risorsa e settimana con totali di ore e, per PM e PMSenior, costo; selezione multipla con Via libera / Approva / Respingi e motivazione; righe saltate con il motivo), contatore delle righe in attesa nel sottomenu, voce nella pagina iniziale. `e2e-prepara.mjs` con pina PM di ALFA e BETA e tito TL di ALFA; `e2e/controllo.py` esteso con il percorso TL → PM → rifiuto → correzione → approvazione. |
| D4 — Chiusura dei periodi | Fatto | `PeriodiService` con `GET /periodi`, `/periodi/chiusi`, `/periodi/:mese/anteprima`, `POST /periodi/:mese/chiusura` (in ordine, bloccata con righe non approvate, forzabile con motivazione, approvate → chiuse) e `/riapertura` (ultimo chiuso, motivazione); mese chiuso rispettato da salvataggio, invio, ritiro, approvazioni e ricalcolo; storico di chiusure e riaperture. Pagina Periodi del controller; "Il mio consuntivo" e Approvazioni mostrano il mese chiuso. Test: 202 backend; `e2e/controllo.py` con chiusura e riapertura. |
| D5 — Storico delle modifiche | Fatto | Storico scritto anche da salvataggio (correzione e cancellazione di righe respinte), ricalcolo, tariffe, tipologie, progetti (creazione, modifica, stato, approvatori) e attività (creazione, modifica, assegnazioni), nella stessa transazione; `differenze()` per i soli campi cambiati. API `GET /storico` (permesso `consultareStorico`: controller e PMSenior) e `GET /storico/riga/:rigaId` (risorsa, approvatori, controller, PMSenior; ricalcoli solo a chi vede i costi). Pagina Storico, cronologia della riga in "Il mio consuntivo" e in "Consuntivi delle risorse". Test: 206 backend, 18 frontend; `e2e/controllo.py` con storico e cronologia. |
| D6 — Test e documentazione | Fatto | Test di integrazione aggiunti (approvazione durante una modifica della risorsa: 409, nessun dato perso; il ricalcolo non tocca un mese chiuso); criteri di completamento verificati; README (API della fase 3), indice di `docs/`, architettura, frontend e guida riletti e aggiornati, con nuove domande frequenti. Test: 208 backend, 18 frontend; prove nel browser `e2e/consuntivazione.py` e `e2e/controllo.py` superate. |

## Obiettivo e perimetro

Alla fine della fase 3 una risorsa invia le ore di uno o più giorni con un clic e vede lo stato di ogni riga; gli approvatori trovano in un'unica pagina le righe dei propri progetti, le approvano o le respingono anche in blocco, con la motivazione del rifiuto; il controller chiude e riapre i mesi; chi deve controllare trova lo storico di ogni modifica rilevante (chi, quando, valore prima e dopo).

**Compreso nella fase 3** (requisiti dell'analisi)

- RF-10 Invio di una o più giornate.
- RF-11 Approvazione su due livelli (via libera TL facoltativo, approvazione PM definitiva), anche in blocco, con rifiuto motivato; RF-23 stesse regole per le righe sulle attività.
- Stati della riga: bozza → inviata → approvataTL → approvata → chiusa, con respinta che torna alla risorsa (schema "Stati di una riga" dell'analisi).
- Evidenza all'approvatore delle righe su attività a cui la risorsa non è assegnata (decisione 10 della fase 2).
- RF-12 Chiusura e riapertura motivata del mese.
- Storico delle modifiche in `audit_log` (decisione 2 della fase 2) e tracciamento del ricalcolo (RF-18).
- Regole di business rimandate: riga approvata non modificabile (per correggerla il PM la respinge), righe inviate su un progetto chiuso ancora approvabili, nessuna riga nuova o cambiata in un mese chiuso.
- Riservatezza per l'approvatore: il PM vede ore e costi delle righe dei propri progetti (il PMSenior di tutti), il TL solo le ore.

**Fuori dalla fase 3**

- Scheda costi del progetto, report per centro di costo, pianificato contro consuntivato, EVM, esportazioni (fase 4).
- Notifiche via email (vedi le decisioni confermate).
- Integrazioni con altri sistemi (fase 5, facoltativa).

## Punto di partenza

| Area | Stato a fine fase 2 (commit `6494192`) | Cosa cambia nella fase 3 |
| --- | --- | --- |
| Righe | Tutte in `bozza`; lo schema ha già gli stati e i campi `approvazioneTL` / `approvazionePM` | Invio, approvazione, rifiuto con `motivazioneRifiuto`, chiusura |
| Giornata | `versione` controllata a ogni salvataggio della risorsa | Anche invio, approvazione, chiusura e ricalcolo incrementano la versione |
| Dati | `tipologie_costo`, `tariffe_standard`, `tariffe_personalizzate`, `consuntivi` | Nuove collection `periodi` e `audit_log`; indice `righe.progettoId + righe.stato + data` |
| Permessi | `gestireTipologieCosto`, `gestireTariffe`, `consuntivare`; costi visibili solo al controller | Permessi `approvare` (chi ha un'abilitazione TL, PM o PMSenior) e `gestirePeriodi` (controller); costi visibili anche al PM sui propri progetti |
| Ricalcolo | Solo righe in bozza (non `chiusa`) | Anche righe inviate e approvate, con storico; mai le righe di un mese chiuso |
| Test | 169 backend, 16 frontend, prova nel browser `e2e/consuntivazione.py` | Test delle transizioni, della concorrenza, dei permessi di approvazione, della chiusura |

## Ordine dei lavori

| Blocco | Dipende da |
| --- | --- |
| D0 Preparazione | — |
| D1 Invio delle ore | D0 |
| D2 Approvazioni (backend) | D1 |
| D3 Pagina Approvazioni | D2 |
| D4 Chiusura dei periodi | D2 |
| D5 Storico delle modifiche | D0 (le scritture nello storico entrano blocco per blocco) |
| D6 Test e documentazione | tutti |

Ogni blocco si chiude con codice, test, documentazione in `docs/` aggiornata e pubblicata su GitHub, ed è rilasciabile da solo. Lo storico (`AuditService`) nasce in D0, così ogni blocco successivo registra da subito le proprie modifiche; D5 aggiunge la consultazione e le scritture su tariffe, tipologie, attività e approvatori.

## Blocchi di lavoro

### D0 — Preparazione

- Migrazione `008-controllo`: collection `periodi` (un documento per mese: stato aperto o chiuso, chi e quando ha chiuso o riaperto, chiusura forzata con motivazione, motivazione della riapertura) e `audit_log` (collezione, id del documento, righe toccate, operazione, utente, data, valori prima e dopo, motivazione) con validatori `$jsonSchema` e indici su collezione, documento e data, righe, data, utente (l'indice `consuntivi { "righe.progettoId": 1, "righe.stato": 1, data: 1 }` esiste già dalla migrazione 007).
- `AuditService.registra(voci, session)` nel modulo `infrastruttura`, da chiamare dentro le stesse transazioni delle modifiche; utente dal contesto della richiesta, utenti tecnici `sistema:...` come per il tracciamento; `cronologia()` per leggerlo.
- Permessi globali `approvare` (abilitazione TL, PM o PMSenior) e `gestirePeriodi` (controller); regole pure `profiloDiApprovazione` e `motivoNegatoApprovazione` per riga, profilo, stato e azione.
- "Approvazioni" (chi ha `approvare`) e "Periodi" (controller) nella pagina iniziale della Consuntivazione, in preparazione; nel sottomenu arrivano con le pagine (D3, D4).

### D1 — Invio delle ore

- `POST /api/consuntivazione/consuntivi/invio` con un elenco di date (o un intervallo): tutte le righe in bozza o respinte di quei giorni passano a `inviata`, in una transazione con il controllo della versione di ogni giornata. Le righe di nuovo inviate dopo un rifiuto perdono il via libera del TL e la motivazione del rifiuto passa nello storico.
- Ritiro (vedi le decisioni): `POST /consuntivi/ritiro` riporta in bozza le righe ancora `inviata`, senza via libera.
- Regole nel salvataggio: righe inviate, approvate e chiuse non si modificano né si cancellano; nella stessa giornata si aggiungono righe nuove in bozza accanto a quelle già inviate.
- Pagina "Il mio consuntivo": stato di ogni riga (colore e sigla), celle in sola lettura sulle righe non modificabili, motivazione del rifiuto vicino alla riga respinta, pulsante **Invia** per il giorno o la settimana con il riepilogo di quante righe partono, contatore delle righe ancora in bozza nei giorni passati.

### D2 — Approvazioni (backend)

- `GET /api/consuntivazione/approvazioni?da=&a=&progetto=&attivita=&risorsa=&stato=`: righe dei progetti di cui l'utente è approvatore (tutti per il PMSenior), con risorsa, data, voce, tipologia, ore, nota, stato, via libera TL (chi e quando), segnale "attività non assegnata alla risorsa" calcolato in lettura; costo e tariffa solo a PM del progetto, PMSenior e controller. Al TL le righe `inviata`; al PM anche le `approvataTL` e, per il rifiuto, le `approvata`.
- `POST /api/consuntivazione/approvazioni` con `{ azione: 'viaLibera' | 'approva' | 'respingi', righe: [...], motivazione? }`: transizioni ammesse per profilo (TL: inviata → approvataTL o respinta; PM: inviata o approvataTL → approvata o respinta, approvata → respinta), motivazione obbligatoria per il rifiuto, aggiornamento delle sole righe interessate con `arrayFilters` e incremento della versione delle giornate, tutto in una transazione con scrittura dello storico.
- Esito per riga: le righe non più nello stato atteso (approvate o respinte da un altro nel frattempo) sono riportate come "saltate", senza far fallire le altre.
- Se la stessa persona è TL e PM sul progetto, approva direttamente come PM; il PMSenior approva come PM su tutti i progetti.
- Le righe su un progetto chiuso restano approvabili e respingibili.

### D3 — Pagina Approvazioni

- `/toolpm/consuntivazione/approvazioni`: elenco delle righe da lavorare con filtri per periodo, progetto, attività, risorsa e stato; raggruppamento per risorsa e settimana con i totali; colonna e filtro "via libera TL" per il PM; evidenza delle righe su attività non assegnate.
- Selezione multipla con **Via libera**, **Approva**, **Respingi** (finestra con la motivazione); conteggio delle righe in attesa nel sottomenu.
- Costo delle righe e totale del periodo solo per PM e PMSenior.

### D4 — Chiusura dei periodi

- Pagina `/toolpm/consuntivazione/periodi` per il controller: mesi con il conteggio delle righe per stato; **Chiudi** con anteprima e **Riapri** con motivazione obbligatoria.
- Chiusura: le righe `approvata` del mese passano a `chiusa`, il periodo diventa chiuso, tutto in una transazione con lo storico. Comportamento con le righe non approvate: vedi le decisioni.
- Mese chiuso: il backend rifiuta salvataggi, invii, approvazioni, rifiuti e ricalcolo sulle sue giornate; la pagina della risorsa mostra il mese chiuso.
- Riapertura: le righe `chiusa` tornano `approvata`, motivazione nello storico.

### D5 — Storico delle modifiche

- Registrazione nello storico di: invio, via libera, approvazione, rifiuto, ritiro, modifica di una riga respinta, ricalcolo, chiusura e riapertura (D1–D4); tariffe, tipologie, attività, approvatori e stato dei progetti (aggiunti qui ai servizi della fase 1 e 2).
- `GET /api/consuntivazione/storico?collezione=&documento=&riga=&operazione=&utente=&da=&a=` per controller e PMSenior (permesso `consultareStorico`), con una pagina Storico; dalla riga di un consuntivo si apre la sua cronologia (inviata, via libera, approvata, respinta con motivazione, corretta...).
- Cronologia della riga anche nel dettaglio di "Consuntivi delle risorse" e, per la risorsa, nella propria pagina (senza importi).

### D6 — Test e documentazione

- Test unitari delle transizioni per profilo e stato, del ritiro, delle regole del mese chiuso.
- Test di integrazione: invio di più giornate, via libera e approvazione con e senza TL, rifiuto e nuovo invio, approvazioni concorrenti e approvazione durante una modifica della risorsa, PMSenior su progetti non suoi, auto-approvazione, progetto chiuso, mese chiuso e riapertura, riservatezza dei costi per TL e PM, storico.
- Prova nel browser: risorsa che invia, TL che dà il via libera, PM che approva e respinge, risorsa che corregge e reinvia, controller che chiude il mese (estensione di `e2e/`).
- Aggiornamento di README, `architettura.md`, `backend.md`, `frontend.md`, `database.md` e della guida `consuntivazione.md`.

## Criteri di completamento

- [x] La risorsa invia uno o più giorni con un clic; le righe inviate, approvate e chiuse non si modificano né si cancellano.
- [x] Il TL dà il via libera o respinge solo sui progetti di cui è TL; il PM approva o respinge, con o senza via libera, solo sui propri progetti; il PMSenior su tutti.
- [x] Il rifiuto ha sempre una motivazione, che la risorsa vede; la riga corretta e reinviata riparte senza via libera del TL.
- [x] Due approvatori sulla stessa riga, o un approvatore e la risorsa sulla stessa giornata: nessun dato perso, la seconda azione riceve un esito chiaro.
- [x] Il TL non riceve mai tariffe né costi; il PM solo sui propri progetti.
- [x] Un mese chiuso non accetta modifiche, invii, approvazioni né ricalcoli; la riapertura richiede una motivazione.
- [x] Ogni modifica elencata in D5 compare nello storico con utente, data, valori prima e dopo.
- [x] Documentazione in `docs/` e Swagger aggiornati; `docker compose up` sul PC con la migrazione 008 eseguita.

## Decisioni confermate

Confermate il 23/11/2026, tutte come proposte, insieme alle contromisure dei rischi. Colmano punti che l'analisi lascia aperti (2, 3, 4, 5, 8, 9) o li precisano.

1. **Invio per giorni.** Si inviano giorni (uno, alcuni o la settimana): partono tutte le righe in bozza o respinte di quei giorni. Non si inviano righe singole, così una giornata non resta inviata a metà per dimenticanza.
2. **Ritiro di un invio.** La risorsa può ritirare le righe inviate finché nessuno le ha ancora toccate (né via libera né approvazione) e correggerle; dopo, solo un rifiuto gliele restituisce. Evita rifiuti fatti solo per correggere un errore appena commesso.
3. **Niente auto-approvazione.** Un approvatore non dà il via libera né approva o respinge le proprie ore: se è l'unico PM del progetto, le approva un PMSenior (o un altro PM aggiunto al progetto).
4. **Chiusura con righe non approvate.** Alla chiusura l'anteprima mostra le righe del mese ancora in bozza, inviate, con via libera o respinte. La chiusura è bloccata finché ce ne sono, con l'elenco e i collegamenti; il controller può **forzarla** con una motivazione: quelle righe restano nel loro stato, non contano nei costi e non si toccano più finché il mese non viene riaperto.
5. **Chiusura solo manuale e in ordine.** I mesi li chiude il controller, senza chiusure automatiche a data fissa, e in ordine: non si chiude giugno se maggio è aperto.
6. **Costi visibili al PM.** Nella pagina Approvazioni il PM vede costo e tariffa delle righe dei propri progetti, il PMSenior di tutti, il TL solo le ore, come dice il requisito di riservatezza dell'analisi.
7. **Ricalcolo sulle righe inviate e approvate.** Il ricalcolo del controller vale anche per le righe inviate e approvate, con lo storico, mai per quelle di un mese chiuso; lo stato della riga non cambia (come annunciato nel piano della fase 2).
8. **Nessuna email in fase 3.** Gli approvatori vedono il numero di righe in attesa nel sottomenu, le risorse il numero di righe respinte nella propria pagina. Le email, che richiedono un server di posta aziendale da configurare, sono rimandate a dopo la fase 4.
9. **Storico a scrittura esplicita.** Ogni servizio registra le proprie modifiche nella stessa transazione, invece di un intercettore generico: le righe incorporate nelle giornate non si prestano a un confronto automatico prima/dopo. Lo storico si conserva senza scadenza.
10. **Gli approvatori non modificano le ore.** L'approvatore approva o respinge; non cambia ore, tipologia o voce delle righe altrui, come nell'analisi.

## Rischi

| Rischio | Effetto | Contromisura |
| --- | --- | --- |
| Approvatore e risorsa sulla stessa giornata | Salvataggio della risorsa rifiutato per versione cambiata | Versione già in uso; la pagina ricarica tenendo le modifiche non salvate delle righe ancora modificabili e mostra lo stato aggiornato |
| Due approvatori sulle stesse righe | Doppia approvazione o rifiuto sovrascritto | Aggiornamento condizionato sullo stato atteso (`arrayFilters`); le righe cambiate nel frattempo tornano come "saltate" |
| Mesi che non si chiudono per righe dimenticate | Costi del mese incerti a lungo | Contatori nelle pagine, anteprima di chiusura con l'elenco e chiusura forzata motivata (decisione 4) |
| Progetti senza PM attivo | Righe che nessuno può approvare | Già impossibile attivare un progetto senza PM; i PMSenior approvano su tutti; elenco "senza approvatore" nella pagina Periodi |
| Storico troppo voluminoso | Collection grande negli anni | Un documento per azione su un insieme di righe (non per riga) dove possibile; indici su collection, documento e data |
| Righe in bozza della fase 2 | Molte righe da inviare al primo giorno | Pulsante Invia della settimana e contatore delle righe in bozza nei giorni passati |
