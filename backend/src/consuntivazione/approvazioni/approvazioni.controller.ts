import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Permesso, type UtenteAutenticato, UtenteRichiesta } from '../../auth/decoratori.js';
import { ApprovazioniService } from './approvazioni.service.js';

/** Approvazioni delle righe di consuntivo (fase 3, blocco D2): TL, PM e PMSenior. */
@ApiTags('consuntivazione')
@Controller('approvazioni')
export class ApprovazioniController {
  constructor(private readonly service: ApprovazioniService) {}

  @Get()
  @Permesso('approvare')
  @ApiOperation({
    summary: 'Righe dei progetti di cui sei approvatore (tutti per il PMSenior), mai le tue',
    description:
      'Senza "stato": le righe che aspettano una tua azione (TL: inviate; PM: inviate e con via libera del TL). ' +
      'Per ogni riga: azioni possibili, via libera del TL, rifiuto, attività non assegnata alla risorsa; costo e tariffa solo al PM del progetto, al PMSenior e al controller. Al massimo 2000 righe.',
  })
  @ApiQuery({ name: 'da', required: false, example: '2026-11-01' })
  @ApiQuery({ name: 'a', required: false, example: '2026-11-30' })
  @ApiQuery({ name: 'progetto', required: false })
  @ApiQuery({ name: 'attivita', required: false })
  @ApiQuery({ name: 'risorsa', required: false })
  @ApiQuery({ name: 'stato', required: false, description: 'Uno o più tra inviata, approvataTL, approvata, respinta, chiusa (separati da virgola)' })
  elenco(@UtenteRichiesta() utente: UtenteAutenticato | undefined, @Query() query: Record<string, unknown>) {
    return this.service.elenco(utente, query);
  }

  @Get('in-attesa')
  @Permesso('approvare')
  @ApiOperation({ summary: 'Quante righe aspettano una tua azione (contatore del menu)' })
  inAttesa(@UtenteRichiesta() utente: UtenteAutenticato | undefined) {
    return this.service.inAttesa(utente);
  }

  @Post()
  @HttpCode(200)
  @Permesso('approvare')
  @ApiOperation({
    summary: 'Via libera, approvazione o rifiuto di più righe insieme',
    description:
      'viaLibera: TL, righe inviate. approva: PM (PMSenior ovunque), righe inviate o con via libera. respingi: TL sulle inviate, PM anche su quelle con via libera o approvate; motivazione obbligatoria. ' +
      'Nessuno agisce sulle proprie ore. Le righe non più nello stato letto, o su cui non hai il permesso, tornano "saltate" con il motivo; le altre si aggiornano in una transazione con lo storico.',
  })
  @ApiBody({ schema: { example: { azione: 'respingi', righe: ['6740a1c2e1f0a1b2c3d4e601'], motivazione: 'Il 3 marzo eri in ferie' } } })
  esegui(@UtenteRichiesta() utente: UtenteAutenticato | undefined, @Body() body: unknown) {
    return this.service.esegui(utente, body);
  }
}
