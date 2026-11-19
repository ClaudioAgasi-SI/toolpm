/** Messaggio leggibile da un errore HTTP del backend. */
export function messaggioErrore(err: unknown): string {
  const e = err as { error?: { message?: string | string[] }; message?: string; status?: number };
  if (e?.status === 0) return 'Backend non raggiungibile.';
  if (e?.status === 403 && !e.error?.message) return 'Non hai il permesso per questa operazione.';
  const m = e?.error?.message ?? e?.message ?? 'Errore sconosciuto';
  return Array.isArray(m) ? m.join('; ') : m;
}
