import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CHIAVE_PERMESSI } from '../auth/decoratori.js';
import { ParametriController } from './parametri.controller.js';
import type { ParametriService } from './parametri.service.js';

function controller() {
  const scritti: unknown[] = [];
  const servizio = {
    elenco: async () => [{ chiave: 'oreGiorno', valore: 8 }, { chiave: 'soglieEvm', valore: {} }],
    scrivi: async (chiave: string, valore: unknown) => (scritti.push([chiave, valore]), { chiave, valore }),
  } as unknown as ParametriService;
  return { c: new ParametriController(servizio), scritti };
}

describe('ParametriController', () => {
  it('lettura con il solo accesso, modifica solo con gestireParametri (controller)', () => {
    const r = new Reflector();
    expect(r.get(CHIAVE_PERMESSI, ParametriController.prototype.elenco)).toEqual([]);
    expect(r.get(CHIAVE_PERMESSI, ParametriController.prototype.modifica)).toEqual(['gestireParametri']);
  });

  it('modifica i parametri esistenti con valori validi', async () => {
    const { c, scritti } = controller();
    await c.modifica('oreGiorno', { valore: 7 });
    await c.modifica('soglieEvm', { valore: { anticipo: 1.1, ritardo: 0.9, fortementeInRitardo: 0.8 } });
    expect(scritti).toHaveLength(2);
  });

  it('rifiuta valori non validi e chiavi sconosciute', async () => {
    const { c, scritti } = controller();
    await expect(c.modifica('oreGiorno', { valore: 0 })).rejects.toThrow(BadRequestException);
    await expect(c.modifica('oreGiorno', { valore: '8' })).rejects.toThrow(BadRequestException);
    await expect(
      c.modifica('soglieEvm', { valore: { anticipo: 0.9, ritardo: 0.95, fortementeInRitardo: 0.85 } }),
    ).rejects.toThrow('anticipo > ritardo > fortementeInRitardo');
    await expect(c.modifica('nuovoParametro', { valore: 1 })).rejects.toThrow(NotFoundException);
    expect(scritti).toHaveLength(0);
  });
});
