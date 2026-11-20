import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBody, ApiConflictResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Permesso, type UtenteAutenticato, UtenteRichiesta } from '../../auth/decoratori.js';
import { ValorizzazioneService } from './valorizzazione.service.js';

/** Righe da valorizzare e ricalcolo dei costi (fase 2, blocco C6): solo controller. */
@ApiTags('consuntivazione')
@Controller()
export class ValorizzazioneController {
  constructor(private readonly service: ValorizzazioneService) {}

  @Get('da-valorizzare')
  @Permesso('gestireTariffe')
  @ApiOperation({
    summary: 'Righe senza costo nel periodo (al massimo un anno), con il motivo',
    description: 'motivo: ruoloMancante (la risorsa non ha un ruolo alla data), tariffaMancante (nessuna tariffa per la tipologia), tariffaDisponibile (la tariffa ora c\'è: basta ricalcolare).',
  })
  @ApiQuery({ name: 'da', example: '2026-11-01' })
  @ApiQuery({ name: 'a', example: '2026-11-30' })
  daValorizzare(@Query('da') da?: string, @Query('a') a?: string) {
    return this.service.daValorizzare({ da, a });
  }

  @Post('ricalcolo')
  @HttpCode(200)
  @Permesso('gestireTariffe')
  @ApiOperation({
    summary: 'Ricalcolo dei costi del periodo con le tariffe attuali: anteprima (conferma: false) o applicazione (conferma: true)',
    description: 'Tocca solo le righe il cui valore cambia, escluse quelle di periodi chiusi; con conferma aggiorna in una transazione.',
  })
  @ApiBody({ schema: { example: { da: '2026-11-01', a: '2026-11-30', risorsaId: null, conferma: false } } })
  @ApiConflictResponse({ description: 'Una giornata è cambiata dopo l\'anteprima' })
  ricalcola(@UtenteRichiesta() utente: UtenteAutenticato, @Body() body: unknown) {
    return this.service.ricalcola(utente, body);
  }
}
