import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { type Model } from 'mongoose';
import { Cliente } from '../../comuni/schemi/anagrafiche.schema.js';
import { Progetto } from '../../comuni/schemi/progetto.schema.js';
import type { Allocazione } from '../../comuni/schemi/risorsa.schema.js';

/** Allocazione come arriva dal client: progettoId, oppure (compatibilità) cliente/progetto a testo. */
type AllocazioneInIngresso = Partial<Allocazione> & Record<string, unknown>;

interface ProgettoBreve {
  _id: mongoose.Types.ObjectId;
  codice: string;
  titolo: string;
  clienteId?: mongoose.Types.ObjectId;
  aliasPianificatore?: { cliente: string; progetto: string }[];
}

const testo = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * Allocazioni del Pianificatore collegate ai progetti (fase 1, blocco B5).
 *
 * Nel database un'allocazione punta al progetto con `progettoId`; il cliente si ricava dal progetto.
 * Nelle risposte si aggiungono, in sola lettura, `progetto` (codice), `progettoTitolo`, `cliente` (codice)
 * e `clienteRagioneSociale`, così il frontend di oggi continua a mostrarli.
 * In scrittura si accetta `progettoId` oppure, per compatibilità, il codice del progetto (o il vecchio
 * testo importato con la migrazione B7) nel campo `progetto`.
 */
@Injectable()
export class AllocazioniService {
  constructor(
    @InjectModel(Progetto.name) private readonly progetti: Model<Progetto>,
    @InjectModel(Cliente.name) private readonly clienti: Model<Cliente>,
  ) {}

  /** Aggiunge alle allocazioni i dati del progetto e del cliente. Le righe senza progettoId restano come sono. */
  async arricchisci<T extends { planned?: Allocazione[] }>(risorse: T[]): Promise<T[]> {
    const ids = new Set<string>();
    for (const r of risorse) for (const a of r.planned ?? []) if (a.progettoId) ids.add(String(a.progettoId));
    if (!ids.size) return risorse;
    const progetti = await this.progetti
      .find({ _id: { $in: [...ids].map((i) => new mongoose.Types.ObjectId(i)) } }, { codice: 1, titolo: 1, clienteId: 1 })
      .lean<ProgettoBreve[]>()
      .exec();
    const idClienti = progetti.map((p) => p.clienteId).filter((c): c is mongoose.Types.ObjectId => !!c);
    const clienti = await this.clienti.find({ _id: { $in: idClienti } }, { codice: 1, ragioneSociale: 1 }).lean().exec();
    const perProgetto = new Map(progetti.map((p) => [String(p._id), p]));
    const perCliente = new Map(clienti.map((c) => [String(c._id), c]));
    for (const r of risorse) {
      r.planned = (r.planned ?? []).map((a) => {
        const p = a.progettoId && perProgetto.get(String(a.progettoId));
        if (!p) return a;
        const c = p.clienteId && perCliente.get(String(p.clienteId));
        return Object.assign({}, a, {
          progetto: p.codice,
          progettoTitolo: p.titolo,
          cliente: c ? c.codice : '',
          clienteRagioneSociale: c ? c.ragioneSociale : '',
        });
      });
    }
    return risorse;
  }

  /**
   * Prepara le allocazioni da salvare: ogni riga con un progetto riceve il progettoId; cliente, progetto e
   * gli altri campi di sola lettura non si salvano. Una riga senza progetto resta senza (mese libero).
   * Errore 400 se un progetto indicato non esiste, con l'elenco delle righe da correggere.
   */
  async risolvi(planned: unknown): Promise<Allocazione[]> {
    if (planned === undefined || planned === null) return [];
    if (!Array.isArray(planned)) throw new BadRequestException('planned: deve essere un elenco');
    const righe = planned as AllocazioneInIngresso[];
    const serveCercare = righe.some((a) => a && (testo(a.progetto) || testo(a.cliente) || a.progettoId));
    const progetti = serveCercare
      ? await this.progetti.find({}, { codice: 1, clienteId: 1, aliasPianificatore: 1 }).lean<ProgettoBreve[]>().exec()
      : [];
    const perId = new Map(progetti.map((p) => [String(p._id), p]));
    const perCodice = new Map(progetti.map((p) => [p.codice.toLowerCase(), p]));
    const perAlias = new Map<string, ProgettoBreve>();
    for (const p of progetti) for (const al of p.aliasPianificatore ?? []) perAlias.set(`${al.cliente}\u0000${al.progetto}`, p);

    const errori: string[] = [];
    const risultato = righe.map((a, i) => {
      if (!a || typeof a !== 'object') {
        errori.push(`planned[${i}]: riga non valida`);
        return a as Allocazione;
      }
      const {
        cliente,
        progetto,
        progettoId,
        progettoTitolo: _titolo,
        clienteRagioneSociale: _ragione,
        ...resto
      } = a;
      const testoProgetto = testo(progetto);
      const testoCliente = testo(cliente);
      let trovato: ProgettoBreve | undefined;
      if (testoProgetto) {
        // Il testo prevale su progettoId: nel frontend di oggi si cambia il progetto scrivendone il codice.
        trovato = perCodice.get(testoProgetto.toLowerCase()) ?? perAlias.get(`${testoCliente}\u0000${testoProgetto}`);
        if (!trovato) {
          errori.push(
            `planned[${i}] (mese ${String(a.mese)}): progetto "${testoProgetto}" inesistente — usa il codice di un progetto di /api/comuni/progetti`,
          );
        }
      } else if (typeof progetto === 'string') {
        // Campo progetto inviato vuoto: la riga resta senza progetto (mese libero), anche se aveva un progettoId.
      } else if (progettoId) {
        trovato = mongoose.isValidObjectId(progettoId) ? perId.get(String(progettoId)) : undefined;
        if (!trovato) errori.push(`planned[${i}] (mese ${String(a.mese)}): progettoId ${String(progettoId)} inesistente`);
      } else if (testoCliente) {
        trovato = perAlias.get(`${testoCliente}\u0000`);
        if (!trovato) errori.push(`planned[${i}] (mese ${String(a.mese)}): indica il progetto, non solo il cliente "${testoCliente}"`);
      }
      return { ...resto, ...(trovato ? { progettoId: trovato._id } : {}) } as Allocazione;
    });
    if (errori.length) throw new BadRequestException(errori);
    return risultato;
  }

  /** Progetti (id) su cui la risorsa è allocata: per i permessi del TL sulle caratteristiche. */
  progettiDellaRisorsa(planned: Allocazione[] | undefined): string[] {
    return [...new Set((planned ?? []).filter((a) => a.progettoId).map((a) => String(a.progettoId)))];
  }

  /** Progetti (id) di cui la risorsa è approvatore, TL o PM. */
  async progettiDelSoggetto(risorsaId: string | undefined): Promise<string[]> {
    if (!risorsaId || !mongoose.isValidObjectId(risorsaId)) return [];
    const ids = await this.progetti.distinct('_id', { 'approvatori.risorsaId': new mongoose.Types.ObjectId(risorsaId) }).exec();
    return ids.map(String);
  }
}
