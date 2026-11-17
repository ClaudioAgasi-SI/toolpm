import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ParametriService } from './parametri.service.js';
import { Parametro, ParametroSchema } from './parametro.schema.js';

/**
 * Servizi tecnici condivisi da tutte le sezioni (fase 1, blocco B1): parametri di sistema.
 * Il tracciamento dei salvataggi è un plugin registrato sulla connessione (app.module.ts),
 * il contesto dell'utente un middleware (ContestoUtenteMiddleware).
 */
@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Parametro.name, schema: ParametroSchema }])],
  providers: [ParametriService],
  exports: [ParametriService],
})
export class InfrastrutturaModule {}
