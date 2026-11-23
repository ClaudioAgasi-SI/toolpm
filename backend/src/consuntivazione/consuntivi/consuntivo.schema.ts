import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import mongoose from 'mongoose';

export const STATI_RIGA = ['bozza', 'inviata', 'approvataTL', 'approvata', 'respinta', 'chiusa'] as const;
export type StatoRiga = (typeof STATI_RIGA)[number];
export const FONTI_TARIFFA = ['personalizzata', 'standard'] as const;

/** Approvazione di una riga (dalla fase 3): chi e quando. */
@Schema({ _id: false })
export class Approvazione {
  @Prop({ required: true })
  da: string;

  @Prop({ type: Date, required: true })
  il: Date;
}
export const ApprovazioneSchema = SchemaFactory.createForClass(Approvazione);

/** Rifiuto di una riga (fase 3): chi, quando e perché. Resta finché la riga non viene inviata di nuovo. */
@Schema({ _id: false })
export class Rifiuto {
  @Prop({ required: true })
  da: string;

  @Prop({ type: Date, required: true })
  il: Date;

  @Prop({ required: true })
  motivazione: string;
}
export const RifiutoSchema = SchemaFactory.createForClass(Rifiuto);

/** Riga della giornata: ore su un progetto o su una sua attività, con tipologia e costo fotografato. */
@Schema({ versionKey: false })
export class RigaConsuntivo {
  _id: mongoose.Types.ObjectId;

  @ApiProperty() @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Progetto', required: true })
  progettoId: mongoose.Types.ObjectId;

  @ApiPropertyOptional() @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Attivita', default: null })
  attivitaId: mongoose.Types.ObjectId | null;

  @ApiProperty({ description: 'Copiato dal progetto al salvataggio' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'CentroCosto', required: true })
  centroCostoId: mongoose.Types.ObjectId;

  @ApiProperty() @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'TipologiaCosto', required: true })
  tipologiaId: mongoose.Types.ObjectId;

  @ApiProperty({ example: 'ORDINARIA' }) @Prop({ required: true })
  tipologiaCodice: string;

  @ApiProperty({ example: 480, description: 'Minuti, a passi di 15' }) @Prop({ required: true })
  minuti: number;

  @ApiPropertyOptional() @Prop({ type: String, default: null })
  nota: string | null;

  @ApiProperty({ enum: STATI_RIGA }) @Prop({ type: String, enum: STATI_RIGA, default: 'bozza' })
  stato: StatoRiga;

  @ApiPropertyOptional({ enum: FONTI_TARIFFA, description: 'Solo controller; null = da valorizzare' })
  @Prop({ type: String, enum: FONTI_TARIFFA, default: null })
  fonteTariffa: (typeof FONTI_TARIFFA)[number] | null;

  @Prop({ type: mongoose.Schema.Types.ObjectId, default: null })
  tariffaId: mongoose.Types.ObjectId | null;

  @ApiPropertyOptional({ description: 'Solo controller' }) @Prop({ type: Number, default: null })
  tariffaCentesimiOra: number | null;

  @ApiPropertyOptional({ description: 'Solo controller; null = da valorizzare' }) @Prop({ type: Number, default: null })
  costoCentesimi: number | null;

  @Prop({ type: ApprovazioneSchema, default: null })
  approvazioneTL: Approvazione | null;

  @Prop({ type: ApprovazioneSchema, default: null })
  approvazionePM: Approvazione | null;

  @Prop({ type: RifiutoSchema, default: null })
  rifiuto: Rifiuto | null;

  @Prop({ type: Date })
  modificatoIl: Date;

  @Prop()
  modificatoDa: string;
}
export const RigaConsuntivoSchema = SchemaFactory.createForClass(RigaConsuntivo);

/** Giornata di consuntivo di una risorsa (collection "consuntivi"): un documento per risorsa e data. */
@Schema({ collection: 'consuntivi', versionKey: false })
export class Consuntivo {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Risorsa', required: true })
  risorsaId: mongoose.Types.ObjectId;

  @Prop({ type: Date, required: true })
  data: Date;

  @Prop({ required: true, match: /^\d{6}$/ })
  mese: string;

  /** Cresce a ogni salvataggio: chi salva indica quella letta, se è cambiata riceve 409. */
  @Prop({ required: true, default: 0 })
  versione: number;

  @Prop({ type: [RigaConsuntivoSchema], default: [] })
  righe: RigaConsuntivo[];
}
export const ConsuntivoSchema = SchemaFactory.createForClass(Consuntivo);
ConsuntivoSchema.index({ risorsaId: 1, data: 1 }, { unique: true });
