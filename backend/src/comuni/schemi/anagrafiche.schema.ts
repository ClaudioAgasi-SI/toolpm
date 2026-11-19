import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Cliente (collection "clienti"). Non si cancella: si disattiva. Gestito dal PMSenior. */
@Schema({ collection: 'clienti', versionKey: false })
export class Cliente {
  @ApiProperty({ example: 'TIM', description: 'Codice univoco' })
  @Prop({ required: true, trim: true })
  codice: string;

  @ApiProperty({ example: 'Telecom Italia S.p.A.' })
  @Prop({ required: true, trim: true })
  ragioneSociale: string;

  @ApiProperty({ example: true })
  @Prop({ default: true })
  attivo: boolean;
}
export const ClienteSchema = SchemaFactory.createForClass(Cliente);
ClienteSchema.index({ codice: 1 }, { unique: true });

/** Centro di costo (collection "centri_costo"). Non si cancella: si disattiva. Gestito dal PMSenior. */
@Schema({ collection: 'centri_costo', versionKey: false })
export class CentroCosto {
  @ApiProperty({ example: 'CDC-SVIL', description: 'Codice univoco' })
  @Prop({ required: true, trim: true })
  codice: string;

  @ApiProperty({ example: 'Sviluppo prodotti' })
  @Prop({ required: true, trim: true })
  descrizione: string;

  @ApiProperty({ example: true })
  @Prop({ default: true })
  attivo: boolean;
}
export const CentroCostoSchema = SchemaFactory.createForClass(CentroCosto);
CentroCostoSchema.index({ codice: 1 }, { unique: true });

/** Ruolo professionale (collection "ruoli"), es. sviluppatore senior. Gestito dall'amministratore. */
@Schema({ collection: 'ruoli', versionKey: false })
export class Ruolo {
  @ApiProperty({ example: 'SVIL-SR', description: 'Codice univoco' })
  @Prop({ required: true, trim: true })
  codice: string;

  @ApiProperty({ example: 'Sviluppatore senior' })
  @Prop({ required: true, trim: true })
  descrizione: string;

  @ApiPropertyOptional({ example: true })
  @Prop({ default: true })
  attivo: boolean;
}
export const RuoloSchema = SchemaFactory.createForClass(Ruolo);
RuoloSchema.index({ codice: 1 }, { unique: true });
