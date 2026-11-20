import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBody, ApiConflictResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Permesso, type UtenteAutenticato, UtenteRichiesta } from '../../auth/decoratori.js';
import { ConsuntiviService } from './consuntivi.service.js';

const ESEMPIO_RIGHE = [
  { attivitaId: '6740a1c2e1f0a1b2c3d4e501', minuti: 360, nota: 'Sviluppo API' },
  { progettoId: '6740a1c2e1f0a1b2c3d4e401', tipologiaId: '6740a1c2e1f0a1b2c3d4e302', minuti: 120 },
];

/** Consuntivi giornalieri (fase 2, blocco C3). */
@ApiTags('consuntivazione')
@Controller('consuntivi')
export class ConsuntiviController {
  constructor(private readonly service: ConsuntiviService) {}

  @Get()
  @Permesso()
  @ApiOperation({
    summary: 'Giornate del periodo (al massimo 62 giorni): le proprie; il controller anche di altre risorse con ?risorsa=',
    description: 'Tariffe e importi compaiono solo per il controller.',
  })
  @ApiQuery({ name: 'da', example: '2027-03-01' })
  @ApiQuery({ name: 'a', example: '2027-03-07' })
  @ApiQuery({ name: 'risorsa', required: false })
  leggi(@UtenteRichiesta() utente: UtenteAutenticato | undefined, @Query('da') da?: string, @Query('a') a?: string, @Query('risorsa') risorsa?: string) {
    return this.service.leggi(utente, { da, a, risorsa });
  }

  @Get('voci')
  @Permesso('consuntivare')
  @ApiOperation({ summary: 'Progetti non chiusi con le loro attività attive: le voci su cui si può consuntivare' })
  voci() {
    return this.service.voci();
  }

  @Get('proposte')
  @Permesso('consuntivare')
  @ApiOperation({ summary: 'Righe proposte per la settimana: allocazioni del Pianificatore e righe della settimana precedente' })
  @ApiQuery({ name: 'settimana', required: false, description: 'Un giorno qualsiasi della settimana (AAAA-MM-GG); se manca, oggi' })
  proposte(@UtenteRichiesta() utente: UtenteAutenticato | undefined, @Query('settimana') settimana?: string) {
    return this.service.proposte(utente, settimana);
  }

  @Put()
  @Permesso('consuntivare')
  @ApiOperation({
    summary: 'Salva più giornate insieme (tutte o nessuna)',
    description: 'Ogni giornata porta la versione letta: se nel frattempo è cambiata, 409 e nessuna giornata viene salvata.',
  })
  @ApiBody({ schema: { example: { giornate: [{ data: '2027-03-01', versione: 0, righe: ESEMPIO_RIGHE }] } } })
  @ApiConflictResponse({ description: 'Versione cambiata o righe non modificabili' })
  salvaGiornate(@UtenteRichiesta() utente: UtenteAutenticato | undefined, @Body() body: unknown) {
    return this.service.salvaGiornate(utente, body);
  }

  @Put(':data')
  @Permesso('consuntivare')
  @ApiOperation({
    summary: 'Salva le righe di una giornata (sostituiscono quelle in bozza)',
    description:
      'Ogni riga indica il progetto o l\'attività (il progetto si ricava), la tipologia (se manca, la predefinita), i minuti a passi di 15 e una nota facoltativa. ' +
      'Le righe esistenti si indicano con _id. versione = quella letta (0 per una giornata nuova).',
  })
  @ApiBody({ schema: { example: { versione: 0, righe: ESEMPIO_RIGHE } } })
  @ApiConflictResponse({ description: 'Versione cambiata' })
  salvaGiornata(@UtenteRichiesta() utente: UtenteAutenticato | undefined, @Param('data') data: string, @Body() body: unknown) {
    return this.service.salvaGiornata(utente, data, body);
  }
}
