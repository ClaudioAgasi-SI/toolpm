import { nomeDaIntestazione } from './pulsante-scarica';

describe('scarica: nome del file', () => {
  it('dal Content-Disposition, altrimenti il ripiego', () => {
    expect(nomeDaIntestazione('attachment; filename="toolpm-report-costi-2026-11-25-provvisorio.xlsx"', 'x')).toBe('toolpm-report-costi-2026-11-25-provvisorio.xlsx');
    expect(nomeDaIntestazione(null, 'toolpm.csv')).toBe('toolpm.csv');
  });
});
