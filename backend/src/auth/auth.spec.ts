import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import mongoose, { type Model } from 'mongoose';
import { eseguiNelContesto, utenteCorrente } from '../infrastruttura/contesto-utente.js';
import { AuthService } from './auth.service.js';
import { AutenticazioneGuard, estraiToken } from './autenticazione.guard.js';
import { CHIAVE_PERMESSI, CHIAVE_PUBBLICA, CHIAVE_RUOLI, type UtenteAutenticato } from './decoratori.js';
import { durataInMs } from './durata.js';
import { cifraPassword, problemaPassword, verificaPassword } from './password.js';
import type { Utente } from './utente.schema.js';

describe('password', () => {
  it('verifica la password giusta e rifiuta quella sbagliata', async () => {
    const hash = await cifraPassword('una-password-lunga');
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verificaPassword('una-password-lunga', hash)).toBe(true);
    expect(await verificaPassword('un-altra-password', hash)).toBe(false);
  });

  it('due cifrature della stessa password sono diverse (sale casuale)', async () => {
    expect(await cifraPassword('una-password-lunga')).not.toBe(await cifraPassword('una-password-lunga'));
  });

  it('rifiuta hash mancanti o malformati', async () => {
    expect(await verificaPassword('x', undefined)).toBe(false);
    expect(await verificaPassword('x', 'md5$abc')).toBe(false);
  });

  it('richiede almeno 10 caratteri', () => {
    expect(problemaPassword('corta')).toMatch(/10 caratteri/);
    expect(problemaPassword('abbastanza-lunga')).toBeNull();
  });
});

describe('durata e token', () => {
  it('converte le durate', () => {
    expect(durataInMs('8h')).toBe(8 * 3_600_000);
    expect(durataInMs('30m')).toBe(1_800_000);
    expect(() => durataInMs('otto ore')).toThrow();
  });

  it('legge il token dal cookie o dall\'intestazione Authorization', () => {
    expect(estraiToken({ cookie: 'altro=1; toolpm_token=abc.def; x=2' })).toBe('abc.def');
    expect(estraiToken({ authorization: 'Bearer xyz' })).toBe('xyz');
    expect(estraiToken({ cookie: 'altro=1' })).toBeNull();
    expect(estraiToken({})).toBeNull();
  });
});

/** Modello Utente finto: un solo utente, cercato per email o per id. */
function modelloUtenti(utente: Record<string, unknown> | null) {
  const query = (risultato: unknown) => ({
    select: () => query(risultato),
    lean: () => query(risultato),
    exec: async () => risultato,
  });
  const aggiornamenti: unknown[] = [];
  const model = {
    findOne: (filtro: { email: string }) => query(utente && filtro.email === utente.email ? utente : null),
    findById: (id: string) => query(utente && String(utente._id) === id ? utente : null),
    updateOne: (_f: unknown, u: unknown) => ({ exec: async () => aggiornamenti.push([utenteCorrente(), u]) }),
    exists: async () => null,
  };
  return { model: model as unknown as Model<Utente>, aggiornamenti };
}

const config = (valori: Record<string, string> = {}) => ({ get: (k: string) => valori[k] }) as unknown as ConfigService;

describe('AuthService', () => {
  const jwt = new JwtService({ secret: 'segreto-di-prova', signOptions: { expiresIn: '1h' } });
  const id = new mongoose.Types.ObjectId();
  let utente: Record<string, unknown>;

  beforeAll(async () => {
    utente = {
      _id: id,
      email: 'mario.rossi@azienda.it',
      passwordHash: await cifraPassword('password-giusta'),
      abilitazione: 'PM',
      ruoli: ['risorsa'],
      attivo: true,
      deveCambiarePassword: false,
    };
  });

  it('con le credenziali giuste restituisce token e profilo, e registra l\'ultimo accesso come l\'utente stesso', async () => {
    const { model, aggiornamenti } = modelloUtenti(utente);
    const servizio = new AuthService(model, jwt, config());
    const { token, utente: profilo } = await servizio.login(' Mario.Rossi@azienda.it ', 'password-giusta');
    expect(profilo).toMatchObject({ id: String(id), email: 'mario.rossi@azienda.it', abilitazione: 'PM' });
    expect(profilo).not.toHaveProperty('passwordHash');
    expect(await servizio.utenteDaToken(token)).toMatchObject({ id: String(id) });
    expect(aggiornamenti[0]).toEqual([String(id), { $set: { ultimoAccesso: expect.any(Date) } }]);
  });

  it('rifiuta password errata, email sconosciuta e utente disattivato con lo stesso messaggio', async () => {
    const attivo = new AuthService(modelloUtenti(utente).model, jwt, config());
    const disattivo = new AuthService(modelloUtenti({ ...utente, attivo: false }).model, jwt, config());
    for (const tentativo of [
      () => attivo.login('mario.rossi@azienda.it', 'password-sbagliata'),
      () => attivo.login('nessuno@azienda.it', 'password-giusta'),
      () => disattivo.login('mario.rossi@azienda.it', 'password-giusta'),
    ]) {
      await expect(tentativo()).rejects.toThrow('Email o password non validi');
    }
  });

  it('un token falso o di un utente disattivato non vale', async () => {
    const servizio = new AuthService(modelloUtenti({ ...utente, attivo: false }).model, jwt, config());
    expect(await servizio.utenteDaToken('non.un.token')).toBeNull();
    expect(await servizio.utenteDaToken(await jwt.signAsync({ sub: String(id) }))).toBeNull();
  });
});

describe('AutenticazioneGuard', () => {
  const ANNA: UtenteAutenticato = {
    id: 'u-anna',
    email: 'anna@azienda.it',
    abilitazione: 'TL',
    ruoli: ['risorsa'],
    deveCambiarePassword: false,
  };

  /** Prepara guard e contesto di esecuzione con i metadati indicati sull'endpoint. */
  function prova(opzioni: { token?: string; pubblica?: boolean; ruoli?: string[]; permessi?: string[]; obbligatoria?: boolean }) {
    const auth = { utenteDaToken: async (t: string) => (t === 'buono' ? ANNA : null) } as unknown as AuthService;
    const handler = () => undefined;
    if (opzioni.pubblica) Reflect.defineMetadata(CHIAVE_PUBBLICA, true, handler);
    if (opzioni.ruoli) Reflect.defineMetadata(CHIAVE_RUOLI, opzioni.ruoli, handler);
    if (opzioni.permessi) Reflect.defineMetadata(CHIAVE_PERMESSI, opzioni.permessi, handler);
    const req: { headers: Record<string, string>; utente?: UtenteAutenticato } = {
      headers: opzioni.token ? { authorization: `Bearer ${opzioni.token}` } : {},
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => handler,
      getClass: () => class {},
    } as unknown as ExecutionContext;
    const guard = new AutenticazioneGuard(
      new Reflector(),
      auth,
      config({ AUTH_OBBLIGATORIA: opzioni.obbligatoria ? 'true' : 'false' }),
    );
    return { guard, ctx, req };
  }

  it('riconosce l\'utente e lo scrive nella richiesta e nel contesto del tracciamento', async () => {
    const { guard, ctx, req } = prova({ token: 'buono' });
    const contesto = { utente: 'anonimo' };
    await eseguiNelContesto(contesto, () => guard.canActivate(ctx));
    expect(req.utente).toEqual(ANNA);
    expect(contesto.utente).toBe('u-anna');
  });

  it('nel periodo di transizione lascia passare le richieste anonime, se non obbligatorio', async () => {
    const { guard, ctx } = prova({});
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('con AUTH_OBBLIGATORIA=true rifiuta le richieste anonime, tranne gli endpoint pubblici', async () => {
    const anonima = prova({ obbligatoria: true });
    await expect(anonima.guard.canActivate(anonima.ctx)).rejects.toThrow(UnauthorizedException);
    const pubblica = prova({ obbligatoria: true, pubblica: true });
    expect(await pubblica.guard.canActivate(pubblica.ctx)).toBe(true);
  });

  it('gli endpoint con ruoli richiedono sempre l\'accesso e il ruolo giusto', async () => {
    const anonimo = prova({ ruoli: ['admin'] });
    await expect(anonimo.guard.canActivate(anonimo.ctx)).rejects.toThrow(UnauthorizedException);
    const senzaRuolo = prova({ ruoli: ['admin'], token: 'buono' });
    await expect(senzaRuolo.guard.canActivate(senzaRuolo.ctx)).rejects.toThrow(ForbiddenException);
    const conRuolo = prova({ ruoli: ['admin', 'risorsa'], token: 'buono' });
    expect(await conRuolo.guard.canActivate(conRuolo.ctx)).toBe(true);
  });

  it('gli endpoint con @Permesso richiedono sempre l\'accesso e i permessi globali indicati', async () => {
    const anonimo = prova({ permessi: [] });
    await expect(anonimo.guard.canActivate(anonimo.ctx)).rejects.toThrow(UnauthorizedException);
    const soloAccesso = prova({ permessi: [], token: 'buono' });
    expect(await soloAccesso.guard.canActivate(soloAccesso.ctx)).toBe(true);
    // Anna è TL: può creare progetti, non gestire i clienti (solo PMSenior).
    const consentito = prova({ permessi: ['creareProgetto'], token: 'buono' });
    expect(await consentito.guard.canActivate(consentito.ctx)).toBe(true);
    const negato = prova({ permessi: ['creareProgetto', 'gestireClienti'], token: 'buono' });
    await expect(negato.guard.canActivate(negato.ctx)).rejects.toThrow('Permesso mancante: gestireClienti');
  });
});
