import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { DatiTariffa, EsitoSalvataggio, Giornata, Proposta, RigaDaSalvare, TariffeApplicabili, Tariffa, TipologiaCosto, VoceProgetto } from './modelli';

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
}
