import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Put } from '@nestjs/common';
import { ApiBody, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Permesso } from '../auth/decoratori.js';
import { ParametriService } from './parametri.service.js';

/**
 * Controlli sul valore di ogni parametro modificabile. Le chiavi nascono solo dalle migrazioni:
 * le API non creano parametri nuovi.
 */
const VALIDATORI: Record<string, (v: unknown) => string | null> = {
  oreGiorno: (v) =>
    typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 24 ? null : 'oreGiorno deve essere un intero tra 1 e 24',
  soglieEvm: (v) => {
    const s = v as { anticipo?: unknown; ritardo?: unknown; fortementeInRitardo?: unknown } | null;
    const numeri = s && [s.anticipo, s.ritardo, s.fortementeInRitardo].every((n) => typeof n === 'number' && n > 0);
    if (!numeri) return 'soglieEvm deve avere anticipo, ritardo e fortementeInRitardo numerici e positivi';
    const { anticipo, ritardo, fortementeInRitardo } = s as Record<string, number>;
    return anticipo > ritardo && ritardo > fortementeInRitardo
      ? null
      : 'soglieEvm: deve valere anticipo > ritardo > fortementeInRitardo';
  },
};

/** Parametri di sistema (fase 1, blocco B3): li legge chi ha fatto l'accesso, li modifica il controller. */
@ApiTags('parametri')
@ApiUnauthorizedResponse({ description: 'Accesso richiesto' })
@Controller('parametri')
export class ParametriController {
  constructor(private readonly parametri: ParametriService) {}

  @Get()
  @Permesso()
  @ApiOperation({ summary: 'Elenco dei parametri di sistema' })
  @ApiOkResponse({ schema: { example: [{ chiave: 'oreGiorno', valore: 8, descrizione: 'Ore lavorative che fanno un giorno' }] } })
  elenco() {
    return this.parametri.elenco();
  }

  @Put(':chiave')
  @Permesso('gestireParametri')
  @ApiOperation({ summary: 'Modifica il valore di un parametro esistente (solo controller)' })
  @ApiBody({ schema: { example: { valore: 8 } } })
  @ApiForbiddenResponse({ description: 'Riservato al ruolo controller' })
  async modifica(@Param('chiave') chiave: string, @Body() body: { valore?: unknown }) {
    const valida = VALIDATORI[chiave];
    const esistente = (await this.parametri.elenco()).some((p) => p.chiave === chiave);
    if (!valida || !esistente) throw new NotFoundException(`Parametro "${chiave}" non trovato`);
    const problema = valida(body?.valore);
    if (problema) throw new BadRequestException(problema);
    return this.parametri.scrivi(chiave, body.valore);
  }
}
