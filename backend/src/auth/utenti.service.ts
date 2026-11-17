import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { type Model } from 'mongoose';
import { AuthService } from './auth.service.js';
import { cifraPassword, problemaPassword } from './password.js';
import { ABILITAZIONI, RUOLI, Utente } from './utente.schema.js';

/** Campi che l'amministratore può impostare (oltre alla password, gestita a parte). */
export interface DatiUtenteAdmin {
  email?: string;
  nome?: string;
  risorsaId?: string | null;
  abilitazione?: string | null;
  ruoli?: string[];
  attivo?: boolean;
}

/** Gestione degli utenti riservata all'amministratore. Gli utenti non si cancellano: si disattivano. */
@Injectable()
export class UtentiService {
  constructor(
    @InjectModel(Utente.name) private readonly model: Model<Utente>,
    private readonly auth: AuthService,
  ) {}

  elenco() {
    return this.model.find().sort({ email: 1 }).lean().exec();
  }

  async crea(dati: DatiUtenteAdmin & { passwordIniziale?: string }) {
    if (!dati?.email) throw new BadRequestException('Email obbligatoria');
    const pulito = this.valida(dati);
    if (await this.model.exists({ email: pulito.email })) throw new ConflictException(`Email già usata: ${pulito.email}`);
    return this.auth.creaUtente({
      ...pulito,
      email: pulito.email as string,
      password: dati.passwordIniziale ?? '',
      deveCambiarePassword: true,
    } as Partial<Utente> & { email: string; password: string });
  }

  async modifica(id: string, dati: DatiUtenteAdmin, idAdmin: string) {
    const pulito = this.valida(dati);
    if (id === idAdmin && (pulito.attivo === false || (pulito.ruoli && !pulito.ruoli.includes('admin')))) {
      throw new BadRequestException('Non puoi disattivare te stesso né toglierti il ruolo admin');
    }
    if (pulito.email && (await this.model.exists({ email: pulito.email, _id: { $ne: id } }))) {
      throw new ConflictException(`Email già usata: ${pulito.email}`);
    }
    const doc = mongoose.isValidObjectId(id)
      ? await this.model
          .findByIdAndUpdate(id, { $set: pulito }, { returnDocument: 'after', runValidators: true })
          .lean()
          .exec()
      : null;
    if (!doc) throw new NotFoundException(`Utente ${id} non trovato`);
    return doc;
  }

  /** Imposta una password provvisoria: l'utente dovrà cambiarla al prossimo accesso. */
  async reimpostaPassword(id: string, nuova: unknown) {
    const problema = problemaPassword(nuova);
    if (problema) throw new BadRequestException(problema);
    const r = mongoose.isValidObjectId(id)
      ? await this.model
          .updateOne({ _id: id }, { $set: { passwordHash: await cifraPassword(nuova as string), deveCambiarePassword: true } })
          .exec()
      : { matchedCount: 0 };
    if (!r.matchedCount) throw new NotFoundException(`Utente ${id} non trovato`);
    return { reimpostata: true };
  }

  /** Tiene solo i campi ammessi e ne controlla i valori. */
  private valida(dati: DatiUtenteAdmin) {
    const pulito: Record<string, unknown> = {};
    if (dati.email !== undefined) pulito.email = String(dati.email).trim().toLowerCase();
    if (dati.nome !== undefined) pulito.nome = dati.nome;
    if (dati.attivo !== undefined) pulito.attivo = Boolean(dati.attivo);
    if (dati.risorsaId !== undefined) {
      if (dati.risorsaId !== null && !mongoose.isValidObjectId(dati.risorsaId)) {
        throw new BadRequestException('risorsaId non valido');
      }
      pulito.risorsaId = dati.risorsaId;
    }
    if (dati.abilitazione !== undefined) {
      if (dati.abilitazione !== null && !(ABILITAZIONI as readonly string[]).includes(dati.abilitazione)) {
        throw new BadRequestException(`Abilitazione non valida; valori ammessi: ${ABILITAZIONI.join(', ')} o null`);
      }
      pulito.abilitazione = dati.abilitazione;
    }
    if (dati.ruoli !== undefined) {
      const sconosciuti = (dati.ruoli ?? []).filter((r) => !(RUOLI as readonly string[]).includes(r));
      if (!Array.isArray(dati.ruoli) || sconosciuti.length) {
        throw new BadRequestException(`Ruoli non validi; valori ammessi: ${RUOLI.join(', ')}`);
      }
      pulito.ruoli = [...new Set(dati.ruoli)];
    }
    return pulito as Partial<Utente> & { ruoli?: string[] };
  }
}
