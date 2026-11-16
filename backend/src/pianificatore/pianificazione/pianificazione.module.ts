import { Module } from '@nestjs/common';
import { RisorseModule } from '../risorse/risorse.module.js';
import { PianificazioneController } from './pianificazione.controller.js';
import { PianificazioneService } from './pianificazione.service.js';

@Module({
  imports: [RisorseModule],
  controllers: [PianificazioneController],
  providers: [PianificazioneService],
})
export class PianificazioneModule {}
