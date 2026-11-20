import { Module } from '@nestjs/common';

/**
 * Sezione "Consuntivazione costi di progetto" di ToolPM (fase 2).
 * Le sue API sono esposte sotto /api/consuntivazione (vedi RouterModule in app.module.ts).
 *
 * Blocchi del piano (docs/piano-fase2.md): C1 tipologie di costo, C2 tariffe standard e
 * personalizzate, C3 consuntivi giornalieri, C6 righe da valorizzare e ricalcolo.
 * Collection (migrazione 007-consuntivazione): tipologie_costo, tariffe_standard,
 * tariffe_personalizzate, consuntivi.
 */
@Module({
  imports: [],
})
export class ConsuntivazioneModule {}
