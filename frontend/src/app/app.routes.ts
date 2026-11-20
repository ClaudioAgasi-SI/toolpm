import { Routes } from '@angular/router';
import { accessoRichiesto } from './core/accesso';

/**
 * Rotte di primo livello: una per sezione del prodotto, tutte dietro l'accesso (blocco B6).
 * Ogni sezione ha il proprio file di rotte, caricato a richiesta.
 */
export const routes: Routes = [
  {
    path: 'accesso',
    title: 'Accesso · ToolPM',
    loadComponent: () => import('./accesso/accesso').then((m) => m.Accesso),
  },
  {
    path: '',
    canActivateChild: [accessoRichiesto],
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'ToolPM',
        loadComponent: () => import('./home/home').then((m) => m.Home),
      },
      {
        path: 'cambia-password',
        title: 'Cambia password · ToolPM',
        loadComponent: () => import('./accesso/cambia-password').then((m) => m.CambiaPassword),
      },
      {
        path: 'pianificatore',
        loadChildren: () => import('./pianificatore/pianificatore.routes').then((m) => m.PIANIFICATORE_ROUTES),
      },
      {
        path: 'comuni',
        loadChildren: () => import('./comuni/comuni.routes').then((m) => m.COMUNI_ROUTES),
      },
      {
        path: 'consuntivazione',
        loadChildren: () => import('./consuntivazione/consuntivazione.routes').then((m) => m.CONSUNTIVAZIONE_ROUTES),
      },
      // Indirizzi del vecchio pianificatore (senza prefisso di sezione).
      { path: 'pianificazione', redirectTo: 'pianificatore/pianificazione' },
      { path: 'risorse', redirectTo: 'pianificatore/risorse' },
      { path: 'risorse/:id', redirectTo: 'pianificatore/risorse/:id' },
      { path: 'anagrafiche', redirectTo: 'pianificatore/anagrafiche' },
    ],
  },
  { path: '**', redirectTo: '' },
];
