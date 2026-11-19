import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RouterModule } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health.controller.js';
import { ContestoUtenteMiddleware } from './infrastruttura/contesto-utente.middleware.js';
import { InfrastrutturaModule } from './infrastruttura/infrastruttura.module.js';
import { tracciamentoPlugin } from './infrastruttura/tracciamento.plugin.js';
import { PermessiModule } from './permessi/permessi.module.js';
import { AnagraficheModule } from './pianificatore/anagrafiche/anagrafiche.module.js';
import { PianificatoreModule } from './pianificatore/pianificatore.module.js';
import { PianificazioneModule } from './pianificatore/pianificazione/pianificazione.module.js';
import { RisorseModule } from './pianificatore/risorse/risorse.module.js';

/**
 * Modulo radice di ToolPM. Ogni sezione del prodotto è un modulo con il proprio
 * prefisso di rotta: /api/<sezione>/... (es. /api/pianificatore/risorse).
 * Per aggiungere una sezione: crea src/<sezione>/<sezione>.module.ts,
 * importalo qui e registralo in RouterModule.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI', 'mongodb://localhost:27017/toolpm'),
        // Gli indici si creano solo se richiesto, per non toccare un database esistente.
        autoIndex: config.get<string>('MONGODB_AUTO_INDEX') === 'true',
        // creatoIl/creatoDa/modificatoIl/modificatoDa su ogni documento di ogni collection.
        connectionFactory: (connection: Connection) => connection.plugin(tracciamentoPlugin),
      }),
    }),
    InfrastrutturaModule,
    AuthModule,
    PermessiModule,
    PianificatoreModule,
    RouterModule.register([
      {
        path: 'pianificatore',
        module: PianificatoreModule,
        children: [RisorseModule, AnagraficheModule, PianificazioneModule],
      },
    ]),
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Contesto dell'utente per ogni richiesta: lo usa il tracciamento dei salvataggi.
    consumer.apply(ContestoUtenteMiddleware).forRoutes('*path');
  }
}
