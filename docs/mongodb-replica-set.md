# MongoDB come replica set (fase 1, blocco B0)

La fase 1 richiede MongoDB configurato come **replica set a un nodo**: è la condizione per usare le transazioni, necessarie alle migrazioni e, dalla fase 2, ai consuntivi. I dati non cambiano. Cambiano solo l'avvio del container di MongoDB e la stringa di connessione.

La procedura vale per l'istanza MongoDB già presente su Docker Desktop, condivisa con il vecchio pianificatore (database `pianificazione`).

> Se l'istanza usa utenti e password (autenticazione attiva), un replica set richiede anche un *keyFile*: in quel caso la procedura va adattata prima di applicarla.

## 1. Individuare il container

```bash
docker ps --filter "publish=27017" --format "table {{.Names}}\t{{.Image}}"
docker inspect <nome-container> --format "{{json .Mounts}}"
```

Annotare nome del container, immagine (es. `mongo:8`) e volume o cartella montata su `/data/db`. Negli esempi seguenti il container si chiama `mongodb` e il volume `mongodb-data`.
                 mongodb                mongo:latest      52bdea6b28b5b270851e35a3b0bd00c72c8323657bb0bfbfc879457a5e183b56 

## 2. Backup

Prima di qualsiasi modifica, una copia dei due database:

```bash
docker exec mongodb mongodump --db toolpm --archive --gzip > backup-toolpm-AAAAMMGG.archive.gz
docker exec mongodb mongodump --db pianificazione --archive --gzip > backup-pianificazione-AAAAMMGG.archive.gz
```

Per ripristinare: `docker exec -i mongodb mongorestore --archive --gzip < backup-toolpm-AAAAMMGG.archive.gz`.

## 3. Ricreare il container con il replica set

Fermare ToolPM (`docker compose down`) e il vecchio pianificatore, poi:

```bash
docker stop mongodb
docker rename mongodb mongodb-vecchio
docker run -d --name mongodb -p 27017:27017 -v mongodb-data:/data/db --restart unless-stopped mongo:8 --replSet rs0 --bind_ip_all
```
docker run -d --name mongodb -p 27017:27017 -v  52bdea6b28b5b270851e35a3b0bd00c72c8323657bb0bfbfc879457a5e183b56:/data/db --restart unless-stopped mongo:latest --replSet rs0 --bind_ip_all


Usare la stessa immagine e lo stesso volume del container originale, e riportare le altre opzioni eventualmente presenti (variabili d'ambiente, porte aggiuntive).

## 4. Inizializzare il replica set

Una sola volta:

```bash
docker exec mongodb mongosh --quiet --eval "rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] })"
docker exec mongodb mongosh --quiet --eval "rs.status().members[0].stateStr"
```

Il secondo comando deve rispondere `PRIMARY`.

## 5. Stringa di connessione

Il membro del replica set si chiama `localhost:27017`, un nome che dentro i container non indica MongoDB. Per questo la stringa di connessione deve contenere `directConnection=true`, che collega il driver direttamente all'indirizzo indicato senza cercare gli altri membri:

```
MONGODB_URI=mongodb://host.docker.internal:27017/toolpm?directConnection=true
```

È già il valore predefinito di `docker-compose.yml` e di `.env.example`; se esiste un file `.env`, aggiornarlo. L'opzione funziona anche con un'istanza singola, quindi si può impostare prima del passaggio. Se il vecchio pianificatore si collega con un nome diverso da `localhost`, aggiungere la stessa opzione anche nella sua configurazione.

## 6. Verifica

```bash
docker compose up -d --build
docker compose exec backend npm run verifica-mongodb
```

Lo script deve indicare `Replica set: rs0` e `Transazioni: disponibili`, ed esce con codice 0. Anche http://localhost:3001/api/health riporta `"replicaSet": "rs0"`. Controllare infine che il vecchio pianificatore su http://localhost:4200 mostri i suoi dati.

Quando tutto funziona, eliminare il container vecchio: `docker rm mongodb-vecchio`.

## Tornare indietro

Fermare il nuovo container, rinominare `mongodb-vecchio` in `mongodb` e riavviarlo. Se i dati risultano alterati, ripristinare i backup del punto 2.
