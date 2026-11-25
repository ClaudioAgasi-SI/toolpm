import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type mongoose from 'mongoose';
import type { Model } from 'mongoose';
import { ParametriService } from '../../infrastruttura/parametri.service.js';
import { Consuntivo } from '../consuntivi/consuntivo.schema.js';
import { GRUPPO_TOTALI, STATI_IN_ATTESA, STATI_VISTA, type Totali, totaliVuoti, type Vista } from './viste.js';

/** Campi di riga per cui si può raggruppare. */
export type Chiave = 'progettoId' | 'attivitaId' | 'centroCostoId' | 'tipologiaId' | 'risorsaId' | 'mese';

const CAMPO: Record<Chiave, string> = {
  progettoId: '$righe.progettoId',
  attivitaId: '$righe.attivitaId',
  centroCostoId: '$righe.centroCostoId',
  tipologiaId: '$righe.tipologiaId',
  risorsaId: '$risorsaId',
  mese: '$mese',
};

export interface Filtro {
  da?: Date;
  a?: Date;
  progettoIds?: mongoose.Types.ObjectId[];
  centroCostoIds?: mongoose.Types.ObjectId[];
  risorsaIds?: mongoose.Types.ObjectId[];
}

/**
 * Aggregazioni comuni dei report (fase 4, blocco E0): somme delle righe di consuntivo nella vista scelta,
 * raggruppate per una o più chiavi, senza ricalcolare i costi (sono fotografati sulle righe). Ogni riga
 * si conta una sola volta per gruppo: il ribaltamento attività → progetto → centro di costo (RF-21) si
 * ottiene raggruppando per le chiavi del livello voluto.
 */
@Injectable()
export class ReportService {
  constructor(
    @InjectModel(Consuntivo.name) private readonly consuntivi: Model<Consuntivo>,
    private readonly parametri: ParametriService,
  ) {}

  oreGiorno(): Promise<number> {
    return this.parametri.leggi('oreGiorno', 8);
  }

  /** Totali per gruppo nella vista; chiavi vuote = un solo gruppo. */
  async totali(filtro: Filtro, vista: Vista, chiavi: Chiave[] = []) {
    return this.aggrega(filtro, STATI_VISTA[vista], chiavi);
  }

  /** Righe che la vista approvata non conta (in attesa o respinte), per gruppo: numero e minuti (decisione 1). */
  async inAttesa(filtro: Filtro, chiavi: Chiave[] = []) {
    return this.aggrega(filtro, STATI_IN_ATTESA, chiavi);
  }

  private async aggrega(filtro: Filtro, stati: string[], chiavi: Chiave[]) {
    const data: Record<string, Date> = {};
    if (filtro.da) data.$gte = filtro.da;
    if (filtro.a) data.$lte = filtro.a;
    const riga: Record<string, unknown> = { 'righe.stato': { $in: stati } };
    if (filtro.progettoIds) riga['righe.progettoId'] = { $in: filtro.progettoIds };
    if (filtro.centroCostoIds) riga['righe.centroCostoId'] = { $in: filtro.centroCostoIds };
    const gruppi = await this.consuntivi
      .aggregate<{ _id: Record<string, unknown> | null } & Totali>([
        {
          $match: {
            ...(Object.keys(data).length ? { data } : {}),
            ...(filtro.risorsaIds ? { risorsaId: { $in: filtro.risorsaIds } } : {}),
            ...riga,
          },
        },
        { $unwind: '$righe' },
        { $match: riga },
        { $group: { _id: chiavi.length ? Object.fromEntries(chiavi.map((k) => [k, CAMPO[k]])) : null, ...GRUPPO_TOTALI } },
      ])
      .exec();
    return gruppi.map(({ _id, ...t }) => ({ chiave: (_id ?? {}) as Partial<Record<Chiave, unknown>>, ...totaliVuoti(), ...t }));
  }
}
