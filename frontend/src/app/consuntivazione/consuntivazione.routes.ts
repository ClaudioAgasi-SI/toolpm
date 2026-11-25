import { Routes } from '@angular/router';
import { permessoRichiesto } from '../core/accesso';
import { ConsuntivazioneLayout } from './consuntivazione-layout';

/**
 * Rotte della sezione Consuntivazione (fase 2), montate sotto /consuntivazione.
 * Le pagine arrivano con i blocchi del piano: tipologie (C1), tariffe (C2),
 * il mio consuntivo (C5), righe da valorizzare (C6); fase 3: approvazioni (D3), periodi (D4), storico (D5); fase 4: progetti e scheda (E1).
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
        path: 'approvazioni',
        title: 'Approvazioni · ToolPM',
        canActivate: [permessoRichiesto('approvare')],
        loadComponent: () => import('./approvazioni').then((m) => m.Approvazioni),
      },
      {
        path: 'periodi',
        title: 'Periodi · ToolPM',
        canActivate: [permessoRichiesto('gestirePeriodi')],
        loadComponent: () => import('./periodi').then((m) => m.Periodi),
      },
      {
        path: 'storico',
        title: 'Storico delle modifiche · ToolPM',
        canActivate: [permessoRichiesto('consultareStorico')],
        loadComponent: () => import('./storico').then((m) => m.Storico),
      },
      {
        path: 'progetti',
        title: 'Progetti: costi e avanzamento · ToolPM',
        canActivate: [permessoRichiesto('vedereReport')],
        loadComponent: () => import('./progetti-report').then((m) => m.ProgettiReport),
      },
      {
        path: 'progetti/:id',
        title: 'Scheda del progetto · ToolPM',
        canActivate: [permessoRichiesto('vedereReport')],
        loadComponent: () => import('./scheda-progetto').then((m) => m.SchedaProgetto),
      },
      {
        path: 'report/costi',
        title: 'Report dei costi · ToolPM',
        canActivate: [permessoRichiesto('vedereReport')],
        loadComponent: () => import('./report-costi').then((m) => m.ReportCosti),
      },
      {
        path: 'consuntivi-risorse',
        title: 'Consuntivi delle risorse · ToolPM',
        canActivate: [permessoRichiesto('gestireTariffe')],
        loadComponent: () => import('./consuntivi-risorse').then((m) => m.ConsuntiviRisorse),
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
