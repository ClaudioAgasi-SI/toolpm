import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Risorsa, RisorsaSchema } from './risorsa.schema.js';
import { RisorseController } from './risorse.controller.js';
import { RisorseService } from './risorse.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: Risorsa.name, schema: RisorsaSchema }])],
  controllers: [RisorseController],
  providers: [RisorseService],
  exports: [MongooseModule],
})
export class RisorseModule {}
