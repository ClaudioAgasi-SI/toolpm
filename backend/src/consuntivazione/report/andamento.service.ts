import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import mongoose, { type Connection, type Model } from 'mongoose';
import type { UtenteAutenticato } from '../../auth/decoratori.js';
import { Avanzamento, Progetto } from '../../comuni/schemi/progetto.schema.js';
import { data as leggiData, idRotta } from '../../comuni/validazione.js';
import { eseguiCome } from '../../infrastruttura/contesto-utente.js';
import { PermessiService } from '../../permessi/permessi.service.js';
import { type ProgettoPerPermessi, puoVedereReportProgetto, vedeEuroProgetto } from '../../permessi/regole.js';
import { giorniTra, oggiInItalia, piuGiorni } from '../consuntivi/regole-giornata.js';
import {
  avvisoAndamento,
  giornoDiPartenza,
  giorniDa,
  MAX_AVVISI,
  PROCEDURA_EVM,
  SCADENZA_MS,
  type StatoEsecuzione,
  type ValoreGiornaliero,
  valoreDelGiorno,
} from './andamento-regole.js';
import { evmProgetto, fineGiornoInItalia, type IndicatoriEvm, percentualeAllIstante, type ProgettoEvm } from './evm.js';
import { ReportService } from './report.service.js';
import { leggiVista, totaliVuoti, type Vista } from './viste.js';

type Id = mongoose.Types.ObjectId;
type ProgettoLetto = ProgettoPerPermessi & ProgettoEvm & { _id: Id; codice: string; titolo: string; percentualeCompletamento?: number };

/** Utente tecnico con cui la procedura salva i dati. */
export const UTENTE_EVM = 'sistema:evm';

export interface Esecuzione {
  _id: Id;
  procedura: string;
  inizio: Date;
  fine: Date | null;
  stato: StatoEsecuzione;
  avviataDa: string;
  daGiorno: Date | null;
  ultimoGiornoCompletato: Date | null;
  giorniElaborati: number;
  avvisi: string[];
  motivo: string | null;
}

interface Giornaliero {
  progettoId: Id;
  data: Date;
  approvata: ValoreGiornaliero | null;
  provvisoria: ValoreGiornaliero | null;
}

const ieriInItalia = () => piuGiorni(new Date(`${oggiInItalia()}T00:00:00.000Z`), -1);

/**
 * Andamento degli indicatori EVM nel tempo (fase 4, blocco E3; RF-31, decisioni 12 e 13).
 * Ogni notte alle 2:00 (e all'avvio del backend) elabora i giorni mancanti fino a ieri, uno alla volta:
 * per ogni progetto In corso salva gli indicatori del giorno nelle due viste in `evm_giornalieri`;
 * ogni giorno si chiude in una transazione insieme al registro `esecuzioni_batch`, da cui si riparte.
 */
@Injectable()
export class AndamentoService implements OnApplicationBootstrap {
  private readonly log = new Logger('AndamentoEvm');

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Progetto.name) private readonly progetti: Model<Progetto>,
    @InjectModel(Avanzamento.name) private readonly avanzamenti: Model<Avanzamento>,
    private readonly report: ReportService,
    private readonly permessi: PermessiService,
  ) {}

  private get esecuzioni() {
    return this.connection.collection<Esecuzione>('esecuzioni_batch');
  }

  private get giornalieri() {
    return this.connection.collection<Giornaliero>('evm_giornalieri');
  }

  /** All'avvio recupera i giorni mancanti (non nei test, né con EVM_RECUPERO_ALL_AVVIO=false). */
  onApplicationBootstrap() {
    if (process.env.VITEST || process.env.EVM_RECUPERO_ALL_AVVIO === 'false') return;
    setTimeout(() => void this.avviaSilenziosa('avvio'), 10_000).unref();
  }

  @Cron('0 2 * * *', { name: 'evm-giornaliero', timeZone: 'Europe/Rome' })
  notturna() {
    if (process.env.VITEST) return;
    return this.avviaSilenziosa('notturna');
  }

  private async avviaSilenziosa(avviataDa: string) {
    try {
      const { completamento } = await this.avvia(avviataDa);
      const e = await completamento;
      this.log.log(`Andamento EVM (${avviataDa}): ${e.stato}, ${e.giorniElaborati} giorni elaborati`);
    } catch (err) {
      this.log.warn(`Andamento EVM (${avviataDa}) non avviato: ${(err as Error).message}`);
    }
  }

  /**
   * Crea l'esecuzione (409 se ce n'è già una in corso) e la porta avanti senza attendere.
   * `fino` (predefinito ieri) serve ai test.
   */
  async avvia(avviataDa: string, opzioni: { fino?: Date } = {}): Promise<{ esecuzione: Esecuzione; completamento: Promise<Esecuzione> }> {
    const ora = new Date();
    // Un'esecuzione rimasta in corso oltre un'ora si considera interrotta (decisione 12).
    await this.esecuzioni.updateMany(
      { procedura: PROCEDURA_EVM, stato: 'inCorso', inizio: { $lt: new Date(ora.getTime() - SCADENZA_MS) } },
      { $set: { stato: 'interrotta', fine: ora, motivo: 'Rimasta in corso oltre un\'ora: considerata interrotta', modificatoIl: ora, modificatoDa: UTENTE_EVM } },
    );
    const fino = opzioni.fino ?? ieriInItalia();
    const [ultimo, piuVecchio] = await Promise.all([
      this.ultimoGiornoCompletato(),
      this.progetti.findOne({ stato: 'inCorso', dataInizio: { $ne: null } }, { dataInizio: 1 }).sort({ dataInizio: 1 }).lean().exec(),
    ]);
    const daGiorno = giornoDiPartenza({ ultimoCompletato: ultimo, inizioPiuVecchio: piuVecchio?.dataInizio ?? null, ieri: fino });
    const nuova = {
      procedura: PROCEDURA_EVM,
      inizio: ora,
      fine: null,
      stato: 'inCorso' as const,
      avviataDa,
      daGiorno,
      ultimoGiornoCompletato: ultimo,
      giorniElaborati: 0,
      avvisi: [],
      motivo: null,
      creatoIl: ora,
      creatoDa: UTENTE_EVM,
      modificatoIl: ora,
      modificatoDa: UTENTE_EVM,
    };
    let id: Id;
    try {
      id = (await this.esecuzioni.insertOne(nuova as never)).insertedId as Id;
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw new ConflictException('Un\'elaborazione dell\'andamento è già in corso');
      throw e;
    }
    const esecuzione = { _id: id, ...nuova } as Esecuzione;
    const completamento = eseguiCome(UTENTE_EVM, () => this.elabora(esecuzione, fino));
    return { esecuzione, completamento };
  }

  /** Elabora i giorni da `daGiorno` a `fino`, uno per transazione; alla fine chiude il registro. */
  private async elabora(e: Esecuzione, fino: Date): Promise<Esecuzione> {
    const avvisi: string[] = [];
    try {
      const giorni = giorniDa(e.daGiorno!, fino);
      if (giorni.length) {
        const progetti = await this.progetti.find({ stato: 'inCorso' }).lean<ProgettoLetto[]>().exec();
        const ids = progetti.map((p) => p._id);
        const [cambi, oreGiorno, soglie] = await Promise.all([
          this.avanzamenti.find({ progettoId: { $in: ids }, attivitaId: null }, { progettoId: 1, il: 1, valorePrecedente: 1, valoreNuovo: 1 }).lean().exec(),
          this.report.oreGiorno(),
          this.report.soglieEvm(),
        ]);
        for (const giorno of giorni) {
          const delGiorno = progetti.filter((p) => !p.dataInizio || p.dataInizio <= giorno);
          const idsGiorno = delGiorno.map((p) => p._id);
          const totali = async (vista: Vista) =>
            new Map(
              (idsGiorno.length ? await this.report.totali({ progettoIds: idsGiorno, a: giorno }, vista, ['progettoId']) : []).map((g) => [String(g.chiave.progettoId as Id), g]),
            );
          const [tApp, tProv] = await Promise.all([totali('approvata'), totali('provvisoria')]);
          const fine = fineGiornoInItalia(giorno);
          const scritture: mongoose.mongo.AnyBulkWriteOperation<Giornaliero>[] = [];
          const ora = new Date();
          for (const p of delGiorno) {
            try {
              const percentuale = percentualeAllIstante(p.percentualeCompletamento ?? 0, cambi.filter((c) => c.progettoId.equals(p._id)), fine);
              const calcola = (t = totaliVuoti()) => valoreDelGiorno(evmProgetto(p, { percentuale, al: giorno, ...t, oreGiorno }, soglie));
              const approvata = calcola(tApp.get(String(p._id)));
              const provvisoria = calcola(tProv.get(String(p._id)));
              if (!approvata && !provvisoria) continue;
              scritture.push({
                updateOne: {
                  filter: { progettoId: p._id, data: giorno },
                  update: {
                    $set: { approvata, provvisoria, modificatoIl: ora, modificatoDa: UTENTE_EVM },
                    $setOnInsert: { creatoIl: ora, creatoDa: UTENTE_EVM },
                  } as never,
                  upsert: true,
                },
              });
            } catch (err) {
              if (avvisi.length < MAX_AVVISI) avvisi.push(`${p.codice}, ${giorno.toISOString().slice(0, 10)}: ${(err as Error).message}`);
            }
          }
          await this.chiudiGiorno(e._id, giorno, scritture, avvisi);
        }
      }
      return await this.termina(e._id, avvisi.length ? 'completataConAvvisi' : 'completata', null, avvisi);
    } catch (err) {
      this.log.error(`Andamento EVM: ${(err as Error).message}`);
      return this.termina(e._id, 'fallita', (err as Error).message, avvisi);
    }
  }

  /** Salva il giorno e fa avanzare il registro nella stessa transazione. */
  private async chiudiGiorno(id: Id, giorno: Date, scritture: mongoose.mongo.AnyBulkWriteOperation<Giornaliero>[], avvisi: string[]) {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        if (scritture.length) await this.giornalieri.bulkWrite(scritture, { session, ordered: false });
        const r = await this.esecuzioni.updateOne(
          { _id: id, stato: 'inCorso' },
          { $set: { ultimoGiornoCompletato: giorno, avvisi: [...avvisi], modificatoIl: new Date(), modificatoDa: UTENTE_EVM }, $inc: { giorniElaborati: 1 } },
          { session },
        );
        if (!r.matchedCount) throw new Error('L\'esecuzione non è più in corso (considerata interrotta)');
      });
    } finally {
      await session.endSession();
    }
  }

  private async termina(id: Id, stato: StatoEsecuzione, motivo: string | null, avvisi: string[]): Promise<Esecuzione> {
    const ora = new Date();
    await this.esecuzioni.updateOne(
      { _id: id, stato: 'inCorso' },
      { $set: { stato, fine: ora, motivo, avvisi: avvisi.slice(0, MAX_AVVISI), modificatoIl: ora, modificatoDa: UTENTE_EVM } },
    );
    return (await this.esecuzioni.findOne({ _id: id }))!;
  }

  /** Ultimo giorno completato da qualunque esecuzione: i dati dell'andamento arrivano fin lì. */
  async ultimoGiornoCompletato(): Promise<Date | null> {
    const e = await this.esecuzioni.find({ procedura: PROCEDURA_EVM, ultimoGiornoCompletato: { $ne: null } }).sort({ ultimoGiornoCompletato: -1 }).limit(1).next();
    return e?.ultimoGiornoCompletato ?? null;
  }

  /** GET /report/esecuzioni: ultima esecuzione e le più recenti, per la pagina Periodi del controller. */
  async stato(utente: UtenteAutenticato | undefined) {
    this.permessi.verifica(utente, true, 'gestirePeriodi');
    const [recenti, aggiornatoAl] = await Promise.all([
      this.esecuzioni.find({ procedura: PROCEDURA_EVM }).sort({ inizio: -1 }).limit(10).toArray(),
      this.ultimoGiornoCompletato(),
    ]);
    return { aggiornatoAl, ultima: recenti[0] ?? null, recenti, avviso: avvisoAndamento({ ultima: recenti[0] ?? null, aggiornatoAl, ieri: ieriInItalia() }) };
  }

  /** POST /report/esecuzioni/evm: "Esegui ora" (controller). Risponde subito; l'elaborazione continua. */
  async eseguiOra(utente: UtenteAutenticato | undefined) {
    this.permessi.verifica(utente, true, 'gestirePeriodi');
    const { esecuzione, completamento } = await this.avvia(utente.id);
    completamento.catch(() => undefined);
    return esecuzione;
  }

  /** GET /report/progetti/:id/evm/andamento?da=&a=&vista=: serie giornaliera con "dati aggiornati al". */
  async serie(utente: UtenteAutenticato | undefined, idGrezzo: string, query: Record<string, unknown>) {
    this.permessi.verifica(utente, true, 'vedereReport');
    const id = idRotta(idGrezzo);
    const p = id ? await this.progetti.findById(id).lean<ProgettoLetto>().exec() : null;
    if (!p) throw new NotFoundException('Progetto non trovato');
    if (!puoVedereReportProgetto(utente, p)) throw new ForbiddenException('Non hai il permesso di vedere l\'andamento di questo progetto');
    const euro = vedeEuroProgetto(utente, p);
    const vista = leggiVista(query.vista);
    const ieri = ieriInItalia();
    const [aggiornatoAl, ultima, soglie] = await Promise.all([
      this.ultimoGiornoCompletato(),
      this.esecuzioni.find({ procedura: PROCEDURA_EVM }).sort({ inizio: -1 }).limit(1).next(),
      this.report.soglieEvm(),
    ]);
    const a = leggiData(query.a, 'a') ?? aggiornatoAl ?? ieri;
    const unAnnoPrima = piuGiorni(a, -365);
    const da = leggiData(query.da, 'da') ?? (p.dataInizio && p.dataInizio > unAnnoPrima ? p.dataInizio : unAnnoPrima);
    if (a < da || giorniTra(da, a) > 366 * 5) throw new BadRequestException('periodo: "a" non prima di "da", al massimo cinque anni');

    const righe = await this.giornalieri.find({ progettoId: p._id, data: { $gte: da, $lte: a } }).sort({ data: 1 }).toArray();
    const punto = (i: IndicatoriEvm | null | undefined) => (i ? { pv: i.pv, ev: i.ev, ac: i.ac, spi: i.spi, cpi: i.cpi } : null);
    return {
      vista,
      vedeEuro: euro,
      periodo: { da, a },
      aggiornatoAl,
      avviso: avvisoAndamento({ ultima, aggiornatoAl, ieri }),
      soglie,
      serie: righe.flatMap((r) => {
        const v = r[vista];
        if (!v) return [];
        return [
          {
            data: r.data,
            percentuale: v.percentuale,
            trascorso: v.trascorso,
            statoTempi: v.statoTempi,
            statoCosti: v.statoCosti,
            giorni: punto(v.giorni),
            ...(euro ? { euro: punto(v.euro) } : {}),
          },
        ];
      }),
    };
  }
}
