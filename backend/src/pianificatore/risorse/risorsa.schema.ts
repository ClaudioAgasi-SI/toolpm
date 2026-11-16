import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { HydratedDocument } from 'mongoose';

/** Skill posseduta da una risorsa. I valori non sono vincolati alle anagrafiche. */
@Schema({ _id: false })
export class SkillValutata {
  @ApiProperty({ example: 'j2ee', description: 'Nome della skill (testo libero, suggerito dall\'anagrafica skills)' })
  @Prop({ required: true, trim: true })
  skillName: string;

  @ApiPropertyOptional({ example: 'ottimo', description: 'Livello, di norma un valore della scala corrispondente in rate' })
  @Prop({ trim: true })
  rate?: string;
}
export const SkillValutataSchema = SchemaFactory.createForClass(SkillValutata);

/** Una riga di pianificazione: risorsa allocata su un progetto in un mese. */
@Schema({ _id: false })
export class Allocazione {
  @ApiProperty({ example: '202701', pattern: '^\\d{6}$', description: 'Mese nel formato AAAAMM' })
  @Prop({ required: true, match: /^\d{6}$/ })
  mese: string;

  @ApiPropertyOptional({ example: 'TIM' })
  @Prop({ trim: true })
  cliente?: string;

  @ApiPropertyOptional({ example: 'TIMBUFE' })
  @Prop({ trim: true })
  progetto?: string;

  @ApiPropertyOptional({ example: 'buono', description: 'Scala rate "competenzaTecnica"' })
  @Prop()
  competenzaTecnica?: string;

  @ApiPropertyOptional({ example: 'buono', description: 'Scala rate "conoscenzaAmbito"' })
  @Prop()
  conoscenzaAmbito?: string;

  @ApiPropertyOptional({ example: 'buono', description: 'Scala rate "conoscenzaFunzionale"' })
  @Prop()
  conoscenzaFunzionale?: string;

  @ApiPropertyOptional({ example: 'imprescindibile', description: 'Scala rate "importanzaStrategica"' })
  @Prop()
  importanzaStrategica?: string;

  @ApiPropertyOptional({ example: 'sicura', description: 'Scala rate "probabilitaAllocazione"' })
  @Prop()
  probabilitaAllocazione?: string;

  @ApiPropertyOptional({
    example: 30,
    minimum: 0,
    maximum: 100,
    description: 'Percentuale di allocazione nel mese. Le righe senza percentuale sono segnaposto (mese libero).',
  })
  @Prop({ min: 0, max: 100 })
  percentualeAllocazione?: number;
}
export const AllocazioneSchema = SchemaFactory.createForClass(Allocazione);

@Schema({ collection: 'risorse', versionKey: false })
export class Risorsa {
  @ApiProperty({ example: 'Agasi' })
  @Prop({ required: true, trim: true })
  cognome: string;

  @ApiProperty({ example: 'Claudio' })
  @Prop({ required: true, trim: true })
  nome: string;

  @ApiPropertyOptional({ type: [SkillValutata] })
  @Prop({ type: [SkillValutataSchema], default: [] })
  skillTecnici: SkillValutata[];

  @ApiPropertyOptional({ type: [SkillValutata] })
  @Prop({ type: [SkillValutataSchema], default: [] })
  skillAmbiti: SkillValutata[];

  @ApiPropertyOptional({ type: [SkillValutata] })
  @Prop({ type: [SkillValutataSchema], default: [] })
  skillFunzionali: SkillValutata[];

  /** Struttura libera: oggi la collection contiene array vuoti. */
  @ApiPropertyOptional({ type: 'array', items: { type: 'object' }, description: 'Struttura libera' })
  @Prop({ type: [Object], default: [] })
  certificazioni: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Allocazione], description: 'Allocazioni mese per mese' })
  @Prop({ type: [AllocazioneSchema], default: [] })
  planned: Allocazione[];
}

/** Risorsa come restituita dalle API (con l'identificativo MongoDB). */
export class RisorsaConId extends Risorsa {
  @ApiProperty({ example: '6ae88b192fcc045f0ca48409' })
  _id: string;
}

export type RisorsaDocument = HydratedDocument<Risorsa>;
export const RisorsaSchema = SchemaFactory.createForClass(Risorsa);
RisorsaSchema.index({ 'planned.mese': 1 });
RisorsaSchema.index({ 'skillTecnici.skillName': 1 });
