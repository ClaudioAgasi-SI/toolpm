import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import mongoose from 'mongoose';

/**
 * Voce del listino di vendita (collection "listino_vendita", fase 5 blocco F1): tariffa giornaliera di
 * vendita di un ruolo, standard (clienteId null) o per un cliente, con validità. Collection, validatore e
 * indice unico ruoloId + clienteId + validoDal creati dalla migrazione 011-offerte.
 */
@Schema({ collection: 'listino_vendita', versionKey: false })
export class VoceListino {
  @ApiProperty({ example: '6740a1c2e1f0a1b2c3d4e201', description: 'Ruolo professionale' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Ruolo', required: true })
  ruoloId: mongoose.Types.ObjectId;

  @ApiPropertyOptional({ example: null, description: 'Cliente dell\'accordo; null = listino standard' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', default: null })
  clienteId: mongoose.Types.ObjectId | null;

  @ApiProperty({ example: '2027-01-01' })
  @Prop({ type: Date, required: true })
  validoDal: Date;

  @ApiPropertyOptional({ example: null, description: 'Fine validità, compresa; null = senza fine' })
  @Prop({ type: Date, default: null })
  validoAl: Date | null;

  @ApiProperty({ example: 45000, description: 'Centesimi di euro al giorno (45000 = 450,00 €/gg)' })
  @Prop({ required: true })
  centesimiGiorno: number;
}
export const VoceListinoSchema = SchemaFactory.createForClass(VoceListino);
