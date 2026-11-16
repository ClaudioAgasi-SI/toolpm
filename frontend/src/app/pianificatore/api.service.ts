import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Certificazione, Pianificazione, Rate, Risorsa, Skill } from './models';

/**
 * Accesso alle API REST della sezione Pianificatore. L'indirizzo è relativo ("/api/pianificatore"): in sviluppo lo inoltra
 * il proxy di "ng serve", in Docker lo inoltra nginx al container del backend.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/pianificatore';

  // Risorse
  risorse() {
    return this.http.get<Risorsa[]>(`${this.base}/risorse`);
  }
  risorsa(id: string) {
    return this.http.get<Risorsa>(`${this.base}/risorse/${id}`);
  }
  creaRisorsa(r: Risorsa) {
    return this.http.post<Risorsa>(`${this.base}/risorse`, r);
  }
  aggiornaRisorsa(id: string, r: Risorsa) {
    return this.http.put<Risorsa>(`${this.base}/risorse/${id}`, r);
  }
  eliminaRisorsa(id: string) {
    return this.http.delete(`${this.base}/risorse/${id}`);
  }

  // Pianificazione
  /** Griglia di pianificazione; con più skill la risorsa ne deve avere almeno una (OR). */
  pianificazione(da: string, a: string, tipoSkill?: string, skill: string[] = []) {
    let params = new HttpParams().set('da', da).set('a', a);
    if (tipoSkill) {
      params = params.set('tipoSkill', tipoSkill);
      for (const s of skill) params = params.append('skill', s);
    }
    return this.http.get<Pianificazione>(`${this.base}/pianificazione`, { params });
  }

  // Anagrafiche
  skills() {
    return this.http.get<Skill[]>(`${this.base}/skills`);
  }
  creaSkill(s: Skill) {
    return this.http.post<Skill>(`${this.base}/skills`, s);
  }
  eliminaSkill(id: string) {
    return this.http.delete(`${this.base}/skills/${id}`);
  }

  certificazioni() {
    return this.http.get<Certificazione[]>(`${this.base}/certificazioni`);
  }
  creaCertificazione(c: Certificazione) {
    return this.http.post<Certificazione>(`${this.base}/certificazioni`, c);
  }
  eliminaCertificazione(id: string) {
    return this.http.delete(`${this.base}/certificazioni/${id}`);
  }

  rate() {
    return this.http.get<Rate[]>(`${this.base}/rate`);
  }
  creaRate(r: Rate) {
    return this.http.post<Rate>(`${this.base}/rate`, r);
  }
  aggiornaRate(id: string, r: Rate) {
    return this.http.put<Rate>(`${this.base}/rate/${id}`, r);
  }
  eliminaRate(id: string) {
    return this.http.delete(`${this.base}/rate/${id}`);
  }
}

/** Messaggio leggibile da un errore HTTP del backend. */
export function messaggioErrore(err: unknown): string {
  const e = err as { error?: { message?: string | string[] }; message?: string; status?: number };
  if (e?.status === 0) return 'Backend non raggiungibile.';
  const m = e?.error?.message ?? e?.message ?? 'Errore sconosciuto';
  return Array.isArray(m) ? m.join('; ') : m;
}
