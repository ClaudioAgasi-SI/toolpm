import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Anagrafica skill: suggerimenti per l'inserimento, non vincoli. */
@Schema({ collection: 'skills', versionKey: false })
export class Skill {
  @ApiProperty({ example: 'springBoot' })
  @Prop({ required: true, trim: true })
  skillName: string;

  @ApiProperty({ example: 'tecnico', enum: ['tecnico', 'funzionale', 'ambito'] })
  @Prop({ required: true, trim: true })
  skillType: string;
}
export const SkillSchema = SchemaFactory.createForClass(Skill);

@Schema({ collection: 'certificazioni', versionKey: false })
export class Certificazione {
  @ApiProperty({ example: 'PMP' })
  @Prop({ required: true, trim: true })
  certName: string;

  @ApiPropertyOptional({ example: 'project management' })
  @Prop({ trim: true })
  certType?: string;
}
export const CertificazioneSchema = SchemaFactory.createForClass(Certificazione);

/** Scala di valutazione. L'ordine dell'array è significativo: primo = livello più alto. */
@Schema({ collection: 'rate', versionKey: false })
export class Rate {
  @ApiProperty({ example: 'probabilitaAllocazione', description: 'Nome della scala, univoco' })
  @Prop({ required: true, trim: true, unique: true })
  rateType: string;

  @ApiProperty({
    type: [String],
    example: ['sicura', 'probabile', 'forse', 'improbabile', 'nessuna'],
    description: 'Valori dal livello più alto al più basso; senza duplicati',
  })
  @Prop({ type: [String], default: [] })
  rate: string[];
}
export const RateSchema = SchemaFactory.createForClass(Rate);
