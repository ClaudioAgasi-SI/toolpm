import { Routes } from '@angular/router';

/**
 * Rotte di primo livello: una per sezione del prodotto.
 * Ogni sezione ha il proprio file di rotte, caricato a richiesta.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'ToolPM',
    loadComponent: () => import('./home/home').then((m) => m.Home),
  },
  {
    path: 'pianificatore',
    loadChildren: () => import('./pianificatore/pianificatore.routes').then((m) => m.PIANIFICATORE_ROUTES),
  },
  // Indirizzi del vecchio pianificatore (senza prefisso di sezione).
  { path: 'pianificazione', redirectTo: 'pianificatore/pianificazione' },
  { path: 'risorse', redirectTo: 'pianificatore/risorse' },
  { path: 'risorse/:id', redirectTo: 'pianificatore/risorse/:id' },
  { path: 'anagrafiche', redirectTo: 'pianificatore/anagrafiche' },
  { path: '**', redirectTo: '' },
];
