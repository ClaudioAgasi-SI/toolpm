import { Module } from '@nestjs/common';
import { AllocazioniService } from './allocazioni.service.js';
import { RisorseController } from './risorse.controller.js';
import { RisorseService } from './risorse.service.js';

/** Risorse viste dal Pianificatore. Il modello Risorsa è registrato in ComuniDatiModule (globale). */
@Module({
  controllers: [RisorseController],
  providers: [RisorseService, AllocazioniService],
  exports: [AllocazioniService],
})
export class RisorseModule {}
