import { Module } from '@nestjs/common';
import { Anagrafiche, CENTRI_COSTO, CLIENTI, RUOLI } from './anagrafiche.js';
import { AttivitaController, ProgettiController } from './progetti/progetti.controller.js';
import { AttivitaService } from './progetti/attivita.service.js';
import { ProgettiService } from './progetti/progetti.service.js';
import { RisorseComuniController } from './risorse/risorse-comuni.controller.js';
import { RisorseComuniService } from './risorse/risorse-comuni.service.js';

/**
 * Modulo Comuni (fase 1, blocco B4), registrato su /api/comuni: dati condivisi da tutte le sezioni.
 * Clienti, centri di costo, ruoli professionali, risorse (anagrafica), progetti con stato, approvatori
 * e percentuale, attività, storico degli avanzamenti. I modelli sono in ComuniDatiModule (globale).
 */
@Module({
  controllers: [
    CLIENTI.controller,
    CENTRI_COSTO.controller,
    RUOLI.controller,
    RisorseComuniController,
    ProgettiController,
    AttivitaController,
  ],
  providers: [CLIENTI.provider, CENTRI_COSTO.provider, RUOLI.provider, Anagrafiche, RisorseComuniService, ProgettiService, AttivitaService],
  exports: [ProgettiService, Anagrafiche],
})
export class ComuniModule {}
