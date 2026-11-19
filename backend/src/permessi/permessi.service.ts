import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import mongoose from 'mongoose';
import * as regole from './regole.js';
import type { AttivitaPerPermessi, PermessoGlobale, ProgettoPerPermessi, Soggetto, StatoProgetto } from './regole.js';

/**
 * Permessi (fase 1, blocco B3). Ogni metodo `puo...` risponde sì o no; `verifica(...)` lancia
 * 401 se manca l'accesso e 403 se il permesso è negato, con un messaggio comprensibile.
 *
 * Uso nei servizi del modulo Comuni (B4) e del Pianificatore (B5):
 *   this.permessi.verifica(utente, this.permessi.puoGestireAttivita(utente, progetto), 'gestire le attività del progetto');
 */
@Injectable()
export class PermessiService {
  permessoGlobale(s: Soggetto, permesso: PermessoGlobale) {
    return regole.permessoGlobale(s, permesso);
  }

  permessiGlobali(s: Soggetto) {
    return regole.permessiGlobali(s);
  }

  profiloSulProgetto(s: Soggetto, progetto: ProgettoPerPermessi) {
    return regole.profiloSulProgetto(s, progetto);
  }

  puoModificareProgetto(s: Soggetto, progetto: ProgettoPerPermessi) {
    return regole.puoModificareProgetto(s, progetto);
  }

  puoModificarePercentualeProgetto(s: Soggetto, progetto: ProgettoPerPermessi) {
    return regole.puoModificarePercentualeProgetto(s, progetto);
  }

  puoCambiareStatoProgetto(s: Soggetto, progetto: ProgettoPerPermessi, da: StatoProgetto) {
    return regole.puoCambiareStatoProgetto(s, progetto, da);
  }

  puoGestireApprovatori(s: Soggetto, progetto: ProgettoPerPermessi) {
    return regole.puoGestireApprovatori(s, progetto);
  }

  puoGestireAttivita(s: Soggetto, progetto: ProgettoPerPermessi) {
    return regole.puoGestireAttivita(s, progetto);
  }

  puoModificarePercentualeAttivita(s: Soggetto, progetto: ProgettoPerPermessi, attivita: AttivitaPerPermessi) {
    return regole.puoModificarePercentualeAttivita(s, progetto, attivita);
  }

  puoGestireRisorse(s: Soggetto) {
    return regole.puoGestireRisorse(s);
  }

  puoModificareCaratteristicheRisorsa(s: Soggetto, progettiDelSoggetto: Iterable<string>, progettiDellaRisorsa: Iterable<string>) {
    return regole.puoModificareCaratteristicheRisorsa(s, progettiDelSoggetto, progettiDellaRisorsa);
  }

  /** Filtro per gli elenchi dei progetti gestibili; null = nessun progetto. */
  filtroProgettiGestibili(s: Soggetto) {
    const filtro = regole.filtroProgettiGestibili(s);
    if (filtro && typeof filtro['approvatori.risorsaId'] === 'string' && mongoose.isValidObjectId(filtro['approvatori.risorsaId'])) {
      return { 'approvatori.risorsaId': new mongoose.Types.ObjectId(filtro['approvatori.risorsaId']) };
    }
    return filtro;
  }

  /**
   * Interrompe la richiesta se il permesso è negato.
   * @param azione cosa si voleva fare, per il messaggio: "Non hai il permesso di <azione>"
   */
  verifica(s: Soggetto | undefined, consentito: boolean, azione: string): asserts s is Soggetto {
    if (!s) throw new UnauthorizedException('Accesso richiesto');
    if (!consentito) throw new ForbiddenException(`Non hai il permesso di ${azione}`);
  }
}
