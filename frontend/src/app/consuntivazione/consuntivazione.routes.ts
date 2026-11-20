import { Routes } from '@angular/router';
import { ConsuntivazioneLayout } from './consuntivazione-layout';

/**
 * Rotte della sezione Consuntivazione (fase 2), montate sotto /consuntivazione.
 * Le pagine arrivano con i blocchi del piano: tipologie (C1), tariffe (C2),
 * il mio consuntivo (C5), righe da valorizzare (C6).
 */
export const CONSUNTIVAZIONE_ROUTES: Routes = [
  {
    path: '',
    component: ConsuntivazioneLayout,
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Consuntivazione · ToolPM',
        loadComponent: () => import('./consuntivazione-inizio').then((m) => m.ConsuntivazioneInizio),
      },
    ],
  },
];
