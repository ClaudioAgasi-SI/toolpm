import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { MongooseErrorsFilter } from './mongoose-errors.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new MongooseErrorsFilter());
  // In sviluppo il frontend gira su un'altra porta (ng serve su 4201).
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true });

  // Documentazione Swagger: http://localhost:3001/api/docs (JSON OpenAPI su /api/docs-json)
  const config = new DocumentBuilder()
    .setTitle('ToolPM — API')
    .setDescription(
      'API REST di ToolPM. Tutte le API richiedono l\'accesso, tranne login, logout e health: ' +
        'POST /api/auth/login con email e password imposta il cookie toolpm_token, poi le chiamate da questa pagina lo usano da sole. ' +
        'Le operazioni sono consentite secondo il profilo (TL, PM, PMSenior) e i ruoli (risorsa, controller, admin): 401 senza accesso, 403 senza permesso. ' +
        'Sezioni: Anagrafiche comuni (/api/comuni), Pianificatore risorse (/api/pianificatore), utenti (/api/utenti), parametri (/api/parametri).',
    )
    .setVersion('1.0')
    .addTag('auth', 'Accesso, uscita, profilo con i permessi, cambio password')
    .addTag('comuni', 'Anagrafiche comuni a tutte le sezioni: clienti, centri di costo, ruoli, risorse, progetti, attività')
    .addTag('utenti', 'Gestione degli utenti (solo amministratore)')
    .addTag('parametri', 'Parametri di sistema (modifica: controller)')
    .addTag('risorse', 'Pianificatore: skill, certificazioni e allocazioni delle risorse')
    .addTag('pianificazione', 'Pianificatore: griglia risorse × mesi')
    .addTag('skills', 'Pianificatore: catalogo delle skill')
    .addTag('certificazioni', 'Pianificatore: catalogo delle certificazioni')
    .addTag('rate', 'Pianificatore: scale di valutazione')
    .addTag('health', 'Stato del backend e di MongoDB')
    // Accesso: cookie toolpm_token impostato da POST /api/auth/login, oppure token in "Authorization: Bearer".
    .addCookieAuth('toolpm_token')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, config), {
    jsonDocumentUrl: 'api/docs-json',
    customSiteTitle: 'ToolPM — API',
  });

  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
