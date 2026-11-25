import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Permesso, type UtenteAutenticato, UtenteRichiesta } from '../../auth/decoratori.js';
import { ProgettiReportService } from './progetti-report.service.js';

/** Report della Consuntivazione (fase 4). */
@ApiTags('consuntivazione')
@Controller('report')
export class ReportController {
  constructor(private readonly progetti: ProgettiReportService) {}

  @Get('progetti')
  @Permesso('vedereReport')
  @ApiOperation({
    summary: 'Progetti visibili con stime, consuntivato dall\'inizio e righe in attesa',
    description: 'Controller e PMSenior: tutti; TL e PM: i progetti di cui sono approvatori. Euro solo a PM del progetto, PMSenior e controller.',
  })
  @ApiQuery({ name: 'vista', required: false, description: 'approvata (predefinita) oppure provvisoria' })
  @ApiQuery({ name: 'stato', required: false, description: 'inValutazione, inCorso, chiuso' })
  @ApiQuery({ name: 'testo', required: false, description: 'Codice o titolo' })
  elenco(@UtenteRichiesta() utente: UtenteAutenticato | undefined, @Query() query: Record<string, unknown>) {
    return this.progetti.elenco(utente, query);
  }

  @Get('progetti/:id')
  @Permesso('vedereReport')
  @ApiOperation({
    summary: 'Scheda costi del progetto',
    description:
      'Stime contro consuntivato dall\'inizio e nel periodo (predefinito: l\'anno in corso), righe in attesa e da valorizzare, dettaglio per attività (con "Senza attività"), ' +
      'risorsa, ruolo alla data, tipologia e mese. Approvatori del progetto, PMSenior e controller; euro solo a PM del progetto, PMSenior e controller.',
  })
  @ApiQuery({ name: 'da', required: false })
  @ApiQuery({ name: 'a', required: false })
  @ApiQuery({ name: 'vista', required: false })
  scheda(@UtenteRichiesta() utente: UtenteAutenticato | undefined, @Param('id') id: string, @Query() query: Record<string, unknown>) {
    return this.progetti.scheda(utente, id, query);
  }
}
