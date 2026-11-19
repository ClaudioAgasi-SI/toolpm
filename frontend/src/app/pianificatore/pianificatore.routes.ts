import { Routes } from '@angular/router';
import { PianificatoreLayout } from './pianificatore-layout';

/** Rotte della sezione "Pianificatore risorse allocate", montate sotto /pianificatore. */
export const PIANIFICATORE_ROUTES: Routes = [
  {
    path: '',
    component: PianificatoreLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'pianificazione' },
      {
        path: 'pianificazione',
        title: 'Pianificazione · ToolPM',
        loadComponent: () => import('./pianificazione/pianificazione').then((m) => m.Pianificazione),
      },
      {
        path: 'risorse',
        title: 'Risorse · ToolPM',
        loadComponent: () => import('./risorse/risorse-elenco').then((m) => m.RisorseElenco),
      },
      // Le risorse nuove si creano nell'anagrafica (con email): /comuni/risorse/nuova.
      { path: 'risorse/nuova', redirectTo: '/comuni/risorse/nuova' },
      {
        path: 'risorse/:id',
        title: 'Risorsa · ToolPM',
        loadComponent: () => import('./risorse/risorsa-dettaglio').then((m) => m.RisorsaDettaglio),
      },
      {
        path: 'anagrafiche',
        title: 'Anagrafiche · ToolPM',
        loadComponent: () => import('./anagrafiche/anagrafiche').then((m) => m.Anagrafiche),
      },
    ],
  },
];
