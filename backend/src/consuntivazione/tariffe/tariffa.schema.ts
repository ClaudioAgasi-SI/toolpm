import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import mongoose from 'mongoose';

/** Campi comuni alle tariffe: tipologia, periodo di validità, importo in centesimi di euro all'ora. */
class TariffaBase {
  @ApiProperty({ example: '6740a1c2e1f0a1b2c3d4e301', description: 'Tipologia di costo' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'TipologiaCosto', required: true })
  tipologiaId: mongoose.Types.ObjectId;

  @ApiProperty({ example: '2027-01-01' })
  @Prop({ type: Date, required: true })
  validoDal: Date;

  @ApiPropertyOptional({ example: null, description: 'Fine validità, compresa; null = senza fine' })
  @Prop({ type: Date, default: null })
  validoAl: Date | null;

  @ApiProperty({ example: 3900, description: 'Centesimi di euro all\'ora (3900 = 39,00 €/h)' })
  @Prop({ required: true })
  centesimiOra: number;
}

/** Tariffa standard di un ruolo per una tipologia (collection "tariffe_standard"). Solo controller. */
@Schema({ collection: 'tariffe_standard', versionKey: false })
export class TariffaStandard extends TariffaBase {
  @ApiProperty({ example: '6740a1c2e1f0a1b2c3d4e201', description: 'Ruolo professionale' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Ruolo', required: true })
  ruoloId: mongoose.Types.ObjectId;
}
export const TariffaStandardSchema = SchemaFactory.createForClass(TariffaStandard);
TariffaStandardSchema.index({ ruoloId: 1, tipologiaId: 1, validoDal: -1 });

/** Tariffa personalizzata di una risorsa per una tipologia (collection "tariffe_personalizzate"). Prevale sulla standard. */
@Schema({ collection: 'tariffe_personalizzate', versionKey: false })
export class TariffaPersonalizzata extends TariffaBase {
  @ApiProperty({ example: '6740a1c2e1f0a1b2c3d4e101', description: 'Risorsa' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Risorsa', required: true })
  risorsaId: mongoose.Types.ObjectId;
}
export const TariffaPersonalizzataSchema = SchemaFactory.createForClass(TariffaPersonalizzata);
TariffaPersonalizzataSchema.index({ risorsaId: 1, tipologiaId: 1, validoDal: -1 });
