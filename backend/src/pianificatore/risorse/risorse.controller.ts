import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { type UtenteAutenticato, UtenteRichiesta } from '../../auth/decoratori.js';
import { Risorsa, RisorsaConId } from './risorsa.schema.js';
import { RisorseService } from './risorse.service.js';

@ApiTags('risorse')
@Controller('risorse')
export class RisorseController {
  constructor(private readonly service: RisorseService) {}

  @Get()
  @ApiOperation({ summary: 'Elenco delle risorse, ordinate per cognome e nome' })
  @ApiOkResponse({ type: [RisorsaConId] })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dettaglio di una risorsa' })
  @ApiParam({ name: 'id', description: 'ObjectId MongoDB della risorsa' })
  @ApiOkResponse({ type: RisorsaConId })
  @ApiNotFoundResponse({ description: 'Risorsa non trovata' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Crea una nuova risorsa (da sostituire con POST /api/comuni/risorse)',
    description: 'Mantenuto per un rilascio, senza email obbligatoria. Con accesso: permesso gestireRisorse (PM, PMSenior).',
    deprecated: true,
  })
  @ApiBody({ type: Risorsa })
  @ApiCreatedResponse({ type: RisorsaConId })
  @ApiBadRequestResponse({ description: 'Dati non validi (es. cognome mancante, mese non nel formato AAAAMM, progetto inesistente)' })
  create(@UtenteRichiesta() utente: UtenteAutenticato | undefined, @Body() body: Partial<Risorsa>) {
    return this.service.create(utente, body);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Sostituisce le caratteristiche della risorsa (skill, certificazioni, allocazioni)',
    description:
      'Le caratteristiche non inviate tornano vuote; i dati anagrafici (email, cellulare, ruolo, orario) non si toccano. ' +
      'Ogni allocazione indica il progetto con progettoId oppure con il suo codice nel campo progetto. ' +
      'Con accesso: PM e PMSenior su tutte le risorse, TL su quelle allocate su un suo progetto; cognome e nome solo PM e PMSenior.',
  })
  @ApiParam({ name: 'id', description: 'ObjectId MongoDB della risorsa' })
  @ApiBody({ type: Risorsa })
  @ApiOkResponse({ type: RisorsaConId })
  @ApiBadRequestResponse({ description: 'Dati non validi' })
  @ApiNotFoundResponse({ description: 'Risorsa non trovata' })
  update(@UtenteRichiesta() utente: UtenteAutenticato | undefined, @Param('id') id: string, @Body() body: Partial<Risorsa>) {
    return this.service.update(utente, id, body);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Elimina una risorsa (mantenuto per un rilascio)',
    description: 'Nel modulo Comuni le risorse non si cancellano: si imposta la data di uscita. Con accesso: permesso gestireRisorse.',
    deprecated: true,
  })
  @ApiParam({ name: 'id', description: 'ObjectId MongoDB della risorsa' })
  @ApiOkResponse({ schema: { example: { deleted: true } } })
  @ApiNotFoundResponse({ description: 'Risorsa non trovata' })
  remove(@UtenteRichiesta() utente: UtenteAutenticato | undefined, @Param('id') id: string) {
    return this.service.remove(utente, id);
  }
}
