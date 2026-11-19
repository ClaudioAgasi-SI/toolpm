import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBody, ApiConflictResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Permesso } from '../../auth/decoratori.js';
import { RisorseComuniService } from './risorse-comuni.service.js';

const ESEMPIO = {
  cognome: 'Rossi',
  nome: 'Mario',
  email: 'mario.rossi@azienda.it',
  cellulare: '+39 333 1234567',
  matricola: 'A0123',
  dataIngresso: '2024-03-01',
  oreContrattualiGiorno: 8,
  storicoRuoli: [{ ruoloId: '6740a1c2e1f0a1b2c3d4e201', dal: '2024-03-01' }],
};

/** Anagrafica delle risorse (/api/comuni/risorse). Skill e allocazioni: /api/pianificatore/risorse. */
@ApiTags('comuni')
@Controller('risorse')
export class RisorseComuniController {
  constructor(private readonly service: RisorseComuniService) {}

  @Get()
  @Permesso()
  @ApiOperation({ summary: 'Elenco delle risorse (dati anagrafici), per cognome e nome' })
  @ApiQuery({ name: 'attive', required: false, description: 'true = senza data di uscita passata' })
  elenco(@Query('attive') attive?: string) {
    return this.service.elenco(attive === 'true');
  }

  @Get(':id')
  @Permesso()
  @ApiOperation({ summary: 'Dati anagrafici di una risorsa' })
  dettaglio(@Param('id') id: string) {
    return this.service.dettaglio(id);
  }

  @Post()
  @Permesso('gestireRisorse')
  @ApiOperation({ summary: 'Crea una risorsa (PM, PMSenior); email obbligatoria e unica' })
  @ApiBody({ schema: { example: ESEMPIO } })
  @ApiConflictResponse({ description: 'Email già usata' })
  crea(@Body() body: unknown) {
    return this.service.crea(body);
  }

  @Put(':id')
  @Permesso('gestireRisorse')
  @ApiOperation({
    summary: 'Modifica i dati anagrafici inviati (PM, PMSenior)',
    description: 'Aggiorna solo i campi presenti; null svuota un campo facoltativo. storicoRuoli, se presente, sostituisce lo storico. Skill, certificazioni e allocazioni non si toccano.',
  })
  @ApiBody({ schema: { example: { cellulare: '+39 333 7654321', oreContrattualiGiorno: 6 } } })
  modifica(@Param('id') id: string, @Body() body: unknown) {
    return this.service.modifica(id, body);
  }
}
