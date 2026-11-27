# ToolPM — Analisi della sezione Offerte e preventivi

26/11/2026 · Claudio Agasi

> Analisi definitiva: le dodici decisioni sono state confermate il 26/11/2026 (vedi "Decisioni confermate"); il lavoro segue il [piano della fase 5](piano-fase5.md). Versione di lavoro con commenti: [documento su Claude](https://claude.ai/artifact/WA3QAbTu62tPRXkM49UY18). Il modo di lavorare è quello di [analisi-consuntivazione.md](analisi-consuntivazione.md) e dei piani delle fasi 1–4.

## Scopo e perimetro

La sezione **Offerte** porta una richiesta del cliente fino all'offerta inviata. Nel mezzo ci sono la stima in giorni per ruolo, il costo, il prezzo e il margine. Un'offerta vinta diventa un progetto con le stime già compilate.

Si usa così:

- **PM e commerciali** preparano l'offerta: cliente, oggetto, tipo (a corpo, a consuntivo, pacchetto di giornate), scadenze;
- **TL ed esperti** stimano i giorni per attività e ruolo;
- il sistema calcola il **costo** dalle tariffe di costo già presenti in Consuntivazione e il **prezzo** da un nuovo listino di vendita per ruolo, con sconto o con un prezzo a corpo deciso a mano;
- un **PMSenior** approva l'offerta prima dell'invio;
- dopo l'esito (vinta, persa, ritirata) l'offerta vinta crea il **progetto** in Anagrafiche, con attività e stime manageriali.

**Dentro:** offerte e loro revisioni, stima, listino di vendita, approvazione interna, esito, creazione del progetto, elenco con il valore delle offerte aperte, esportazione della stima in Excel e del documento d'offerta.

**Fuori, per ora:** SAL, milestone e fatture (sezione **Fatturazione e SAL**, la prossima); change request sui progetti già aperti (sezione **Richieste evolutive**, che riuserà la stessa stima); costi non di personale (licenze, trasferte); CRM e firma elettronica.

## Glossario

| Termine | Significato |
| --- | --- |
| Offerta | Proposta a un cliente per un lavoro, con un numero (OFF-2026-0001), un oggetto, un tipo, un responsabile e uno stato. Ha una o più revisioni. |
| Revisione | Versione della stima e del prezzo di un'offerta (rev. 1, 2, …). Si modifica solo finché è in bozza; dopo l'invio è congelata e ogni cambio apre una nuova revisione. |
| Tipo di offerta | **A corpo**: prezzo fisso per un risultato. **A consuntivo**: si fatturano i giorni lavorati alle tariffe di vendita; la stima è indicativa. **Pacchetto di giornate**: un monte di giorni per ruolo a prezzo concordato, da consumare in un periodo (tipico della manutenzione evolutiva). |
| Gruppo di stima | Blocco di lavoro della stima (es. Analisi, Sviluppo, Collaudo). Se l'offerta è vinta diventa un'attività del progetto. |
| Voce di stima | Riga di un gruppo: ruolo, giorni, descrizione facoltativa. |
| Contingenza | Percentuale di giorni aggiunta alla stima per coprire i rischi; si applica a tutte le voci della revisione. |
| Tariffa di costo | Costo orario per ruolo, già gestito in Consuntivazione (tariffe standard, tipologia ordinaria). Moltiplicato per le ore di una giornata dà il costo di un giorno. |
| Listino di vendita | Nuovo elenco di tariffe giornaliere di vendita per ruolo, con validità; uno standard e, se serve, uno per cliente (accordi quadro). |
| Sconto | Percentuale tolta al prezzo da listino. |
| Margine | Prezzo meno costo stimato; in percentuale sul prezzo. |
| Esito | Vinta, persa (con il motivo) o ritirata. |

## Ciclo di vita

Ogni offerta passa da bozza ad approvata prima di arrivare al cliente; dopo l'invio si chiude con un esito, oppure torna in bozza come nuova revisione se il cliente chiede modifiche.

```
Bozza ──invia──► In approvazione ──approva──► Approvata ──al cliente──► Inviata ──vinta──► Vinta ──crea──► Progetto (Anagrafiche)
  ▲                    │                                                   │  └──persa (motivo)──► Persa
  └──respinge (motivo)─┘                                                   │
  ▲                                                                        │
  └────────────────── nuova revisione (la precedente diventa superata) ────┘
```

Da ogni stato aperto l'offerta si può anche **ritirare**; un'offerta inviata oltre la validità senza esito è segnalata come **scaduta**, ma resta inviata finché qualcuno non decide l'esito.

| Passaggio | Chi lo fa | Condizioni |
| --- | --- | --- |
| Bozza → In approvazione | responsabile | ogni ruolo con tariffa di costo e, a consuntivo o a pacchetto, di vendita; prezzo presente; tariffe e totali fotografati |
| In approvazione → Approvata | PMSenior diverso da chi ha preparato la revisione | nota obbligatoria se il margine è sotto il minimo |
| In approvazione → Bozza | stesso PMSenior | motivo obbligatorio; tariffe di nuovo calcolate al momento |
| Approvata → Inviata | responsabile | data d'invio; la validità parte da qui |
| Inviata → Bozza (nuova revisione) | responsabile | copia dell'ultima revisione; la precedente diventa superata |
| Inviata → Vinta / Persa | responsabile, PMSenior | perdita con motivo; vinta propone la creazione del progetto |
| Stato aperto → Ritirata | responsabile, PMSenior | nota facoltativa |

## Requisiti funzionali

1. **RO-1 Anagrafica dell'offerta.** Numero assegnato dal sistema (OFF-AAAA-NNNN, progressivo per anno), cliente (obbligatorio), titolo, descrizione, tipo, centro di costo previsto, responsabile, data della richiesta, scadenza per la risposta, validità dell'offerta (giorni dall'invio, predefinito 60).
2. **RO-2 Stimatori.** Il responsabile può invitare TL e altri utenti a stimare: vedono e modificano giorni e voci, non costi, prezzi e margini.
3. **RO-3 Stima.** Gruppi in ordine, ciascuno con voci ruolo × giorni (mezze giornate ammesse) e descrizione facoltativa; contingenza percentuale sulla revisione. Totali per gruppo, per ruolo e complessivi, in giorni con e senza contingenza.
4. **RO-4 Costo stimato.** Per ruolo: giorni con contingenza × ore di una giornata × tariffa standard di costo del ruolo (tipologia ordinaria) valida alla data. Un ruolo senza tariffa è segnalato e blocca l'invio in approvazione.
5. **RO-5 Prezzo.** A consuntivo e pacchetto: giorni con contingenza × tariffa giornaliera di vendita del ruolo (listino del cliente se c'è, altrimenti standard), meno lo sconto. A corpo: il prezzo calcolato è una proposta, il responsabile inserisce il prezzo finale. Un ruolo senza tariffa di vendita è segnalato.
6. **RO-6 Margine.** Prezzo meno costo, in euro e in percentuale; sotto il margine minimo (parametro, predefinito 25%) la pagina avvisa e l'approvazione chiede una nota.
7. **RO-7 Revisioni.** Una revisione in bozza alla volta; all'invio in approvazione tariffe e totali sono fotografati. Dopo l'invio al cliente la revisione è congelata; una nuova revisione parte come copia della precedente, che diventa "superata". Storico delle revisioni con il confronto di giorni, prezzo e margine.
8. **RO-8 Approvazione interna.** Prima dell'invio al cliente un PMSenior approva o respinge con motivo; chi ha preparato la revisione non può approvarla.
9. **RO-9 Invio ed esito.** Il responsabile segna l'offerta come inviata (data), poi vinta, persa (motivo da elenco e nota) o ritirata. Scaduta la validità senza esito, l'elenco la segnala.
10. **RO-10 Dall'offerta al progetto.** Un'offerta vinta crea, su conferma, il progetto in Anagrafiche (vedi "Dall'offerta vinta al progetto"); offerta e progetto restano collegati.
11. **RO-11 Elenco e pipeline.** Elenco con filtri (stato, cliente, responsabile, tipo, periodo), valore delle offerte aperte per stato, offerte in scadenza, tasso di successo del periodo per numero e per valore.
12. **RO-12 Listino di vendita.** Tariffe giornaliere per ruolo con validità (dal, al), standard e per cliente, senza sovrapposizioni per lo stesso ruolo e cliente.
13. **RO-13 Esportazioni.** Stima in Excel (gruppi, voci, totali; costi e margini solo a chi li vede); documento d'offerta per il cliente in Word, con oggetto, perimetro, stima per gruppo, prezzo e condizioni, senza costi né margini.
14. **RO-14 Storico.** Ogni modifica di stato, prezzo, sconto, contingenza e listino lascia una traccia nello storico (come la fase 3 della Consuntivazione).

## Stima, costo e prezzo

I giorni stimati, aumentati della contingenza, danno il costo con le tariffe di costo e il prezzo con il listino di vendita; il margine è la differenza. Si calcola per ruolo, poi si somma.

- giorni del ruolo = somma dei giorni delle sue voci × (1 + contingenza)
- costo = Σ giorni del ruolo × ore di una giornata × tariffa di costo oraria del ruolo
- prezzo da listino = Σ giorni del ruolo × tariffa di vendita giornaliera del ruolo
- prezzo = prezzo da listino × (1 − sconto); a corpo lo decide il responsabile
- margine = prezzo − costo; margine % = margine / prezzo

Giorni arrotondati a due decimali, importi al centesimo per ruolo. Le tariffe sono quelle valide alla data della revisione e restano fotografate dall'invio in approvazione: un cambio di listino non modifica le offerte già approvate.

**Esempio.** Offerta a corpo "Portale ordini" per un cliente senza listino proprio: Analisi (PM 2 gg, analista 10 gg), Sviluppo (senior 20 gg, junior 30 gg), Collaudo (tester 8 gg), 70 giorni; contingenza 10%, giornata di 8 ore, sconto 5%.

| Ruolo | Giorni con contingenza | Costo (€/h) | Costo | Vendita (€/gg) | Prezzo da listino |
| --- | --- | --- | --- | --- | --- |
| PM | 2,2 | 45 | 792,00 € | 600 | 1.320,00 € |
| Analista | 11 | 38 | 3.344,00 € | 500 | 5.500,00 € |
| Sviluppatore senior | 22 | 35 | 6.160,00 € | 480 | 10.560,00 € |
| Sviluppatore junior | 33 | 25 | 6.600,00 € | 350 | 11.550,00 € |
| Tester | 8,8 | 28 | 1.971,20 € | 380 | 3.344,00 € |
| **Totale** | **77** | | **18.867,20 €** | | **32.274,00 €** |

Con lo sconto del 5% il prezzo calcolato è 30.660,30 €, margine 11.793,10 € (38,5%). Il responsabile fissa il prezzo a corpo a 30.000,00 €: margine 11.132,80 € (37,1%), sopra il minimo del 25%. Le tariffe dell'esempio sono inventate.

## Profili e permessi

Costi e margini restano riservati come in Consuntivazione: li vedono solo chi è responsabile dell'offerta come PM, PMSenior o commerciale, i PMSenior e il controller. I TL stimano in giorni e non vedono euro.

| Profilo | Quali offerte vede | Crea e modifica | Stima i giorni | Costi e margini | Prezzo e sconto | Approva | Esito e progetto |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Commerciale (nuovo ruolo globale) | tutte | sì, come responsabile | sì | sulle proprie | sulle proprie | no | sulle proprie |
| PM | quelle di cui è responsabile o stimatore | sì, come responsabile | sì | sulle proprie | sulle proprie | no | sulle proprie |
| PMSenior | tutte | sì | sì | tutte | tutte | sì, non le proprie | tutte |
| TL | quelle di cui è stimatore | no | sì, dove invitato | no | no | no | no |
| Controller | tutte, in lettura | no | no | tutte | no | no | no |

Il listino di vendita lo gestiscono il controller e i PMSenior; commerciali e PM lo leggono. Le tariffe di costo restano come oggi, modificate solo dal controller; chi vede costi e margini di un'offerta vede anche il costo giornaliero di ogni ruolo, che si ricava comunque dai totali. Nella pagina del listino, chi lo legge (commerciali, PM, PMSenior, controller) vede per ogni ruolo anche il costo giornaliero e il margine della giornata venduta a listino (deciso il 27/11/2026).

## Dall'offerta vinta al progetto

Un'offerta vinta crea il progetto con un clic e una conferma: chi la segna vinta vede l'anteprima del progetto e può correggerla prima di crearlo. I dati vengono dall'ultima revisione inviata.

| Nel progetto (Anagrafiche) | Dall'offerta |
| --- | --- |
| Codice | proposto dal responsabile, univoco come oggi |
| Titolo, descrizione, cliente | quelli dell'offerta |
| Centro di costo | quello previsto nell'offerta, modificabile in anteprima |
| Stato | In valutazione (diventa In corso con la data di inizio, come oggi) |
| Approvatori | il responsabile dell'offerta come PM, se è PM o PMSenior; altrimenti un PM scelto in anteprima |
| Stima manageriale in giorni | giorni con contingenza |
| Stima manageriale in euro | costo stimato (è il budget di costo che l'EVM confronta con il consuntivato) |
| Stima definitiva | vuota: la imposta il PM dopo l'analisi, come oggi |
| Attività | una per gruppo di stima, con la stima in giorni del gruppo |
| Collegamento | `offertaId` sul progetto, `progettoId` sull'offerta |

Il **prezzo** non va nelle stime del progetto, che sono di costo: resta sull'offerta e la scheda del progetto lo mostra (ricavo previsto e margine previsto, solo a chi vede gli euro). Sarà il punto di partenza della sezione Fatturazione e SAL. Le allocazioni del Pianificatore non si creano in automatico; la stima per ruolo resta consultabile dalla scheda come aiuto per pianificare.

## Modello dei dati

Quattro collection nuove (una è il contatore dei numeri), un campo in più su `progetti` e un parametro; tutte con il tracciamento (`creatoIl`, `creatoDa`, `modificatoIl`, `modificatoDa`) e importi in centesimi, come il resto di ToolPM. Le crea la migrazione `011-offerte`.

| Collection | Un documento è | Campi principali | Indici |
| --- | --- | --- | --- |
| `offerte` | un'offerta | `numero` (OFF-AAAA-NNNN), `clienteId`, `titolo`, `descrizione`, `tipo` (corpo, consuntivo, pacchetto), `stato`, `responsabile` {utenteId}, `stimatori` [utenteId], `centroCostoId`, `dataRichiesta`, `scadenzaRisposta`, `validitaGiorni`, `inviataIl`, `revisioneCorrente`, `esito` {stato, data, motivo, nota}, `progettoId`, `versione` | `numero` unico; `stato` + `scadenzaRisposta`; `clienteId`; `responsabile.utenteId`; `stimatori` |
| `offerte_revisioni` | una revisione | `offertaId`, `numero`, `stato` (bozza, inApprovazione, approvata, inviata, superata, respinta), `gruppi` [{_id, nome, ordine, voci [{_id, ruoloId, giorni, descrizione}]}], `contingenzaPercento`, `scontoPercento`, `prezzoACorpoCentesimi`, `tariffe` [{ruoloId, costoCentesimiGiorno, venditaCentesimiGiorno, fonte}] (fotografate all'invio in approvazione), `totali` {giorni, giorniConContingenza, costoCentesimi, prezzoListinoCentesimi, prezzoCentesimi, margineCentesimi, marginePercento}, `condizioni` (testo), `approvazione` {da, il, nota}, `rifiuto` {da, il, motivo}, `versione` | `offertaId` + `numero` unico |
| `listino_vendita` | una tariffa di vendita | `ruoloId`, `clienteId` (null = standard), `validoDal`, `validoAl`, `centesimiGiorno` | `ruoloId` + `clienteId` + `validoDal` unico |

- **Contatore dei numeri.** `contatori` {_id: "offerte-2026", valore} con `findOneAndUpdate` + `$inc`, dentro la transazione che crea l'offerta: nessun numero doppio.
- **Progetto.** Nuovo campo facoltativo `offertaId` su `progetti`.
- **Parametro** `offerte` {margineMinimoPercento: 25, validitaGiorni: 60, motiviPerdita: [prezzo, tempi, concorrente, rinuncia del cliente, altro]}.
- **Concorrenza.** `versione` su offerta e revisione, come per le giornate di consuntivo: chi salva una copia superata riceve un conflitto (409) e ricarica.
- **Storico.** Le modifiche passano dall'`AuditService` della fase 3 (collection `audit_log`).

## API

Nuovo modulo NestJS `src/offerte/`, percorsi sotto `/api/offerte`; la sezione ha il permesso globale `vedereOfferte` (commerciale, PM, PMSenior, controller, TL stimatore). Le risposte tolgono costi, prezzi e margini a chi non li vede, come i report della fase 4.

| Metodo | Percorso | Chi | Cosa |
| --- | --- | --- | --- |
| GET | `/api/offerte?stato=&cliente=&responsabile=&tipo=&da=&a=&testo=` | chi vede le offerte | Elenco con totali dell'ultima revisione, scadenze e valore per stato (pipeline) |
| POST | `/api/offerte` | commerciale, PM, PMSenior | Nuova offerta con la revisione 1 in bozza; numero assegnato |
| GET / PUT | `/api/offerte/:id` | chi la vede / responsabile, PMSenior | Testata dell'offerta (cliente, titolo, tipo, scadenze, stimatori) |
| GET | `/api/offerte/:id/revisioni`, `/revisioni/:n` | chi la vede | Revisioni con stima e totali; confronto tra due revisioni |
| PUT | `/api/offerte/:id/revisioni/:n` | responsabile, stimatori (solo gruppi e voci), PMSenior | Salva la bozza (gruppi, voci, contingenza, sconto, prezzo a corpo, condizioni) con la versione letta |
| POST | `/api/offerte/:id/revisioni/:n/approvazione` | responsabile | Invia in approvazione: controlla tariffe e campi, fotografa tariffe e totali |
| POST | `/api/offerte/:id/revisioni/:n/esito-approvazione` | PMSenior non autore | Approva (nota obbligatoria sotto il margine minimo) o respinge con motivo |
| POST | `/api/offerte/:id/invio` | responsabile | Segna inviata al cliente la revisione approvata |
| POST | `/api/offerte/:id/revisioni` | responsabile | Nuova revisione come copia dell'ultima inviata |
| POST | `/api/offerte/:id/esito` | responsabile, PMSenior | Vinta, persa (motivo) o ritirata |
| GET / POST | `/api/offerte/:id/progetto` | responsabile, PMSenior | Anteprima e creazione del progetto dall'offerta vinta |
| GET | `/api/offerte/:id/revisioni/:n/esporta?formato=xlsx\|docx` | chi la vede | Stima in Excel; documento d'offerta in Word (senza costi) |
| GET / POST / PUT / DELETE | `/api/offerte/listino` | lettura: commerciale, PM, PMSenior, controller; modifica: controller, PMSenior | Listino di vendita standard e per cliente, con validità |

## Pagine

Nuova sezione **Offerte** nel menu principale, con le pagine sotto `/toolpm/offerte` e il codice in `frontend/src/app/offerte/`, sullo stile di Consuntivazione.

| Pagina | Percorso | Contenuto |
| --- | --- | --- |
| Elenco | `/offerte` | Offerte con numero, cliente, titolo, tipo, stato, responsabile, scadenza, giorni, prezzo e margine (a chi li vede); filtri; riquadro della pipeline (valore aperto per stato, in scadenza, tasso di successo); **Nuova offerta**; Scarica in Excel e CSV |
| Offerta | `/offerte/:id` | Testata modificabile; barra di stato con le azioni possibili (invia in approvazione, approva o respingi, segna inviata, nuova revisione, esito, crea progetto); linguetta della revisione corrente e storico delle revisioni |
| Stima | dentro l'offerta | Griglia gruppi × voci (ruolo, giorni, descrizione) con aggiunta, riordino ed eliminazione; contingenza; totali per gruppo e per ruolo; a destra, per chi li vede, costo, prezzo da listino, sconto o prezzo a corpo, margine con l'avviso sotto il minimo; avvisi per i ruoli senza tariffa |
| Confronto | dentro l'offerta | Due revisioni affiancate: giorni per gruppo e ruolo, prezzo, margine, con le differenze evidenziate |
| Nuovo progetto | dentro l'offerta vinta | Anteprima del progetto (codice, centro di costo, PM, attività, stime) da correggere e confermare |
| Listino di vendita | `/offerte/listino` | Tariffe giornaliere per ruolo, standard e per cliente, con validità; segnala i ruoli senza tariffa |

Nella scheda del progetto in Consuntivazione compare un collegamento all'offerta d'origine con ricavo e margine previsti, solo per chi vede gli euro.

## Decisioni confermate

Tutte e dodici le proposte sono state confermate così come sono il 26/11/2026.

| N. | Domanda | Decisione |
| --- | --- | --- |
| 1 | Quali tipi di offerta servono? | A corpo, a consuntivo, pacchetto di giornate |
| 2 | Come si struttura la stima? | Gruppi (diventano attività) con voci ruolo × giorni; contingenza unica sulla revisione |
| 3 | Da dove viene il costo? | Tariffe standard di costo del ruolo già in Consuntivazione, tipologia ordinaria, × ore di una giornata (parametro `oreGiorno`) |
| 4 | Da dove viene il prezzo? | Nuovo listino giornaliero per ruolo, standard e per cliente, meno lo sconto; a corpo il prezzo finale lo decide il responsabile |
| 5 | Chi prepara le offerte? | PM, PMSenior e un nuovo ruolo globale **commerciale**, assegnato dall'amministratore come il ruolo controller |
| 6 | Chi vede costi e margini? | Responsabile (PM, PMSenior, commerciale), PMSenior, controller; i TL stimatori solo i giorni |
| 7 | Serve sempre l'approvazione prima dell'invio? | Sì, di un PMSenior diverso da chi ha preparato la revisione; sotto il margine minimo del 25% con una nota |
| 8 | Come si gestiscono le modifiche dopo l'invio? | Revisione congelata; ogni modifica apre una nuova revisione, la precedente diventa superata |
| 9 | Cosa crea un'offerta vinta? | Un progetto In valutazione con cliente, centro di costo, PM, attività dai gruppi e stime manageriali (giorni e costo); il prezzo resta sull'offerta |
| 10 | Come si numerano le offerte? | OFF-AAAA-NNNN, progressivo per anno |
| 11 | Serve un documento per il cliente? | Sì, in Word, generato dalla revisione inviata (oggetto, perimetro, stima per gruppo, prezzo, condizioni), da rifinire a mano |
| 12 | Quali motivi di perdita? | Prezzo, tempi, concorrente, rinuncia del cliente, altro, con una nota libera; elenco modificabile nei parametri |

## Fuori perimetro e sezioni successive

Le due sezioni che seguiranno partono da qui, quindi il modello delle offerte lascia già lo spazio per loro.

- **Fatturazione e SAL** (la prossima): userà prezzo, tipo e condizioni dell'offerta vinta per piano di fatturazione, milestone e SAL; a consuntivo e a pacchetto fatturerà le ore approvate della Consuntivazione alle tariffe fotografate nell'offerta, quindi il listino ha già la validità e le tariffe restano sulla revisione.
- **Richieste evolutive** (dopo): change request e ticket su progetti aperti useranno la stessa stima (gruppi, voci, contingenza, costo, prezzo) come componente riusabile, legata al progetto invece che a una nuova offerta; un pacchetto di giornate potrà essere "consumato" dalle richieste.
- **Non previsti:** costi non di personale (licenze, hardware, trasferte), CRM e anagrafica dei contatti del cliente, firma elettronica, invio dell'offerta per email dal sistema, offerte in valute diverse dall'euro.
