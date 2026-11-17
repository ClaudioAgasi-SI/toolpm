import {
  BadRequestException,
  Injectable,
  Logger,
  type OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { type Model } from 'mongoose';
import { eseguiCome } from '../infrastruttura/contesto-utente.js';
import type { UtenteAutenticato } from './decoratori.js';
import { cifraPassword, problemaPassword, verificaPassword } from './password.js';
import { Utente } from './utente.schema.js';

/** Messaggio unico per email sconosciuta, password errata o utente disattivato: non rivela quale dei tre. */
const CREDENZIALI_NON_VALIDE = 'Email o password non validi';

type DatiUtente = Utente & { _id: mongoose.Types.ObjectId };

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(Utente.name) private readonly model: Model<Utente>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * All'avvio crea il primo amministratore da ADMIN_EMAIL e ADMIN_PASSWORD_INIZIALE,
   * solo se non esiste ancora nessun utente con il ruolo admin.
   */
  async onModuleInit() {
    const email = this.config.get<string>('ADMIN_EMAIL')?.trim().toLowerCase();
    const password = this.config.get<string>('ADMIN_PASSWORD_INIZIALE');
    if (!email || !password) return;
    try {
      if (await this.model.exists({ ruoli: 'admin' })) return;
      const problema = problemaPassword(password);
      if (problema) {
        this.logger.warn(`Primo amministratore non creato: ${problema} (ADMIN_PASSWORD_INIZIALE)`);
        return;
      }
      await eseguiCome('sistema:avvio', () =>
        this.creaUtente({ email, password, nome: 'Amministratore', ruoli: ['admin'], deveCambiarePassword: true }),
      );
      this.logger.log(`Creato il primo amministratore ${email}: al primo accesso dovrà cambiare la password`);
    } catch (err) {
      this.logger.error(`Primo amministratore non creato: ${(err as Error).message}`);
    }
  }

  /** Verifica email e password; restituisce il token e il profilo. */
  async login(email: unknown, password: unknown) {
    if (typeof email !== 'string' || typeof password !== 'string') throw new UnauthorizedException(CREDENZIALI_NON_VALIDE);
    const utente = await this.model
      .findOne({ email: email.trim().toLowerCase() })
      .select('+passwordHash')
      .lean<DatiUtente>()
      .exec();
    // La verifica si fa comunque, anche per email sconosciute, per non rivelarle dai tempi di risposta.
    const valida = await verificaPassword(password, utente?.passwordHash ?? FALSO_HASH);
    if (!utente || !utente.attivo || !valida) throw new UnauthorizedException(CREDENZIALI_NON_VALIDE);

    const id = String(utente._id);
    await eseguiCome(id, () => this.model.updateOne({ _id: utente._id }, { $set: { ultimoAccesso: new Date() } }).exec());
    return { token: await this.jwt.signAsync({ sub: id }), utente: profilo(utente) };
  }

  /** Utente del token, se il token è valido e l'utente esiste ed è attivo; altrimenti null. */
  async utenteDaToken(token: string): Promise<UtenteAutenticato | null> {
    try {
      const { sub } = await this.jwt.verifyAsync<{ sub: string }>(token);
      if (!mongoose.isValidObjectId(sub)) return null;
      const utente = await this.model.findById(sub).lean<DatiUtente>().exec();
      return utente?.attivo ? profilo(utente) : null;
    } catch {
      return null;
    }
  }

  /** Cambio della propria password, con verifica di quella attuale. */
  async cambiaPassword(id: string, attuale: unknown, nuova: unknown) {
    const utente = await this.model.findById(id).select('+passwordHash').lean<DatiUtente>().exec();
    if (!utente || typeof attuale !== 'string' || !(await verificaPassword(attuale, utente.passwordHash))) {
      throw new UnauthorizedException('Password attuale non corretta');
    }
    const problema = problemaPassword(nuova);
    if (problema) throw new BadRequestException(problema);
    if (nuova === attuale) throw new BadRequestException('La nuova password deve essere diversa da quella attuale');
    await this.model
      .updateOne({ _id: id }, { $set: { passwordHash: await cifraPassword(nuova as string), deveCambiarePassword: false } })
      .exec();
    return { cambiata: true };
  }

  /** Crea un utente con password cifrata (usato anche dalla gestione utenti). */
  async creaUtente(dati: Partial<Utente> & { email: string; password: string }) {
    const problema = problemaPassword(dati.password);
    if (problema) throw new BadRequestException(problema);
    const { password, ...resto } = dati;
    const creato = await this.model.create({ ...resto, passwordHash: await cifraPassword(password) });
    const { passwordHash: _nascosto, ...visibile } = creato.toObject();
    return visibile;
  }
}

/** Hash di una password casuale, usato per non distinguere nei tempi le email inesistenti. */
const FALSO_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

/** Profilo dell'utente esposto al resto del backend e al frontend. */
export function profilo(u: DatiUtente): UtenteAutenticato {
  return {
    id: String(u._id),
    email: u.email,
    nome: u.nome,
    risorsaId: u.risorsaId ? String(u.risorsaId) : undefined,
    abilitazione: u.abilitazione ?? null,
    ruoli: u.ruoli ?? [],
    deveCambiarePassword: u.deveCambiarePassword ?? false,
  };
}
