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
    description: 'Mantenuto per un rilascio, senza email obbligatoria. Permesso gestireRisorse (PM, PMSenior).',
    deprecated: true,
  })
  @ApiBody({ type: Risorsa })
  @ApiCreatedResponse({ type: RisorsaConId })
  @ApiBadRequestResponse({ description: 'Dati non validi (es. cognome mancante, mese non nel formato AAAAMM, progetto inesistente)' })
  create(@UtenteRichiesta() utente: UtenteAutenticato, @Body() body: Partial<Risorsa>) {
    return this.service.create(utente, body);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Sostituisce le caratteristiche della risorsa (skill, certificazioni, allocazioni)',
    description:
      'Le caratteristiche non inviate tornano vuote; i dati anagrafici (email, cellulare, ruolo, orario) non si toccano. ' +
      'Ogni allocazione indica il progetto con progettoId oppure con il suo codice nel campo progetto. ' +
      'PM e PMSenior su tutto; il TL alloca qualsiasi risorsa sui propri progetti e modifica solo quelle allocazioni, e le skill delle risorse che lavorano sui suoi progetti; cognome e nome solo PM e PMSenior.',
  })
  @ApiParam({ name: 'id', description: 'ObjectId MongoDB della risorsa' })
  @ApiBody({ type: Risorsa })
  @ApiOkResponse({ type: RisorsaConId })
  @ApiBadRequestResponse({ description: 'Dati non validi' })
  @ApiNotFoundResponse({ description: 'Risorsa non trovata' })
  update(@UtenteRichiesta() utente: UtenteAutenticato, @Param('id') id: string, @Body() body: Partial<Risorsa>) {
    return this.service.update(utente, id, body);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Elimina una risorsa (mantenuto per un rilascio)',
    description: 'Nel modulo Comuni le risorse non si cancellano: si imposta la data di uscita. Permesso gestireRisorse.',
    deprecated: true,
  })
  @ApiParam({ name: 'id', description: 'ObjectId MongoDB della risorsa' })
  @ApiOkResponse({ schema: { example: { deleted: true } } })
  @ApiNotFoundResponse({ description: 'Risorsa non trovata' })
  remove(@UtenteRichiesta() utente: UtenteAutenticato, @Param('id') id: string) {
    return this.service.remove(utente, id);
  }
}
