import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Permesso, type UtenteAutenticato, UtenteRichiesta } from '../../auth/decoratori.js';
import { AndamentoService } from './andamento.service.js';
import { CostiReportService } from './costi-report.service.js';
import { PianificatoReportService } from './pianificato-report.service.js';
import { file, leggiFormato } from './esporta.js';
import { esportaCosti, esportaElenco, esportaPianificato, esportaScheda } from './esportazioni.js';
import { RigheReportService } from './righe-report.service.js';
import { EvmService } from './evm.service.js';
import { ProgettiReportService } from './progetti-report.service.js';

/** Report della Consuntivazione (fase 4). */
@ApiTags('consuntivazione')
@Controller('report')
export class ReportController {
  constructor(
    private readonly progetti: ProgettiReportService,
    private readonly evm: EvmService,
    private readonly andamento: AndamentoService,
    private readonly costiReport: CostiReportService,
    private readonly pianificatoReport: PianificatoReportService,
    private readonly righeReport: RigheReportService,
  ) {}

  @Get('progetti')
  @Permesso('vedereReport')
  @ApiOperation({
    summary: 'Progetti visibili con stime, consuntivato dall\'inizio e righe in attesa',
    description: 'Controller e PMSenior: tutti; TL e PM: i progetti di cui sono approvatori. Euro solo a PM del progetto, PMSenior e controller.',
  })
  @ApiQuery({ name: 'vista', required: false, description: 'approvata (predefinita) oppure provvisoria' })
  @ApiQuery({ name: 'stato', required: false, description: 'inValutazione, inCorso, chiuso' })
  @ApiQuery({ name: 'testo', required: false, description: 'Codice o titolo' })
  @ApiQuery({ name: 'cliente', required: false, description: 'Id del cliente' })
  @ApiQuery({ name: 'centroCosto', required: false, description: 'Id del centro di costo' })
  @ApiQuery({ name: 'formato', required: false, description: 'xlsx o csv per scaricare il file' })
  async elenco(@UtenteRichiesta() utente: UtenteAutenticato | undefined, @Query() query: Record<string, unknown>) {
    const formato = leggiFormato(query.formato);
    const r = await this.progetti.elenco(utente, query);
    return formato ? file(esportaElenco(r), formato) : r;
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
  @ApiQuery({ name: 'formato', required: false, description: 'xlsx o csv per scaricare il file' })
  async scheda(@UtenteRichiesta() utente: UtenteAutenticato | undefined, @Param('id') id: string, @Query() query: Record<string, unknown>) {
    const formato = leggiFormato(query.formato);
    const r = await this.progetti.scheda(utente, id, query);
    return formato ? file(esportaScheda(r), formato) : r;
  }

  @Get('progetti/:id/evm')
  @Permesso('vedereReport')
  @ApiOperation({
    summary: 'Indicatori EVM del progetto e delle attività alla data',
    description:
      'PV, EV, AC, SV, CV, SPI, CPI, EAC, ETC, VAC, TCPI in euro e in giorni con lo stato di tempi e costi; per le attività con stima in giorni EV, AC, CPI e, con le date, SPI. ' +
      'Solo progetti In corso e Chiusi (In valutazione: motivo). Al TL senza euro.',
  })
  @ApiQuery({ name: 'al', required: false, description: 'AAAA-MM-GG, predefinito oggi, non oltre oggi' })
  @ApiQuery({ name: 'vista', required: false })
  indicatori(@UtenteRichiesta() utente: UtenteAutenticato | undefined, @Param('id') id: string, @Query() query: Record<string, unknown>) {
    return this.evm.progetto(utente, id, query);
  }

  @Get('progetti/:id/evm/andamento')
  @Permesso('vedereReport')
  @ApiOperation({
    summary: 'Andamento giornaliero degli indicatori EVM',
    description:
      'Serie salvata ogni notte (PV, EV, AC, SPI, CPI in giorni e, a chi può, in euro; percentuale, stati) con "aggiornatoAl" (ultimo giorno elaborato) e un avviso se ' +
      'l\'ultima elaborazione non si è conclusa o i dati non arrivano a ieri. Periodo predefinito: l\'ultimo anno fino ad aggiornatoAl.',
  })
  @ApiQuery({ name: 'da', required: false })
  @ApiQuery({ name: 'a', required: false })
  @ApiQuery({ name: 'vista', required: false })
  andamentoEvm(@UtenteRichiesta() utente: UtenteAutenticato | undefined, @Param('id') id: string, @Query() query: Record<string, unknown>) {
    return this.andamento.serie(utente, id, query);
  }

  @Get('esecuzioni')
  @Permesso('gestirePeriodi')
  @ApiOperation({ summary: 'Esecuzioni della procedura dell\'andamento EVM', description: 'Ultima esecuzione con esito, motivo e avvisi, le dieci più recenti, giorno fino a cui arrivano i dati. Solo controller.' })
  esecuzioni(@UtenteRichiesta() utente: UtenteAutenticato | undefined) {
    return this.andamento.stato(utente);
  }

  @Post('esecuzioni/evm')
  @HttpCode(202)
  @Permesso('gestirePeriodi')
  @ApiOperation({ summary: 'Esegui ora la procedura dell\'andamento EVM', description: 'Avvia l\'elaborazione dei giorni mancanti fino a ieri e risponde subito (202). 409 se è già in corso. Solo controller.' })
  eseguiOra(@UtenteRichiesta() utente: UtenteAutenticato | undefined) {
    return this.andamento.eseguiOra(utente);
  }

  @Get('costi')
  @Permesso('vedereReport')
  @ApiOperation({
    summary: 'Report dei costi annidato per i livelli scelti',
    description:
      'Ore, giorni e costi del periodo (predefinito: il mese corrente) raggruppati da 1 a 4 livelli tra cdc, progetto, attivita, risorsa, ruolo, tipologia, mese, ' +
      'con i totali di ogni livello e le righe da valorizzare; ogni riga conta una volta per livello (RF-21). Controller e PMSenior: tutti i progetti; TL e PM: i propri. ' +
      'Euro solo se l\'utente li vede su tutti i progetti compresi. In "opzioni" i valori dei filtri.',
  })
  @ApiQuery({ name: 'da', required: false })
  @ApiQuery({ name: 'a', required: false })
  @ApiQuery({ name: 'raggruppa', required: false, description: 'es. cdc,progetto,attivita (predefinito cdc,progetto)' })
  @ApiQuery({ name: 'centroCosto', required: false, description: 'Id separati da virgola' })
  @ApiQuery({ name: 'cliente', required: false, description: 'Id separati da virgola' })
  @ApiQuery({ name: 'progetto', required: false, description: 'Id separati da virgola' })
  @ApiQuery({ name: 'vista', required: false })
  @ApiQuery({ name: 'formato', required: false, description: 'xlsx o csv per scaricare il file' })
  async costi(@UtenteRichiesta() utente: UtenteAutenticato | undefined, @Query() query: Record<string, unknown>) {
    const formato = leggiFormato(query.formato);
    const r = await this.costiReport.costi(utente, query);
    return formato ? file(esportaCosti(r), formato) : r;
  }

  @Get('pianificato')
  @Permesso('vedereReport')
  @ApiOperation({
    summary: 'Pianificato contro consuntivato, per risorsa, mese e progetto',
    description:
      'Ore pianificate (percentuale di allocazione × giorni lavorativi del mese × ore contrattuali, entro ingresso e uscita; lun–ven meno le festività italiane) ' +
      'contro ore approvate, ore ancora in attesa a parte, scostamento in ore e percentuale; ore su progetti non allocati segnate. Solo ore. ' +
      'Controller e PMSenior: tutti i progetti; TL e PM: i propri.',
  })
  @ApiQuery({ name: 'da', required: false, description: 'AAAAMM, predefinito il mese corrente' })
  @ApiQuery({ name: 'a', required: false, description: 'AAAAMM, predefinito uguale a "da"; al massimo 24 mesi' })
  @ApiQuery({ name: 'risorsa', required: false, description: 'Id separati da virgola' })
  @ApiQuery({ name: 'progetto', required: false, description: 'Id separati da virgola' })
  @ApiQuery({ name: 'formato', required: false, description: 'xlsx o csv per scaricare il file' })
  async pianificato(@UtenteRichiesta() utente: UtenteAutenticato | undefined, @Query() query: Record<string, unknown>) {
    const formato = leggiFormato(query.formato);
    const r = await this.pianificatoReport.pianificato(utente, query);
    return formato ? file(esportaPianificato(r), formato) : r;
  }

  @Get('righe')
  @Permesso('vedereReport')
  @ApiOperation({
    summary: 'Righe di dettaglio approvate e chiuse',
    description:
      'Una riga per riga di consuntivo approvata dal PM o di un mese chiuso: data, risorsa, ruolo alla data, progetto, attività, centro di costo, tipologia, ore, ' +
      'tariffa e costo (solo sui progetti di cui si vedono gli importi), nota, stato, via libera e approvazione. Al massimo un anno e 100.000 righe. ' +
      'Senza formato risponde con un\'anteprima di 200 righe.',
  })
  @ApiQuery({ name: 'da', required: false })
  @ApiQuery({ name: 'a', required: false })
  @ApiQuery({ name: 'progetto', required: false, description: 'Id separati da virgola' })
  @ApiQuery({ name: 'centroCosto', required: false, description: 'Id separati da virgola' })
  @ApiQuery({ name: 'risorsa', required: false, description: 'Id separati da virgola' })
  @ApiQuery({ name: 'formato', required: false, description: 'xlsx o csv per scaricare il file' })
  async righe(@UtenteRichiesta() utente: UtenteAutenticato | undefined, @Query() query: Record<string, unknown>) {
    const formato = leggiFormato(query.formato);
    const r = await this.righeReport.righe(utente, query);
    return formato ? file(this.righeReport.esportazione(r), formato) : this.righeReport.anteprima(r);
  }
}
