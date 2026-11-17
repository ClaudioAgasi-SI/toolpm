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
      'API REST di ToolPM. Accesso: POST /api/auth/login con email e password (cookie toolpm_token). Sezione Pianificatore risorse (/api/pianificatore): risorse, pianificazione mensile e anagrafiche (skills, certificazioni, scale di valutazione). ' +
        'Le anagrafiche sono suggerimenti: nelle risorse sono ammessi anche valori non presenti lì.',
    )
    .setVersion('1.0')
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
