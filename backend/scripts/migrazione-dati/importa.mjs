// Passi 5 e 6 della migrazione: legge risorse.csv e progetti.csv compilati, controlla tutto e, solo se
// non ci sono errori, crea o aggiorna in un'unica transazione ruoli, risorse, utenti, clienti, centri di
// costo e progetti, poi collega le allocazioni del Pianificatore ai progetti (progettoId).
// Con { prova: true } esegue tutto e annulla la transazione: mostra cosa farebbe senza scrivere nulla.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import {
  allocazioniConTesto,
  chiaveCoppia,
  FILE_PROGETTI,
  FILE_RISORSE,
  norm,
  testiAllocazione,
  tracciaModifica,
  tracciaNuovo,
  UTENTE,
} from './comune.mjs';
import { leggiCsv, scriviCsv } from './csv.mjs';
import { cifraPassword, passwordProvvisoria } from './password.mjs';

const { ObjectId } = mongoose.Types;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_CODICE = /^[A-Za-z0-9._-]{1,40}$/;
const ABILITAZIONI = { tl: 'TL', pm: 'PM', pmsenior: 'PMSenior' };
const STATI = { invalutazione: 'inValutazione', incorso: 'inCorso', chiuso: 'chiuso' };

/** Data AAAA-MM-GG (accetta anche GG/MM/AAAA, come la scrive Excel in italiano). */
function leggiData(v) {
  if (!v) return undefined;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) {
    const it = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
    if (it) m = [v, it[3], it[2].padStart(2, '0'), it[1].padStart(2, '0')];
  }
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}` ? null : d;
}

const elencoEmail = (v) =>
  norm(v)
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((e) => e.toLowerCase());

async function leggiFile(cartella, nome) {
  try {
    return leggiCsv(await readFile(path.join(cartella, nome), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`Manca ${nome} in ${cartella}: esegui prima "esporta"`);
    throw err;
  }
}

/**
 * Controlla i due file e prepara il piano delle scritture. Non scrive nulla.
 * @returns {{ errori: string[], avvisi: string[], piano?: object }}
 */
export async function controlla(db, cartella) {
  const errori = [];
  const avvisi = [];
  const csvR = await leggiFile(cartella, FILE_RISORSE);
  const csvP = await leggiFile(cartella, FILE_PROGETTI);
  for (const [nome, csv, col] of [
    [FILE_RISORSE, csvR, ['id', 'email']],
    [FILE_PROGETTI, csvP, ['clienteTesto', 'progettoTesto', 'codice']],
  ]) {
    const mancanti = col.filter((c) => !csv.colonne.includes(c));
    if (mancanti.length) errori.push(`${nome}: mancano le colonne ${mancanti.join(', ')}`);
  }
  if (errori.length) return { errori, avvisi };

  const risorse = await db.collection('risorse').find().toArray();
  const perId = new Map(risorse.map((r) => [String(r._id), r]));
  const utenti = await db.collection('utenti').find().toArray();
  const ruoli = new Map((await db.collection('ruoli').find().toArray()).map((r) => [r.codice, r]));
  const clienti = new Map((await db.collection('clienti').find().toArray()).map((c) => [c.codice, c]));
  const centri = new Map((await db.collection('centri_costo').find().toArray()).map((c) => [c.codice, c]));
  const progettiDb = new Map((await db.collection('progetti').find().toArray()).map((p) => [p.codice, p]));

  // ---- risorse.csv
  const pianoRisorse = [];
  const emailInFile = new Map();
  const nuoviRuoli = new Map();
  const visti = new Set();
  for (const r of csvR.righe) {
    const dove = `${FILE_RISORSE} riga ${r._riga}`;
    const err = (m) => errori.push(`${dove}: ${m}`);
    const risorsa = mongoose.isValidObjectId(r.id) ? perId.get(String(r.id)) : undefined;
    if (!risorsa) {
      err(`id "${r.id}" non corrisponde a nessuna risorsa (non modificare la colonna id)`);
      continue;
    }
    if (visti.has(r.id)) {
      err(`risorsa ${r.id} presente due volte`);
      continue;
    }
    visti.add(r.id);
    const voce = { risorsa, riga: r._riga, nomeCompleto: `${risorsa.cognome} ${risorsa.nome}` };

    const email = norm(r.email).toLowerCase();
    if (email) {
      if (!RE_EMAIL.test(email)) err(`email "${r.email}" non valida`);
      else if (emailInFile.has(email)) err(`email ${email} già usata alla riga ${emailInFile.get(email)}`);
      else if (risorse.some((x) => x.email === email && String(x._id) !== r.id)) err(`email ${email} già usata da un'altra risorsa nel database`);
      else {
        emailInFile.set(email, r._riga);
        voce.email = email;
      }
    }
    if (norm(r.cellulare)) voce.cellulare = norm(r.cellulare);
    if (norm(r.matricola)) voce.matricola = norm(r.matricola);
    if (norm(r.oreContrattualiGiorno)) {
      const ore = Number(norm(r.oreContrattualiGiorno).replace(',', '.'));
      if (!Number.isFinite(ore) || ore < 0 || ore > 24) err(`oreContrattualiGiorno "${r.oreContrattualiGiorno}" non valido (0–24)`);
      else voce.oreContrattualiGiorno = ore;
    }
    if (norm(r.abilitazione)) {
      voce.abilitazione = ABILITAZIONI[norm(r.abilitazione).toLowerCase().replace(/\s/g, '')];
      if (!voce.abilitazione) err(`abilitazione "${r.abilitazione}" non valida (TL, PM, PMSenior o vuota)`);
    }
    const accesso = norm(r.accesso).toLowerCase() || 'si';
    if (!['si', 'sì', 'no'].includes(accesso)) err(`accesso "${r.accesso}" non valido (si o no)`);
    voce.accesso = accesso !== 'no';
    if (norm(r.ruoloCodice)) {
      const codice = norm(r.ruoloCodice);
      const dal = leggiData(norm(r.ruoloDal));
      if (!RE_CODICE.test(codice)) err(`ruoloCodice "${codice}" non valido (lettere, cifre, . - _ senza spazi)`);
      if (!dal) err(`ruoloDal obbligatoria con il ruolo, nel formato AAAA-MM-GG`);
      if (!ruoli.has(codice)) {
        const descr = norm(r.ruoloDescrizione);
        if (!descr && !nuoviRuoli.has(codice)) err(`ruolo ${codice} nuovo: serve ruoloDescrizione`);
        else if (descr && nuoviRuoli.has(codice) && nuoviRuoli.get(codice) !== descr) {
          err(`ruolo ${codice} con due descrizioni diverse ("${nuoviRuoli.get(codice)}" e "${descr}")`);
        } else if (descr) nuoviRuoli.set(codice, descr);
      }
      voce.ruolo = { codice, dal };
    }
    if (voce.abilitazione && !voce.email && !risorsa.email) err('abilitazione indicata ma email mancante: senza email non si crea l\'utente');
    const emailFinale = voce.email ?? risorsa.email;
    if (emailFinale) {
      const u = utenti.find((x) => x.email === emailFinale);
      if (u?.risorsaId && String(u.risorsaId) !== r.id) err(`l'utente ${emailFinale} è già collegato a un'altra risorsa`);
      voce.utenteEsistente = u;
    } else {
      avvisi.push(`${dove}: ${voce.nomeCompleto} senza email — resta "da completare" e non potrà accedere`);
    }
    pianoRisorse.push(voce);
  }
  for (const r of risorse) {
    if (!visti.has(String(r._id))) avvisi.push(`${FILE_RISORSE}: ${r.cognome} ${r.nome} non è nel file — non viene modificata`);
  }

  // Email → risorsa, dopo l'importazione (file + database), per PM e TL dei progetti.
  const risorsaPerEmail = new Map(risorse.filter((r) => r.email).map((r) => [r.email, r._id]));
  for (const v of pianoRisorse) if (v.email) risorsaPerEmail.set(v.email, v.risorsa._id);

  // ---- progetti.csv
  const coppieDati = new Set();
  for (const { cliente, progetto } of allocazioniConTesto(risorse)) coppieDati.add(chiaveCoppia(cliente, progetto));
  const coppieFile = new Map();
  const perCodice = new Map();
  const nuoviClienti = new Map();
  const nuoviCentri = new Map();
  for (const p of csvP.righe) {
    const dove = `${FILE_PROGETTI} riga ${p._riga}`;
    const err = (m) => errori.push(`${dove}: ${m}`);
    const k = chiaveCoppia(p.clienteTesto, p.progettoTesto);
    if (!coppieDati.has(k)) {
      err(`la coppia "${p.clienteTesto}" / "${p.progettoTesto}" non c'è nelle allocazioni (non modificare clienteTesto e progettoTesto)`);
      continue;
    }
    if (coppieFile.has(k)) {
      err(`coppia già presente alla riga ${coppieFile.get(k)}`);
      continue;
    }
    coppieFile.set(k, p._riga);

    const codice = norm(p.codice);
    if (!RE_CODICE.test(codice)) err(`codice "${p.codice}" non valido (lettere, cifre, . - _ senza spazi, max 40)`);
    const titolo = norm(p.titolo);
    if (!titolo) err('titolo obbligatorio');

    const clienteCodice = norm(p.clienteCodice);
    if (clienteCodice) {
      if (!RE_CODICE.test(clienteCodice)) err(`clienteCodice "${clienteCodice}" non valido`);
      else if (!clienti.has(clienteCodice)) {
        const rs = norm(p.clienteRagioneSociale);
        if (!rs && !nuoviClienti.has(clienteCodice)) err(`cliente ${clienteCodice} nuovo: serve clienteRagioneSociale`);
        else if (rs && nuoviClienti.has(clienteCodice) && nuoviClienti.get(clienteCodice) !== rs) {
          err(`cliente ${clienteCodice} con due ragioni sociali diverse`);
        } else if (rs) nuoviClienti.set(clienteCodice, rs);
      } else if (!clienti.get(clienteCodice).attivo) err(`cliente ${clienteCodice} non attivo`);
    }
    const centroCodice = norm(p.centroCostoCodice);
    if (!centroCodice) err('centroCostoCodice obbligatorio');
    else if (!RE_CODICE.test(centroCodice)) err(`centroCostoCodice "${centroCodice}" non valido`);
    else if (!centri.has(centroCodice)) {
      const d = norm(p.centroCostoDescrizione);
      if (!d && !nuoviCentri.has(centroCodice)) err(`centro di costo ${centroCodice} nuovo: serve centroCostoDescrizione`);
      else if (d && nuoviCentri.has(centroCodice) && nuoviCentri.get(centroCodice) !== d) err(`centro di costo ${centroCodice} con due descrizioni diverse`);
      else if (d) nuoviCentri.set(centroCodice, d);
    } else if (!centri.get(centroCodice).attivo) err(`centro di costo ${centroCodice} non attivo`);

    const approvatori = [];
    for (const [colonna, profilo] of [
      ['pm', 'PM'],
      ['tl', 'TL'],
    ]) {
      for (const e of elencoEmail(p[colonna])) {
        const id = risorsaPerEmail.get(e);
        if (!id) err(`${colonna}: ${e} non è l'email di nessuna risorsa (né nel database né in ${FILE_RISORSE})`);
        else if (!approvatori.some((a) => String(a.risorsaId) === String(id))) approvatori.push({ risorsaId: id, profilo });
      }
    }
    const stato = STATI[norm(p.stato).toLowerCase().replace(/\s/g, '') || 'invalutazione'];
    if (!stato) err(`stato "${p.stato}" non valido (inValutazione, inCorso, chiuso)`);
    const dataInizio = leggiData(norm(p.dataInizio));
    const dataFine = leggiData(norm(p.dataFine));
    if (dataInizio === null) err(`dataInizio "${p.dataInizio}" non valida (AAAA-MM-GG)`);
    if (dataFine === null) err(`dataFine "${p.dataFine}" non valida (AAAA-MM-GG)`);
    if (dataInizio && dataFine && dataFine < dataInizio) err('dataFine precede dataInizio');
    const haPM = approvatori.some((a) => a.profilo === 'PM');
    if (stato === 'inCorso' || stato === 'chiuso') {
      if (!dataInizio) err(`stato ${stato}: serve dataInizio`);
      if (!haPM) err(`stato ${stato}: serve almeno un PM`);
    }
    if (stato === 'chiuso' && !dataFine) err('stato chiuso: serve dataFine');
    if (!haPM && stato === 'inValutazione') avvisi.push(`${dove}: progetto ${codice} senza PM — andrà assegnato prima di passarlo In corso`);

    const dati = {
      codice,
      titolo,
      descrizione: norm(p.descrizione) || undefined,
      clienteCodice: clienteCodice || undefined,
      centroCodice,
      approvatori,
      stato,
      dataInizio: dataInizio ?? undefined,
      dataFine: dataFine ?? undefined,
    };
    const firma = JSON.stringify(dati);
    const gia = perCodice.get(codice);
    if (gia && gia.firma !== firma) {
      err(`il codice ${codice} è usato anche alla riga ${gia.righe[0]} con dati diversi: le righe dello stesso progetto devono essere uguali (tranne clienteTesto e progettoTesto)`);
    } else if (gia) {
      gia.righe.push(p._riga);
      gia.alias.push({ cliente: norm(p.clienteTesto), progetto: norm(p.progettoTesto) });
    } else {
      perCodice.set(codice, { dati, firma, righe: [p._riga], alias: [{ cliente: norm(p.clienteTesto), progetto: norm(p.progettoTesto) }] });
    }
  }
  for (const k of coppieDati) {
    if (!coppieFile.has(k)) {
      const [cliente, progetto] = k.split('\u0000');
      errori.push(`${FILE_PROGETTI}: manca la riga per "${cliente}" / "${progetto}", presente nelle allocazioni (riesegui "esporta" in un'altra cartella per vederla)`);
    }
  }
  for (const codice of perCodice.keys()) {
    if (progettiDb.has(codice)) avvisi.push(`${FILE_PROGETTI}: il progetto ${codice} esiste già — viene aggiornato con i dati del file`);
  }

  return {
    errori,
    avvisi,
    piano: { pianoRisorse, nuoviRuoli, nuoviClienti, nuoviCentri, perCodice, risorse },
  };
}

/** Applica il piano nella transazione della sessione. Restituisce il riepilogo e le password create. */
async function applica(db, session, piano, ora) {
  const o = { session };
  const conteggi = { ruoliCreati: 0, risorseAggiornate: 0, utentiCreati: 0, utentiAggiornati: 0, clientiCreati: 0, centriCreati: 0, progettiCreati: 0, progettiAggiornati: 0, allocazioniCollegate: 0 };
  const passwords = [];

  for (const [codice, descrizione] of piano.nuoviRuoli) {
    await db.collection('ruoli').insertOne({ codice, descrizione, attivo: true, ...tracciaNuovo(ora) }, o);
    conteggi.ruoliCreati++;
  }
  const ruoli = new Map((await db.collection('ruoli').find({}, o).toArray()).map((r) => [r.codice, r._id]));

  for (const v of piano.pianoRisorse) {
    const $set = { ...tracciaModifica(ora) };
    for (const campo of ['email', 'cellulare', 'matricola', 'oreContrattualiGiorno']) if (v[campo] !== undefined) $set[campo] = v[campo];
    if (v.ruolo) {
      const storico = (v.risorsa.storicoRuoli ?? []).filter((s) => s.dal.getTime() !== v.ruolo.dal.getTime());
      storico.push({ ruoloId: ruoli.get(v.ruolo.codice), dal: v.ruolo.dal });
      $set.storicoRuoli = storico.sort((a, b) => a.dal - b.dal);
    }
    await db.collection('risorse').updateOne({ _id: v.risorsa._id }, { $set }, o);
    conteggi.risorseAggiornate++;

    const email = v.email ?? v.risorsa.email;
    if (!email || !v.accesso) continue;
    if (v.utenteEsistente) {
      const $setU = { risorsaId: v.risorsa._id, ...tracciaModifica(ora) };
      if (v.abilitazione) $setU.abilitazione = v.abilitazione;
      await db.collection('utenti').updateOne({ _id: v.utenteEsistente._id }, { $set: $setU, $addToSet: { ruoli: 'risorsa' } }, o);
      conteggi.utentiAggiornati++;
    } else {
      const password = passwordProvvisoria();
      await db.collection('utenti').insertOne(
        {
          email,
          passwordHash: await cifraPassword(password),
          nome: `${v.risorsa.nome} ${v.risorsa.cognome}`,
          risorsaId: v.risorsa._id,
          abilitazione: v.abilitazione ?? null,
          ruoli: ['risorsa'],
          attivo: true,
          deveCambiarePassword: true,
          ...tracciaNuovo(ora),
        },
        o,
      );
      passwords.push({ email, nome: `${v.risorsa.cognome} ${v.risorsa.nome}`, passwordProvvisoria: password });
      conteggi.utentiCreati++;
    }
  }

  for (const [nome, collection, campo, mappa, conteggio] of [
    ['clienti', 'clienti', 'ragioneSociale', piano.nuoviClienti, 'clientiCreati'],
    ['centri', 'centri_costo', 'descrizione', piano.nuoviCentri, 'centriCreati'],
  ]) {
    void nome;
    for (const [codice, testo] of mappa) {
      await db.collection(collection).insertOne({ codice, [campo]: testo, attivo: true, ...tracciaNuovo(ora) }, o);
      conteggi[conteggio]++;
    }
  }
  const clienti = new Map((await db.collection('clienti').find({}, o).toArray()).map((c) => [c.codice, c._id]));
  const centri = new Map((await db.collection('centri_costo').find({}, o).toArray()).map((c) => [c.codice, c._id]));

  const progettoPerCoppia = new Map();
  for (const [codice, { dati, alias }] of piano.perCodice) {
    const campi = {
      titolo: dati.titolo,
      centroCostoId: centri.get(dati.centroCodice),
      approvatori: dati.approvatori,
      stato: dati.stato,
    };
    const $unset = {};
    for (const [campo, valore] of [
      ['descrizione', dati.descrizione],
      ['clienteId', dati.clienteCodice && clienti.get(dati.clienteCodice)],
      ['dataInizio', dati.dataInizio],
      ['dataFine', dati.dataFine],
    ]) {
      if (valore) campi[campo] = valore;
      else $unset[campo] = '';
    }
    const esistente = await db.collection('progetti').findOne({ codice }, o);
    let id;
    if (esistente) {
      await db.collection('progetti').updateOne(
        { _id: esistente._id },
        { $set: { ...campi, ...tracciaModifica(ora) }, ...(Object.keys($unset).length ? { $unset } : {}), $addToSet: { aliasPianificatore: { $each: alias } } },
        o,
      );
      id = esistente._id;
      conteggi.progettiAggiornati++;
    } else {
      id = (
        await db.collection('progetti').insertOne(
          { codice, ...campi, soloSuAttivita: false, percentualeCompletamento: 0, stime: {}, aliasPianificatore: alias, ...tracciaNuovo(ora) },
          o,
        )
      ).insertedId;
      conteggi.progettiCreati++;
    }
    for (const a of alias) progettoPerCoppia.set(chiaveCoppia(a.cliente, a.progetto), id);
  }

  // Collegamento delle allocazioni: progettoId + testi originali in clienteTesto/progettoTesto.
  // Dal blocco B5 i campi cliente e progetto non si salvano più: il cliente si ricava dal progetto.
  for (const r of piano.risorse) {
    let cambiata = false;
    const planned = (r.planned ?? []).map((a) => {
      const t = testiAllocazione(a);
      const id = (t.progetto || t.cliente) && progettoPerCoppia.get(chiaveCoppia(t.cliente, t.progetto));
      if (!id) return a;
      cambiata = true;
      conteggi.allocazioniCollegate++;
      const { cliente: _c, progetto: _p, ...resto } = a;
      return { ...resto, progettoId: id, clienteTesto: t.cliente, progettoTesto: t.progetto };
    });
    if (cambiata) await db.collection('risorse').updateOne({ _id: r._id }, { $set: { planned, ...tracciaModifica(ora) } }, o);
  }

  await db.collection('migrazioni').updateOne(
    { _id: 'B7-importa' },
    {
      $set: { descrizione: 'Importazione dei dati del Pianificatore da risorse.csv e progetti.csv', eseguitaIl: ora, risultato: conteggi, ...tracciaModifica(ora) },
      $setOnInsert: { creatoIl: ora, creatoDa: UTENTE },
    },
    { ...o, upsert: true },
  );
  return { conteggi, passwords };
}

/**
 * Controlla e, se non ci sono errori, importa. Con prova = true annulla la transazione alla fine.
 * @returns {{ errori: string[], avvisi: string[], conteggi?: object, filePassword?: string }}
 */
export async function importa(client, db, cartella, { prova = false } = {}) {
  const { errori, avvisi, piano } = await controlla(db, cartella);
  if (errori.length) return { errori, avvisi };
  const ora = new Date();
  const session = client.startSession();
  let esito;
  try {
    session.startTransaction();
    esito = await applica(db, session, piano, ora);
    if (prova) await session.abortTransaction();
    else await session.commitTransaction();
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    throw err;
  } finally {
    await session.endSession();
  }
  let filePassword;
  if (!prova && esito.passwords.length) {
    const quando = ora.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    filePassword = path.join(cartella, `utenti-creati-${quando}.csv`);
    await writeFile(filePassword, scriviCsv(['email', 'nome', 'passwordProvvisoria'], esito.passwords));
  }
  return { errori, avvisi, conteggi: esito.conteggi, filePassword, prova };
}
