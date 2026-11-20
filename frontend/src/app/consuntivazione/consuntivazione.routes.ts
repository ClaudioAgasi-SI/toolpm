import { Routes } from '@angular/router';
import { permessoRichiesto } from '../core/accesso';
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
      {
        path: 'settimana',
        title: 'Il mio consuntivo · ToolPM',
        canActivate: [permessoRichiesto('consuntivare')],
        loadComponent: () => import('./mio-consuntivo').then((m) => m.MioConsuntivo),
      },
      {
        path: 'da-valorizzare',
        title: 'Righe da valorizzare · ToolPM',
        canActivate: [permessoRichiesto('gestireTariffe')],
        loadComponent: () => import('./da-valorizzare').then((m) => m.DaValorizzare),
      },
      {
        path: 'tipologie',
        title: 'Tipologie di costo · ToolPM',
        canActivate: [permessoRichiesto('gestireTipologieCosto')],
        loadComponent: () => import('./tipologie-costo').then((m) => m.TipologieCosto),
      },
      {
        path: 'tariffe',
        title: 'Tariffe · ToolPM',
        canActivate: [permessoRichiesto('gestireTariffe')],
        loadComponent: () => import('./tariffe').then((m) => m.Tariffe),
      },
    ],
  },
];
