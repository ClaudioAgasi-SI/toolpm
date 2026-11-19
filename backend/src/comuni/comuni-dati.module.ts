import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CentroCosto, CentroCostoSchema, Cliente, ClienteSchema, Ruolo, RuoloSchema } from './schemi/anagrafiche.schema.js';
import { Attivita, AttivitaSchema, Avanzamento, AvanzamentoSchema, Progetto, ProgettoSchema } from './schemi/progetto.schema.js';
import { Risorsa, RisorsaSchema } from './schemi/risorsa.schema.js';

/**
 * Modelli Mongoose dei dati comuni (fase 1, blocco B4), registrati una sola volta e disponibili
 * in tutte le sezioni (Pianificatore, Consuntivazione...).
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Risorsa.name, schema: RisorsaSchema },
      { name: Cliente.name, schema: ClienteSchema },
      { name: CentroCosto.name, schema: CentroCostoSchema },
      { name: Ruolo.name, schema: RuoloSchema },
      { name: Progetto.name, schema: ProgettoSchema },
      { name: Attivita.name, schema: AttivitaSchema },
      { name: Avanzamento.name, schema: AvanzamentoSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class ComuniDatiModule {}
