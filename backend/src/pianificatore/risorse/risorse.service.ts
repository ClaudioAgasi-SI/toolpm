import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import type { Model } from 'mongoose';
import type { UtenteAutenticato } from '../../auth/decoratori.js';
import { Attivita, Progetto } from '../../comuni/schemi/progetto.schema.js';
import { PermessiService } from '../../permessi/permessi.service.js';
import { AllocazioniService } from './allocazioni.service.js';
import { Risorsa } from './risorsa.schema.js';

const { isValidObjectId } = mongoose;

/** Caratteristiche della risorsa gestite dal Pianificatore. */
const CARATTERISTICHE = ['skillTecnici', 'skillAmbiti', 'skillFunzionali', 'certificazioni', 'planned'] as const;

type RisorsaLetta = Risorsa & { _id: mongoose.Types.ObjectId };

/**
 * Risorse viste dal Pianificatore (fase 1, blocchi B4 e B5). Il modello è quello del modulo Comuni.
 * - Caratteristiche (skill, certificazioni, allocazioni): PM e PMSenior su tutte le risorse, TL solo su
 *   quelle allocate su un suo progetto (permessi del blocco B3).
 * - Cognome e nome, creazione ed eliminazione: anagrafica, permesso gestireRisorse (PM, PMSenior).
 * Le richieste anonime passano finché AUTH_OBBLIGATORIA=false (fino al blocco B6).
 * Le allocazioni puntano al progetto con progettoId (vedi AllocazioniService).
 */
@Injectable()
export class RisorseService {
  constructor(
    @InjectModel(Risorsa.name) private readonly model: Model<Risorsa>,
    @InjectModel(Progetto.name) private readonly progetti: Model<Progetto>,
    @InjectModel(Attivita.name) private readonly attivita: Model<Attivita>,
    private readonly allocazioni: AllocazioniService,
    private readonly permessi: PermessiService,
  ) {}

  async findAll() {
    const risorse = await this.model.find().sort({ cognome: 1, nome: 1 }).lean<RisorsaLetta[]>().exec();
    return this.allocazioni.arricchisci(risorse);
  }

  private async carica(id: string) {
    const doc = isValidObjectId(id) ? await this.model.findById(id).lean<RisorsaLetta>().exec() : null;
    if (!doc) throw new NotFoundException(`Risorsa ${id} non trovata`);
    return doc;
  }

  async findOne(id: string) {
    const [r] = await this.allocazioni.arricchisci([await this.carica(id)]);
    return r;
  }

  /**
   * Crea una risorsa dal Pianificatore (percorso mantenuto per un rilascio: la creazione completa,
   * con email, è POST /api/comuni/risorse). Permesso gestireRisorse.
   */
  async create(utente: UtenteAutenticato | undefined, data: Partial<Risorsa>) {
    await this.permessi.verificaSeAutenticato(utente, () => this.permessi.puoGestireRisorse(utente!), 'creare una risorsa');
    const dati: Record<string, unknown> = {};
    for (const campo of ['cognome', 'nome', ...CARATTERISTICHE] as const) if (data?.[campo] !== undefined) dati[campo] = data[campo];
    dati.planned = await this.allocazioni.risolvi(dati.planned);
    const creata = await this.model.create(dati);
    return this.findOne(String(creata._id));
  }

  /**
   * Sostituisce le caratteristiche della risorsa (skill, certificazioni, allocazioni) con quelle ricevute:
   * quelle non inviate tornano vuote. Cognome e nome si cambiano solo con il permesso gestireRisorse;
   * i dati anagrafici (email, cellulare, ruolo, orario...) non si toccano: sono di /api/comuni/risorse.
   */
  async update(utente: UtenteAutenticato | undefined, id: string, data: Partial<Risorsa> & { _id?: unknown }) {
    const attuale = await this.carica(id);
    await this.permessi.verificaSeAutenticato(
      utente,
      async () =>
        this.permessi.puoModificareCaratteristicheRisorsa(
          utente!,
          await this.allocazioni.progettiDelSoggetto(utente!.risorsaId),
          this.allocazioni.progettiDellaRisorsa(attuale.planned),
        ),
      'modificare le caratteristiche di questa risorsa',
    );
    const $set: Record<string, unknown> = {};
    for (const campo of ['cognome', 'nome'] as const) {
      if (data?.[campo] === undefined) continue;
      if (typeof data[campo] !== 'string' || !data[campo].trim()) throw new BadRequestException(`${campo}: obbligatorio`);
      if (data[campo].trim() !== attuale[campo]) $set[campo] = data[campo];
    }
    if ($set.cognome !== undefined || $set.nome !== undefined) {
      await this.permessi.verificaSeAutenticato(utente, () => this.permessi.puoGestireRisorse(utente!), 'cambiare cognome e nome');
    }
    for (const campo of CARATTERISTICHE) $set[campo] = data?.[campo] ?? [];
    $set.planned = await this.allocazioni.risolvi($set.planned);
    await this.model.updateOne({ _id: attuale._id }, { $set }, { runValidators: true }).exec();
    return this.findOne(id);
  }

  /**
   * Elimina la risorsa (percorso mantenuto per un rilascio; nel modulo Comuni le risorse non si cancellano,
   * si imposta la data di uscita). Permesso gestireRisorse; vietato se la risorsa è approvatore di un
   * progetto o assegnata a un'attività.
   */
  async remove(utente: UtenteAutenticato | undefined, id: string) {
    await this.permessi.verificaSeAutenticato(utente, () => this.permessi.puoGestireRisorse(utente!), 'eliminare una risorsa');
    if (isValidObjectId(id)) {
      const _id = new mongoose.Types.ObjectId(id);
      const [progetto, attivita] = await Promise.all([
        this.progetti.findOne({ 'approvatori.risorsaId': _id }, { codice: 1 }).lean().exec(),
        this.attivita.exists({ risorseAssegnateIds: _id }),
      ]);
      if (progetto) throw new ConflictException(`La risorsa è approvatore del progetto ${progetto.codice}: non si può eliminare`);
      if (attivita) throw new ConflictException('La risorsa è assegnata a un\'attività: non si può eliminare');
    }
    const doc = isValidObjectId(id) ? await this.model.findByIdAndDelete(id).lean().exec() : null;
    if (!doc) throw new NotFoundException(`Risorsa ${id} non trovata`);
    return { deleted: true };
  }
}
