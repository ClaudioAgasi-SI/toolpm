import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * Stato di un mese (collection "periodi", fase 3 blocco D4): un documento per mese, creato alla prima
 * chiusura; un mese senza documento è aperto.
 */
@Schema({ collection: 'periodi', versionKey: false })
export class Periodo {
  /** AAAAMM. */
  @Prop({ required: true, unique: true, match: /^\d{6}$/ })
  mese: string;

  @Prop({ type: String, required: true, enum: ['aperto', 'chiuso'] })
  stato: 'aperto' | 'chiuso';

  @Prop({ type: Date, default: null })
  chiusoIl: Date | null;

  @Prop({ type: String, default: null })
  chiusoDa: string | null;

  /** Chiuso con righe non approvate (decisione 4): restano nel loro stato, ferme e fuori dai costi. */
  @Prop({ default: false })
  forzata: boolean;

  @Prop({ type: String, default: null })
  motivazioneChiusura: string | null;

  @Prop({ type: Date, default: null })
  riapertoIl: Date | null;

  @Prop({ type: String, default: null })
  riapertoDa: string | null;

  @Prop({ type: String, default: null })
  motivazioneRiapertura: string | null;
}

export const PeriodoSchema = SchemaFactory.createForClass(Periodo);
