import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiBody, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Ruoli, type UtenteAutenticato, UtenteRichiesta } from './decoratori.js';
import { Utente } from './utente.schema.js';
import { type DatiUtenteAdmin, UtentiService } from './utenti.service.js';

@ApiTags('utenti')
@Controller('utenti')
@Ruoli('admin')
@ApiForbiddenResponse({ description: 'Riservato agli amministratori' })
export class UtentiController {
  constructor(private readonly service: UtentiService) {}

  @Get()
  @ApiOperation({ summary: 'Elenco degli utenti' })
  @ApiOkResponse({ type: [Utente] })
  elenco() {
    return this.service.elenco();
  }

  @Post()
  @ApiOperation({ summary: 'Crea un utente con una password provvisoria, da cambiare al primo accesso' })
  @ApiBody({
    schema: {
      example: {
        email: 'mario.rossi@azienda.it',
        nome: 'Mario Rossi',
        passwordIniziale: 'provvisoria-123',
        abilitazione: 'PM',
        ruoli: ['risorsa'],
        risorsaId: '6ae88b192fcc045f0ca48409',
      },
    },
  })
  crea(@Body() body: DatiUtenteAdmin & { passwordIniziale?: string }) {
    return this.service.crea(body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Modifica email, nome, risorsa collegata, abilitazione, ruoli o stato (attivo)' })
  @ApiBody({ schema: { example: { abilitazione: 'PMSenior', ruoli: ['risorsa', 'controller'], attivo: true } } })
  modifica(@Param('id') id: string, @Body() body: DatiUtenteAdmin, @UtenteRichiesta() admin: UtenteAutenticato) {
    return this.service.modifica(id, body, admin.id);
  }

  @Post(':id/password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Imposta una password provvisoria; l\'utente dovrà cambiarla al prossimo accesso' })
  @ApiBody({ schema: { example: { nuova: 'provvisoria-456' } } })
  reimpostaPassword(@Param('id') id: string, @Body() body: { nuova?: unknown }) {
    return this.service.reimpostaPassword(id, body?.nuova);
  }
}
