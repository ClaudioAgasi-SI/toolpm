import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type mongoose from 'mongoose';
import type { Connection, Model } from 'mongoose';
import type { UtenteAutenticato } from '../../auth/decoratori.js';
import { AuditService, differenze } from '../../infrastruttura/audit.service.js';
import { PermessiService } from '../../permessi/permessi.service.js';
import { Attivita, STATI_ATTIVITA } from '../schemi/progetto.schema.js';
import { Risorsa } from '../schemi/risorsa.schema.js';
import {
  codice,
  controllaDate,
  type Corpo,
  corpo,
  data,
  elencoObjectId,
  idRotta,
  numero,
  percentuale,
  presente,
  scelta,
  testo,
} from '../validazione.js';
import { ProgettiService } from './progetti.service.js';

type AttivitaLetta = Attivita & { _id: mongoose.Types.ObjectId };

/**
 * Attività di un progetto (fase 1, blocco B4). Le gestiscono TL e PM del progetto e i PMSenior;
 * la percentuale anche le risorse assegnate all'attività.
 */
@Injectable()
export class AttivitaService {
  constructor(
    @InjectModel(Attivita.name) private readonly model: Model<Attivita>,
    @InjectModel(Risorsa.name) private readonly risorse: Model<Risorsa>,
    private readonly progetti: ProgettiService,
    private readonly permessi: PermessiService,
    private readonly audit: AuditService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async elenco(progettoId: string) {
    const p = await this.progetti.carica(progettoId);
    return this.model.find({ progettoId: p._id }).sort({ codice: 1 }).lean().exec();
  }

  private async carica(progettoId: string, id: string) {
    const p = await this.progetti.carica(progettoId);
    const _id = idRotta(id);
    const a = _id ? await this.model.findOne({ _id, progettoId: p._id }).lean<AttivitaLetta>().exec() : null;
    if (!a) throw new NotFoundException(`Attività ${id} non trovata nel progetto ${p.codice}`);
    return { p, a };
  }

  async dettaglio(progettoId: string, id: string) {
    return (await this.carica(progettoId, id)).a;
  }

  async crea(utente: UtenteAutenticato, progettoId: string, body: unknown) {
    const p = await this.progetti.carica(progettoId);
    this.permessi.verifica(utente, this.permessi.puoGestireAttivita(utente, p), 'gestire le attività del progetto');
    const c = corpo(body);
    const dati: Record<string, unknown> = {
      progettoId: p._id,
      codice: codice(c.codice),
      descrizione: testo(c.descrizione, 'descrizione', { obbligatorio: true, max: 500 }),
      stato: 'attiva',
      percentualeCompletamento: 0,
    };
    for (const [k, v] of Object.entries(await this.campiFacoltativi(c))) if (v !== undefined) dati[k] = v;
    controllaDate(dati.dataInizio as Date | undefined, dati.dataFine as Date | undefined);
    if (await this.model.exists({ progettoId: p._id, codice: dati.codice as string })) {
      throw new ConflictException(`Esiste già un'attività con codice ${String(dati.codice)} nel progetto ${p.codice}`);
    }
    // Storico (fase 3, blocco D5): creazione, modifica e assegnazioni delle attività.
    const creata = await this.connection.transaction(async (session) => {
      const [doc] = await this.model.create([dati], { session });
      await this.audit.registra({ collezione: 'attivita', documentoId: doc._id, operazione: 'creazione', dopo: dati }, session);
      return doc;
    });
    return this.dettaglio(progettoId, String(creata._id));
  }

  async modifica(utente: UtenteAutenticato, progettoId: string, id: string, body: unknown) {
    const { p, a } = await this.carica(progettoId, id);
    this.permessi.verifica(utente, this.permessi.puoGestireAttivita(utente, p), 'gestire le attività del progetto');
    const c = corpo(body);
    for (const vietato of ['progettoId', 'percentualeCompletamento']) {
      if (presente(c, vietato)) throw new BadRequestException(`${vietato}: non modificabile con questa API`);
    }
    if (presente(c, 'codice') && c.codice !== a.codice) throw new ConflictException('Il codice dell\'attività non si può modificare');
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};
    if (presente(c, 'descrizione')) $set.descrizione = testo(c.descrizione, 'descrizione', { obbligatorio: true, max: 500 });
    if (presente(c, 'stato')) $set.stato = scelta(c.stato, 'stato', STATI_ATTIVITA, true);
    for (const [k, v] of Object.entries(await this.campiFacoltativi(c))) {
      if (v === undefined) $unset[k] = 1;
      else $set[k] = v;
    }
    controllaDate(
      presente(c, 'dataInizio') ? ($set.dataInizio as Date | undefined) : a.dataInizio,
      presente(c, 'dataFine') ? ($set.dataFine as Date | undefined) : a.dataFine,
    );
    await this.connection.transaction(async (session) => {
      await this.model
        .updateOne({ _id: a._id }, { $set, ...(Object.keys($unset).length ? { $unset } : {}) }, { runValidators: true, session })
        .exec();
      const diff = differenze(a, $set, Object.keys($unset));
      if (diff) await this.audit.registra({ collezione: 'attivita', documentoId: a._id, operazione: 'modifica', ...diff }, session);
    });
    return this.dettaglio(progettoId, id);
  }

  /** Sostituisce l'elenco delle risorse assegnate all'attività. */
  async impostaRisorse(utente: UtenteAutenticato, progettoId: string, id: string, body: unknown) {
    const { p, a } = await this.carica(progettoId, id);
    this.permessi.verifica(utente, this.permessi.puoGestireAttivita(utente, p), 'assegnare le risorse all\'attività');
    const ids = elencoObjectId(corpo(body).risorseAssegnateIds, 'risorseAssegnateIds');
    if ((await this.risorse.countDocuments({ _id: { $in: ids } }).exec()) !== ids.length) {
      throw new NotFoundException('risorseAssegnateIds: una o più risorse inesistenti');
    }
    await this.connection.transaction(async (session) => {
      await this.model.updateOne({ _id: a._id }, { $set: { risorseAssegnateIds: ids } }, { session }).exec();
      const diff = differenze(a, { risorseAssegnateIds: ids });
      if (diff) await this.audit.registra({ collezione: 'attivita', documentoId: a._id, operazione: 'assegnazioni', ...diff }, session);
    });
    return this.dettaglio(progettoId, id);
  }

  /** Percentuale di completamento dell'attività, registrata nello storico degli avanzamenti. */
  async impostaCompletamento(utente: UtenteAutenticato, progettoId: string, id: string, body: unknown) {
    const { p, a } = await this.carica(progettoId, id);
    this.permessi.verifica(
      utente,
      this.permessi.puoModificarePercentualeAttivita(utente, p, a),
      'modificare la percentuale dell\'attività',
    );
    const valore = percentuale(corpo(body).percentuale);
    await this.progetti.registraAvanzamento(utente, {
      modello: this.model as unknown as Model<{ percentualeCompletamento: number }>,
      _id: a._id,
      progettoId: p._id,
      attivitaId: a._id,
      precedente: a.percentualeCompletamento ?? 0,
      valore,
    });
    return this.dettaglio(progettoId, id);
  }

  private async campiFacoltativi(c: Corpo) {
    const f: Record<string, unknown> = {};
    if (presente(c, 'dataInizio')) f.dataInizio = data(c.dataInizio, 'dataInizio');
    if (presente(c, 'dataFine')) f.dataFine = data(c.dataFine, 'dataFine');
    if (presente(c, 'stimaGiorni')) f.stimaGiorni = numero(c.stimaGiorni, 'stimaGiorni', { min: 0 });
    return f;
  }
}
