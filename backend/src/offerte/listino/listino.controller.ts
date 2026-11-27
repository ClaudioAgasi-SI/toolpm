import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBody, ApiConflictResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Permesso, type UtenteAutenticato, UtenteRichiesta } from '../../auth/decoratori.js';
import { permessoGlobale } from '../../permessi/regole.js';
import { ListinoService } from './listino.service.js';

/**
 * Listino di vendita (fase 5, blocco F1), sotto /api/offerte/listino.
 * Lettura: commerciali, PM, PMSenior e controller (vedereListino); modifica: PMSenior e controller (gestireListino).
 */
@ApiTags('offerte')
@Controller('listino')
export class ListinoController {
  constructor(private readonly service: ListinoService) {}

  @Get()
  @Permesso('vedereListino')
  @ApiOperation({ summary: 'Voci del listino di vendita, standard e per cliente, con validità' })
  @ApiQuery({ name: 'cliente', required: false, description: 'Id del cliente, oppure "standard"; se manca, tutto il listino' })
  @ApiQuery({ name: 'ruolo', required: false })
  elenco(@Query('cliente') cliente?: string, @Query('ruolo') ruolo?: string) {
    return this.service.elenco({ cliente, ruolo });
  }

  @Get('applicabili')
  @Permesso('vedereListino')
  @ApiOperation({
    summary: 'Tariffa di vendita (del cliente, altrimenti standard) e costo giornaliero di ogni ruolo alla data; segnala i ruoli senza tariffa',
    description: 'Il costo giornaliero in euro arriva solo a PMSenior e controller; agli altri solo costoPresente.',
  })
  @ApiQuery({ name: 'cliente', required: false, description: 'Id del cliente; se manca o "standard", il listino standard' })
  @ApiQuery({ name: 'data', required: false, description: 'AAAA-MM-GG; se manca, oggi' })
  applicabili(@UtenteRichiesta() utente: UtenteAutenticato, @Query('cliente') cliente?: string, @Query('data') data?: string) {
    return this.service.applicabili({ cliente, data }, permessoGlobale(utente, 'gestireListino'));
  }

  @Post()
  @Permesso('gestireListino')
  @ApiOperation({ summary: 'Nuova tariffa di vendita; il periodo non deve sovrapporsi ad altre dello stesso ruolo e cliente' })
  @ApiBody({ schema: { example: { ruoloId: '6740a1c2e1f0a1b2c3d4e201', clienteId: null, validoDal: '2027-01-01', validoAl: null, centesimiGiorno: 45000 } } })
  @ApiConflictResponse({ description: 'Periodo sovrapposto' })
  crea(@Body() body: unknown) {
    return this.service.crea(body);
  }

  @Put(':id')
  @Permesso('gestireListino')
  @ApiOperation({ summary: 'Modifica validità o importo di una tariffa di vendita (ruolo e cliente non cambiano)' })
  @ApiBody({ schema: { example: { validoAl: '2027-06-30' } } })
  modifica(@Param('id') id: string, @Body() body: unknown) {
    return this.service.modifica(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Permesso('gestireListino')
  @ApiOperation({ summary: 'Cancella una tariffa di vendita inserita per errore (le offerte approvate tengono gli importi fotografati)' })
  elimina(@Param('id') id: string) {
    return this.service.elimina(id);
  }
}
