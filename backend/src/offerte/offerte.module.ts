import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TariffaStandard, TariffaStandardSchema } from '../consuntivazione/tariffe/tariffa.schema.js';
import { TipologiaCosto, TipologiaCostoSchema } from '../consuntivazione/tipologie/tipologia-costo.schema.js';
import { ListinoController } from './listino/listino.controller.js';
import { ListinoService } from './listino/listino.service.js';
import { VoceListino, VoceListinoSchema } from './listino/voce-listino.schema.js';

/**
 * Sezione Offerte e preventivi (fase 5; analisi in docs/analisi-offerte.md, piano in docs/piano-fase5.md).
 * Le sue API sono esposte sotto /api/offerte (vedi RouterModule in app.module.ts).
 * F0: calcoli della stima (`calcoli.ts`) e permessi; F1: listino di vendita (`listino/`) e risoluzione delle
 * tariffe di costo e vendita alla data; offerte e revisioni arrivano dai blocchi F2–F5.
 * Le tariffe di costo si leggono dalle collection della Consuntivazione (tariffe_standard, tipologie_costo).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VoceListino.name, schema: VoceListinoSchema },
      { name: TariffaStandard.name, schema: TariffaStandardSchema },
      { name: TipologiaCosto.name, schema: TipologiaCostoSchema },
    ]),
  ],
  controllers: [ListinoController],
  providers: [ListinoService],
  exports: [ListinoService],
})
export class OfferteModule {}
