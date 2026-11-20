import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Permesso } from '../../auth/decoratori.js';
import { TipologieService } from './tipologie.service.js';

@ApiTags('consuntivazione')
@Controller('tipologie-costo')
export class TipologieController {
  constructor(private readonly service: TipologieService) {}

  @Get()
  @Permesso()
  @ApiOperation({ summary: 'Elenco delle tipologie di costo, in ordine di visualizzazione' })
  @ApiQuery({ name: 'attive', required: false, description: 'true = solo le attive' })
  elenco(@Query('attive') attive?: string) {
    return this.service.elenco(attive === 'true');
  }

  @Get(':id')
  @Permesso()
  @ApiOperation({ summary: 'Dettaglio di una tipologia di costo' })
  dettaglio(@Param('id') id: string) {
    return this.service.dettaglio(id);
  }

  @Post()
  @Permesso('gestireTipologieCosto')
  @ApiOperation({ summary: 'Crea una tipologia di costo (controller). Con predefinita: true diventa la proposta delle righe nuove' })
  @ApiBody({ schema: { example: { codice: 'REPERIBILITA', descrizione: 'Reperibilità', categoria: 'straordinaria', ordine: 5 } } })
  @ApiConflictResponse({ description: 'Codice già usato' })
  crea(@Body() body: unknown) {
    return this.service.crea(body);
  }

  @Put(':id')
  @Permesso('gestireTipologieCosto')
  @ApiOperation({
    summary: 'Modifica descrizione, ordine, categoria, attiva, predefinita (controller); il codice non cambia',
    description: 'La predefinita non si disattiva e non perde il segno: si sceglie un\'altra tipologia come predefinita.',
  })
  @ApiBody({ schema: { example: { descrizione: 'Straordinaria festiva', attiva: true, predefinita: false } } })
  @ApiBadRequestResponse({ description: 'Dati non validi o regola sulla predefinita' })
  modifica(@Param('id') id: string, @Body() body: unknown) {
    return this.service.modifica(id, body);
  }
}
