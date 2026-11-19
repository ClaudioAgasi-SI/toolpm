import { Module } from '@nestjs/common';
import { RisorseController } from './risorse.controller.js';
import { RisorseService } from './risorse.service.js';

/** Risorse viste dal Pianificatore. Il modello Risorsa è registrato in ComuniDatiModule (globale). */
@Module({
  controllers: [RisorseController],
  providers: [RisorseService],
})
export class RisorseModule {}
