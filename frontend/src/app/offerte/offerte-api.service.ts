import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { DatiVoceListino, ListinoApplicabile, VoceListino } from './modelli';

/** Accesso alle API della sezione Offerte e preventivi (/api/offerte). */
@Injectable({ providedIn: 'root' })
export class OfferteApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/offerte';

  // Listino di vendita (blocco F1)
  /** `cliente`: id del cliente o "standard"; senza, tutto il listino. */
  listino(filtro: { cliente?: string; ruolo?: string } = {}) {
    let params = new HttpParams();
    if (filtro.cliente) params = params.set('cliente', filtro.cliente);
    if (filtro.ruolo) params = params.set('ruolo', filtro.ruolo);
    return this.http.get<VoceListino[]>(`${this.base}/listino`, { params });
  }
  listinoApplicabile(cliente: string | null, data: string) {
    const params = new HttpParams().set('cliente', cliente ?? 'standard').set('data', data);
    return this.http.get<ListinoApplicabile>(`${this.base}/listino/applicabili`, { params });
  }
  creaVoceListino(ruoloId: string, clienteId: string | null, dati: DatiVoceListino) {
    return this.http.post<VoceListino>(`${this.base}/listino`, { ...dati, ruoloId, clienteId });
  }
  modificaVoceListino(id: string, dati: DatiVoceListino) {
    return this.http.put<VoceListino>(`${this.base}/listino/${id}`, dati);
  }
  eliminaVoceListino(id: string) {
    return this.http.delete<void>(`${this.base}/listino/${id}`);
  }
}
