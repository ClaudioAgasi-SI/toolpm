# ToolPM — Piano della fase 2: consuntivazione

20/11/2026 · Claudio Agasi

> Piano di lavoro della fase 2 (confermato il 20/11/2026, nessun codice ancora scritto). Versione di lavoro con commenti: [documento su Claude](https://claude.ai/artifact/C1SidhKdbZLTC9ZL6Lpvzp). Le decisioni da cui parte sono in [analisi-consuntivazione.md](analisi-consuntivazione.md); il modo di lavorare è quello della [fase 1](piano-fase1.md).

La fase 2 apre la sezione **Consuntivazione**: il controller censisce tipologie di costo e tariffe, ogni risorsa inserisce le proprie ore giorno per giorno e il sistema ne calcola e memorizza il costo. Le righe restano in **bozza**: invio, approvazione su due livelli e chiusura dei periodi sono la fase 3; report ed EVM la fase 4.

## Avanzamento

| Blocco | Stato | Note |
| --- | --- | --- |
| C0 — Preparazione | Fatto | Commit b81d352. Modulo `consuntivazione/` su `/api/consuntivazione`, sezione nel menu con pagina iniziale per profilo, permessi `gestireTipologieCosto`, `gestireTariffe` (controller) e `consuntivare` (chi ha una risorsa), migrazione `007-consuntivazione` (4 collection con validatori e indici, 4 tipologie con ORDINARIA predefinita). Test: 113 backend (67 unitari + 46 di integrazione), 12 frontend. Migrazione eseguita sul PC il 20/11/2026. |
| C1 — Tipologie di costo | Fatto | Commit 65544fc. API `/api/consuntivazione/tipologie-costo` (lettura per tutti, modifica controller; codice fisso; una sola predefinita sempre attiva, cambio in transazione), pagina `/toolpm/consuntivazione/tipologie` con "Rendi predefinita". Test: 119 backend (67 + 52), 12 frontend; prova nel browser superata; provato sul PC il 20/11/2026. |
| C2 — Tariffe | Fatto | Commit f54b635. API tariffe standard e personalizzate (solo controller; periodi non sovrapposti, ruolo e tipologia fissi, cancellazione solo se non usate) e `tariffe-applicabili`; regole pure in `risoluzione.ts` (ruolo alla data, personalizzata poi standard, costo arrotondato al centesimo; esempio dell'analisi 10 ore = 334 € nei test); `TariffeService.risolutore()` pronto per C3. Pagina `/toolpm/consuntivazione/tariffe` con matrice ruolo × tipologia alla data e scheda per risorsa con le tariffe applicabili. Test: 136 backend (78 unitari + 58 di integrazione), 12 frontend; prova nel browser superata; provato sul PC il 20/11/2026. |
| C3 — Consuntivo (backend) | Fatto | Commit 7dc639d, e6ea9f0 (attività non assegnate con avviso). API `consuntivi` (lettura con riservatezza dei costi, salvataggio di una o più giornate in transazione con versione, `voci`, `proposte`); regole pure in `regole-giornata.ts`; costo fotografato con la tariffa del giorno, ricalcolato solo se cambiano tipologia o minuti; tipologia predefinita se manca. La copia del giorno o della settimana si sposta nella pagina (C5), senza API: le righe copiate si vedono prima di salvarle. Test: 151 backend (83 unitari + 68 di integrazione), 12 frontend. Nessuna migrazione nuova. |
| C4 — Vincoli su Comuni e permessi | Fatto (codice) | Consuntivo solo sui progetti su cui si lavora (attività assegnata, approvatrice, allocazione nel mese), con voci e proposte filtrate; centro di costo del progetto bloccato dopo il primo consuntivo (409, campo in sola lettura nel dettaglio del progetto); TL modifica skill e certificazioni anche delle risorse con ore sui suoi progetti (backend e pagina del Pianificatore); matrice dei profili estesa a 8 operazioni della Consuntivazione. Attività e tipologie non hanno cancellazione: il vincolo è già rispettato. Test: 164 backend (84 unitari + 80 di integrazione), 12 frontend. Da fare sul PC: aggiornare e provare il dettaglio di un progetto. |
| C5 — Il mio consuntivo (frontend) | Da fare | |
| C6 — Righe da valorizzare e ricalcolo | Da fare | |
| C7 — Test e documentazione | Da fare | |

## Obiettivo e perimetro

Alla fine della fase 2 una risorsa inserisce le proprie ore quando vuole, un giorno alla volta o una settimana intera (una settimana tipica in meno di due minuti), scegliendo progetto o attività e tipologia di costo; ogni riga salvata porta il costo calcolato con la tariffa giusta, "fotografato" insieme alla tariffa usata e alla sua provenienza. Il controller gestisce tipologie e tariffe e vede le righe ancora senza tariffa.

**Compreso nella fase 2** (requisiti dell'analisi)

- RF-04 Tipologie di costo, con le quattro iniziali (ordinaria, straordinaria, straordinaria notturna, straordinaria festiva).
- RF-05 Tariffe standard per ruolo e RF-06 tariffe personalizzate per risorsa, con periodi di validità non sovrapposti.
- RF-07 Consuntivo giornaliero, RF-08 vista settimanale con i progetti proposti dal Pianificatore, RF-09 copia del giorno o della settimana precedente.
- RF-13 calcolo del costo, RF-20 consuntivazione su attività (progetto ricavato dall'attività, centro di costo copiato sulla riga).
- RF-18 ricalcolo dopo una correzione di tariffa, e l'elenco delle righe "da valorizzare" per il controller (vedi le decisioni da confermare).
- Regole di business della giornata: passi di 15 minuti, minimo 0,25 h, massimo 24 h al giorno, avviso sulle ore ordinarie oltre l'orario contrattuale, niente righe su progetti Chiusi, attività chiuse, tipologie disattivate o fuori dalle date di ingresso e uscita della risorsa, opzione "solo su attività".
- I vincoli che la fase 1 aveva rimandato al primo consuntivo: centro di costo del progetto bloccato, attività non spostabile, tipologie usate non cancellabili, TL che modifica le caratteristiche anche delle risorse con ore sui suoi progetti.

**Fuori dalla fase 2**

- Invio delle giornate, approvazione TL e PM, rifiuto, chiusura dei mesi, storico delle modifiche in `audit_log` (fase 3).
- Report dei costi per progetto, attività e centro di costo, pianificato contro consuntivato, EVM, esportazioni (fase 4).
- Ferie, permessi e malattia; paghe e HR (esclusi dall'analisi).

## Punto di partenza

| Area | Stato a fine fase 1 (commit `4a9c6a8`) | Cosa cambia nella fase 2 |
| --- | --- | --- |
| Backend | Moduli `auth`, `permessi`, `infrastruttura`, `comuni`, `pianificatore` | Nuovo modulo `consuntivazione/` su `/api/consuntivazione` |
| Frontend | Sezioni Pianificatore e Anagrafiche, accesso obbligatorio | Nuova sezione Consuntivazione su `/toolpm/consuntivazione` |
| Dati | `risorse` con `storicoRuoli` e `oreContrattualiGiorno`, `ruoli`, `progetti`, `attivita`, `parametri` (`oreGiorno`, `soglieEvm`) | Collection `tipologie_costo`, `tariffe_standard`, `tariffe_personalizzate`, `consuntivi` |
| Permessi | Ruolo `controller` e permesso globale `gestireParametri`; TL sulle risorse allocate nel Pianificatore | Permessi `gestireTipologieCosto`, `gestireTariffe`, `consuntivare`; TL anche sulle risorse con ore consuntivate |
| Progetti | Centro di costo ancora modificabile | Centro di costo bloccato dopo il primo consuntivo |
| Test | 107 backend (67 unitari + 40 di integrazione), 12 frontend | Test della risoluzione delle tariffe, delle regole della giornata, della concorrenza, dei permessi |

## Ordine dei lavori

| Blocco | Dipende da |
| --- | --- |
| C0 Preparazione | — |
| C1 Tipologie di costo | C0 |
| C2 Tariffe | C1 |
| C3 Consuntivo (backend) | C2 |
| C4 Vincoli su Comuni e permessi | C3 |
| C5 Il mio consuntivo (frontend) | C3 (può procedere insieme a C4) |
| C6 Righe da valorizzare e ricalcolo | C3 |
| C7 Test e documentazione | tutti |

Ogni blocco si chiude con codice, test, documentazione in `docs/` aggiornata e pubblicata su GitHub, ed è rilasciabile da solo. C1 e C2 portano già le loro pagine, così il controller può caricare tipologie e tariffe vere mentre si lavora sul consuntivo.

## Blocchi di lavoro

### C0 — Preparazione

- Modulo `backend/src/consuntivazione/` registrato con `RouterModule` su `/api/consuntivazione`; voce "Consuntivazione" in `sezioni.ts` e in `app.routes.ts` (`frontend/src/app/consuntivazione/`), visibile a chi ha accesso.
- Migrazione `007-consuntivazione`: collection `tipologie_costo`, `tariffe_standard`, `tariffe_personalizzate`, `consuntivi` con validatori `$jsonSchema` e gli indici dell'analisi; le quattro tipologie iniziali (`ORDINARIA`, `STRAORDINARIA`, `STRAORD_NOTTURNA`, `STRAORD_FESTIVA`).
- Nuovi permessi globali in `regole.ts`: `gestireTipologieCosto` e `gestireTariffe` (controller), `consuntivare` (utente collegato a una risorsa).
- Backup del database `toolpm` prima di eseguire la migrazione sul PC.

### C1 — Tipologie di costo

- API `GET/POST/PUT /api/consuntivazione/tipologie-costo`: codice (unico, non modificabile), descrizione, ordine, categoria (`ordinaria` o `straordinaria`), attiva, predefinita (una sola tipologia attiva è la predefinita: all'inizio ORDINARIA). Nessuna cancellazione: si disattiva; la predefinita non si disattiva finché non se ne sceglie un'altra.
- Lettura per tutti gli utenti con accesso (servono alla griglia), scrittura solo controller.
- Pagina `/toolpm/consuntivazione/tipologie` (riuso del componente delle anagrafiche semplici, con i campi in più).

### C2 — Tariffe

- API `/api/consuntivazione/tariffe-standard?ruolo=` e `/api/consuntivazione/risorse/:id/tariffe-personalizzate`: tipologia, `validoDal`, `validoAl` facoltativa, `centesimiOra` intero. Solo controller, in lettura e scrittura.
- Nessuna sovrapposizione di periodi per ruolo + tipologia e per risorsa + tipologia (controllo nel servizio, dentro una transazione).
- `TariffeService.risolvi(risorsa, data)`: ruolo alla data da `storicoRuoli`, poi per ogni tipologia la personalizzata, altrimenti la standard del ruolo, altrimenti nessuna. La scelta è una funzione pura, testata a parte; il caricamento legge tutto in una volta per una settimana intera.
- API `GET /api/consuntivazione/risorse/:id/tariffe-applicabili?data=` con la provenienza di ogni tariffa.
- Pagina `/toolpm/consuntivazione/tariffe`: tariffe standard per ruolo (tabella ruolo × tipologia con storico) e personalizzate per risorsa; importi inseriti in euro, salvati in centesimi.

### C3 — Consuntivo (backend)

- Schema `consuntivi`: un documento per risorsa e giornata (indice unico `risorsaId + data`), `mese`, `versione`, righe incorporate con `progettoId`, `attivitaId`, `centroCostoId`, `tipologiaId`, `tipologiaCodice`, `minuti`, `nota`, `stato` (in fase 2 sempre `bozza`), `fonteTariffa`, `tariffaCentesimiOra`, `costoCentesimi`, `modificatoIl`, `modificatoDa`. I campi di approvazione esistono già nello schema ma restano vuoti fino alla fase 3.
- API `GET /api/consuntivazione/consuntivi?da=&a=` (le proprie giornate; il controller anche con `risorsa=`), `PUT /api/consuntivazione/consuntivi/:data` (righe della giornata, con la `versione` letta), `PUT /api/consuntivazione/consuntivi` (più giornate insieme per la settimana, in una transazione), `GET /api/consuntivazione/consuntivi/voci` (progetti non chiusi con le attività attive, quelle assegnate alla risorsa segnate e in testa), `GET /api/consuntivazione/consuntivi/proposte?settimana=` (progetti su cui la risorsa è allocata nel Pianificatore nei mesi della settimana, più quelli già usati la settimana prima).
- Al salvataggio: attività → progetto ricavato dal backend (un progetto diverso dal client è rifiutato), centro di costo copiato dal progetto, tariffa risolta e costo calcolato con `round(minuti × centesimiOra / 60)`; senza tariffa il costo resta vuoto e la riga è "da valorizzare".
- Regole della giornata come nell'analisi; l'ora ordinaria oltre l'orario contrattuale è un avviso nella risposta, non un errore.
- Riservatezza: le risposte alla risorsa non contengono mai tariffe né importi (né `fonteTariffa`); il controller li vede.
- Concorrenza: salvataggio condizionato sulla `versione`; se è cambiata, 409 e la pagina ricarica.

### C4 — Vincoli su Comuni e permessi

- Consuntivo solo sui progetti su cui la risorsa lavora (decisione 5 rivista): controllo al salvataggio delle righe nuove o cambiate, voci e proposte filtrate per i mesi della settimana.
- Centro di costo di un progetto non più modificabile dopo il primo consuntivo (oggi modificabile); in Anagrafiche il campo diventa di sola lettura con la spiegazione.
- Attività e tipologie usate in un consuntivo non si cancellano (si chiudono o si disattivano); progetti e centri di costo già oggi non si cancellano.
- `regole.motivoNegatoModificaRisorsa` e `filtro` del TL: una risorsa "lavora sui suoi progetti" anche se ha ore consuntivate su un progetto di cui è TL, come previsto dalla fase 1.
- Aggiornamento di `profili.integrazione.spec.ts` con le operazioni della Consuntivazione per tutti i profili.

### C5 — Il mio consuntivo (frontend)

- Pagina `/toolpm/consuntivazione/settimana`: a scelta della risorsa vista del singolo giorno oppure vista settimanale (griglia righe progetto o attività + tipologia × giorni da lunedì a domenica), totali per riga e per giorno, ore in formato `h:mm` o decimale con passi di 15 minuti, nota per cella.
- Scelta della riga da elenco (progetti non chiusi, con le loro attività attive), righe proposte dal Pianificatore, copia della settimana precedente, navigazione tra giorni e settimane, salvataggio delle sole giornate modificate (anche una sola) in un colpo; nessun obbligo di compilare la settimana intera.
- Attività assegnate alla risorsa in cima all'elenco di scelta; avviso quando se ne sceglie una non assegnata.
- Avvisi visibili: ore ordinarie oltre l'orario contrattuale, giorno oltre 24 h, progetto "solo su attività", ricarica dopo un conflitto di versione.
- Ogni riga nuova parte con la tipologia predefinita (ordinaria), che la risorsa può cambiare. Nessun importo mostrato alla risorsa. Per la stessa risorsa, aggiornamento della percentuale delle attività a cui è assegnata (API già pronta dalla fase 1).

### C6 — Righe da valorizzare e ricalcolo

- Pagina `/toolpm/consuntivazione/da-valorizzare` per il controller: righe senza tariffa, raggruppate per risorsa, ruolo e tipologia, con il motivo (ruolo mancante alla data, tipologia senza tariffa).
- `POST /api/consuntivazione/ricalcolo`: con `anteprima` mostra le righe dell'intervallo il cui costo cambierebbe (prima e dopo); con conferma le aggiorna in una transazione, con l'utente del controller nel tracciamento. Il ricalcolo tocca anche le righe da valorizzare per cui ora esiste una tariffa.
- In fase 2 le righe sono tutte in bozza; dalla fase 3 il ricalcolo varrà anche per le righe approvate, sempre su conferma del controller.

### C7 — Test e documentazione

- Test unitari della risoluzione: personalizzata parziale, cambio di ruolo a metà mese, cambio di tariffa, tariffa mancante, nuova tipologia, arrotondamenti al centesimo.
- Test di integrazione: regole della giornata, attività e progetto coerenti, progetto Chiuso, "solo su attività", date di ingresso e uscita, conflitto di versione, riservatezza delle risposte, permessi per profilo.
- Prova nel browser (Playwright) del percorso controller (tipologie, tariffe) e risorsa (settimana, copia, salvataggio).
- Aggiornamento di `architettura.md`, `backend.md`, `frontend.md`, `database.md`, README e Swagger; nuova guida `docs/consuntivazione.md` per controller e risorse.

## Criteri di completamento

- [ ] Il controller crea, modifica e disattiva tipologie di costo; nessun altro profilo può farlo.
- [ ] Le tariffe standard e personalizzate non si sovrappongono; `tariffe-applicabili` restituisce per ogni tipologia la tariffa giusta e la provenienza, anche con cambio di ruolo a metà mese.
- [ ] Ogni riga salvata ha minuti, tariffa, provenienza e costo fotografati, oppure risulta "da valorizzare"; l'esempio dell'analisi (10 ore, 334 €) dà lo stesso risultato in un test.
- [ ] Le regole della giornata sono rispettate dal backend (15 minuti, 24 h, progetto Chiuso, attività chiusa, tipologia disattivata, date della risorsa, "solo su attività").
- [ ] La risorsa non riceve mai tariffe né importi in nessuna risposta.
- [ ] Due salvataggi concorrenti della stessa giornata: il secondo riceve 409, nessun dato perso.
- [ ] Il centro di costo di un progetto con consuntivi non si può più cambiare.
- [ ] Una settimana tipica si inserisce e si salva in meno di due minuti nella pagina della risorsa.
- [ ] Il ricalcolo mostra l'anteprima e, confermato, aggiorna solo le righe interessate.
- [ ] Documentazione in `docs/` e Swagger aggiornati; `docker compose up` sul PC con la migrazione 007 eseguita.

## Decisioni confermate

Confermate il 20/11/2026, insieme alle contromisure dei rischi della tabella; i punti 8, 9 e 10 sono precisazioni dell'utente, il punto 5 è stato rivisto. Colmano punti che l'analisi lascia aperti o che cambiano l'ordine delle fasi.

1. **Ricalcolo (RF-18) in fase 2.** Il piano di rilascio dell'analisi non lo assegna a una fase precisa; lo porto in fase 2 perché senza ricalcolo le righe salvate prima che il controller inserisca una tariffa resterebbero "da valorizzare" per sempre.
2. **Storico delle modifiche (`audit_log`) in fase 3**, come nell'analisi: in fase 2 su tariffe e tipologie resta il tracciamento dell'ultimo salvataggio; le tariffe non si sovrascrivono di fatto, perché una correzione si fa chiudendo un periodo e aprendone un altro.
3. **Date di progetto e attività non bloccanti.** Si consuntiva su progetti In valutazione e In corso e su attività attive, a qualsiasi data; le date di inizio e fine servono all'EVM, non alla consuntivazione. Bloccanti restano solo le date di ingresso e uscita della risorsa.
4. **Niente ore nel futuro.** Si consuntiva fino alla data di oggi; i giorni futuri della settimana sono in sola lettura.
5. **Solo sui progetti su cui si lavora** (decisione rivista il 20/11/2026). La risorsa consuntiva su un progetto non chiuso solo se ci lavora: è assegnata ad almeno un'attività del progetto, oppure è allocata sul progetto nel Pianificatore nel mese della riga (percentuale maggiore di zero), oppure ne è approvatrice. È la stessa definizione usata per il TL e le caratteristiche delle risorse. Il backend rifiuta le righe nuove o cambiate sugli altri progetti; la pagina propone solo quelli ammessi. Dentro un progetto ammesso vale la decisione 10.
6. **Salvataggio di più giornate in un'unica transazione** (`PUT /api/consuntivazione/consuntivi`), in aggiunta al salvataggio della singola giornata previsto dall'analisi.
7. **Chi consuntiva:** solo gli utenti collegati a una risorsa e solo per sé stessi. Un amministratore senza risorsa non vede la pagina; nessuno inserisce ore per conto di altri.
8. **Nessun obbligo di ritmo.** La risorsa può consuntivare un giorno alla volta oppure per settimana, come preferisce: la pagina offre la vista del giorno e quella della settimana, e salva solo le giornate modificate. Nessun controllo pretende la settimana completa.
9. **Tipologia ordinaria proposta di default.** Ogni riga nuova parte con la tipologia predefinita, ordinaria, e la risorsa può cambiarla (straordinaria, notturna, festiva e le altre). Serve a compilare più in fretta e con meno errori. La predefinita è un'impostazione della tipologia, modificabile dal controller; se la richiesta arriva senza tipologia, anche il backend usa la predefinita.
10. **Attività non assegnate: permesse, con avviso.** Dentro i progetti su cui lavora (decisione 5), la risorsa può consuntivare su tutte le attività attive, anche dove non è tra le risorse assegnate. Le voci consuntivabili indicano le attività assegnate alla risorsa, e la pagina le mostra per prime; scegliendo un'attività non assegnata compare un avviso, che arriva anche nella risposta del salvataggio. Dalla fase 3 l'approvatore vedrà evidenziate quelle righe.

| Rischio | Effetto | Contromisura |
| --- | --- | --- |
| Tariffe non ancora disponibili quando le risorse iniziano | Molte righe "da valorizzare" | Pagina del controller e ricalcolo (C6); le pagine di C1 e C2 escono prima del consuntivo |
| Risorse senza ruolo nello storico | Nessuna tariffa standard applicabile | Elenco delle risorse senza ruolo nella pagina "da valorizzare"; il ruolo lo completano PM e PMSenior in Anagrafiche |
| Errori di arrotondamento | Totali diversi dai report futuri | Minuti e centesimi interi, un solo arrotondamento per riga, test sull'esempio dell'analisi |
| Griglia lenta o scomoda | Le risorse non consuntivano | Salvataggio della settimana in un colpo, copia, proposte dal Pianificatore, prova nel browser |
