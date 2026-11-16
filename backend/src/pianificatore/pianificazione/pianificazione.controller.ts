import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CellaMeseDto, GrigliaDto } from './pianificazione.dto.js';
import { PianificazioneService } from './pianificazione.service.js';

@ApiTags('pianificazione')
@ApiExtraModels(CellaMeseDto)
@Controller('pianificazione')
export class PianificazioneController {
  constructor(private readonly service: PianificazioneService) {}

  @Get()
  @ApiOperation({
    summary: 'Griglia risorse × mesi',
    description:
      'Per ogni risorsa e mese: % allocata, % pesata per probabilità (sicura 100%, probabile 75%, forse 50%, ' +
      'improbabile 25%, nessuna 0%) e dettaglio delle allocazioni. Massimo 36 mesi.',
  })
  @ApiQuery({ name: 'da', required: false, example: '202701', description: 'Primo mese (AAAAMM). Default: mese corrente' })
  @ApiQuery({ name: 'a', required: false, example: '202712', description: 'Ultimo mese (AAAAMM). Default: da + 11 mesi' })
  @ApiQuery({
    name: 'tipoSkill',
    required: false,
    enum: ['tecnico', 'funzionale', 'ambito'],
    description: 'Filtra le risorse per tipo di skill (da solo: almeno una skill di quel tipo)',
  })
  @ApiQuery({
    name: 'skill',
    required: false,
    type: [String],
    isArray: true,
    example: ['j2ee', 'devOps'],
    description:
      'Una o più skill (parametro ripetuto: skill=j2ee&skill=devOps): risorse che ne hanno almeno una, in OR. ' +
      'Richiede tipoSkill; le skill "n.a." non contano.',
  })
  @ApiOkResponse({ type: GrigliaDto })
  @ApiBadRequestResponse({ description: 'Parametri non nel formato AAAAMM, oppure da > a' })
  griglia(
    @Query('da') da?: string,
    @Query('a') a?: string,
    @Query('tipoSkill') tipoSkill?: string,
    @Query('skill') skill?: string | string[],
  ) {
    return this.service.griglia(da, a, { tipo: tipoSkill, skill });
  }
}
