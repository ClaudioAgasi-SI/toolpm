import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { type ActivatedRouteSnapshot, provideRouter, Router, type RouterStateSnapshot, UrlTree } from '@angular/router';
import { accessoRichiesto, interceptor401, permessoRichiesto } from './accesso';
import { messaggioErrore } from './errori';
import { SessioneService, type UtenteSessione } from './sessione.service';

const UTENTE: UtenteSessione = {
  id: 'u1',
  email: 'tullio@azienda.it',
  abilitazione: 'TL',
  ruoli: ['risorsa'],
  deveCambiarePassword: false,
  permessi: { creareProgetto: true },
};

describe('accesso', () => {
  let sessione: SessioneService;
  let router: Router;
  const stato = (url: string) => ({ url }) as RouterStateSnapshot;
  const rotta = {} as ActivatedRouteSnapshot;
  const esegui = (guard: typeof accessoRichiesto, url = '/comuni/progetti') =>
    TestBed.runInInjectionContext(() => guard(rotta, stato(url)));

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([interceptor401])), provideHttpClientTesting()],
    });
    sessione = TestBed.inject(SessioneService);
    router = TestBed.inject(Router);
  });

  it('senza accesso porta alla pagina di accesso, ricordando la pagina richiesta', () => {
    const esito = esegui(accessoRichiesto) as UrlTree;
    expect(router.serializeUrl(esito)).toBe('/accesso?ritorno=%2Fcomuni%2Fprogetti');
  });

  it('con una password provvisoria porta al cambio password', () => {
    sessione.utente.set({ ...UTENTE, deveCambiarePassword: true });
    expect(router.serializeUrl(esegui(accessoRichiesto) as UrlTree)).toBe('/cambia-password');
    expect(esegui(accessoRichiesto, '/cambia-password')).toBe(true);
  });

  it('con accesso e permesso lascia passare; senza permesso torna alla home', () => {
    sessione.utente.set(UTENTE);
    expect(esegui(accessoRichiesto)).toBe(true);
    expect(esegui(permessoRichiesto('creareProgetto'))).toBe(true);
    expect(router.serializeUrl(esegui(permessoRichiesto('gestireClienti')) as UrlTree)).toBe('/');
  });

  it('una risposta 401 delle API chiude la sessione e porta alla pagina di accesso', () => {
    sessione.utente.set(UTENTE);
    const naviga = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    TestBed.inject(HttpClient).get('/api/comuni/progetti').subscribe({ error: () => undefined });
    TestBed.inject(HttpTestingController).expectOne('/api/comuni/progetti').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(sessione.utente()).toBeNull();
    expect(naviga).toHaveBeenCalledWith(['/accesso'], expect.anything());
  });

  it('il 401 del login non chiude la sessione (lo gestisce la pagina di accesso)', () => {
    const naviga = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    TestBed.inject(HttpClient).post('/api/auth/login', {}).subscribe({ error: () => undefined });
    TestBed.inject(HttpTestingController).expectOne('/api/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(naviga).not.toHaveBeenCalled();
  });

  it('messaggi di errore leggibili', () => {
    expect(messaggioErrore({ status: 0 })).toBe('Backend non raggiungibile.');
    expect(messaggioErrore({ status: 400, error: { message: ['a', 'b'] } })).toBe('a; b');
    expect(messaggioErrore({ status: 403, error: {} })).toBe('Non hai il permesso per questa operazione.');
  });
});
