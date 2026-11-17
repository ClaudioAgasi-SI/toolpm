import { randomBytes } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AutenticazioneGuard } from './autenticazione.guard.js';
import { Utente, UtenteSchema } from './utente.schema.js';
import { UtentiController } from './utenti.controller.js';
import { UtentiService } from './utenti.service.js';

/**
 * Autenticazione (fase 1, blocco B2): utenti, accesso con email e password, token JWT in un cookie
 * httpOnly, guard globale. API: /api/auth/... (accesso) e /api/utenti (gestione, solo admin).
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Utente.name, schema: UtenteSchema }]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        let secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          secret = randomBytes(32).toString('hex');
          new Logger('AuthModule').warn(
            'JWT_SECRET non impostato: uso un segreto casuale, gli accessi scadono a ogni riavvio del backend',
          );
        }
        return { secret, signOptions: { expiresIn: (config.get<string>('JWT_DURATA') ?? '8h') as `${number}h` } };
      },
    }),
  ],
  controllers: [AuthController, UtentiController],
  providers: [AuthService, UtentiService, { provide: APP_GUARD, useClass: AutenticazioneGuard }],
  exports: [AuthService],
})
export class AuthModule {}
