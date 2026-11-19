import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import mongoose, { type HydratedDocument } from 'mongoose';

/** Skill posseduta da una risorsa. I valori non sono vincolati alle anagrafiche. */
@Schema({ _id: false })
export class SkillValutata {
  @ApiProperty({ example: 'j2ee', description: 'Nome della skill (testo libero, suggerito dall\'anagrafica skills)' })
  @Prop({ required: true, trim: true })
  skillName: string;

  @ApiPropertyOptional({ example: 'ottimo', description: 'Livello, di norma un valore della scala corrispondente in rate' })
  @Prop({ trim: true })
  rate?: string;
}
export const SkillValutataSchema = SchemaFactory.createForClass(SkillValutata);

/** Una riga di pianificazione: risorsa allocata su un progetto in un mese. */
@Schema({ _id: false })
export class Allocazione {
  @ApiProperty({ example: '202701', pattern: '^\\d{6}$', description: 'Mese nel formato AAAAMM' })
  @Prop({ required: true, match: /^\d{6}$/ })
  mese: string;

  @ApiPropertyOptional({
    example: '6740a1c2e1f0a1b2c3d4e501',
    description: 'Progetto (collection progetti). Dal blocco B5 è il riferimento vero dell\'allocazione; il cliente si ricava dal progetto.',
  })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Progetto' })
  progettoId?: mongoose.Types.ObjectId;

  // Campi non salvati (blocco B5): nelle risposte li aggiunge il backend dal progetto; in scrittura
  // "progetto" è accettato, per compatibilità, come codice del progetto al posto di progettoId.
  @ApiPropertyOptional({ example: 'TIMBUFE', description: 'Codice del progetto. In risposta: ricavato da progettoId. In scrittura: accettato al posto di progettoId' })
  progetto?: string;

  @ApiPropertyOptional({ example: 'TIM — front end Business', readOnly: true, description: 'Titolo del progetto, ricavato da progettoId' })
  progettoTitolo?: string;

  @ApiPropertyOptional({ example: 'TIM', readOnly: true, description: 'Codice del cliente del progetto, ricavato da progettoId' })
  cliente?: string;

  @ApiPropertyOptional({ example: 'Telecom Italia S.p.A.', readOnly: true, description: 'Ragione sociale del cliente, ricavata da progettoId' })
  clienteRagioneSociale?: string;

  @ApiPropertyOptional({ example: 'TIM', description: 'Cliente scritto a testo prima della migrazione B7 (resta per un rilascio, poi si elimina)' })
  @Prop({ trim: true })
  clienteTesto?: string;

  @ApiPropertyOptional({ example: 'TIMBUFE', description: 'Progetto scritto a testo prima della migrazione B7 (resta per un rilascio, poi si elimina)' })
  @Prop({ trim: true })
  progettoTesto?: string;

  @ApiPropertyOptional({ example: 'buono', description: 'Scala rate "competenzaTecnica"' })
  @Prop()
  competenzaTecnica?: string;

  @ApiPropertyOptional({ example: 'buono', description: 'Scala rate "conoscenzaAmbito"' })
  @Prop()
  conoscenzaAmbito?: string;

  @ApiPropertyOptional({ example: 'buono', description: 'Scala rate "conoscenzaFunzionale"' })
  @Prop()
  conoscenzaFunzionale?: string;

  @ApiPropertyOptional({ example: 'imprescindibile', description: 'Scala rate "importanzaStrategica"' })
  @Prop()
  importanzaStrategica?: string;

  @ApiPropertyOptional({ example: 'sicura', description: 'Scala rate "probabilitaAllocazione"' })
  @Prop()
  probabilitaAllocazione?: string;

  @ApiPropertyOptional({
    example: 30,
    minimum: 0,
    maximum: 100,
    description: 'Percentuale di allocazione nel mese. Le righe senza percentuale sono segnaposto (mese libero).',
  })
  @Prop({ min: 0, max: 100 })
  percentualeAllocazione?: number;
}
export const AllocazioneSchema = SchemaFactory.createForClass(Allocazione);

/** Ruolo professionale della risorsa a partire da una data (storico dei ruoli). */
@Schema({ _id: false })
export class RuoloRisorsa {
  @ApiProperty({ example: '6740a1c2e1f0a1b2c3d4e201', description: 'Ruolo professionale (collection ruoli)' })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Ruolo', required: true })
  ruoloId: mongoose.Types.ObjectId;

  @ApiProperty({ example: '2027-01-01', description: 'Data di decorrenza' })
  @Prop({ type: Date, required: true })
  dal: Date;
}
export const RuoloRisorsaSchema = SchemaFactory.createForClass(RuoloRisorsa);

/**
 * Risorsa (persona), collection "risorse". Dal blocco B4 appartiene al modulo Comuni:
 * - dati anagrafici (nome, email, cellulare, matricola, date, orario, storico dei ruoli) gestiti da /api/comuni/risorse;
 * - caratteristiche (skill, certificazioni) e allocazioni (planned) gestite dal Pianificatore.
 * L'abilitazione (TL, PM, PMSenior) e i ruoli applicativi stanno sull'utente (collection utenti), collegato con risorsaId.
 */
@Schema({ collection: 'risorse', versionKey: false })
export class Risorsa {
  @ApiProperty({ example: 'Agasi' })
  @Prop({ required: true, trim: true })
  cognome: string;

  @ApiProperty({ example: 'Claudio' })
  @Prop({ required: true, trim: true })
  nome: string;

  @ApiPropertyOptional({
    example: 'claudio.agasi@azienda.it',
    description: 'Email, unica; è il nome utente per l\'accesso. Obbligatoria per le risorse nuove; quelle importate dal Pianificatore la ricevono con la migrazione (B7).',
  })
  @Prop({ trim: true, lowercase: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })
  email?: string;

  @ApiPropertyOptional({ example: '+39 333 1234567' })
  @Prop({ trim: true })
  cellulare?: string;

  @ApiPropertyOptional({ example: 'A0123' })
  @Prop({ trim: true })
  matricola?: string;

  @ApiPropertyOptional({ example: '2020-03-01' })
  @Prop({ type: Date })
  dataIngresso?: Date;

  @ApiPropertyOptional({ example: null, description: 'Data di uscita dall\'azienda: le risorse non si cancellano' })
  @Prop({ type: Date })
  dataUscita?: Date;

  @ApiPropertyOptional({ example: 8, description: 'Ore contrattuali al giorno (orario contrattuale)' })
  @Prop({ min: 0, max: 24 })
  oreContrattualiGiorno?: number;

  @ApiPropertyOptional({ type: [RuoloRisorsa], description: 'Ruoli professionali con la data di decorrenza, dal più vecchio' })
  @Prop({ type: [RuoloRisorsaSchema], default: [] })
  storicoRuoli: RuoloRisorsa[];

  @ApiPropertyOptional({ type: [SkillValutata] })
  @Prop({ type: [SkillValutataSchema], default: [] })
  skillTecnici: SkillValutata[];

  @ApiPropertyOptional({ type: [SkillValutata] })
  @Prop({ type: [SkillValutataSchema], default: [] })
  skillAmbiti: SkillValutata[];

  @ApiPropertyOptional({ type: [SkillValutata] })
  @Prop({ type: [SkillValutataSchema], default: [] })
  skillFunzionali: SkillValutata[];

  /** Struttura libera: oggi la collection contiene array vuoti. */
  @ApiPropertyOptional({ type: 'array', items: { type: 'object' }, description: 'Struttura libera' })
  @Prop({ type: [Object], default: [] })
  certificazioni: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Allocazione], description: 'Allocazioni mese per mese' })
  @Prop({ type: [AllocazioneSchema], default: [] })
  planned: Allocazione[];
}

/** Risorsa come restituita dalle API (con l'identificativo MongoDB). */
export class RisorsaConId extends Risorsa {
  @ApiProperty({ example: '6ae88b192fcc045f0ca48409' })
  _id: string;

  // Campi di tracciamento aggiunti a ogni collection dal plugin (infrastruttura/tracciamento.plugin.ts).
  // Sono in sola lettura: se arrivano nel corpo di una richiesta vengono ignorati.
  @ApiPropertyOptional({ example: '2026-11-17T10:00:00.000Z', readOnly: true })
  creatoIl?: Date;

  @ApiPropertyOptional({ example: 'sistema:migrazione', description: 'Id dell\'utente o utente tecnico sistema:...', readOnly: true })
  creatoDa?: string;

  @ApiPropertyOptional({ example: '2026-11-17T10:00:00.000Z', readOnly: true })
  modificatoIl?: Date;

  @ApiPropertyOptional({ example: 'anonimo', description: 'Id dell\'utente o utente tecnico sistema:...', readOnly: true })
  modificatoDa?: string;
}

export type RisorsaDocument = HydratedDocument<Risorsa>;
export const RisorsaSchema = SchemaFactory.createForClass(Risorsa);
RisorsaSchema.index({ 'planned.mese': 1 });
RisorsaSchema.index({ 'skillTecnici.skillName': 1 });
RisorsaSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
