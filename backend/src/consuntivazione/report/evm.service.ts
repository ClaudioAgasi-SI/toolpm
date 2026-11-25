import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { type Model } from 'mongoose';
import type { UtenteAutenticato } from '../../auth/decoratori.js';
import { Attivita, Avanzamento, Progetto } from '../../comuni/schemi/progetto.schema.js';
import { data as leggiData, idRotta } from '../../comuni/validazione.js';
import { PermessiService } from '../../permessi/permessi.service.js';
import { type ProgettoPerPermessi, puoVedereReportProgetto, vedeEuroProgetto } from '../../permessi/regole.js';
import { oggiInItalia } from '../consuntivi/regole-giornata.js';
import {
  arrotondaGiorni,
  calcolaEvm,
  evmProgetto,
  evmSenzaEuro,
  fineGiornoInItalia,
  percentualeAllIstante,
  type ProgettoEvm,
  quotaTrascorsa,
  statoCosti,
  statoTempi,
} from './evm.js';
import { ReportService } from './report.service.js';
import { leggiVista, totaliVuoti } from './viste.js';

type Id = mongoose.Types.ObjectId;
type ProgettoLetto = ProgettoPerPermessi & ProgettoEvm & { _id: Id; codice: string; titolo: string; percentualeCompletamento?: number };

/**
 * Indicatori EVM del progetto e delle sue attività a una data (fase 4, blocco E2; RF-29, RF-30, RF-32).
 * Calcolati al momento della richiesta: AC dalle righe della vista fino alla data, percentuale alla data
 * dallo storico degli avanzamenti, stime attuali.
 */
@Injectable()
export class EvmService {
  constructor(
    @InjectModel(Progetto.name) private readonly progetti: Model<Progetto>,
    @InjectModel(Attivita.name) private readonly attivita: Model<Attivita>,
    @InjectModel(Avanzamento.name) private readonly avanzamenti: Model<Avanzamento>,
    private readonly report: ReportService,
    private readonly permessi: PermessiService,
  ) {}

  /** GET /report/progetti/:id/evm?al=&vista= */
  async progetto(utente: UtenteAutenticato | undefined, idGrezzo: string, query: Record<string, unknown>) {
    this.permessi.verifica(utente, true, 'vedereReport');
    const id = idRotta(idGrezzo);
    const p = id ? await this.progetti.findById(id).lean<ProgettoLetto>().exec() : null;
    if (!p) throw new NotFoundException('Progetto non trovato');
    if (!puoVedereReportProgetto(utente, p)) throw new ForbiddenException('Non hai il permesso di vedere gli indicatori di questo progetto');
    const euro = vedeEuroProgetto(utente, p);
    const vista = leggiVista(query.vista);
    const oggi = oggiInItalia();
    const al = leggiData(query.al, 'al') ?? leggiData(oggi, 'al', true)!;
    if (al.toISOString().slice(0, 10) > oggi) throw new BadRequestException('al: non oltre oggi');

    const fine = fineGiornoInItalia(al);
    const filtro = { progettoIds: [p._id], a: al };
    const [totali, perAttivita, attivita, cambi, oreGiorno, soglie] = await Promise.all([
      this.report.totali(filtro, vista),
      this.report.totali(filtro, vista, ['attivitaId']),
      this.attivita
        .find({ progettoId: p._id }, { codice: 1, descrizione: 1, stato: 1, stimaGiorni: 1, percentualeCompletamento: 1, dataInizio: 1, dataFine: 1 })
        .sort({ codice: 1 })
        .lean()
        .exec(),
      this.avanzamenti.find({ progettoId: p._id }, { attivitaId: 1, il: 1, valorePrecedente: 1, valoreNuovo: 1 }).lean().exec(),
      this.report.oreGiorno(),
      this.report.soglieEvm(),
    ]);
    const t = totali[0] ?? totaliVuoti();
    const cambiDi = (attivitaId: Id | null) => cambi.filter((c) => (attivitaId ? c.attivitaId?.equals(attivitaId) : !c.attivitaId));

    const evm = evmProgetto(
      p,
      {
        percentuale: percentualeAllIstante(p.percentualeCompletamento ?? 0, cambiDi(null), fine),
        al,
        minuti: t.minuti,
        costoCentesimi: t.costoCentesimi,
        daValorizzare: t.daValorizzare,
        minutiDaValorizzare: t.minutiDaValorizzare,
        oreGiorno,
      },
      soglie,
    );

    // Attività (RF-32): solo in giorni, con la stima dell'attività; SPI e stato dei tempi solo con le date.
    const minutiAttivita = new Map(perAttivita.map((g) => [g.chiave.attivitaId ? String(g.chiave.attivitaId as Id) : '', g.minuti]));
    const voci = p.stato === 'inValutazione'
      ? []
      : attivita.map((a) => {
          const percentuale = percentualeAllIstante(a.percentualeCompletamento ?? 0, cambiDi(a._id), fine);
          const g = calcolaEvm(
            {
              bac: a.stimaGiorni,
              percentuale,
              ac: (minutiAttivita.get(String(a._id)) ?? 0) / 60 / oreGiorno,
              quota: quotaTrascorsa(a.dataInizio, a.dataFine, al),
            },
            arrotondaGiorni,
          );
          return {
            attivitaId: String(a._id),
            codice: a.codice,
            descrizione: a.descrizione,
            stato: a.stato,
            stimaGiorni: a.stimaGiorni ?? null,
            dataInizio: a.dataInizio ?? null,
            dataFine: a.dataFine ?? null,
            percentuale,
            giorni: g,
            statoTempi: statoTempi(g?.spi, soglie),
            statoCosti: statoCosti(g?.cpi, soglie),
          };
        });

    return {
      vista,
      calcolatoIl: new Date(),
      al,
      vedeEuro: euro,
      oreGiorno,
      soglie,
      progetto: { _id: String(p._id), codice: p.codice, titolo: p.titolo, stato: p.stato, dataInizio: p.dataInizio ?? null, dataFine: p.dataFine ?? null },
      evm: euro ? evm : evmSenzaEuro(evm),
      attivita: voci,
    };
  }
}
