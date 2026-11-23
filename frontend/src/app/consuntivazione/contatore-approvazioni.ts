import { Injectable, inject, signal } from '@angular/core';
import { SessioneService } from '../core/sessione.service';
import { ConsuntivazioneApiService } from './consuntivazione-api.service';

/** Numero di righe che aspettano un'azione dell'approvatore, per il sottomenu (fase 3, decisione 8: niente email). */
@Injectable({ providedIn: 'root' })
export class ContatoreApprovazioni {
  private readonly api = inject(ConsuntivazioneApiService);
  private readonly sessione = inject(SessioneService);
  readonly righe = signal(0);

  aggiorna() {
    if (!this.sessione.puo('approvare')) {
      this.righe.set(0);
      return;
    }
    this.api.inAttesa().subscribe({ next: (r) => this.righe.set(r.righe), error: () => this.righe.set(0) });
  }
}
