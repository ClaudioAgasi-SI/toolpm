import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Attivita, Avanzamento, Progetto, RisorsaAnagrafica, UtenteAdmin, VoceAnagrafica } from './modelli';

/** Accesso alle API del modulo Comuni (/api/comuni) e della gestione utenti (/api/utenti). */
@Injectable({ providedIn: 'root' })
export class ComuniApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/comuni';

  // Anagrafiche semplici: clienti, centri-costo, ruoli
  voci(percorso: string, soloAttive = false) {
    const params = soloAttive ? new HttpParams().set('attivi', 'true') : undefined;
    return this.http.get<VoceAnagrafica[]>(`${this.base}/${percorso}`, { params });
  }
  creaVoce(percorso: string, voce: Partial<VoceAnagrafica>) {
    return this.http.post<VoceAnagrafica>(`${this.base}/${percorso}`, voce);
  }
  modificaVoce(percorso: string, id: string, voce: Partial<VoceAnagrafica>) {
    return this.http.put<VoceAnagrafica>(`${this.base}/${percorso}/${id}`, voce);
  }

  // Risorse (anagrafica)
  risorse() {
    return this.http.get<RisorsaAnagrafica[]>(`${this.base}/risorse`);
  }
  risorsa(id: string) {
    return this.http.get<RisorsaAnagrafica>(`${this.base}/risorse/${id}`);
  }
  creaRisorsa(r: Partial<RisorsaAnagrafica>) {
    return this.http.post<RisorsaAnagrafica>(`${this.base}/risorse`, r);
  }
  modificaRisorsa(id: string, r: Partial<RisorsaAnagrafica>) {
    return this.http.put<RisorsaAnagrafica>(`${this.base}/risorse/${id}`, r);
  }

  // Progetti
  progetti(filtro: { gestibili?: boolean; stato?: string } = {}) {
    let params = new HttpParams();
    if (filtro.gestibili) params = params.set('gestibili', 'true');
    if (filtro.stato) params = params.set('stato', filtro.stato);
    return this.http.get<Progetto[]>(`${this.base}/progetti`, { params });
  }
  progetto(id: string) {
    return this.http.get<Progetto>(`${this.base}/progetti/${id}`);
  }
  creaProgetto(p: Partial<Progetto>) {
    return this.http.post<Progetto>(`${this.base}/progetti`, p);
  }
  modificaProgetto(id: string, p: Partial<Progetto>) {
    return this.http.put<Progetto>(`${this.base}/progetti/${id}`, p);
  }
  cambiaStato(id: string, stato: string) {
    return this.http.post<Progetto>(`${this.base}/progetti/${id}/stato`, { stato });
  }
  impostaApprovatori(id: string, approvatori: { risorsaId: string; profilo: string }[]) {
    return this.http.put<Progetto>(`${this.base}/progetti/${id}/approvatori`, { approvatori });
  }
  completamentoProgetto(id: string, percentuale: number) {
    return this.http.put<Progetto>(`${this.base}/progetti/${id}/completamento`, { percentuale });
  }
  avanzamenti(id: string) {
    return this.http.get<Avanzamento[]>(`${this.base}/progetti/${id}/avanzamenti`);
  }

  // Attività
  attivita(progettoId: string) {
    return this.http.get<Attivita[]>(`${this.base}/progetti/${progettoId}/attivita`);
  }
  creaAttivita(progettoId: string, a: Partial<Attivita>) {
    return this.http.post<Attivita>(`${this.base}/progetti/${progettoId}/attivita`, a);
  }
  modificaAttivita(progettoId: string, id: string, a: Partial<Attivita>) {
    return this.http.put<Attivita>(`${this.base}/progetti/${progettoId}/attivita/${id}`, a);
  }
  risorseAttivita(progettoId: string, id: string, risorseAssegnateIds: string[]) {
    return this.http.put<Attivita>(`${this.base}/progetti/${progettoId}/attivita/${id}/risorse`, { risorseAssegnateIds });
  }
  completamentoAttivita(progettoId: string, id: string, percentuale: number) {
    return this.http.put<Attivita>(`${this.base}/progetti/${progettoId}/attivita/${id}/completamento`, { percentuale });
  }

  // Utenti (solo amministratore)
  utenti() {
    return this.http.get<UtenteAdmin[]>('/api/utenti');
  }
  creaUtente(u: Partial<UtenteAdmin> & { passwordIniziale: string }) {
    return this.http.post<UtenteAdmin>('/api/utenti', u);
  }
  modificaUtente(id: string, u: Partial<UtenteAdmin>) {
    return this.http.put<UtenteAdmin>(`/api/utenti/${id}`, u);
  }
  reimpostaPassword(id: string, nuova: string) {
    return this.http.post(`/api/utenti/${id}/password`, { nuova });
  }
}
