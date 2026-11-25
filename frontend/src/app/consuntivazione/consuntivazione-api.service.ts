import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ReportCosti, ReportPianificato, AndamentoEvm, EsecuzioneBatch, StatoEsecuzioni, AnteprimaChiusura, AnteprimaRicalcolo, AzioneApprovazione, CronologiaRiga, DaInviare, DatiTariffa, ElencoApprovazioni, ElencoPeriodi, ElencoProgettiReport, EvmScheda, EsitoApprovazione, EsitoInvio, EsitoSalvataggio, Giornata, Proposta, RigaDaSalvare, RigaDaValorizzare, SchedaProgetto, Tariffa, TariffeApplicabili, TipologiaCosto, TotaliRicalcolo, VistaReport, VoceProgetto, VoceStorico } from './modelli';

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

  // Periodi (fase 3, blocco D4)
  mesiChiusi(da: string, a: string) {
    return this.http.get<string[]>(`${this.base}/periodi/chiusi`, { params: { da, a } });
  }
  periodi() {
    return this.http.get<ElencoPeriodi>(`${this.base}/periodi`);
  }
  anteprimaChiusura(mese: string) {
    return this.http.get<AnteprimaChiusura>(`${this.base}/periodi/${mese}/anteprima`);
  }
  chiudiMese(mese: string, forzata: boolean, motivazione?: string) {
    return this.http.post<{ mese: string; nome: string; righeChiuse: number; nonApprovate: number }>(`${this.base}/periodi/${mese}/chiusura`, { forzata, motivazione });
  }
  riapriMese(mese: string, motivazione: string) {
    return this.http.post<{ mese: string; nome: string; righeRiaperte: number }>(`${this.base}/periodi/${mese}/riapertura`, { motivazione });
  }

  // Report (fase 4)
  progettiReport(filtri: { vista?: VistaReport; stato?: string; testo?: string; cliente?: string; centroCosto?: string }) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filtri)) if (v) params = params.set(k, v);
    return this.http.get<ElencoProgettiReport>(`${this.base}/report/progetti`, { params });
  }
  schedaProgetto(id: string, filtri: { vista?: VistaReport; da?: string; a?: string }) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filtri)) if (v) params = params.set(k, v);
    return this.http.get<SchedaProgetto>(`${this.base}/report/progetti/${id}`, { params });
  }
  evmProgetto(id: string, filtri: { vista?: VistaReport; al?: string }) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filtri)) if (v) params = params.set(k, v);
    return this.http.get<EvmScheda>(`${this.base}/report/progetti/${id}/evm`, { params });
  }
  andamentoEvm(id: string, filtri: { vista?: VistaReport; da?: string; a?: string }) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filtri)) if (v) params = params.set(k, v);
    return this.http.get<AndamentoEvm>(`${this.base}/report/progetti/${id}/evm/andamento`, { params });
  }
  reportCosti(filtri: { vista?: VistaReport; da?: string; a?: string; raggruppa?: string; centroCosto?: string; cliente?: string; progetto?: string }) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filtri)) if (v) params = params.set(k, v);
    return this.http.get<ReportCosti>(`${this.base}/report/costi`, { params });
  }
  reportPianificato(filtri: { da?: string; a?: string; risorsa?: string; progetto?: string }) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filtri)) if (v) params = params.set(k, v);
    return this.http.get<ReportPianificato>(`${this.base}/report/pianificato`, { params });
  }
  esecuzioniBatch() {
    return this.http.get<StatoEsecuzioni>(`${this.base}/report/esecuzioni`);
  }
  eseguiAndamentoOra() {
    return this.http.post<EsecuzioneBatch>(`${this.base}/report/esecuzioni/evm`, {});
  }

  // Storico (fase 3, blocco D5)
  storico(filtri: Record<string, string>) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filtri)) if (v) params = params.set(k, v);
    return this.http.get<{ voci: VoceStorico[]; troncato: boolean }>(`${this.base}/storico`, { params });
  }
  cronologiaRiga(rigaId: string) {
    return this.http.get<CronologiaRiga>(`${this.base}/storico/riga/${rigaId}`);
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
