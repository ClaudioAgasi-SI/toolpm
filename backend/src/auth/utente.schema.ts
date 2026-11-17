import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import mongoose, { type HydratedDocument } from 'mongoose';

/** Abilitazione generale di approvazione (analisi: profili TL, PM, PMSenior). */
export const ABILITAZIONI = ['TL', 'PM', 'PMSenior'] as const;
export type Abilitazione = (typeof ABILITAZIONI)[number];

/** Ruoli applicativi, indipendenti dall'abilitazione. */
export const RUOLI = ['risorsa', 'controller', 'admin'] as const;
export type Ruolo = (typeof RUOLI)[number];

/** Utente che accede a ToolPM (collection "utenti"). Il nome utente è l'email. */
@Schema({ collection: 'utenti', versionKey: false })
export class Utente {
  @ApiProperty({ example: 'claudio.agasi@azienda.it', description: 'Email, usata come nome utente; unica' })
  @Prop({ required: true, trim: true, lowercase: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })
  email: string;

  /** Hash scrypt della password; mai restituito dalle API. */
  @Prop({ required: true, select: false })
  passwordHash: string;

  @ApiPropertyOptional({ example: 'Claudio Agasi', description: 'Nome mostrato nell\'applicazione' })
  @Prop({ trim: true })
  nome?: string;

  @ApiPropertyOptional({ description: 'Risorsa (persona) collegata, se c\'è' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Risorsa' })
  risorsaId?: mongoose.Types.ObjectId;

  @ApiPropertyOptional({ enum: ABILITAZIONI, nullable: true, description: 'Abilitazione generale di approvazione' })
  @Prop({ type: String, enum: [...ABILITAZIONI, null], default: null })
  abilitazione: Abilitazione | null;

  @ApiProperty({ enum: RUOLI, isArray: true, example: ['risorsa'] })
  @Prop({ type: [String], enum: RUOLI, default: ['risorsa'] })
  ruoli: Ruolo[];

  @ApiProperty({ example: true })
  @Prop({ default: true })
  attivo: boolean;

  @ApiProperty({ example: false, description: 'Al prossimo accesso deve cambiare la password' })
  @Prop({ default: false })
  deveCambiarePassword: boolean;

  @ApiPropertyOptional()
  @Prop()
  ultimoAccesso?: Date;
}

export type UtenteDocument = HydratedDocument<Utente>;
export const UtenteSchema = SchemaFactory.createForClass(Utente);
UtenteSchema.index({ email: 1 }, { unique: true });
