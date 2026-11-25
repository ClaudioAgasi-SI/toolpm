import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Utente, UtenteSchema } from '../auth/utente.schema.js';
import { ApprovazioniController } from './approvazioni/approvazioni.controller.js';
import { ApprovazioniService } from './approvazioni/approvazioni.service.js';
import { PeriodiController } from './periodi/periodi.controller.js';
import { PeriodiService } from './periodi/periodi.service.js';
import { Periodo, PeriodoSchema } from './periodi/periodo.schema.js';
import { StoricoController } from './storico/storico.controller.js';
import { StoricoService } from './storico/storico.service.js';
import { ReportService } from './report/report.service.js';
import { VoceStorico, VoceStoricoSchema } from '../infrastruttura/voce-storico.schema.js';
import { ConsuntiviController } from './consuntivi/consuntivi.controller.js';
import { ConsuntiviService } from './consuntivi/consuntivi.service.js';
import { Consuntivo, ConsuntivoSchema } from './consuntivi/consuntivo.schema.js';
import { TariffeController } from './tariffe/tariffe.controller.js';
import { TariffeService } from './tariffe/tariffe.service.js';
import { TariffaPersonalizzata, TariffaPersonalizzataSchema, TariffaStandard, TariffaStandardSchema } from './tariffe/tariffa.schema.js';
import { ValorizzazioneController } from './valorizzazione/valorizzazione.controller.js';
import { ValorizzazioneService } from './valorizzazione/valorizzazione.service.js';
import { TipologieController } from './tipologie/tipologie.controller.js';
import { TipologieService } from './tipologie/tipologie.service.js';
import { TipologiaCosto, TipologiaCostoSchema } from './tipologie/tipologia-costo.schema.js';

/**
 * Sezione "Consuntivazione costi di progetto" di ToolPM (fasi 2 e 3).
 * Le sue API sono esposte sotto /api/consuntivazione (vedi RouterModule in app.module.ts).
 *
 * Blocchi del piano (docs/piano-fase2.md): C1 tipologie di costo, C2 tariffe standard e
 * personalizzate, C3 consuntivi giornalieri, C6 righe da valorizzare e ricalcolo; fase 3
 * (docs/piano-fase3.md): D1 invio e ritiro, D2 approvazioni, D4 chiusura dei mesi, D5 storico; fase 4 (docs/piano-fase4.md): E0 aggregazioni dei report.
 * Collection (migrazione 007-consuntivazione): tipologie_costo, tariffe_standard,
 * tariffe_personalizzate, consuntivi.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TipologiaCosto.name, schema: TipologiaCostoSchema },
      { name: TariffaStandard.name, schema: TariffaStandardSchema },
      { name: TariffaPersonalizzata.name, schema: TariffaPersonalizzataSchema },
      { name: Consuntivo.name, schema: ConsuntivoSchema },
      { name: Utente.name, schema: UtenteSchema },
      { name: Periodo.name, schema: PeriodoSchema },
      { name: VoceStorico.name, schema: VoceStoricoSchema },
    ]),
  ],
  controllers: [TipologieController, TariffeController, ConsuntiviController, ValorizzazioneController, ApprovazioniController, PeriodiController, StoricoController],
  providers: [TipologieService, TariffeService, ConsuntiviService, ValorizzazioneService, ApprovazioniService, PeriodiService, StoricoService, ReportService],
  exports: [TipologieService, TariffeService, ConsuntiviService],
})
export class ConsuntivazioneModule {}
