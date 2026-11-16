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
  @ApiOperation({ summary: 'Crea una nuova risorsa' })
  @ApiBody({ type: Risorsa })
  @ApiCreatedResponse({ type: RisorsaConId })
  @ApiBadRequestResponse({ description: 'Dati non validi (es. cognome mancante, mese non nel formato AAAAMM)' })
  create(@Body() body: Partial<Risorsa>) {
    return this.service.create(body);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Sostituisce una risorsa',
    description: 'Il documento viene sostituito per intero: i campi non inviati tornano ai valori predefiniti.',
  })
  @ApiParam({ name: 'id', description: 'ObjectId MongoDB della risorsa' })
  @ApiBody({ type: Risorsa })
  @ApiOkResponse({ type: RisorsaConId })
  @ApiBadRequestResponse({ description: 'Dati non validi' })
  @ApiNotFoundResponse({ description: 'Risorsa non trovata' })
  update(@Param('id') id: string, @Body() body: Partial<Risorsa>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina una risorsa' })
  @ApiParam({ name: 'id', description: 'ObjectId MongoDB della risorsa' })
  @ApiOkResponse({ schema: { example: { deleted: true } } })
  @ApiNotFoundResponse({ description: 'Risorsa non trovata' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
