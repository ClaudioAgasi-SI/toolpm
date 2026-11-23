import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ParametriController } from './parametri.controller.js';
import { ParametriService } from './parametri.service.js';
import { Parametro, ParametroSchema } from './parametro.schema.js';
import { AuditService } from './audit.service.js';
import { VoceStorico, VoceStoricoSchema } from './voce-storico.schema.js';

/**
 * Servizi tecnici condivisi da tutte le sezioni (fase 1, blocco B1): parametri di sistema,
 * con le API /api/parametri (blocco B3: lettura con accesso, modifica solo controller), e lo storico
 * delle modifiche (AuditService, collection audit_log, fase 3 blocco D0).
 * Il tracciamento dei salvataggi è un plugin registrato sulla connessione (app.module.ts),
 * il contesto dell'utente un middleware (ContestoUtenteMiddleware).
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Parametro.name, schema: ParametroSchema },
      { name: VoceStorico.name, schema: VoceStoricoSchema },
    ]),
  ],
  controllers: [ParametriController],
  providers: [ParametriService, AuditService],
  exports: [ParametriService, AuditService],
})
export class InfrastrutturaModule {}
