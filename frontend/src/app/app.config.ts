import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { interceptor401 } from './core/accesso';
import { SessioneService } from './core/sessione.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Il cookie di accesso viaggia da solo (stessa origine); le risposte 401 riportano alla pagina di accesso.
    provideHttpClient(withInterceptors([interceptor401])),
    // I parametri di rotta (es. :id) arrivano ai componenti come input.
    provideRouter(routes, withComponentInputBinding()),
    // Prima di mostrare qualsiasi pagina si legge chi ha fatto l'accesso.
    provideAppInitializer(() => inject(SessioneService).carica()),
  ],
};
