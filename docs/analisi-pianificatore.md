# ToolPM — Pianificatore risorse allocate

16/11/2026 · Claudio Agasi

> Analisi funzionale e tecnica della sezione **Pianificatore risorse allocate**, la prima sezione di ToolPM. Descrive il sistema così com'è oggi (codice ripreso dal repository `pianificatore-risorse`, commit 4fe0b42, e adattato a ToolPM) e le evoluzioni già decise per integrarlo con la sezione Consuntivazione. I dettagli di implementazione sono in [architettura.md](architettura.md), [frontend.md](frontend.md), [backend.md](backend.md) e [database.md](database.md).

## Introduzione

Il Pianificatore mostra, mese per mese, quanto ogni persona è allocata sui progetti e con quale grado di certezza. Serve a chi gestisce le persone per capire chi è libero, chi è sovraccarico e chi ha le competenze giuste per un nuovo progetto. Ogni allocazione è descritta da percentuale, probabilità, importanza strategica del progetto e livello di competenza della persona su quel progetto.

**Perimetro attuale.** Pianificazione mensile delle allocazioni, anagrafica delle risorse con le loro skill, anagrafiche di supporto (skill, certificazioni, scale di valutazione). Restano fuori: consuntivazione delle ore e costi (sezione Consuntivazione, in analisi), autenticazione e permessi, pianificazione a granularità inferiore al mese.

**Glossario**

| Termine | Significato |
| --- | --- |
| Risorsa | Persona allocabile sui progetti, con le sue skill e la sua pianificazione. |
| Skill | Competenza della risorsa, di tre tipi: tecnica (es. j2ee, devOps), funzionale, di ambito. Ognuna ha un livello. |
| Scala di valutazione | Elenco ordinato di valori, dal più alto al più basso, usato per livelli, importanza e probabilità (es. ottimo, buono, sufficiente, elementare, n.a.). |
| Allocazione | Riga di pianificazione: una risorsa su un progetto di un cliente in un mese, con percentuale di impegno. |
| Percentuale allocata | Quota del tempo della risorsa assegnata al progetto nel mese (0–100). |
| Probabilità di allocazione | Quanto è certa l'allocazione: sicura, probabile, forse, improbabile, nessuna. |
| Percentuale pesata | Percentuale allocata moltiplicata per il peso della probabilità. |
| Importanza strategica | Quanto la risorsa è importante per quel progetto: imprescindibile (mostrata come "chiave"), importante, utile, sostituibile, non idoneo. |
| Segnaposto | Allocazione senza percentuale: indica un mese libero. |

## Analisi funzionale

Il cuore della sezione è la **griglia di pianificazione**: una riga per risorsa, una colonna per mese, e in ogni cella i progetti del mese con percentuale allocata e pesata, colorati in base al carico. Le altre pagine servono a gestire le risorse e le anagrafiche che alimentano la griglia.

### Attori

| Attore | Cosa fa |
| --- | --- |
| Responsabile delle risorse / PM | Consulta la griglia, cerca persone libere o con certe skill, aggiorna le allocazioni. |
| Amministratore delle anagrafiche | Gestisce skill, certificazioni e scale di valutazione. |

Oggi non ci sono utenti né ruoli: chiunque raggiunga l'applicazione può leggere e modificare tutto (vedi "Limiti attuali").

### Requisiti funzionali

**Griglia di pianificazione**

1. **RF-P01 Periodo.** La griglia mostra di default 12 mesi a partire dal mese corrente. L'utente può scegliere mese iniziale e finale, fino a 36 mesi.
2. **RF-P02 Contenuto della cella.** Per ogni risorsa e mese: nessun progetto (cella grigia "0 | 0"); un progetto (nome, % allocata, % pesata); più progetti (riga "N progetti" con i totali del mese e, aprendola, il dettaglio dei singoli progetti).
3. **RF-P03 Colori del carico.** Sia la % allocata sia la % pesata sono colorate per fascia: 0 libero (grigio), meno di 50, 50, oltre 50, 100 pieno (verde), oltre 100 sovrallocato (rosso, in grassetto).
4. **RF-P04 Importanza strategica.** Il singolo progetto ha un bordo oro se la risorsa è "chiave" (imprescindibile) per quel progetto, argento se è "importante", nessun bordo negli altri casi.
5. **RF-P05 Dettaglio.** Passando sopra un progetto si vedono cliente, progetto, probabilità, pesata e importanza. Cliccandolo si apre sotto la griglia il dettaglio completo del mese per quella risorsa.
6. **RF-P06 Apri e chiudi tutto.** Un pulsante apre o chiude in un colpo il dettaglio di tutte le celle con più progetti.
7. **RF-P07 Filtro per skill.** Si sceglie un tipo di skill (tecnica, funzionale, ambito) e una o più skill di quel tipo: compaiono le risorse che ne hanno almeno una (OR), escluse quelle valutate "n.a.". Sotto il nome di ogni risorsa si vedono le skill trovate con il livello. Un pulsante rimuove il filtro.
8. **RF-P08 Ricerca per nome.** Filtro immediato su cognome e nome, senza ricaricare i dati.
9. **RF-P09 Legenda.** La pagina spiega colori, bordi e pesi di probabilità.

**Risorse**

10. **RF-P10 Elenco.** Tabella con nome, skill tecniche, skill funzionali e di ambito, numero di mesi pianificati (esclusi i segnaposto); ricerca immediata per nome o skill.
11. **RF-P11 Scheda risorsa.** Inserimento e modifica di cognome, nome, skill dei tre tipi con livello, e delle allocazioni: mese, cliente, progetto, percentuale, probabilità, importanza strategica, competenza tecnica, conoscenza funzionale e di ambito sul progetto.
12. **RF-P12 Suggerimenti.** I campi propongono i valori delle anagrafiche e i clienti e progetti già usati dalla risorsa, ma accettano anche testo libero.
13. **RF-P13 Inserimento rapido.** "Aggiungi allocazione" copia mese, cliente e progetto dell'ultima riga.
14. **RF-P14 Eliminazione.** Una risorsa si elimina dalla sua scheda, dopo conferma.

**Anagrafiche**

15. **RF-P15 Skill.** Elenco raggruppato per tipo, aggiunta (nome e tipo), eliminazione.
16. **RF-P16 Certificazioni.** Elenco, aggiunta (nome e categoria), eliminazione.
17. **RF-P17 Scale di valutazione.** Creazione di una scala, modifica dei valori (rinomina, riordino, aggiunta, rimozione) con salvataggio esplicito o annullamento. Il nome della scala è univoco e i valori non si ripetono.

### Calcolo della percentuale pesata

```latex
\text{pesata}_{\text{allocazione}} = \text{percentuale allocata} \times \text{peso}(\text{probabilità})
```

```latex
\text{totale}_{\text{mese}} = \sum \text{percentuali allocate} \qquad \text{pesato}_{\text{mese}} = \sum \text{pesate}
```

| Probabilità | Peso |
| --- | --- |
| sicura | 100% |
| probabile | 75% |
| forse | 50% |
| improbabile | 25% |
| nessuna | 0% |
| non indicata | 100% |
| valore sconosciuto | 0% |

Esempio: in gennaio una risorsa ha 30% su un progetto "sicura", 30% su uno "forse" e 10% su uno "forse". Il totale allocato è 70%, il pesato 30 + 15 + 5 = 50%. La cella mostra "3 progetti", 70 (colore "oltre 50") e 50 (colore "50").

### Regole di business

- Le anagrafiche sono **suggerimenti, non vincoli**: una risorsa può avere skill, livelli, clienti o progetti non presenti nelle anagrafiche. Rinominare o eliminare un valore di anagrafica non modifica le risorse che lo usano.
- Nelle scale l'ordine conta: il primo valore è il livello più alto.
- Una skill valutata "n.a." non conta come posseduta nei filtri.
- Le allocazioni senza percentuale (o con 0) sono segnaposto: non entrano nei totali e indicano un mese libero.
- Il confronto dei nomi di skill nei filtri non distingue maiuscole e minuscole.
- I pesi di probabilità sono legati ai nomi dei valori della scala `probabilitaAllocazione`: rinominare quei valori richiede di aggiornare il codice.
- Le percentuali di una risorsa in un mese possono superare 100: la griglia lo segnala come sovrallocazione, non lo impedisce.

### Limiti attuali

| Limite | Conseguenza | Evoluzione prevista |
| --- | --- | --- |
| Nessuna autenticazione | Chiunque raggiunga l'applicazione legge e modifica tutto | Accesso con utenti e ruoli, fase 1 del piano della Consuntivazione |
| Clienti e progetti sono testo libero nelle allocazioni | Errori di battitura creano progetti diversi; nessun collegamento con altre sezioni | Anagrafica comune di clienti, progetti e attività; migrazione dei testi esistenti |
| Risorse dentro la sezione Pianificatore | Le altre sezioni non possono usarle senza dipendere dal Pianificatore | Spostamento delle risorse nel modulo Comuni (`/api/comuni/risorse`) |
| Nessun tracciamento di chi modifica | Non si sa chi ha cambiato un'allocazione e quando | Campi `creatoIl`, `creatoDa`, `modificatoIl`, `modificatoDa` su tutti i documenti |
| Pesi di probabilità nel codice | Cambiare un peso richiede un rilascio | Da valutare: pesi configurabili nella scala |

## Analisi tecnica

Il Pianificatore è la sezione `pianificatore` di ToolPM: frontend Angular sotto `/toolpm/pianificatore`, API NestJS sotto `/api/pianificatore`, dati nel database MongoDB `toolpm`. In Docker il frontend risponde su http://localhost:4201/toolpm e il backend su http://localhost:3001/api.

### Componenti

| Livello | Tecnologia | Dove | Dettagli |
| --- | --- | --- | --- |
| Frontend | Angular 22, componenti standalone, signals | `frontend/src/app/pianificatore/` | [frontend.md](frontend.md) |
| Web server | nginx, che serve l'app e inoltra `/api` al backend | `frontend/nginx.conf` | [architettura.md](architettura.md) |
| Backend | NestJS 12, Node.js 22, Mongoose 9 | `backend/src/pianificatore/` | [backend.md](backend.md) |
| Database | MongoDB, database `toolpm` | collection `risorse`, `skills`, `rate`, `certificazioni` | [database.md](database.md) |

### Moduli del backend

| Modulo | API | Contenuto |
| --- | --- | --- |
| `RisorseModule` | `/api/pianificatore/risorse` | Lettura, creazione, sostituzione ed eliminazione delle risorse |
| `AnagraficheModule` | `/api/pianificatore/skills`, `/certificazioni`, `/rate` | CRUD generico delle anagrafiche; controllo di univocità e duplicati sulle scale |
| `PianificazioneModule` | `/api/pianificatore/pianificazione` | Calcolo della griglia risorse × mesi, con filtro per skill |
| `PianificatoreModule` | — | Raggruppa i tre moduli e li monta sotto `/api/pianificatore` con `RouterModule` |

La documentazione interattiva delle API (Swagger) è su http://localhost:3001/api/docs.

### Pagine del frontend

| Percorso | Pagina |
| --- | --- |
| `/toolpm/pianificatore/pianificazione` | Griglia di pianificazione |
| `/toolpm/pianificatore/risorse` | Elenco risorse |
| `/toolpm/pianificatore/risorse/nuova`, `/risorse/:id` | Scheda risorsa |
| `/toolpm/pianificatore/anagrafiche` | Skill, certificazioni, scale di valutazione |

### Calcolo della griglia

1. Il frontend chiama `GET /api/pianificatore/pianificazione?da=AAAAMM&a=AAAAMM`, più `tipoSkill` e `skill` se c'è un filtro.
2. Il backend valida l'intervallo (massimo 36 mesi) e legge le risorse che soddisfano il filtro, ordinate per cognome e nome.
3. Per ogni risorsa crea una cella per mese, scarta segnaposto e mesi fuori intervallo, calcola la pesata di ogni allocazione e somma totale e pesato del mese.
4. Il frontend colora i valori, raggruppa i mesi con più progetti e applica il bordo per importanza.

### Modello dei dati

Un documento per risorsa nella collection `risorse`, con skill e allocazioni incorporate (`skillTecnici`, `skillFunzionali`, `skillAmbiti`, `certificazioni`, `planned`). Le anagrafiche contengono valori di testo usati come suggerimenti; le risorse non le referenziano per id. Schema completo, scale presenti e indici in [database.md](database.md).

### Test e qualità

- Backend: test Vitest sulle utilità dei mesi (`mesi.spec.ts`).
- Frontend: test Vitest sulla shell dell'applicazione e sulle utilità dei mesi.
- Mancano test sul calcolo della griglia e sul filtro per skill: da aggiungere prima delle modifiche della fase 1.

### Evoluzioni tecniche previste

Decise durante l'analisi della Consuntivazione ([analisi-consuntivazione.md](analisi-consuntivazione.md)):

1. **Modulo Comuni.** Risorse, ruoli, clienti, progetti (con attività e approvatori) e centri di costo passano in `src/comuni/`, condivisi tra le sezioni. Il Pianificatore li legge da lì.
2. **Allocazioni collegate ai progetti.** I campi `cliente` e `progetto` delle allocazioni, oggi testo libero, diventano riferimenti all'anagrafica progetti, con una migrazione che associa i testi esistenti.
3. **Autenticazione e profili** su tutte le API, comprese quelle del Pianificatore. Si accede con l'email della risorsa come nome utente. Le risorse le creano i profili PM e PMSenior; le loro caratteristiche (skill, certificazioni, pianificazione e simili) le modificano PM e PMSenior per tutte le risorse e il TL solo per le risorse che lavorano sui suoi progetti.
4. **Tracciamento dei salvataggi**: `creatoIl`, `creatoDa`, `modificatoIl`, `modificatoDa` su ogni documento, valorizzati in automatico; migrazione per i documenti esistenti.
5. **Confronto pianificato e consuntivato**: la Consuntivazione userà le percentuali del Pianificatore per confrontarle con le ore effettivamente lavorate.
6. **Nuovi dati della risorsa**: email (obbligatoria e unica, usata come nome utente) e cellulare (facoltativo).
