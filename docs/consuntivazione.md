# Guida alla Consuntivazione

Guida d'uso della sezione **Consuntivazione** (fase 2): come le risorse registrano le ore lavorate e come il controller
gestisce tipologie di costo, tariffe e costi. Per le regole complete vedi [analisi-consuntivazione.md](analisi-consuntivazione.md),
per le scelte della fase 2 [piano-fase2.md](piano-fase2.md).

Si entra da **Consuntivazione** nel menu in alto (`/toolpm/consuntivazione`). Il sottomenu mostra solo le pagine del proprio profilo:

| Pagina | Chi la vede | A cosa serve |
|---|---|---|
| Il mio consuntivo | chi è collegato a una risorsa | Inserire le proprie ore per giorno o per settimana |
| Tipologie di costo | controller | Ordinaria, straordinaria, festiva...: quali esistono e qual è la predefinita |
| Tariffe | controller | Costo orario standard per ruolo e personalizzato per risorsa, con i periodi di validità |
| Approvazioni | TL, PM, PMSenior | Via libera, approvazione o rifiuto delle righe inviate sui propri progetti |
| Consuntivi delle risorse | controller | Ore, tariffe e costi di una risorsa, settimana per settimana (sola lettura) |
| Periodi | controller | Chiusura e riapertura dei mesi |
| Storico | controller, PMSenior | Chi ha cambiato cosa e quando |
| Da valorizzare | controller | Righe senza costo, con il motivo, e ricalcolo dei costi |

## Per le risorse: il mio consuntivo

### Compilare la settimana

1. Apri **Il mio consuntivo**. Si apre la settimana corrente; con **‹ ›** passi alle settimane vicine, con **Oggi** torni a quella attuale.
   Con **Giorno / Settimana** scegli se vedere un solo giorno o tutta la settimana: puoi consuntivare ogni giorno o una volta a settimana, come preferisci.
2. Le righe sono le voci su cui lavori (un progetto, oppure un'attività del progetto, scritta come `PROGETTO › ATTIVITÀ`) con la loro
   tipologia; le colonne sono i giorni. Se il periodo è vuoto, la pagina propone già le righe dei progetti su cui sei allocato nel
   Pianificatore e quelle della settimana prima: basta scrivere le ore.
3. Per aggiungere una riga scegli la voce in **Aggiungi una riga** e premi **Aggiungi**. Le attività che ti sono assegnate sono in cima, con la ★.
   La tipologia parte da quella predefinita (di solito **Ordinaria**) e la puoi cambiare, per esempio in Straordinaria.
4. Scrivi le ore nelle celle: `8`, `7,5` oppure `7:30`. Si va a quarti d'ora; in un giorno non si superano le 24 ore.
5. Cliccando una cella puoi scrivere una **nota** sotto la griglia.
6. Premi **Salva**: si salvano insieme tutte e sole le giornate cambiate. O si salvano tutte o nessuna.
7. Quando le ore sono complete, premi **Invia** (vedi sotto).

Ci vogliono di solito meno di due minuti per una settimana tipica: con le righe proposte bastano le ore di cinque celle e **Salva**
(nella prova automatica: scelta della voce, Aggiungi, cinque celle, Salva).

### Inviare le ore all'approvazione

Quando le ore di un giorno o della settimana sono complete e salvate, premi **Invia la settimana** (o **Invia il giorno** nella vista del giorno): partono tutte le righe in bozza o respinte del periodo, il numero tra parentesi dice quante. Non si inviano righe singole.

- Le celle inviate diventano in sola lettura e hanno un bordo colorato: blu inviata, viola via libera del TL, verde approvata, rosso respinta, grigio mese chiuso (legenda sotto la griglia). Senza colore sono in bozza.
- Nello stesso giorno puoi aggiungere righe nuove accanto a quelle inviate: partono con il prossimo invio.
- **Ritira l'invio**: finché nessun approvatore le ha guardate, le righe inviate tornano in bozza per correggerle; poi le invii di nuovo.
- Le **righe respinte** compaiono in un riquadro rosso con la motivazione: correggile (restano respinte finché non le invii) e inviale di nuovo.
- Se nei giorni passati restano righe da inviare fuori dalla settimana che stai guardando, un avviso te lo dice e ti porta alla settimana più vecchia.
- Cliccando una cella (anche inviata o approvata) e poi **Cronologia della riga** vedi i passaggi della riga: inviata, via libera, approvata, respinta con la motivazione, corretta.
- Quando il controller **chiude un mese**, le sue ore non si modificano più (un avviso lo dice): per una correzione chiedi di riaprirlo.

**Copia la settimana precedente** (o **il giorno precedente** nella vista del giorno) riporta righe e ore nei giorni passati ancora vuoti, senza salvare:
controlli e premi **Salva**.

Nella sezione **Avanzamento delle mie attività** aggiorni la percentuale di completamento delle attività che ti sono assegnate.

### Cosa non si può fare, e perché

- **Giorni futuri**: si consuntiva fino a oggi; i giorni dopo sono in sola lettura.
- **Progetti su cui non lavori**: puoi consuntivare solo sui progetti non chiusi su cui sei assegnato ad almeno un'attività, allocato nel
  Pianificatore nel mese (percentuale maggiore di zero) o approvatore. Se un progetto manca dall'elenco, chiedi al TL o al PM di assegnarti un'attività o di allocarti.
- **Attività non assegnate a te**: si possono usare, ma compare un avviso; dalla fase 3 l'approvatore vedrà evidenziate quelle righe.
- **Progetti chiusi, attività chiuse, tipologie disattivate**: non accettano righe nuove o cambiate.
- **Date fuori dal tuo periodo** di ingresso e uscita in azienda: non si consuntivano.
- **Ore di altri**: ognuno inserisce solo le proprie.

La risorsa non vede mai tariffe né importi: le ore diventano costi solo nelle pagine del controller.

Se qualcun altro (per esempio tu stesso da un'altra finestra) ha salvato la stessa giornata nel frattempo, il salvataggio è rifiutato
con un messaggio e il pulsante **Ricarica**: ricarichi, rifai la modifica e salvi. Nessun dato va perso.

### Le mie competenze

Dal Pianificatore, voce **Le mie competenze**, aggiorni le tue skill (con il livello) e le tue certificazioni: nome dal catalogo, data di
conseguimento (obbligatoria), scadenza, ente certificatore, codice e link (facoltativi). Le voci nuove si scelgono dal catalogo, curato da PM e PMSenior.
Le tue allocazioni invece le gestiscono PM, PMSenior e TL dei progetti.

## Per TL e PM: approvare le ore

Nel sottomenu **Approvazioni** il numero rosso dice quante righe aspettano una tua azione. La pagina mostra le righe dei progetti di cui sei
approvatore (il PMSenior di tutti), raggruppate per risorsa e settimana; le tue ore non compaiono mai: le approva un altro PM del progetto o un PMSenior.

- **Mostra**: *Da lavorare* (il TL vede le righe inviate, il PM anche quelle con il via libera del TL), oppure Inviate, Con via libera del TL, Approvate, Respinte; il periodo con *dal* e *al*.
- Puoi restringere a un progetto, a una risorsa, o alle sole righe su **attività non assegnate** alla risorsa (segnate "non assegnata").
- Spunta le righe (o tutto il gruppo, o *Seleziona tutte*) e premi:
  - **Via libera** (TL): un primo controllo, facoltativo; la riga passa al PM.
  - **Approva** (PM): approvazione definitiva, con o senza via libera. La riga approvata non si modifica più.
  - **Respingi** (TL sulle inviate, PM anche su quelle approvate): scrivi la motivazione, che la risorsa vedrà accanto alla riga. La riga corretta e reinviata riparte senza via libera.
- Il numero sul pulsante dice a quante righe selezionate si applica; se una riga nel frattempo è stata lavorata da un altro o ritirata, viene saltata e l'esito ne dice il motivo.
- Il PM vede anche il costo delle righe dei propri progetti (il PMSenior di tutti), con il totale del gruppo; il TL vede solo le ore.

## Per TL e PM: preparare i progetti

Perché le risorse possano consuntivare:

- il progetto deve essere **In valutazione** o **In corso** (non chiuso) e avere un **centro di costo**: dopo il primo consuntivo il centro di costo non si può più cambiare;
- le **attività** devono essere attive e, se il progetto le prevede, assegnate alle risorse (Anagrafiche › Progetti › dettaglio);
  il **codice** dell'attività è un codice breve che la identifica dentro il progetto (per esempio `SVI`, `TEST`);
- le risorse che non hanno attività devono essere **allocate** sul progetto nel Pianificatore per il mese.

## Per il controller

### Tipologie di costo

In **Tipologie di costo** aggiungi una tipologia con codice, descrizione e categoria, la modifichi in riga e scegli quale è la
**predefinita** con **Rendi predefinita** (ce n'è sempre una sola; è quella proposta sulle righe nuove). Le tipologie non si cancellano: si disattivano.

### Tariffe

In **Tariffe**:

- **Standard per ruolo**: scegli il ruolo e aggiungi, per ogni tipologia, il costo orario con data di inizio e (facoltativa) di fine validità.
- **Personalizzate per risorsa**: scegli la risorsa e aggiungi le tariffe che valgono solo per lei; la sezione **Si applica al** mostra, per la data scelta, quale tariffa vale per ogni tipologia e da dove viene.

Una personalizzata, se c'è, vince sulla standard del ruolo della risorsa a quella data. I periodi della stessa tipologia non si
sovrappongono: per cambiare una tariffa chiudi il periodo vecchio (data di fine) e apri il nuovo dal giorno dopo.

### Chiudere i mesi

In **Periodi** c'è un mese per riga, dal più recente, con quante righe sono in bozza, inviate, con via libera, respinte, approvate e chiuse.

- I mesi si chiudono **in ordine**: **Chiudi…** compare sul primo mese aperto con ore. Si apre l'anteprima.
- Se tutte le righe sono approvate, **Chiudi il mese**: le righe approvate diventano chiuse e il mese non accetta più modifiche, invii, approvazioni né ricalcoli.
- Se ci sono righe non approvate, l'anteprima le elenca: falle approvare (o inviare), oppure **Chiudi comunque** scrivendo il motivo. Quelle righe restano ferme nel loro stato e fuori dai costi.
- **Riapri…** sull'ultimo mese chiuso, con la motivazione: le righe chiuse tornano approvate. Chiusure e riaperture restano nello storico.
- In fondo alla pagina, i progetti con righe in attesa e nessun PM tra gli approvatori: le può approvare solo un PMSenior, conviene aggiungere un PM.

### Storico delle modifiche

In **Storico** (controller e PMSenior) trovi chi ha cambiato cosa e quando: invii, approvazioni, rifiuti e correzioni delle ore, ricalcoli dei costi,
chiusure e riaperture dei mesi, progetti (dati, stato, approvatori), attività (dati e risorse assegnate), tipologie e tariffe, con i valori prima e dopo
e le motivazioni. Si filtra per tipo di dato, operazione e periodo. Lo storico non si modifica né si cancella. In **Consuntivi delle risorse**,
**Cronologia** su una riga mostra i suoi passaggi.

### Come si calcola il costo

Al salvataggio ogni riga riceve la tariffa valida in quel giorno e il costo, `ore × tariffa`, arrotondato al centesimo; tariffa,
provenienza e costo restano fotografati sulla riga. Cambiare una tariffa non cambia le righe già salvate finché non lanci il ricalcolo.

### Consuntivi delle risorse

Scegli la risorsa e la settimana: vedi il riepilogo per voce, tipologia e giorno con ore, tariffa e costo, i totali, e il dettaglio
di ogni riga con la tariffa usata (personalizzata o standard del ruolo) e la nota.

### Da valorizzare e ricalcolo

**Da valorizzare** elenca le righe senza costo, raggruppate, con il motivo e il collegamento a dove si sistema:

| Motivo | Cosa fare |
|---|---|
| La risorsa non ha un ruolo alla data | Assegna il ruolo in Anagrafiche › Risorse |
| Nessuna tariffa per la tipologia | Aggiungi la tariffa standard del ruolo o una personalizzata |
| Tariffa ora disponibile | Basta il ricalcolo |

**Ricalcolo**: scegli il periodo e, se vuoi, una risorsa, premi **Anteprima** per vedere le righe il cui costo cambierebbe (prima e dopo),
poi **Applica il ricalcolo**. Se nessuna riga cambia, l'anteprima lo dice e non c'è nulla da applicare.
Il ricalcolo serve sia dopo aver inserito una tariffa mancante sia dopo aver corretto una tariffa.

## Domande frequenti

**Ho consuntivato ma il controller non vede le ore in "Da valorizzare".** È normale: quella pagina mostra solo le righe senza costo.
Le ore con il costo si vedono in **Consuntivi delle risorse**.

**L'anteprima del ricalcolo è vuota.** Nessuna riga del periodo cambierebbe costo: le tariffe sono già quelle usate.

**Un progetto non compare tra le voci.** La risorsa non ci lavora (vedi sopra) oppure il progetto è chiuso.

**Posso consuntivare su un'attività di un altro collega?** Sì, se è nel progetto su cui lavori: compare un avviso.

**Più persone possono lavorare sulla stessa attività?** Sì, un'attività può essere assegnata a più risorse.

**Chi approva le ore?** Il TL del progetto può dare un primo via libera, il PM approva in modo definitivo o respinge con una motivazione; nessuno approva le proprie ore. Vedi "Per TL e PM: approvare le ore".
