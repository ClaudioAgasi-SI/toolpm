import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiConflictResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Permesso, type UtenteAutenticato, UtenteRichiesta } from '../../auth/decoratori.js';
import { PeriodiService } from './periodi.service.js';

/** Chiusura e riapertura dei mesi (fase 3, blocco D4). */
@ApiTags('consuntivazione')
@Controller('periodi')
export class PeriodiController {
  constructor(private readonly service: PeriodiService) {}

  @Get()
  @Permesso('gestirePeriodi')
  @ApiOperation({
    summary: 'Mesi dal primo con ore a quello corrente: stato, righe per stato, chi ha chiuso o riaperto, se si può chiudere o riaprire',
    description: 'Con i progetti che hanno righe in attesa e nessun PM tra gli approvatori.',
  })
  elenco() {
    return this.service.elenco();
  }

  @Get('chiusi')
  @Permesso()
  @ApiOperation({ summary: 'Mesi chiusi (AAAAMM) nel periodo, per le pagine della consuntivazione' })
  @ApiQuery({ name: 'da', example: '2026-11-01' })
  @ApiQuery({ name: 'a', example: '2026-11-30' })
  chiusi(@Query('da') da: string, @Query('a') a: string) {
    return this.service.chiusiTra(da, a);
  }

  @Get(':mese/anteprima')
  @Permesso('gestirePeriodi')
  @ApiOperation({ summary: 'Anteprima della chiusura: righe per stato, righe non approvate (al massimo 200), blocco per l\'ordine dei mesi' })
  anteprima(@Param('mese') mese: string) {
    return this.service.anteprima(mese);
  }

  @Post(':mese/chiusura')
  @HttpCode(200)
  @Permesso('gestirePeriodi')
  @ApiOperation({
    summary: 'Chiude il mese',
    description:
      'In ordine (non se un mese precedente con ore è aperto). Bloccata se ci sono righe non approvate, salvo forzata: true con la motivazione ' +
      '(quelle righe restano ferme nel loro stato). Le righe approvate diventano "chiusa".',
  })
  @ApiBody({ schema: { example: { forzata: false } } })
  @ApiConflictResponse({ description: 'Già chiuso, mese precedente aperto o righe non approvate' })
  chiudi(@UtenteRichiesta() utente: UtenteAutenticato, @Param('mese') mese: string, @Body() body: unknown) {
    return this.service.chiudi(utente, mese, body);
  }

  @Post(':mese/riapertura')
  @HttpCode(200)
  @Permesso('gestirePeriodi')
  @ApiOperation({ summary: 'Riapre l\'ultimo mese chiuso, con motivazione: le righe "chiusa" tornano "approvata"' })
  @ApiBody({ schema: { example: { motivazione: 'Correzione delle ore di un collaboratore' } } })
  riapri(@UtenteRichiesta() utente: UtenteAutenticato, @Param('mese') mese: string, @Body() body: unknown) {
    return this.service.riapri(utente, mese, body);
  }
}
