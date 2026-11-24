import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Permesso, type UtenteAutenticato, UtenteRichiesta } from '../../auth/decoratori.js';
import { StoricoService } from './storico.service.js';

/** Storico delle modifiche (fase 3, blocco D5). */
@ApiTags('consuntivazione')
@Controller('storico')
export class StoricoController {
  constructor(private readonly service: StoricoService) {}

  @Get()
  @Permesso('consultareStorico')
  @ApiOperation({
    summary: 'Voci dello storico, dalla più recente (controller e PMSenior)',
    description:
      'Filtri: collezione (consuntivi, progetti, attivita, tipologie_costo, tariffe_standard, tariffe_personalizzate, periodi), documento (id), riga (id di una riga di consuntivo), ' +
      'operazione, utente (id), da/a (date). Al massimo 1000 voci (limite, predefinito 200).',
  })
  @ApiQuery({ name: 'collezione', required: false })
  @ApiQuery({ name: 'documento', required: false })
  @ApiQuery({ name: 'riga', required: false })
  @ApiQuery({ name: 'operazione', required: false })
  @ApiQuery({ name: 'utente', required: false })
  @ApiQuery({ name: 'da', required: false })
  @ApiQuery({ name: 'a', required: false })
  @ApiQuery({ name: 'limite', required: false })
  elenco(@Query() query: Record<string, unknown>) {
    return this.service.elenco(query);
  }

  @Get('riga/:rigaId')
  @Permesso()
  @ApiOperation({
    summary: 'Cronologia di una riga di consuntivo',
    description: 'Per la risorsa, gli approvatori del progetto, controller e PMSenior; i ricalcoli (con gli importi) solo a chi vede i costi.',
  })
  riga(@UtenteRichiesta() utente: UtenteAutenticato, @Param('rigaId') rigaId: string) {
    return this.service.riga(utente, rigaId);
  }
}
