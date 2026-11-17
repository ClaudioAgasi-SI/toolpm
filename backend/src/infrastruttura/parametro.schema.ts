import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import mongoose from 'mongoose';

/**
 * Parametro di sistema (collection "parametri"): un documento per chiave.
 * Valori iniziali creati dalla migrazione 001: oreGiorno, soglieEvm.
 */
@Schema({ collection: 'parametri', versionKey: false })
export class Parametro {
  @ApiProperty({ example: 'oreGiorno' })
  @Prop({ required: true, trim: true, unique: true })
  chiave: string;

  @ApiProperty({ example: 8, description: 'Valore: numero, testo o oggetto, secondo il parametro' })
  @Prop({ type: mongoose.Schema.Types.Mixed, required: true })
  valore: unknown;

  @ApiPropertyOptional({ example: 'Ore lavorative che fanno un giorno (confronto tra ore e stime in giorni)' })
  @Prop({ trim: true })
  descrizione?: string;
}

export const ParametroSchema = SchemaFactory.createForClass(Parametro);
