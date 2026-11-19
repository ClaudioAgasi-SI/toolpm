import { Global, Module } from '@nestjs/common';
import { PermessiService } from './permessi.service.js';

/**
 * Permessi (fase 1, blocco B3): regole su profili e ruoli, condivise da tutte le sezioni.
 * I permessi globali si dichiarano sui controller con @Permesso(...) e li controlla AutenticazioneGuard;
 * quelli che dipendono da un progetto, un'attività o una risorsa li controllano i servizi con PermessiService.
 */
@Global()
@Module({
  providers: [PermessiService],
  exports: [PermessiService],
})
export class PermessiModule {}
