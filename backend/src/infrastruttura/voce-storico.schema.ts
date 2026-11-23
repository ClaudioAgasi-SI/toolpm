import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';

/**
 * Voce dello storico delle modifiche (collection "audit_log", fase 3): una per azione.
 * Per i consuntivi una voce copre una giornata e le righe toccate (righeIds), con i valori
 * prima e dopo delle sole righe interessate. Si scrive solo con AuditService, mai si modifica.
 */
@Schema({ collection: 'audit_log', versionKey: false })
export class VoceStorico {
  /** Collection del documento modificato, es. "consuntivi", "tariffe_standard". */
  @Prop({ required: true })
  collezione: string;

  @Prop({ required: true })
  documentoId: string;

  @Prop({ type: [String], default: undefined })
  righeIds?: string[];

  /** Azione, es. "invio", "approvazione", "rifiuto", "chiusura", "modifica". */
  @Prop({ required: true })
  operazione: string;

  /** Id dell'utente o utente tecnico "sistema:...". */
  @Prop({ required: true })
  utente: string;

  @Prop({ required: true })
  il: Date;

  @Prop({ type: mongoose.Schema.Types.Mixed })
  prima?: unknown;

  @Prop({ type: mongoose.Schema.Types.Mixed })
  dopo?: unknown;

  @Prop({ type: String, default: null })
  motivazione?: string | null;
}

export const VoceStoricoSchema = SchemaFactory.createForClass(VoceStorico);
