import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';
import { utenteCorrente } from './contesto-utente.js';
import { VoceStorico } from './voce-storico.schema.js';

/** Dati di una voce dello storico; utente e data li aggiunge il servizio. */
export interface NuovaVoceStorico {
  collezione: string;
  documentoId: string | { toString(): string };
  righeIds?: (string | { toString(): string })[];
  operazione: string;
  prima?: unknown;
  dopo?: unknown;
  motivazione?: string | null;
}

/**
 * Storico delle modifiche (fase 3, decisione 9): ogni servizio registra le proprie modifiche
 * chiamando `registra` dentro la stessa transazione, così modifica e storico si salvano insieme
 * o per niente. L'utente è quello del contesto della richiesta (o l'utente tecnico "sistema:...").
 */
@Injectable()
export class AuditService {
  constructor(@InjectModel(VoceStorico.name) private readonly model: Model<VoceStorico>) {}

  async registra(voci: NuovaVoceStorico | NuovaVoceStorico[], session?: ClientSession | null): Promise<void> {
    const elenco = Array.isArray(voci) ? voci : [voci];
    if (!elenco.length) return;
    const utente = utenteCorrente();
    const il = new Date();
    await this.model.insertMany(
      elenco.map((v) => ({
        collezione: v.collezione,
        documentoId: String(v.documentoId),
        ...(v.righeIds?.length ? { righeIds: v.righeIds.map(String) } : {}),
        operazione: v.operazione,
        utente,
        il,
        prima: v.prima ?? null,
        dopo: v.dopo ?? null,
        motivazione: v.motivazione ?? null,
      })),
      { session: session ?? undefined },
    );
  }

  /** Voci di un documento (o di una sua riga), dalla più recente. */
  cronologia(collezione: string, documentoId: string, rigaId?: string) {
    return this.model
      .find({ collezione, documentoId, ...(rigaId ? { righeIds: rigaId } : {}) })
      .sort({ il: -1, _id: -1 })
      .lean()
      .exec();
  }
}
