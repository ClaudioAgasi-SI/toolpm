import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBody, ApiConflictResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Permesso } from '../../auth/decoratori.js';
import { TariffeService } from './tariffe.service.js';

const ESEMPIO = { tipologiaId: '6740a1c2e1f0a1b2c3d4e301', validoDal: '2027-01-01', validoAl: null, centesimiOra: 3900 };

/** Tariffe (fase 2, blocco C2): riservate al controller, in lettura e scrittura. */
@ApiTags('consuntivazione')
@Controller()
export class TariffeController {
  constructor(private readonly service: TariffeService) {}

  @Get('tariffe-standard')
  @Permesso('gestireTariffe')
  @ApiOperation({ summary: 'Tariffe standard per ruolo e tipologia, con validità (controller)' })
  @ApiQuery({ name: 'ruolo', required: false })
  @ApiQuery({ name: 'tipologia', required: false })
  elencoStandard(@Query('ruolo') ruolo?: string, @Query('tipologia') tipologia?: string) {
    return this.service.elencoStandard({ ruolo, tipologia });
  }

  @Post('tariffe-standard')
  @Permesso('gestireTariffe')
  @ApiOperation({ summary: 'Nuova tariffa standard; il periodo non deve sovrapporsi ad altre dello stesso ruolo e tipologia' })
  @ApiBody({ schema: { example: { ruoloId: '6740a1c2e1f0a1b2c3d4e201', ...ESEMPIO } } })
  @ApiConflictResponse({ description: 'Periodo sovrapposto' })
  creaStandard(@Body() body: unknown) {
    return this.service.creaStandard(body);
  }

  @Put('tariffe-standard/:id')
  @Permesso('gestireTariffe')
  @ApiOperation({ summary: 'Modifica validità o importo di una tariffa standard (ruolo e tipologia non cambiano)' })
  @ApiBody({ schema: { example: { validoAl: '2027-06-30' } } })
  modificaStandard(@Param('id') id: string, @Body() body: unknown) {
    return this.service.modificaStandard(id, body);
  }

  @Delete('tariffe-standard/:id')
  @HttpCode(204)
  @Permesso('gestireTariffe')
  @ApiOperation({ summary: 'Cancella una tariffa standard inserita per errore (409 se già usata nei consuntivi)' })
  eliminaStandard(@Param('id') id: string) {
    return this.service.eliminaStandard(id);
  }

  @Get('risorse/:risorsaId/tariffe-personalizzate')
  @Permesso('gestireTariffe')
  @ApiOperation({ summary: 'Tariffe personalizzate della risorsa (controller)' })
  elencoPersonalizzate(@Param('risorsaId') risorsaId: string) {
    return this.service.elencoPersonalizzate(risorsaId);
  }

  @Post('risorse/:risorsaId/tariffe-personalizzate')
  @Permesso('gestireTariffe')
  @ApiOperation({ summary: 'Nuova tariffa personalizzata; prevale sulla standard per la sua tipologia' })
  @ApiBody({ schema: { example: ESEMPIO } })
  @ApiConflictResponse({ description: 'Periodo sovrapposto' })
  creaPersonalizzata(@Param('risorsaId') risorsaId: string, @Body() body: unknown) {
    return this.service.creaPersonalizzata(risorsaId, body);
  }

  @Put('risorse/:risorsaId/tariffe-personalizzate/:id')
  @Permesso('gestireTariffe')
  @ApiOperation({ summary: 'Modifica validità o importo di una tariffa personalizzata' })
  @ApiBody({ schema: { example: { centesimiOra: 3300 } } })
  modificaPersonalizzata(@Param('risorsaId') risorsaId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.service.modificaPersonalizzata(risorsaId, id, body);
  }

  @Delete('risorse/:risorsaId/tariffe-personalizzate/:id')
  @HttpCode(204)
  @Permesso('gestireTariffe')
  @ApiOperation({ summary: 'Cancella una tariffa personalizzata inserita per errore (409 se già usata nei consuntivi)' })
  eliminaPersonalizzata(@Param('risorsaId') risorsaId: string, @Param('id') id: string) {
    return this.service.eliminaPersonalizzata(risorsaId, id);
  }

  @Get('risorse/:risorsaId/tariffe-applicabili')
  @Permesso('gestireTariffe')
  @ApiOperation({ summary: 'Tariffa applicabile alla data per ogni tipologia, con la provenienza (personalizzata, standard o nessuna)' })
  @ApiQuery({ name: 'data', required: false, description: 'AAAA-MM-GG; se manca, oggi' })
  applicabili(@Param('risorsaId') risorsaId: string, @Query('data') data?: string) {
    return this.service.applicabili(risorsaId, data);
  }
}
