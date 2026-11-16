import { Module } from '@nestjs/common';
import { AnagraficheModule } from './anagrafiche/anagrafiche.module.js';
import { PianificazioneModule } from './pianificazione/pianificazione.module.js';
import { RisorseModule } from './risorse/risorse.module.js';

/**
 * Sezione "Pianificatore risorse allocate" di ToolPM.
 * Le sue API sono esposte sotto /api/pianificatore (vedi RouterModule in app.module.ts).
 */
@Module({
  imports: [RisorseModule, AnagraficheModule, PianificazioneModule],
})
export class PianificatoreModule {}
