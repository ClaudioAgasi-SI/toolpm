import { Routes } from '@angular/router';
import { ruoloRichiesto } from '../core/accesso';
import { ComuniLayout } from './comuni-layout';
import type { DefinizioneAnagrafica } from './modelli';

const anagrafica = (definizione: DefinizioneAnagrafica) => ({
  path: definizione.percorso,
  title: `${definizione.titolo} · ToolPM`,
  data: { definizione },
  loadComponent: () => import('./anagrafica-semplice').then((m) => m.AnagraficaSemplice),
});

/** Rotte della sezione Anagrafiche (modulo Comuni), montate sotto /comuni. */
export const COMUNI_ROUTES: Routes = [
  {
    path: '',
    component: ComuniLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'progetti' },
      {
        path: 'progetti',
        title: 'Progetti · ToolPM',
        loadComponent: () => import('./progetti/progetti-elenco').then((m) => m.ProgettiElenco),
      },
      {
        path: 'progetti/:id',
        title: 'Progetto · ToolPM',
        loadComponent: () => import('./progetti/progetto-dettaglio').then((m) => m.ProgettoDettaglio),
      },
      {
        path: 'risorse',
        title: 'Risorse · ToolPM',
        loadComponent: () => import('./risorse/risorse-anagrafica').then((m) => m.RisorseAnagrafica),
      },
      {
        path: 'risorse/:id',
        title: 'Risorsa · ToolPM',
        loadComponent: () => import('./risorse/risorsa-anagrafica').then((m) => m.RisorsaAnagraficaDettaglio),
      },
      anagrafica({ percorso: 'clienti', titolo: 'Clienti', campo: 'ragioneSociale', etichettaCampo: 'Ragione sociale', permesso: 'gestireClienti' }),
      anagrafica({ percorso: 'centri-costo', titolo: 'Centri di costo', campo: 'descrizione', etichettaCampo: 'Descrizione', permesso: 'gestireCentriDiCosto' }),
      anagrafica({ percorso: 'ruoli', titolo: 'Ruoli professionali', campo: 'descrizione', etichettaCampo: 'Descrizione', permesso: 'gestireRuoli' }),
      {
        path: 'utenti',
        title: 'Utenti · ToolPM',
        canActivate: [ruoloRichiesto('admin')],
        loadComponent: () => import('./utenti/utenti').then((m) => m.Utenti),
      },
    ],
  },
];
