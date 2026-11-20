import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import mongoose, { type ClientSession, type Connection, type Model } from 'mongoose';
import type { UtenteAutenticato } from '../../auth/decoratori.js';
import { PermessiService } from '../../permessi/permessi.service.js';
import { Anagrafiche } from '../anagrafiche.js';
import {
  type Approvatore,
  Avanzamento,
  PROFILI_APPROVATORE,
  Progetto,
  STATI_PROGETTO,
  type StatoProgettoValore,
} from '../schemi/progetto.schema.js';
import { Risorsa } from '../schemi/risorsa.schema.js';
import {
  booleano,
  codice,
  controllaDate,
  type Corpo,
  corpo,
  data,
  idRotta,
  numero,
  objectId,
  percentuale,
  presente,
  scelta,
  testo,
} from '../validazione.js';

export type ProgettoLetto = Progetto & { _id: mongoose.Types.ObjectId };

/** Passaggi di stato ammessi: In valutazione → In corso → Chiuso, e riapertura Chiuso → In corso. */
const PASSAGGI: Record<StatoProgettoValore, StatoProgettoValore[]> = {
  inValutazione: ['inCorso'],
  inCorso: ['chiuso'],
  chiuso: ['inCorso'],
};

const CAMPI_STIME = ['managerialeGiorni', 'managerialeCentesimi', 'definitivaGiorni', 'definitivaCentesimi'] as const;

/**
 * Progetti (fase 1, blocco B4): anagrafica, stato, approvatori, percentuale di completamento.
 * I permessi vengono dal blocco B3 (PermessiService); qui si controllano le regole sui dati.
 */
@Injectable()
export class ProgettiService {
  constructor(
    @InjectModel(Progetto.name) private readonly model: Model<Progetto>,
    @InjectModel(Avanzamento.name) private readonly avanzamenti: Model<Avanzamento>,
    @InjectModel(Risorsa.name) private readonly risorse: Model<Risorsa>,
    @InjectConnection() private readonly connection: Connection,
    private readonly permessi: PermessiService,
    private readonly anagrafiche: Anagrafiche,
  ) {}

  /**
   * Il progetto come lo vede l'utente: le stime in euro solo a chi gestisce il progetto
   * (TL e PM del progetto, PMSenior) e al controller; per gli altri restano le stime in giorni.
   */
  vista(utente: UtenteAutenticato, p: ProgettoLetto) {
    const vedeEuro = this.permessi.puoModificareProgetto(utente, p) || utente.ruoli.includes('controller');
    if (vedeEuro) return p;
    const { managerialeCentesimi: _m, definitivaCentesimi: _d, ...stime } = (p.stime ?? {}) as Record<string, number>;
    return Object.assign({}, p, { stime });
  }

  async elenco(utente: UtenteAutenticato, q: { gestibili?: string; stato?: string; clienteId?: string }) {
    const filtro: Record<string, unknown> = {};
    if (q.gestibili === 'true') {
      const gestibili = this.permessi.filtroProgettiGestibili(utente);
      if (!gestibili) return [];
      Object.assign(filtro, gestibili);
    }
    if (q.stato) filtro.stato = scelta(q.stato, 'stato', STATI_PROGETTO);
    if (q.clienteId) filtro.clienteId = objectId(q.clienteId, 'clienteId');
    const elenco = await this.model.find(filtro).sort({ codice: 1 }).lean<ProgettoLetto[]>().exec();
    return elenco.map((p) => this.vista(utente, p));
  }

  async carica(id: string | mongoose.Types.ObjectId): Promise<ProgettoLetto> {
    const _id = typeof id === 'string' ? idRotta(id) : id;
    const doc = _id ? await this.model.findById(_id).lean<ProgettoLetto>().exec() : null;
    if (!doc) throw new NotFoundException(`Progetto ${String(id)} non trovato`);
    return doc;
  }

  /** Dettaglio del progetto, con conConsuntivi: true se ha già ore consuntivate (centro di costo bloccato). */
  async dettaglio(utente: UtenteAutenticato, id: string) {
    const p = await this.carica(id);
    return Object.assign({}, this.vista(utente, p), { conConsuntivi: await this.conConsuntivi(p._id) });
  }

  /** Il progetto ha già righe di consuntivo (in qualsiasi stato). */
  private async conConsuntivi(id: mongoose.Types.ObjectId) {
    return Boolean(await this.model.db.collection('consuntivi').findOne({ 'righe.progettoId': id }, { projection: { _id: 1 } }));
  }

  /**
   * Crea il progetto In valutazione. Chi lo crea ne diventa approvatore con il proprio profilo
   * (TL, oppure PM per PM e PMSenior), se ha una risorsa collegata.
   */
  async crea(utente: UtenteAutenticato, body: unknown) {
    this.permessi.verifica(utente, this.permessi.permessoGlobale(utente, 'creareProgetto'), 'creare un progetto');
    const c = corpo(body);
    const dati: Record<string, unknown> = {
      codice: codice(c.codice),
      titolo: testo(c.titolo, 'titolo', { obbligatorio: true, max: 200 }),
      centroCostoId: objectId(c.centroCostoId, 'centroCostoId', true),
      stato: 'inValutazione',
      percentualeCompletamento: 0,
    };
    const facoltativi = await this.campiModificabili(c, null);
    for (const [k, v] of Object.entries(facoltativi)) if (v !== undefined) dati[k] = v;
    await this.anagrafiche.centriCosto.verificaAttivo(dati.centroCostoId, 'centroCostoId');
    controllaDate(dati.dataInizio as Date | undefined, dati.dataFine as Date | undefined);
    if (await this.model.exists({ codice: dati.codice as string })) throw new ConflictException(`Esiste già un progetto con codice ${String(dati.codice)}`);
    if (utente.risorsaId && mongoose.isValidObjectId(utente.risorsaId)) {
      dati.approvatori = [{ risorsaId: new mongoose.Types.ObjectId(utente.risorsaId), profilo: utente.abilitazione === 'TL' ? 'TL' : 'PM' }];
    }
    const creato = await this.model.create(dati);
    return this.dettaglio(utente, String(creato._id));
  }

  /** Modifica dei dati del progetto (non stato, approvatori, percentuale, che hanno API proprie). */
  async modifica(utente: UtenteAutenticato, id: string, body: unknown) {
    const p = await this.carica(id);
    this.permessi.verifica(utente, this.permessi.puoModificareProgetto(utente, p), 'modificare il progetto');
    const c = corpo(body);
    for (const vietato of ['stato', 'approvatori', 'percentualeCompletamento']) {
      if (presente(c, vietato)) throw new BadRequestException(`${vietato}: si modifica con la sua API dedicata`);
    }
    if (presente(c, 'codice') && c.codice !== p.codice) throw new ConflictException('Il codice del progetto non si può modificare');

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};
    if (presente(c, 'titolo')) $set.titolo = testo(c.titolo, 'titolo', { obbligatorio: true, max: 200 });
    if (presente(c, 'centroCostoId')) {
      // Il centro di costo si corregge solo finché il progetto non ha ore consuntivate (fase 2, blocco C4):
      // le righe ne portano una copia, che deve restare coerente.
      $set.centroCostoId = objectId(c.centroCostoId, 'centroCostoId', true);
      if (String($set.centroCostoId) !== String(p.centroCostoId)) {
        if (await this.conConsuntivi(p._id)) {
          throw new ConflictException('Il centro di costo non si può più cambiare: il progetto ha già ore consuntivate');
        }
        await this.anagrafiche.centriCosto.verificaAttivo($set.centroCostoId, 'centroCostoId');
      }
    }
    for (const [k, v] of Object.entries(await this.campiModificabili(c, p))) {
      if (v === undefined) $unset[k] = 1;
      else $set[k] = v;
    }
    const inizio = presente(c, 'dataInizio') ? ($set.dataInizio as Date | undefined) : p.dataInizio;
    const fine = presente(c, 'dataFine') ? ($set.dataFine as Date | undefined) : p.dataFine;
    controllaDate(inizio, fine);
    if (p.stato !== 'inValutazione' && !inizio) throw new BadRequestException('dataInizio: obbligatoria per un progetto In corso o Chiuso');
    if (p.stato === 'chiuso' && !fine) throw new BadRequestException('dataFine: obbligatoria per un progetto Chiuso');

    await this.model
      .updateOne({ _id: p._id }, { $set, ...(Object.keys($unset).length ? { $unset } : {}) }, { runValidators: true })
      .exec();
    return this.dettaglio(utente, id);
  }

  /** Campi facoltativi comuni a creazione e modifica; undefined = da svuotare. */
  private async campiModificabili(c: Corpo, attuale: ProgettoLetto | null) {
    const f: Record<string, unknown> = {};
    if (presente(c, 'descrizione')) f.descrizione = testo(c.descrizione, 'descrizione', { max: 2000 });
    if (presente(c, 'clienteId')) {
      f.clienteId = objectId(c.clienteId, 'clienteId');
      if (f.clienteId && String(f.clienteId as mongoose.Types.ObjectId) !== String(attuale?.clienteId)) {
        await this.anagrafiche.clienti.verificaAttivo(f.clienteId, 'clienteId');
      }
    }
    if (presente(c, 'dataInizio')) f.dataInizio = data(c.dataInizio, 'dataInizio');
    if (presente(c, 'dataFine')) f.dataFine = data(c.dataFine, 'dataFine');
    if (presente(c, 'soloSuAttivita')) f.soloSuAttivita = booleano(c.soloSuAttivita, 'soloSuAttivita') ?? false;
    if (presente(c, 'stime')) {
      const s = (c.stime ?? {}) as Corpo;
      if (typeof s !== 'object' || Array.isArray(s)) throw new BadRequestException('stime: deve essere un oggetto');
      const stime = Object.assign({}, attuale?.stime) as Record<string, number>;
      for (const campo of CAMPI_STIME) {
        if (!presente(s, campo)) continue;
        const v = numero(s[campo], `stime.${campo}`, { min: 0, intero: campo.endsWith('Centesimi') });
        if (v === undefined) delete stime[campo];
        else stime[campo] = v;
      }
      f.stime = stime;
    }
    return f;
  }

  /**
   * Passaggio di stato. In corso: serve la data di inizio e almeno un PM tra gli approvatori.
   * Chiuso: serve la data di fine. Riapertura di un Chiuso: solo PM del progetto o PMSenior.
   */
  async cambiaStato(utente: UtenteAutenticato, id: string, body: unknown) {
    const p = await this.carica(id);
    const nuovo = scelta(corpo(body).stato, 'stato', STATI_PROGETTO, true) as StatoProgettoValore;
    if (nuovo === p.stato) throw new BadRequestException(`Il progetto è già nello stato ${nuovo}`);
    if (!PASSAGGI[p.stato].includes(nuovo)) throw new BadRequestException(`Passaggio non ammesso: da ${p.stato} a ${nuovo}`);
    const azione = p.stato === 'chiuso' ? 'riaprire il progetto' : `portare il progetto nello stato ${nuovo}`;
    this.permessi.verifica(utente, this.permessi.puoCambiareStatoProgetto(utente, p, p.stato), azione);
    if (nuovo === 'inCorso') {
      if (!p.dataInizio) throw new BadRequestException('Per passare In corso serve la data di inizio');
      if (!p.approvatori.some((a) => a.profilo === 'PM')) throw new BadRequestException('Per passare In corso serve almeno un approvatore PM');
    }
    if (nuovo === 'chiuso' && !p.dataFine) throw new BadRequestException('Per chiudere il progetto serve la data di fine');
    // Aggiornamento condizionato allo stato letto: due passaggi contemporanei non si sovrappongono.
    const r = await this.model.updateOne({ _id: p._id, stato: p.stato }, { $set: { stato: nuovo } }).exec();
    if (r.matchedCount === 0) throw new ConflictException('Lo stato del progetto è cambiato nel frattempo: ricarica e riprova');
    return this.dettaglio(utente, id);
  }

  /**
   * Sostituisce l'elenco degli approvatori (PM del progetto e PMSenior). Una risorsa compare una volta:
   * se è indicata sia TL sia PM vale PM. Un progetto In corso o Chiuso deve avere almeno un PM.
   */
  async impostaApprovatori(utente: UtenteAutenticato, id: string, body: unknown) {
    const p = await this.carica(id);
    this.permessi.verifica(utente, this.permessi.puoGestireApprovatori(utente, p), 'assegnare gli approvatori del progetto');
    const elenco = corpo(body).approvatori;
    if (!Array.isArray(elenco)) throw new BadRequestException('approvatori: deve essere un elenco');
    const perRisorsa = new Map<string, Approvatore>();
    for (const [i, v] of (elenco as Corpo[]).entries()) {
      const risorsaId = objectId(v?.risorsaId, `approvatori[${i}].risorsaId`, true) as mongoose.Types.ObjectId;
      const profilo = scelta(v?.profilo, `approvatori[${i}].profilo`, PROFILI_APPROVATORE, true)!;
      const gia = perRisorsa.get(String(risorsaId));
      if (!gia || profilo === 'PM') perRisorsa.set(String(risorsaId), { risorsaId, profilo });
    }
    const approvatori = [...perRisorsa.values()];
    const esistenti = await this.risorse.countDocuments({ _id: { $in: approvatori.map((a) => a.risorsaId) } }).exec();
    if (esistenti !== approvatori.length) throw new NotFoundException('approvatori: una o più risorse inesistenti');
    if (p.stato !== 'inValutazione' && !approvatori.some((a) => a.profilo === 'PM')) {
      throw new BadRequestException('Un progetto In corso o Chiuso deve avere almeno un approvatore PM');
    }
    await this.model.updateOne({ _id: p._id }, { $set: { approvatori } }, { runValidators: true }).exec();
    return this.dettaglio(utente, id);
  }

  /** Percentuale di completamento del progetto, registrata nello storico degli avanzamenti. */
  async impostaCompletamento(utente: UtenteAutenticato, id: string, body: unknown) {
    const p = await this.carica(id);
    this.permessi.verifica(utente, this.permessi.puoModificarePercentualeProgetto(utente, p), 'modificare la percentuale del progetto');
    const valore = percentuale(corpo(body).percentuale);
    await this.registraAvanzamento(utente, { modello: this.model, _id: p._id, progettoId: p._id, precedente: p.percentualeCompletamento ?? 0, valore });
    return this.dettaglio(utente, id);
  }

  /**
   * Scrive la nuova percentuale e la voce dello storico nella stessa transazione.
   * L'aggiornamento è condizionato al valore letto: se nel frattempo è cambiato, 409.
   */
  async registraAvanzamento(
    utente: UtenteAutenticato,
    a: {
      modello: Model<{ percentualeCompletamento: number }> | Model<Progetto>;
      _id: mongoose.Types.ObjectId;
      progettoId: mongoose.Types.ObjectId;
      attivitaId?: mongoose.Types.ObjectId;
      precedente: number;
      valore: number;
    },
  ) {
    if (a.valore === a.precedente) return;
    await this.connection.transaction(async (session: ClientSession) => {
      const modello = a.modello as Model<{ percentualeCompletamento: number }>;
      const r = await modello
        .updateOne(
          { _id: a._id, percentualeCompletamento: a.precedente },
          { $set: { percentualeCompletamento: a.valore } },
          { session },
        )
        .exec();
      if (r.matchedCount === 0) throw new ConflictException('La percentuale è cambiata nel frattempo: ricarica e riprova');
      await this.avanzamenti.create(
        [
          {
            progettoId: a.progettoId,
            ...(a.attivitaId ? { attivitaId: a.attivitaId } : {}),
            valorePrecedente: a.precedente,
            valoreNuovo: a.valore,
            il: new Date(),
            da: utente.id,
          },
        ],
        { session },
      );
    });
  }

  /** Storico delle percentuali del progetto e delle sue attività, dal più recente. */
  async storicoAvanzamenti(id: string, attivitaId?: string) {
    const p = await this.carica(id);
    const filtro: Record<string, unknown> = { progettoId: p._id };
    if (attivitaId) filtro.attivitaId = objectId(attivitaId, 'attivitaId');
    return this.avanzamenti.find(filtro).sort({ il: -1 }).lean().exec();
  }
}
