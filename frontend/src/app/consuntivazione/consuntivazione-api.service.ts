import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { AnteprimaRicalcolo, AzioneApprovazione, DaInviare, DatiTariffa, ElencoApprovazioni, EsitoApprovazione, EsitoInvio, EsitoSalvataggio, Giornata, Proposta, RigaDaSalvare, RigaDaValorizzare, Tariffa, TariffeApplicabili, TipologiaCosto, TotaliRicalcolo, VoceProgetto } from './modelli';

/** Accesso alle API della sezione Consuntivazione (/api/consuntivazione). */
@Injectable({ providedIn: 'root' })
export class ConsuntivazioneApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/consuntivazione';

  // Tipologie di costo (blocco C1)
  tipologie(soloAttive = false) {
    const params = soloAttive ? new HttpParams().set('attive', 'true') : undefined;
    return this.http.get<TipologiaCosto[]>(`${this.base}/tipologie-costo`, { params });
  }
  creaTipologia(t: Partial<TipologiaCosto>) {
    return this.http.post<TipologiaCosto>(`${this.base}/tipologie-costo`, t);
  }
  modificaTipologia(id: string, t: Partial<TipologiaCosto>) {
    return this.http.put<TipologiaCosto>(`${this.base}/tipologie-costo/${id}`, t);
  }

  // Tariffe (blocco C2): solo controller
  tariffeStandard(ruoloId?: string) {
    const params = ruoloId ? new HttpParams().set('ruolo', ruoloId) : undefined;
    return this.http.get<Tariffa[]>(`${this.base}/tariffe-standard`, { params });
  }
  creaTariffaStandard(ruoloId: string, t: DatiTariffa) {
    return this.http.post<Tariffa>(`${this.base}/tariffe-standard`, { ...t, ruoloId });
  }
  modificaTariffaStandard(id: string, t: DatiTariffa) {
    return this.http.put<Tariffa>(`${this.base}/tariffe-standard/${id}`, t);
  }
  eliminaTariffaStandard(id: string) {
    return this.http.delete<void>(`${this.base}/tariffe-standard/${id}`);
  }
  tariffePersonalizzate(risorsaId: string) {
    return this.http.get<Tariffa[]>(`${this.base}/risorse/${risorsaId}/tariffe-personalizzate`);
  }
  creaTariffaPersonalizzata(risorsaId: string, t: DatiTariffa) {
    return this.http.post<Tariffa>(`${this.base}/risorse/${risorsaId}/tariffe-personalizzate`, t);
  }
  modificaTariffaPersonalizzata(risorsaId: string, id: string, t: DatiTariffa) {
    return this.http.put<Tariffa>(`${this.base}/risorse/${risorsaId}/tariffe-personalizzate/${id}`, t);
  }
  eliminaTariffaPersonalizzata(risorsaId: string, id: string) {
    return this.http.delete<void>(`${this.base}/risorse/${risorsaId}/tariffe-personalizzate/${id}`);
  }
  tariffeApplicabili(risorsaId: string, data: string) {
    return this.http.get<TariffeApplicabili>(`${this.base}/risorse/${risorsaId}/tariffe-applicabili`, { params: new HttpParams().set('data', data) });
  }

  // Il mio consuntivo (blocco C5)
  consuntivi(da: string, a: string) {
    return this.http.get<Giornata[]>(`${this.base}/consuntivi`, { params: new HttpParams().set('da', da).set('a', a) });
  }
  voci(da: string, a: string) {
    return this.http.get<VoceProgetto[]>(`${this.base}/consuntivi/voci`, { params: new HttpParams().set('da', da).set('a', a) });
  }
  proposte(settimana: string) {
    return this.http.get<{ settimana: string; righe: Proposta[] }>(`${this.base}/consuntivi/proposte`, { params: new HttpParams().set('settimana', settimana) });
  }
  salvaGiornate(giornate: { data: string; versione: number; righe: RigaDaSalvare[] }[]) {
    return this.http.put<EsitoSalvataggio>(`${this.base}/consuntivi`, { giornate });
  }

  // Invio e ritiro (fase 3, blocco D1)
  invia(giornate: { data: string; versione: number }[]) {
    return this.http.post<EsitoInvio>(`${this.base}/consuntivi/invio`, { giornate });
  }
  ritira(giornate: { data: string; versione: number }[]) {
    return this.http.post<EsitoInvio>(`${this.base}/consuntivi/ritiro`, { giornate });
  }
  daInviare() {
    return this.http.get<DaInviare>(`${this.base}/consuntivi/da-inviare`);
  }

  // Approvazioni (fase 3, blocchi D2 e D3)
  approvazioni(filtri: { da?: string; a?: string; stato?: string }) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filtri)) if (v) params = params.set(k, v);
    return this.http.get<ElencoApprovazioni>(`${this.base}/approvazioni`, { params });
  }
  inAttesa() {
    return this.http.get<{ righe: number }>(`${this.base}/approvazioni/in-attesa`);
  }
  agisci(azione: AzioneApprovazione, righe: string[], motivazione?: string) {
    return this.http.post<EsitoApprovazione>(`${this.base}/approvazioni`, { azione, righe, motivazione });
  }

  // Righe da valorizzare e ricalcolo (blocco C6): solo controller
  daValorizzare(da: string, a: string) {
    return this.http.get<{ da: string; a: string; righe: RigaDaValorizzare[] }>(`${this.base}/da-valorizzare`, {
      params: new HttpParams().set('da', da).set('a', a),
    });
  }
  anteprimaRicalcolo(da: string, a: string, risorsaId: string | null) {
    return this.http.post<AnteprimaRicalcolo>(`${this.base}/ricalcolo`, { da, a, risorsaId, conferma: false });
  }
  applicaRicalcolo(da: string, a: string, risorsaId: string | null) {
    return this.http.post<{ applicato: true; totali: TotaliRicalcolo }>(`${this.base}/ricalcolo`, { da, a, risorsaId, conferma: true });
  }

  /** Consuntivi di un'altra risorsa, con i costi (solo controller). */
  consuntiviDi(risorsaId: string, da: string, a: string) {
    return this.http.get<Giornata[]>(`${this.base}/consuntivi`, { params: new HttpParams().set('da', da).set('a', a).set('risorsa', risorsaId) });
  }
}
