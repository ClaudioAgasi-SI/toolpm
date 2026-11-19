import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import mongoose from 'mongoose';

export const STATI_PROGETTO = ['inValutazione', 'inCorso', 'chiuso'] as const;
export type StatoProgettoValore = (typeof STATI_PROGETTO)[number];

export const PROFILI_APPROVATORE = ['TL', 'PM'] as const;
export type ProfiloApprovatore = (typeof PROFILI_APPROVATORE)[number];

/** Approvatore del progetto: una risorsa con il profilo TL o PM su questo progetto. */
@Schema({ _id: false })
export class Approvatore {
  @ApiProperty({ example: '6740a1c2e1f0a1b2c3d4e099' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Risorsa', required: true })
  risorsaId: mongoose.Types.ObjectId;

  @ApiProperty({ enum: PROFILI_APPROVATORE, example: 'PM' })
  @Prop({ type: String, enum: PROFILI_APPROVATORE, required: true })
  profilo: ProfiloApprovatore;
}
export const ApprovatoreSchema = SchemaFactory.createForClass(Approvatore);

/** Coppia cliente/progetto scritta a testo nelle allocazioni del Pianificatore che corrisponde al progetto. */
@Schema({ _id: false })
export class AliasPianificatore {
  @ApiProperty({ example: 'TIM' })
  @Prop({ default: '' })
  cliente: string;

  @ApiProperty({ example: 'TIMBUFE' })
  @Prop({ default: '' })
  progetto: string;
}
export const AliasPianificatoreSchema = SchemaFactory.createForClass(AliasPianificatore);

/** Le quattro stime del progetto, impostate a mano e mai calcolate. Gli euro sono in centesimi. */
@Schema({ _id: false })
export class Stime {
  @ApiPropertyOptional({ example: 400 })
  @Prop({ min: 0 })
  managerialeGiorni?: number;

  @ApiPropertyOptional({ example: 16000000, description: 'Centesimi di euro' })
  @Prop({ min: 0 })
  managerialeCentesimi?: number;

  @ApiPropertyOptional({ example: 440, description: 'Stima definitiva in giorni (effort)' })
  @Prop({ min: 0 })
  definitivaGiorni?: number;

  @ApiPropertyOptional({ example: 17600000, description: 'Centesimi di euro' })
  @Prop({ min: 0 })
  definitivaCentesimi?: number;
}
export const StimeSchema = SchemaFactory.createForClass(Stime);

/** Progetto (collection "progetti"). */
@Schema({ collection: 'progetti', versionKey: false })
export class Progetto {
  @ApiProperty({ example: 'TIMBUFE', description: 'Codice univoco, non modificabile' })
  @Prop({ required: true, trim: true })
  codice: string;

  @ApiProperty({ example: 'TIM — front end Business' })
  @Prop({ required: true, trim: true })
  titolo: string;

  @ApiPropertyOptional({ example: 'Evoluzione del front end per la clientela Business' })
  @Prop({ trim: true })
  descrizione?: string;

  @ApiPropertyOptional({ description: 'Cliente; assente nei progetti interni' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Cliente' })
  clienteId?: mongoose.Types.ObjectId;

  @ApiProperty({ description: 'Centro di costo, obbligatorio e unico' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'CentroCosto', required: true })
  centroCostoId: mongoose.Types.ObjectId;

  @ApiProperty({ type: [Approvatore] })
  @Prop({ type: [ApprovatoreSchema], default: [] })
  approvatori: Approvatore[];

  @ApiProperty({ example: false, description: 'Se true, si consuntiva solo sulle attività (fase 2)' })
  @Prop({ default: false })
  soloSuAttivita: boolean;

  @ApiPropertyOptional({ example: '2027-01-01' })
  @Prop({ type: Date })
  dataInizio?: Date;

  @ApiPropertyOptional({ example: '2027-12-31' })
  @Prop({ type: Date })
  dataFine?: Date;

  @ApiProperty({ enum: STATI_PROGETTO, example: 'inValutazione' })
  @Prop({ type: String, enum: STATI_PROGETTO, default: 'inValutazione' })
  stato: StatoProgettoValore;

  @ApiProperty({ example: 0, minimum: 0, maximum: 100 })
  @Prop({ default: 0, min: 0, max: 100 })
  percentualeCompletamento: number;

  @ApiPropertyOptional({ type: Stime })
  @Prop({ type: StimeSchema, default: {} })
  stime: Stime;

  @ApiPropertyOptional({
    type: [AliasPianificatore],
    description:
      'Testi cliente/progetto delle allocazioni del Pianificatore che corrispondono a questo progetto (migrazione B7). Servono a collegare in automatico le allocazioni scritte ancora a testo.',
  })
  @Prop({ type: [AliasPianificatoreSchema], default: undefined })
  aliasPianificatore?: AliasPianificatore[];
}
export const ProgettoSchema = SchemaFactory.createForClass(Progetto);
ProgettoSchema.index({ codice: 1 }, { unique: true });
ProgettoSchema.index({ 'approvatori.risorsaId': 1 });
ProgettoSchema.index({ centroCostoId: 1 });
ProgettoSchema.index({ 'aliasPianificatore.cliente': 1, 'aliasPianificatore.progetto': 1 });

export const STATI_ATTIVITA = ['attiva', 'chiusa'] as const;
export type StatoAttivita = (typeof STATI_ATTIVITA)[number];

/** Attività di un progetto (collection "attivita"), un solo livello. */
@Schema({ collection: 'attivita', versionKey: false })
export class Attivita {
  @ApiProperty({ description: 'Progetto a cui appartiene' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Progetto', required: true })
  progettoId: mongoose.Types.ObjectId;

  @ApiProperty({ example: 'SVIL', description: 'Codice univoco nel progetto, non modificabile' })
  @Prop({ required: true, trim: true })
  codice: string;

  @ApiProperty({ example: 'Sviluppo' })
  @Prop({ required: true, trim: true })
  descrizione: string;

  @ApiPropertyOptional({ example: '2027-01-01' })
  @Prop({ type: Date })
  dataInizio?: Date;

  @ApiPropertyOptional({ example: null })
  @Prop({ type: Date })
  dataFine?: Date;

  @ApiProperty({ enum: STATI_ATTIVITA, example: 'attiva' })
  @Prop({ type: String, enum: STATI_ATTIVITA, default: 'attiva' })
  stato: StatoAttivita;

  @ApiPropertyOptional({ example: 250, description: 'Stima in giorni, facoltativa; non concorre alle stime del progetto' })
  @Prop({ min: 0 })
  stimaGiorni?: number;

  @ApiProperty({ example: 0, minimum: 0, maximum: 100 })
  @Prop({ default: 0, min: 0, max: 100 })
  percentualeCompletamento: number;

  @ApiProperty({ type: [String], example: ['6ae88b192fcc045f0ca48409'] })
  @Prop({ type: [mongoose.Schema.Types.ObjectId], ref: 'Risorsa', default: [] })
  risorseAssegnateIds: mongoose.Types.ObjectId[];
}
export const AttivitaSchema = SchemaFactory.createForClass(Attivita);
AttivitaSchema.index({ progettoId: 1, codice: 1 }, { unique: true });
AttivitaSchema.index({ risorseAssegnateIds: 1 });

/** Un cambio di percentuale di completamento (collection "avanzamenti"). */
@Schema({ collection: 'avanzamenti', versionKey: false })
export class Avanzamento {
  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Progetto', required: true })
  progettoId: mongoose.Types.ObjectId;

  @ApiPropertyOptional({ description: 'Assente se il cambio riguarda il progetto' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Attivita' })
  attivitaId?: mongoose.Types.ObjectId;

  @ApiProperty({ example: 30 })
  @Prop({ required: true, min: 0, max: 100 })
  valorePrecedente: number;

  @ApiProperty({ example: 40 })
  @Prop({ required: true, min: 0, max: 100 })
  valoreNuovo: number;

  @ApiProperty({ description: 'Quando' })
  @Prop({ type: Date, required: true })
  il: Date;

  @ApiProperty({ example: '6740a1c2e1f0a1b2c3d4e0c1', description: 'Id dell\'utente che ha fatto il cambio' })
  @Prop({ required: true })
  da: string;
}
export const AvanzamentoSchema = SchemaFactory.createForClass(Avanzamento);
AvanzamentoSchema.index({ progettoId: 1, il: -1 });
