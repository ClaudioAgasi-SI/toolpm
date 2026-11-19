// Passo 4 della migrazione: produce risorse.csv e progetti.csv da compilare, e la fotografia della griglia.
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  allocazioniConTesto,
  chiaveCoppia,
  codiceProposto,
  COLONNE_PROGETTI,
  COLONNE_RISORSE,
  FILE_GRIGLIA,
  FILE_PROGETTI,
  FILE_RISORSE,
  fotografiaGriglia,
  norm,
} from './comune.mjs';
import { scriviCsv } from './csv.mjs';

const esiste = (f) =>
  access(f).then(
    () => true,
    () => false,
  );

const giorno = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : '');

/**
 * @param {import('mongodb').Db} db
 * @param {string} cartella
 * @param {{ sovrascrivi?: boolean }} opzioni
 */
export async function esporta(db, cartella, { sovrascrivi = false } = {}) {
  await mkdir(cartella, { recursive: true });
  const fileRisorse = path.join(cartella, FILE_RISORSE);
  const fileProgetti = path.join(cartella, FILE_PROGETTI);
  if (!sovrascrivi && ((await esiste(fileRisorse)) || (await esiste(fileProgetti)))) {
    throw new Error(
      `${FILE_RISORSE} o ${FILE_PROGETTI} esistono già in ${cartella}: potrebbero essere già compilati. ` +
        'Spostali o rinominali, oppure usa --sovrascrivi.',
    );
  }

  const risorse = await db.collection('risorse').find().sort({ cognome: 1, nome: 1 }).toArray();
  const utenti = await db.collection('utenti').find().toArray();
  const ruoli = new Map((await db.collection('ruoli').find().toArray()).map((r) => [String(r._id), r]));
  const progetti = await db.collection('progetti').find().toArray();
  const clienti = new Map((await db.collection('clienti').find().toArray()).map((c) => [String(c._id), c]));
  const centri = new Map((await db.collection('centri_costo').find().toArray()).map((c) => [String(c._id), c]));
  const emailRisorsa = new Map(risorse.map((r) => [String(r._id), r.email ?? '']));

  // risorse.csv: una riga per risorsa, con i valori già presenti (utile se si riesporta).
  const righeRisorse = risorse.map((r) => {
    const utente = utenti.find((u) => String(u.risorsaId) === String(r._id)) ?? (r.email && utenti.find((u) => u.email === r.email));
    const ultimoRuolo = (r.storicoRuoli ?? []).at(-1);
    const ruolo = ultimoRuolo && ruoli.get(String(ultimoRuolo.ruoloId));
    return {
      id: String(r._id),
      cognome: r.cognome,
      nome: r.nome,
      email: r.email ?? '',
      cellulare: r.cellulare ?? '',
      matricola: r.matricola ?? '',
      ruoloCodice: ruolo?.codice ?? '',
      ruoloDescrizione: ruolo?.descrizione ?? '',
      ruoloDal: giorno(ultimoRuolo?.dal),
      oreContrattualiGiorno: r.oreContrattualiGiorno ?? '',
      abilitazione: utente?.abilitazione ?? '',
      accesso: 'si',
    };
  });

  // progetti.csv: una riga per coppia cliente/progetto trovata nelle allocazioni.
  const coppie = new Map();
  for (const { allocazione: a, cliente, progetto } of allocazioniConTesto(risorse)) {
    const k = chiaveCoppia(cliente, progetto);
    const c = coppie.get(k) ?? { cliente, progetto, righe: 0, mesi: new Set() };
    c.righe++;
    c.mesi.add(a.mese);
    coppie.set(k, c);
  }
  const righeProgetti = [...coppie.values()]
    .sort((x, y) => x.cliente.localeCompare(y.cliente) || x.progetto.localeCompare(y.progetto))
    .map((c) => {
      const mesi = [...c.mesi].sort();
      const info = `${c.righe} allocazioni, mesi ${mesi[0]}–${mesi.at(-1)}`;
      const p = progetti.find((x) => (x.aliasPianificatore ?? []).some((al) => chiaveCoppia(al.cliente, al.progetto) === chiaveCoppia(c.cliente, c.progetto)));
      if (p) {
        const cliente = p.clienteId && clienti.get(String(p.clienteId));
        const centro = centri.get(String(p.centroCostoId));
        const emails = (profilo) =>
          (p.approvatori ?? [])
            .filter((a) => a.profilo === profilo)
            .map((a) => emailRisorsa.get(String(a.risorsaId)))
            .filter(Boolean)
            .join(' ');
        return {
          clienteTesto: c.cliente,
          progettoTesto: c.progetto,
          allocazioni: info,
          codice: p.codice,
          titolo: p.titolo,
          descrizione: p.descrizione ?? '',
          clienteCodice: cliente?.codice ?? '',
          clienteRagioneSociale: cliente?.ragioneSociale ?? '',
          centroCostoCodice: centro?.codice ?? '',
          centroCostoDescrizione: centro?.descrizione ?? '',
          pm: emails('PM'),
          tl: emails('TL'),
          stato: p.stato,
          dataInizio: giorno(p.dataInizio),
          dataFine: giorno(p.dataFine),
        };
      }
      return {
        clienteTesto: c.cliente,
        progettoTesto: c.progetto,
        allocazioni: info,
        codice: codiceProposto(c.progetto || c.cliente),
        titolo: c.progetto || c.cliente,
        descrizione: '',
        clienteCodice: c.cliente ? codiceProposto(c.cliente) : '',
        clienteRagioneSociale: c.cliente,
        centroCostoCodice: '',
        centroCostoDescrizione: '',
        pm: '',
        tl: '',
        stato: 'inValutazione',
        dataInizio: '',
        dataFine: '',
      };
    });

  await writeFile(fileRisorse, scriviCsv(COLONNE_RISORSE, righeRisorse));
  await writeFile(fileProgetti, scriviCsv(COLONNE_PROGETTI, righeProgetti));

  // Fotografia della griglia prima della migrazione: si scrive una sola volta e non si sovrascrive.
  const fileGriglia = path.join(cartella, FILE_GRIGLIA);
  const nuovaFotografia = !(await esiste(fileGriglia));
  if (nuovaFotografia) {
    await writeFile(fileGriglia, JSON.stringify({ creataIl: new Date().toISOString(), totali: fotografiaGriglia(risorse) }, null, 1));
  }
  return { risorse: righeRisorse.length, progetti: righeProgetti.length, fotografiaGriglia: nuovaFotografia ? 'creata' : 'già presente' };
}
