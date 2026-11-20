import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { TipologiaCosto } from './modelli';

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
}
