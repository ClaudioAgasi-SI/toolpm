import { Routes } from '@angular/router';
import { permessoRichiesto } from '../core/accesso';

/**
 * Rotte della sezione Offerte e preventivi (fase 5), montate sotto /offerte.
 * F0: pagina iniziale; F1: listino di vendita (/offerte/listino), offerte e stima (F2), ciclo di vita (F3), progetto (F4), pipeline ed esportazioni (F5).
 */
export const OFFERTE_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Offerte · ToolPM',
    canActivate: [permessoRichiesto('vedereOfferte')],
    loadComponent: () => import('./offerte-inizio').then((m) => m.OfferteInizio),
  },
  {
    path: 'listino',
    title: 'Listino di vendita · ToolPM',
    canActivate: [permessoRichiesto('vedereListino')],
    loadComponent: () => import('./listino').then((m) => m.Listino),
  },
];
