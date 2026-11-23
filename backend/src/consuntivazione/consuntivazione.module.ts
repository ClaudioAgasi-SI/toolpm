import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Utente, UtenteSchema } from '../auth/utente.schema.js';
import { ApprovazioniController } from './approvazioni/approvazioni.controller.js';
import { ApprovazioniService } from './approvazioni/approvazioni.service.js';
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
 * (docs/piano-fase3.md): D1 invio e ritiro, D2 approvazioni.
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
    ]),
  ],
  controllers: [TipologieController, TariffeController, ConsuntiviController, ValorizzazioneController, ApprovazioniController],
  providers: [TipologieService, TariffeService, ConsuntiviService, ValorizzazioneService, ApprovazioniService],
  exports: [TipologieService, TariffeService, ConsuntiviService],
})
export class ConsuntivazioneModule {}
