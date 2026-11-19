import { Body, Controller, Get, HttpCode, Post, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { COOKIE_TOKEN } from './autenticazione.guard.js';
import { Pubblica, type UtenteAutenticato, UtenteRichiesta } from './decoratori.js';
import { permessiGlobali } from '../permessi/regole.js';
import { durataInMs } from './durata.js';

const ESEMPIO_PROFILO = {
  id: '6740a1c2e1f0a1b2c3d4e0c1',
  email: 'claudio.agasi@azienda.it',
  nome: 'Claudio Agasi',
  abilitazione: 'PMSenior',
  ruoli: ['risorsa', 'admin'],
  deveCambiarePassword: false,
  permessi: {
    gestireClienti: true,
    gestireCentriDiCosto: true,
    creareProgetto: true,
    gestireRisorse: true,
    gestireCaratteristicheTutteLeRisorse: true,
    gestireParametri: false,
    gestireUtenti: true,
  },
};

/** Profilo con i permessi globali (blocco B3): il frontend li usa per mostrare solo le voci consentite. */
const conPermessi = (utente: UtenteAutenticato) => ({ ...utente, permessi: permessiGlobali(utente) });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @Pubblica()
  @HttpCode(200)
  @ApiOperation({ summary: 'Accesso con email e password; imposta il cookie httpOnly toolpm_token' })
  @ApiBody({
    description: 'Per il primo amministratore: ADMIN_EMAIL e la password impostate nel file .env',
    schema: { example: { email: 'sostituire-con-la-propria-email@esempio.it', password: 'sostituire-con-la-password' } },
  })
  @ApiOkResponse({ schema: { example: ESEMPIO_PROFILO } })
  @ApiUnauthorizedResponse({ description: 'Email o password non validi, oppure utente disattivato' })
  async login(@Body() body: { email?: unknown; password?: unknown }, @Res({ passthrough: true }) res: Response) {
    const { token, utente } = await this.auth.login(body?.email, body?.password);
    res.cookie(COOKIE_TOKEN, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get<string>('COOKIE_SECURE') === 'true',
      path: '/',
      maxAge: durataInMs(this.config.get<string>('JWT_DURATA') ?? '8h'),
    });
    return conPermessi(utente);
  }

  @Post('logout')
  @Pubblica()
  @HttpCode(200)
  @ApiOperation({ summary: 'Uscita: cancella il cookie del token' })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_TOKEN, { path: '/' });
    return { uscito: true };
  }

  @Get('me')
  @ApiOperation({ summary: 'Profilo dell\'utente che ha fatto l\'accesso, con i permessi globali' })
  @ApiOkResponse({ schema: { example: ESEMPIO_PROFILO } })
  @ApiUnauthorizedResponse({ description: 'Nessun accesso' })
  me(@UtenteRichiesta() utente?: UtenteAutenticato) {
    if (!utente) throw new UnauthorizedException('Accesso richiesto');
    return conPermessi(utente);
  }

  @Post('cambia-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cambio della propria password (almeno 10 caratteri)' })
  @ApiBody({ schema: { example: { attuale: '••••••••••', nuova: '••••••••••••' } } })
  cambiaPassword(
    @Body() body: { attuale?: unknown; nuova?: unknown },
    @UtenteRichiesta() utente?: UtenteAutenticato,
  ) {
    if (!utente) throw new UnauthorizedException('Accesso richiesto');
    return this.auth.cambiaPassword(utente.id, body?.attuale, body?.nuova);
  }
}
