import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CertificazioniController,
  CertificazioniService,
  RateController,
  RateService,
  SkillsController,
  SkillsService,
} from './anagrafiche.controllers.js';
import {
  Certificazione,
  CertificazioneSchema,
  Rate,
  RateSchema,
  Skill,
  SkillSchema,
} from './anagrafiche.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Skill.name, schema: SkillSchema },
      { name: Certificazione.name, schema: CertificazioneSchema },
      { name: Rate.name, schema: RateSchema },
    ]),
  ],
  controllers: [SkillsController, CertificazioniController, RateController],
  providers: [SkillsService, CertificazioniService, RateService],
  exports: [RateService],
})
export class AnagraficheModule {}
