import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';

export const CATEGORIE_TIPOLOGIA = ['ordinaria', 'straordinaria'] as const;
export type CategoriaTipologia = (typeof CATEGORIE_TIPOLOGIA)[number];

/**
 * Tipologia di costo delle ore consuntivate (collection "tipologie_costo", fase 2 blocco C1).
 * Gestita dal controller; non si cancella, si disattiva. Una sola è la predefinita delle righe nuove.
 */
@Schema({ collection: 'tipologie_costo', versionKey: false })
export class TipologiaCosto {
  @ApiProperty({ example: 'STRAORD_FESTIVA', description: 'Codice univoco, non modificabile' })
  @Prop({ required: true, trim: true })
  codice: string;

  @ApiProperty({ example: 'Straordinaria festiva' })
  @Prop({ required: true, trim: true })
  descrizione: string;

  @ApiProperty({ example: 4, description: 'Ordine di visualizzazione' })
  @Prop({ required: true })
  ordine: number;

  @ApiProperty({ enum: CATEGORIE_TIPOLOGIA, description: 'Le ore "ordinaria" si confrontano con l\'orario contrattuale' })
  @Prop({ type: String, required: true, enum: CATEGORIE_TIPOLOGIA })
  categoria: CategoriaTipologia;

  @ApiProperty({ example: true })
  @Prop({ required: true, default: true })
  attiva: boolean;

  @ApiProperty({ example: false, description: 'Tipologia proposta sulle righe nuove (una sola)' })
  @Prop({ required: true, default: false })
  predefinita: boolean;
}
export const TipologiaCostoSchema = SchemaFactory.createForClass(TipologiaCosto);
TipologiaCostoSchema.index({ codice: 1 }, { unique: true });
TipologiaCostoSchema.index({ predefinita: 1 }, { unique: true, partialFilterExpression: { predefinita: true }, name: 'una_sola_predefinita' });
