import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Permesso, type UtenteAutenticato, UtenteRichiesta } from '../../auth/decoratori.js';
import { AttivitaService } from './attivita.service.js';
import { ProgettiService } from './progetti.service.js';

const ESEMPIO_PROGETTO = {
  codice: 'TIMBUFE',
  titolo: 'TIM — front end Business',
  descrizione: 'Evoluzione del front end per la clientela Business',
  clienteId: '6740a1c2e1f0a1b2c3d4e401',
  centroCostoId: '6740a1c2e1f0a1b2c3d4e301',
  dataInizio: '2027-01-01',
  dataFine: '2027-12-31',
  soloSuAttivita: false,
  stime: { managerialeGiorni: 400, managerialeCentesimi: 16000000, definitivaGiorni: 440, definitivaCentesimi: 17600000 },
};

/** Progetti (/api/comuni/progetti). Richiedono sempre l'accesso. */
@ApiTags('comuni')
@ApiForbiddenResponse({ description: 'Permesso negato' })
@Controller('progetti')
export class ProgettiController {
  constructor(private readonly service: ProgettiService) {}

  @Get()
  @Permesso()
  @ApiOperation({ summary: 'Elenco dei progetti; stime in euro solo a chi gestisce il progetto e al controller' })
  @ApiQuery({ name: 'gestibili', required: false, description: 'true = solo i progetti che l\'utente può gestire' })
  @ApiQuery({ name: 'stato', required: false, enum: ['inValutazione', 'inCorso', 'chiuso'] })
  @ApiQuery({ name: 'clienteId', required: false })
  elenco(
    @UtenteRichiesta() utente: UtenteAutenticato,
    @Query('gestibili') gestibili?: string,
    @Query('stato') stato?: string,
    @Query('clienteId') clienteId?: string,
  ) {
    return this.service.elenco(utente, { gestibili, stato, clienteId });
  }

  @Get(':id')
  @Permesso()
  @ApiOperation({ summary: 'Dettaglio del progetto' })
  dettaglio(@UtenteRichiesta() utente: UtenteAutenticato, @Param('id') id: string) {
    return this.service.dettaglio(utente, id);
  }

  @Post()
  @Permesso('creareProgetto')
  @ApiOperation({
    summary: 'Crea un progetto In valutazione (TL, PM, PMSenior)',
    description: 'Chi lo crea ne diventa approvatore: TL se è abilitato TL, altrimenti PM. Centro di costo obbligatorio e attivo.',
  })
  @ApiBody({ schema: { example: ESEMPIO_PROGETTO } })
  @ApiConflictResponse({ description: 'Codice già usato, oppure cliente o centro di costo non attivo' })
  crea(@UtenteRichiesta() utente: UtenteAutenticato, @Body() body: unknown) {
    return this.service.crea(utente, body);
  }

  @Put(':id')
  @Permesso()
  @ApiOperation({
    summary: 'Modifica i dati del progetto (TL e PM del progetto, PMSenior)',
    description:
      'Aggiorna solo i campi inviati; null svuota un campo facoltativo. Il codice non cambia. Stato, approvatori e percentuale hanno API dedicate.',
  })
  @ApiBody({ schema: { example: { titolo: 'TIM — front end Business (fase 2)', dataFine: '2028-03-31', stime: { definitivaGiorni: 460 } } } })
  @ApiBadRequestResponse({ description: 'Dati non validi' })
  modifica(@UtenteRichiesta() utente: UtenteAutenticato, @Param('id') id: string, @Body() body: unknown) {
    return this.service.modifica(utente, id, body);
  }

  @Post(':id/stato')
  @Permesso()
  @ApiOperation({
    summary: 'Passaggio di stato',
    description:
      'In valutazione → In corso (serve data di inizio e almeno un PM) → Chiuso (serve data di fine): TL e PM del progetto, PMSenior. Riapertura Chiuso → In corso: PM del progetto, PMSenior.',
  })
  @ApiBody({ schema: { example: { stato: 'inCorso' } } })
  cambiaStato(@UtenteRichiesta() utente: UtenteAutenticato, @Param('id') id: string, @Body() body: unknown) {
    return this.service.cambiaStato(utente, id, body);
  }

  @Put(':id/approvatori')
  @Permesso()
  @ApiOperation({
    summary: 'Sostituisce gli approvatori (PM del progetto, PMSenior)',
    description: 'Ogni risorsa con il profilo TL o PM su questo progetto. Un progetto In corso o Chiuso deve avere almeno un PM.',
  })
  @ApiBody({
    schema: {
      example: {
        approvatori: [
          { risorsaId: '6740a1c2e1f0a1b2c3d4e099', profilo: 'PM' },
          { risorsaId: '6740a1c2e1f0a1b2c3d4e098', profilo: 'TL' },
        ],
      },
    },
  })
  impostaApprovatori(@UtenteRichiesta() utente: UtenteAutenticato, @Param('id') id: string, @Body() body: unknown) {
    return this.service.impostaApprovatori(utente, id, body);
  }

  @Put(':id/completamento')
  @Permesso()
  @ApiOperation({ summary: 'Percentuale di completamento del progetto, 0–100 (TL e PM del progetto, PMSenior)' })
  @ApiBody({ schema: { example: { percentuale: 40 } } })
  impostaCompletamento(@UtenteRichiesta() utente: UtenteAutenticato, @Param('id') id: string, @Body() body: unknown) {
    return this.service.impostaCompletamento(utente, id, body);
  }

  @Get(':id/avanzamenti')
  @Permesso()
  @ApiOperation({ summary: 'Storico delle percentuali del progetto e delle sue attività, dal più recente' })
  @ApiQuery({ name: 'attivitaId', required: false })
  avanzamenti(@Param('id') id: string, @Query('attivitaId') attivitaId?: string) {
    return this.service.storicoAvanzamenti(id, attivitaId);
  }
}

/** Attività di un progetto (/api/comuni/progetti/:progettoId/attivita). */
@ApiTags('comuni')
@ApiForbiddenResponse({ description: 'Permesso negato' })
@Controller('progetti/:progettoId/attivita')
export class AttivitaController {
  constructor(private readonly service: AttivitaService) {}

  @Get()
  @Permesso()
  @ApiOperation({ summary: 'Attività del progetto, per codice' })
  elenco(@Param('progettoId') progettoId: string) {
    return this.service.elenco(progettoId);
  }

  @Get(':id')
  @Permesso()
  @ApiOperation({ summary: 'Dettaglio dell\'attività' })
  dettaglio(@Param('progettoId') progettoId: string, @Param('id') id: string) {
    return this.service.dettaglio(progettoId, id);
  }

  @Post()
  @Permesso()
  @ApiOperation({ summary: 'Crea un\'attività (TL e PM del progetto, PMSenior); codice univoco nel progetto' })
  @ApiBody({ schema: { example: { codice: 'SVIL', descrizione: 'Sviluppo', dataInizio: '2027-01-01', stimaGiorni: 250 } } })
  crea(@UtenteRichiesta() utente: UtenteAutenticato, @Param('progettoId') progettoId: string, @Body() body: unknown) {
    return this.service.crea(utente, progettoId, body);
  }

  @Put(':id')
  @Permesso()
  @ApiOperation({ summary: 'Modifica l\'attività (TL e PM del progetto, PMSenior); il codice non cambia' })
  @ApiBody({ schema: { example: { descrizione: 'Sviluppo e unit test', stato: 'chiusa', stimaGiorni: 260 } } })
  modifica(
    @UtenteRichiesta() utente: UtenteAutenticato,
    @Param('progettoId') progettoId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.modifica(utente, progettoId, id, body);
  }

  @Put(':id/risorse')
  @Permesso()
  @ApiOperation({ summary: 'Sostituisce le risorse assegnate all\'attività (TL e PM del progetto, PMSenior)' })
  @ApiBody({ schema: { example: { risorseAssegnateIds: ['6ae88b192fcc045f0ca48409'] } } })
  impostaRisorse(
    @UtenteRichiesta() utente: UtenteAutenticato,
    @Param('progettoId') progettoId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.impostaRisorse(utente, progettoId, id, body);
  }

  @Put(':id/completamento')
  @Permesso()
  @ApiOperation({ summary: 'Percentuale dell\'attività, 0–100 (risorse assegnate, TL e PM del progetto, PMSenior)' })
  @ApiBody({ schema: { example: { percentuale: 55 } } })
  impostaCompletamento(
    @UtenteRichiesta() utente: UtenteAutenticato,
    @Param('progettoId') progettoId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.impostaCompletamento(utente, progettoId, id, body);
  }
}
