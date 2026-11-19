import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { type PermessoGlobale, type RuoloApplicativo, SessioneService } from './sessione.service';

/**
 * Risposte 401 delle API: l'accesso è scaduto o mancante, si torna alla pagina di accesso.
 * Fanno eccezione login e profilo, che gestiscono il 401 da soli.
 */
export const interceptor401: HttpInterceptorFn = (req, next) => {
  const sessione = inject(SessioneService);
  const router = inject(Router);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && !/\/api\/auth\/(login|me)$/.test(req.url)) {
        sessione.accessoScaduto(router.url);
      }
      return throwError(() => err);
    }),
  );
};

/** Pagine riservate a chi ha fatto l'accesso; chi ha una password provvisoria deve prima cambiarla. */
export const accessoRichiesto: CanActivateFn = (_route, state) => {
  const sessione = inject(SessioneService);
  const router = inject(Router);
  const utente = sessione.utente();
  if (!utente) return router.createUrlTree(['/accesso'], { queryParams: state.url !== '/' ? { ritorno: state.url } : {} });
  if (utente.deveCambiarePassword && !state.url.startsWith('/cambia-password')) return router.createUrlTree(['/cambia-password']);
  return true;
};

/** Pagine riservate a chi ha il permesso globale indicato. */
export const permessoRichiesto =
  (permesso: PermessoGlobale): CanActivateFn =>
  () =>
    inject(SessioneService).puo(permesso) || inject(Router).createUrlTree(['/']);

/** Pagine riservate a chi ha il ruolo applicativo indicato. */
export const ruoloRichiesto =
  (ruolo: RuoloApplicativo): CanActivateFn =>
  () =>
    inject(SessioneService).haRuolo(ruolo) || inject(Router).createUrlTree(['/']);
