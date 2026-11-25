# ToolPM — Piano della fase 4: report

25/11/2026 · Claudio Agasi

> Piano di lavoro della fase 4, confermato il 25/11/2026 (decisioni 1–10 e, dalla revisione dei rischi, 11–13). Versione di lavoro con commenti: [documento su Claude](https://claude.ai/artifact/4S4oqSmfAKxDCETE85qP4v). Le regole da cui parte sono in [analisi-consuntivazione.md](analisi-consuntivazione.md) (requisiti RF-14…17, RF-21, RF-22, RF-24, RF-25, RF-29…32, "Calcolo dell'avanzamento (EVM)", "Aggregazione dei costi"); il modo di lavorare è quello delle fasi [2](piano-fase2.md) e [3](piano-fase3.md).

La fase 4 trasforma le ore approvate in **informazioni per decidere**: quanto costa ogni progetto e ogni centro di costo, come stanno andando tempi e costi rispetto alle stime (indicatori Earned Value), quanto del pianificato è stato davvero lavorato, con le esportazioni in Excel e CSV. Non cambia come si inseriscono o approvano le ore.

## Avanzamento

| Blocco | Stato | Note |
| --- | --- | --- |
| E0 — Preparazione | In corso | |
| E1 — Scheda costi del progetto | Da fare | |
| E2 — Indicatori EVM | Da fare | |
| E3 — Andamento nel tempo | Da fare | |
| E4 — Report dei costi | Da fare | |
| E5 — Pianificato e consuntivato | Da fare | |
| E6 — Esportazioni | Da fare | |
| E7 — Test e documentazione | Da fare | |

## Obiettivo e perimetro

Alla fine della fase 4:

- il PM apre un suo progetto e vede stime e consuntivato a confronto (giorni ed euro), il dettaglio per attività, risorsa, ruolo, tipologia e mese, e gli indicatori Earned Value con lo stato di tempi e costi e il loro andamento;
- un elenco dei progetti mostra a colpo d'occhio quali sono in ritardo o sopra budget;
- il controller e il PMSenior vedono i costi per centro di costo, progetto e attività, e il confronto tra pianificato e consuntivato;
- ogni report si scarica in Excel o CSV, e così le righe di dettaglio.

**Compreso nella fase 4** (requisiti dell'analisi)

- RF-14 e RF-22 Scheda costi del progetto e costo per attività; RF-24 e RF-25 stime contro consuntivato; RF-21 ribaltamento attività → progetto → centro di costo, senza doppi conteggi.
- RF-15 Costo per centro di costo, con il dettaglio per progetto.
- RF-16 Pianificato (allocazioni del Pianificatore) contro consuntivato, per risorsa, progetto e mese.
- RF-17 Esportazione in Excel e CSV dei report e delle righe di dettaglio.
- RF-29, RF-30, RF-32 Indicatori EVM di progetto e attività, con lo stato di tempi e costi; RF-31 andamento giornaliero salvato ogni notte.
- Riservatezza: il TL vede ore, giorni, indici e stati, mai gli euro; il PM i propri progetti; PMSenior e controller tutti.

**Fuori dalla fase 4**

- Integrazioni con contabilità, paghe, ERP (fase 5, facoltativa: collection `esportazioni`, script di estrazione).
- Pianificato tratto dalle allocazioni per il calcolo del PV dell'EVM (l'analisi lo lascia "in futuro": in fase 4 il PV resta lineare tra le date).
- Notifiche via email.

## Punto di partenza

| Area | Stato a fine fase 3 (commit `bd5caf2`) | Cosa cambia nella fase 4 |
| --- | --- | --- |
| Costi | Fotografati su ogni riga (`costoCentesimi`, null = da valorizzare); solo le righe `approvata` e `chiusa` sono costi validi | Si sommano nei report, senza ricalcolarli |
| Progetti | Quattro stime, date, stato, percentuale con storico (`avanzamenti`); attività con `stimaGiorni`, date e risorse assegnate | Letti dalla scheda e dall'EVM |
| Pianificatore | Allocazioni `planned` (mese, progetto, percentuale) sulle risorse | Lette per il pianificato |
| Parametri | `oreGiorno` (8) e `soglieEvm` (0,85 / 0,95 / 1,05) già presenti | Usati da EVM e report |
| Dati | Indici su `righe.progettoId`, `righe.centroCostoId`, `righe.attivitaId` + `data` | Nuova collection `evm_giornalieri` |
| Permessi | `approvare`, `gestireTariffe`, `consultareStorico`… | Regole per vedere un report e i suoi euro |
| Test | 208 backend, 18 frontend, prove nel browser `consuntivazione.py` e `controllo.py` | Calcoli EVM sull'esempio TIMBUFE e sui casi limite, aggregazioni, permessi, esportazioni |

## Ordine dei lavori

| Blocco | Dipende da |
| --- | --- |
| E0 Preparazione | — |
| E1 Scheda costi del progetto | E0 |
| E2 Indicatori EVM | E1 (si aggiungono alla scheda e all'elenco) |
| E3 Andamento nel tempo | E2 |
| E4 Report dei costi | E0 |
| E5 Pianificato e consuntivato | E0 |
| E6 Esportazioni | E1, E4, E5 |
| E7 Test e documentazione | tutti |

Ogni blocco si chiude con codice, test, documentazione in `docs/` aggiornata e pubblicata su GitHub, ed è rilasciabile da solo.

## Blocchi di lavoro

### E0 — Preparazione

- Migrazione `009-report`: collection `evm_giornalieri` (indicatori del giorno nelle due viste, approvata e provvisoria) con validatore e indice unico `{ progettoId: 1, data: 1 }`; collection `esecuzioni_batch` (registro delle esecuzioni delle procedure pianificate: procedura, inizio, fine, giorni elaborati, ultimo giorno completato, esito, avvisi, motivo); indice `consuntivi { "righe.stato": 1, data: 1 }` per i report di periodo.
- Modulo `src/consuntivazione/report/` con le funzioni di aggregazione comuni, nelle due viste (decisione 11): **approvata** (righe `approvata` e `chiusa`) e **provvisoria** (anche `bozza`, `inviata`, `approvataTL`; mai le `respinta`); minuti, giorni, costo, righe da valorizzare.
- Regole dei permessi: `puoVedereReportProgetto` (approvatori del progetto, PMSenior, controller) e `vedeEuroProgetto` (PM del progetto, PMSenior, controller; mai il TL); permesso globale `vedereReport` (abilitazione TL, PM, PMSenior o controller) per il menu.
- Pagina iniziale e sottomenu: voce **Progetti** (elenco e scheda) e **Report** (costi, pianificato).

### E1 — Scheda costi del progetto

- `GET /api/consuntivazione/report/progetti` — elenco dei progetti visibili all'utente (filtri: stato, cliente, centro di costo, testo): stime, consuntivato dall'inizio (giorni e, a chi può, euro), percentuale; dal blocco E2 anche gli stati di tempi e costi.
- Tutte le API dei report accettano `vista=approvata|provvisoria` (predefinita: approvata); la risposta dice la vista usata e l'ora del calcolo.
- `GET /api/consuntivazione/report/progetti/:id?da=&a=` — scheda: stime contro consuntivato dall'inizio e nel periodo (giorni ed euro), righe ancora in attesa o da valorizzare (numero e ore, a parte), dettaglio per attività con la sua stima in giorni (più "senza attività"), per risorsa, ruolo, tipologia e mese.
- Pagine `/toolpm/consuntivazione/progetti` (elenco) e `/progetti/:id` (scheda), con collegamento dal dettaglio del progetto nelle Anagrafiche; interruttore **Includi le ore non ancora approvate** e, nella vista provvisoria, un'etichetta "Dati provvisori" ben visibile.

### E2 — Indicatori EVM

- `evm.ts` con funzioni pure: BAC (stima definitiva, altrimenti manageriale), PV lineare tra le date, EV dalla percentuale, AC dalle righe approvate fino alla data, SV, CV, SPI, CPI, EAC, ETC, VAC, TCPI, in euro e in giorni; stati con le soglie di `soglieEvm`; casi "non calcolabile" (stima mancante, date mancanti, PV o AC a zero). Test sull'esempio TIMBUFE dell'analisi.
- Indicatori delle attività (RF-32): con stima in giorni EV, AC e CPI in giorni; SPI e stato dei tempi solo con date di inizio e fine.
- `GET /api/consuntivazione/report/progetti/:id/evm?al=` — progetto e attività alla data; al TL senza euro. Solo progetti In corso e Chiusi.
- Nella scheda: riquadro degli indicatori con gli stati colorati, spiegazione in parole ("al ritmo attuale costerà…"), media delle percentuali delle attività pesata sulla stima, per riferimento. Nell'elenco: colonne stato tempi e stato costi.

### E3 — Andamento nel tempo

- Procedura notturna nel backend (alle 2:00, ora italiana) con l'utente tecnico `sistema:evm`, che **riparte da dove era arrivata** (decisione 12): legge in `esecuzioni_batch` l'ultimo giorno completato ed elabora i giorni successivi fino a ieri, uno alla volta, salvando per ogni progetto In corso gli indicatori del giorno nelle due viste (percentuale presa dallo storico `avanzamenti`, stime attuali).
- Ogni giorno si chiude in una transazione insieme all'avanzamento del registro: dopo un fermo si riparte dal primo giorno non concluso, senza buchi né doppioni (indice unico su progetto e giorno).
- Registro di ogni esecuzione: inizio, fine, giorni elaborati, esito (completata, completata con avvisi, fallita) con il motivo; un progetto con dati non validi produce un avviso e non ferma gli altri. Un'esecuzione "in corso" fa da blocco contro esecuzioni contemporanee (notturna e all'avvio); se resta in corso oltre un'ora si considera interrotta.
- Primo avvio: dalla data di inizio più vecchia tra i progetti In corso, al massimo un anno indietro. All'avvio del backend la procedura recupera i giorni mancanti.
- `GET /api/consuntivazione/report/progetti/:id/evm/andamento?da=&a=&vista=` — serie giornaliera, con **"dati aggiornati al"** (ultimo giorno completato) ed eventuale avviso se l'ultima esecuzione non si è conclusa (decisione 13).
- Nella pagina Periodi, per il controller: ultima esecuzione con esito e motivo, giorni elaborati, pulsante **Esegui ora**.
- Nella scheda: grafico di PV, EV e AC nel tempo e grafico di SPI e CPI con le fasce delle soglie (al TL in giorni), nella vista scelta, con la dicitura "Andamento aggiornato al …".

### E4 — Report dei costi

- `GET /api/consuntivazione/report/costi?da=&a=&raggruppa=cdc,progetto,attivita|risorsa|ruolo|tipologia|mese&centroCosto=&progetto=` — ore, giorni e costi annidati (es. centro di costo → progetto → attività), con totali di ogni livello e righe da valorizzare a parte. Ogni riga conta una volta per livello (RF-21).
- Visibilità: controller e PMSenior tutto; il PM i propri progetti; il TL i propri progetti solo in ore e giorni.
- Pagina `/toolpm/consuntivazione/report/costi`: periodo, scelta dei livelli, tabella espandibile con i totali.

### E5 — Pianificato e consuntivato

- `GET /api/consuntivazione/report/pianificato?da=AAAAMM&a=AAAAMM&risorsa=&progetto=` — per risorsa, progetto e mese: ore pianificate (percentuale di allocazione × giorni lavorativi del mese × ore contrattuali della risorsa, entro le date di ingresso e uscita), ore consuntivate approvate, ore ancora in attesa, scostamento in ore e in percentuale; ore consuntivate su progetti non allocati come voce a parte.
- Visibilità come E4 (solo ore: niente euro in questo report).
- Pagina `/toolpm/consuntivazione/report/pianificato`: tabella risorsa × mese con il dettaglio per progetto, scostamenti evidenziati.

### E6 — Esportazioni

- `?formato=xlsx|csv` su elenco progetti, scheda del progetto, report costi e pianificato: stessi filtri e stessa riservatezza delle pagine (gli euro escono solo a chi li vede).
- `GET /api/consuntivazione/report/righe?da=&a=&progetto=&centroCosto=&risorsa=&formato=` — righe di dettaglio approvate e chiuse (data, risorsa, ruolo, progetto, attività, centro di costo, tipologia, ore, tariffa e costo a chi può, nota, stato, approvazione), al massimo un anno per volta.
- Excel con una scheda per livello e i totali; CSV con separatore `;` e decimali con la virgola, come li apre Excel in italiano. Ogni file riporta la vista (dati approvati o provvisori), il periodo e la data e ora di estrazione; il nome del file contiene "provvisorio" per la vista provvisoria. Pulsante **Scarica** nelle pagine.

### E7 — Test e documentazione

- Test unitari: formule EVM (esempio TIMBUFE e casi limite), giorni lavorativi e festività, aggregazioni (doppi conteggi), formati CSV.
- Test di integrazione: scheda e report con righe in tutti gli stati, riservatezza per TL, PM, PMSenior e controller, EVM alla data con lo storico delle percentuali, recupero dell'andamento, esportazioni.
- Prova nel browser `e2e/report.py`: PM che apre la scheda, vede gli indicatori e scarica l'Excel; TL senza euro; controller con il report per centro di costo.
- Prestazioni: report annuale con dati di prova realistici (200 risorse, 130.000 righe) in pochi secondi.
- Guida `consuntivazione.md` (sezione Report), README, `architettura.md`, `backend.md`, `frontend.md`, `database.md`.

## Criteri di completamento

- [ ] La scheda del progetto mostra stime e consuntivato (giorni ed euro) dall'inizio e nel periodo, con il dettaglio per attività ("senza attività" compresa), risorsa, ruolo, tipologia e mese; i totali coincidono con la somma delle righe approvate.
- [ ] Gli indicatori EVM dell'esempio TIMBUFE danno gli stessi valori dell'analisi; i casi senza stima o senza date sono "non calcolabili" senza errori.
- [ ] Stato di tempi e costi colorato nella scheda e nell'elenco dei progetti; soglie lette dai parametri.
- [ ] L'andamento giornaliero si salva ogni notte nelle due viste, riparte dall'ultimo giorno completato dopo un fermo, registra ogni esecuzione con esito e motivo; la scheda lo mostra nei grafici con "aggiornato al".
- [ ] Ogni report si vede nella vista approvata (predefinita) e in quella provvisoria, chiaramente indicata in pagina e nelle esportazioni.
- [ ] Il report dei costi per centro di costo, progetto e attività non conta due volte nessuna riga e rispetta la visibilità di ogni profilo.
- [ ] Il confronto pianificato/consuntivato usa giorni lavorativi e ore contrattuali e segnala le ore su progetti non allocati.
- [ ] Ogni report e le righe di dettaglio si scaricano in Excel e CSV, con la stessa riservatezza delle pagine.
- [ ] Il TL non riceve mai euro in nessuna risposta o esportazione.
- [ ] Report annuale su tutte le risorse in pochi secondi.
- [ ] Documentazione in `docs/` e Swagger aggiornati; `docker compose up` sul PC con la migrazione 009 eseguita.

## Decisioni confermate

Confermate il 25/11/2026, tutte come proposte. Colmano punti che l'analisi lascia aperti o li precisano.

1. **Quali righe contano.** Costi, EVM e report sommano solo le righe approvate dal PM e quelle dei mesi chiusi, come dice l'analisi. Le righe in attesa (bozza, inviate, con via libera, respinte) e quelle approvate ma da valorizzare compaiono a parte, come numero e ore, per sapere quanto manca.
2. **Ore pianificate.** Percentuale di allocazione × giorni lavorativi del mese (lunedì–venerdì meno le festività nazionali italiane, Pasquetta compresa) × ore contrattuali giornaliere della risorsa (se mancano, il parametro `oreGiorno`), limitate alle date di ingresso e uscita. Le ferie non si conoscono: non si tolgono.
3. **Consuntivato nel confronto con il pianificato.** Si confrontano le ore approvate; le ore ancora in attesa compaiono in una colonna a parte, così il confronto è utile anche a metà mese.
4. **Chi vede cosa.** Scheda e indicatori: approvatori del progetto, PMSenior, controller. Report dei costi e pianificato: controller e PMSenior tutto, PM e TL i propri progetti. Il TL vede ore, giorni, indici e stati, mai euro (anche nelle esportazioni).
5. **Andamento notturno nel backend.** La procedura gira dentro il backend (pianificata con `@nestjs/schedule`) e recupera da sola i giorni mancanti all'avvio, così non serve un servizio a parte sul PC. Per i giorni recuperati la percentuale viene dallo storico; le stime sono quelle attuali.
6. **Dove si vede lo stato dei progetti.** In una nuova pagina **Progetti** della Consuntivazione (elenco con consuntivato, stime e stati) che porta alla scheda; nelle Anagrafiche resta solo un collegamento "Costi e avanzamento" dal dettaglio del progetto. Così le Anagrafiche restano leggere.
7. **Formati delle esportazioni.** Excel (.xlsx) e CSV (separatore `;`, decimali con la virgola, codifica UTF-8 con BOM), generati dal backend con le stesse regole delle pagine. Le righe di dettaglio sono solo quelle approvate e chiuse, al massimo un anno per esportazione.
8. **Periodo predefinito.** La scheda mostra sempre i totali dall'inizio del progetto e, per il dettaglio, l'anno in corso, modificabile; i report partono dal mese corrente.
9. **Giorni dai minuti.** Nei report e nell'EVM un giorno vale `oreGiorno` ore (8), come le stime; le ore contrattuali della risorsa servono solo al pianificato. Come nell'analisi.
10. **Nessun dato precalcolato oltre all'andamento.** Report e indicatori si calcolano al momento dalla collection dei consuntivi; si salvano solo gli indicatori giornalieri per i grafici. Se le prove di prestazione lo richiedessero, si aggiungerebbe un riepilogo mensile.

Aggiunte il 25/11/2026 dalla revisione dei rischi, su proposta dell'utente:

11. **Due viste: dati approvati e dati provvisori.** Ogni report, la scheda, gli indicatori, l'andamento e le esportazioni esistono in due viste. La **approvata** (predefinita e ufficiale) somma le righe approvate e chiuse; la **provvisoria** aggiunge le righe in bozza, inviate e con via libera, mai le respinte. Si passa dall'una all'altra con un interruttore; la vista provvisoria è sempre etichettata come tale, anche nei file. Le righe da valorizzare restano segnalate a parte in entrambe.
12. **La procedura notturna riparte da dove era arrivata.** Un registro delle esecuzioni (`esecuzioni_batch`) dice fin dove è arrivata l'ultima esecuzione completa e, se non ha completato, perché; la successiva riprende dal giorno dopo fino a ieri, un giorno per volta, con blocco contro le esecuzioni contemporanee. Il controller vede l'ultima esecuzione e può lanciarla a mano.
13. **"Dati aggiornati al".** Dove i dati vengono dalla procedura (l'andamento), la pagina e le esportazioni indicano l'ultimo giorno completato e avvisano se l'ultima esecuzione non si è conclusa; le schede e i report calcolati al momento indicano la data e l'ora del calcolo.

## Rischi

| Rischio | Effetto | Contromisura |
| --- | --- | --- |
| Report annuali lenti | Pagine che si caricano in molti secondi | Aggregazioni sugli indici esistenti, prova con 130.000 righe in E7, riepilogo mensile solo se serve (decisione 10) |
| Indicatori fuorvianti con dati incompleti | Un progetto sembra sotto budget perché le ore non sono ancora approvate | Due viste (decisione 11): approvata, ufficiale, e provvisoria con le ore non ancora approvate, sempre etichettata; righe da valorizzare segnalate a parte |
| Divisioni per zero e casi limite dell'EVM | Errori o valori assurdi (infinito, negativi) | Funzioni pure provate sui casi dell'analisi; "non calcolabile" invece di numeri senza senso |
| Procedura notturna non eseguita o interrotta (PC spento, errore, fuso orario) | Giorni saltati, doppi o andamento fermo senza che nessuno se ne accorga | Ripresa dall'ultimo giorno completato con registro delle esecuzioni (decisione 12), un giorno per transazione, indice unico su progetto e giorno, giorni in ora italiana, blocco contro le esecuzioni contemporanee; "aggiornato al" e avviso nelle pagine (decisione 13), esito visibile al controller con **Esegui ora** |
| Euro esposti al TL in un'esportazione | Violazione della riservatezza | La stessa funzione decide gli euro per pagine ed esportazioni; test dedicati per ogni profilo |
| Festività e giorni lavorativi | Pianificato sovrastimato in alcuni mesi | Calendario delle festività nazionali provato con i test; scostamenti presentati come indicazione |
| Andamento che non riflette approvazioni arrivate dopo | Il grafico di un giorno passato resta com'era la notte in cui è stato salvato | Comportamento voluto (l'andamento è una fotografia di ogni giorno); la scheda mostra sempre i dati aggiornati; detto nella guida |
| Nuove librerie (`exceljs`, `@nestjs/schedule`) | Build più pesante sul PC | Librerie diffuse e senza dipendenze native; installate con `npm` come le altre |
