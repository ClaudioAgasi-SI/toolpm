import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  type Type,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { ApiBody, ApiConflictResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Model } from 'mongoose';
import { Permesso } from '../auth/decoratori.js';
import type { PermessoGlobale } from '../permessi/regole.js';
import { CentroCosto, Cliente, Ruolo } from './schemi/anagrafiche.schema.js';
import { booleano, codice, corpo, idRotta, presente, testo } from './validazione.js';

/**
 * Anagrafiche semplici del modulo Comuni (codice univoco, un campo descrittivo, attivo):
 * clienti, centri di costo, ruoli professionali. Non si cancellano: si disattivano.
 * Il codice non si modifica dopo la creazione (è il riferimento per le integrazioni).
 */
interface Definizione {
  percorso: string;
  modello: string;
  etichetta: string;
  campo: 'ragioneSociale' | 'descrizione';
  permesso: PermessoGlobale;
  esempio: Record<string, unknown>;
}

interface Voce {
  codice: string;
  attivo: boolean;
  [campo: string]: unknown;
}

export class AnagraficaService {
  constructor(
    private readonly model: Model<Voce>,
    private readonly def: Definizione,
  ) {}

  elenco(soloAttivi: boolean) {
    return this.model
      .find(soloAttivi ? { attivo: true } : {})
      .sort({ codice: 1 })
      .lean()
      .exec();
  }

  async dettaglio(id: string) {
    const _id = idRotta(id);
    const doc = _id ? await this.model.findById(_id).lean().exec() : null;
    if (!doc) throw new NotFoundException(`${this.def.etichetta} ${id} non trovato`);
    return doc;
  }

  async crea(body: unknown) {
    const c = corpo(body);
    const dati = {
      codice: codice(c.codice),
      [this.def.campo]: testo(c[this.def.campo], this.def.campo, { obbligatorio: true, max: 200 }),
      attivo: booleano(c.attivo, 'attivo') ?? true,
    };
    if (await this.model.exists({ codice: dati.codice })) {
      throw new ConflictException(`Esiste già un ${this.def.etichetta.toLowerCase()} con codice ${dati.codice}`);
    }
    return (await this.model.create(dati)).toObject();
  }

  async modifica(id: string, body: unknown) {
    const c = corpo(body);
    if (presente(c, 'codice')) {
      const attuale = await this.dettaglio(id);
      if (c.codice !== attuale.codice) throw new ConflictException('Il codice non si può modificare');
    }
    const $set: Record<string, unknown> = {};
    if (presente(c, this.def.campo)) $set[this.def.campo] = testo(c[this.def.campo], this.def.campo, { obbligatorio: true, max: 200 });
    if (presente(c, 'attivo')) $set.attivo = booleano(c.attivo, 'attivo');
    const _id = idRotta(id);
    const doc = _id
      ? await this.model.findOneAndUpdate({ _id }, { $set }, { returnDocument: 'after', runValidators: true }).lean().exec()
      : null;
    if (!doc) throw new NotFoundException(`${this.def.etichetta} ${id} non trovato`);
    return doc;
  }

  /** Controlla che l'elemento esista (anche se non più attivo). */
  async verificaEsiste(id: unknown, campo: string) {
    if (!(await this.model.exists({ _id: id }))) throw new NotFoundException(`${campo}: ${this.def.etichetta.toLowerCase()} inesistente`);
  }

  /** Controlla che l'elemento esista ed è attivo (per i riferimenti da progetti e risorse). */
  async verificaAttivo(id: unknown, campo: string) {
    const doc = await this.model.findById(id).lean().exec();
    if (!doc) throw new NotFoundException(`${campo}: ${this.def.etichetta.toLowerCase()} inesistente`);
    if (!doc.attivo) throw new ConflictException(`${campo}: ${this.def.etichetta.toLowerCase()} ${doc.codice} non attivo`);
    return doc;
  }
}

/** Crea servizio e controller di un'anagrafica semplice. */
function anagrafica(def: Definizione) {
  const TOKEN = `Anagrafica:${def.percorso}`;

  @ApiTags('comuni')
  @Controller(def.percorso)
  class AnagraficaController {
    constructor(@Inject(TOKEN) readonly service: AnagraficaService) {}

    @Get()
    @Permesso()
    @ApiOperation({ summary: `Elenco: ${def.percorso}` })
    @ApiQuery({ name: 'attivi', required: false, description: 'true = solo gli attivi' })
    elenco(@Query('attivi') attivi?: string) {
      return this.service.elenco(attivi === 'true');
    }

    @Get(':id')
    @Permesso()
    @ApiOperation({ summary: `Dettaglio: ${def.percorso}` })
    dettaglio(@Param('id') id: string) {
      return this.service.dettaglio(id);
    }

    @Post()
    @Permesso(def.permesso)
    @ApiOperation({ summary: `Crea (permesso ${def.permesso})` })
    @ApiBody({ schema: { example: def.esempio } })
    @ApiConflictResponse({ description: 'Codice già usato' })
    crea(@Body() body: unknown) {
      return this.service.crea(body);
    }

    @Put(':id')
    @Permesso(def.permesso)
    @ApiOperation({ summary: `Modifica descrizione e stato attivo (permesso ${def.permesso}); il codice non cambia` })
    @ApiBody({ schema: { example: { [def.campo]: def.esempio[def.campo], attivo: false } } })
    modifica(@Param('id') id: string, @Body() body: unknown) {
      return this.service.modifica(id, body);
    }
  }
  Object.defineProperty(AnagraficaController, 'name', { value: `${def.modello}Controller` });

  const provider = {
    provide: TOKEN,
    inject: [getModelToken(def.modello)],
    useFactory: (model: Model<Voce>) => new AnagraficaService(model, def),
  };
  return { controller: AnagraficaController as Type<unknown>, provider, TOKEN };
}

export const CLIENTI = anagrafica({
  percorso: 'clienti',
  modello: Cliente.name,
  etichetta: 'Cliente',
  campo: 'ragioneSociale',
  permesso: 'gestireClienti',
  esempio: { codice: 'TIM', ragioneSociale: 'Telecom Italia S.p.A.' },
});

export const CENTRI_COSTO = anagrafica({
  percorso: 'centri-costo',
  modello: CentroCosto.name,
  etichetta: 'Centro di costo',
  campo: 'descrizione',
  permesso: 'gestireCentriDiCosto',
  esempio: { codice: 'CDC-SVIL', descrizione: 'Sviluppo prodotti' },
});

export const RUOLI = anagrafica({
  percorso: 'ruoli',
  modello: Ruolo.name,
  etichetta: 'Ruolo',
  campo: 'descrizione',
  permesso: 'gestireRuoli',
  esempio: { codice: 'SVIL-SR', descrizione: 'Sviluppatore senior' },
});

/** Servizi delle anagrafiche, per gli altri servizi del modulo (controllo dei riferimenti). */
@Injectable()
export class Anagrafiche {
  constructor(
    @Inject(CLIENTI.TOKEN) readonly clienti: AnagraficaService,
    @Inject(CENTRI_COSTO.TOKEN) readonly centriCosto: AnagraficaService,
    @Inject(RUOLI.TOKEN) readonly ruoli: AnagraficaService,
  ) {}
}
