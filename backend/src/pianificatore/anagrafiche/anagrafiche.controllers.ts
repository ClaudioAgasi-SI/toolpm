import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import type { Model } from 'mongoose';
import { Permesso } from '../../auth/decoratori.js';
import { Certificazione, Rate, Skill } from './anagrafiche.schema.js';
import { CrudService } from './crud.service.js';

@Injectable()
export class SkillsService extends CrudService<Skill> {
  constructor(@InjectModel(Skill.name) model: Model<Skill>) {
    super(model, { skillType: 1, skillName: 1 });
  }
}

@Injectable()
export class CertificazioniService extends CrudService<Certificazione> {
  constructor(@InjectModel(Certificazione.name) model: Model<Certificazione>) {
    super(model, { certType: 1, certName: 1 });
  }
}

@Injectable()
export class RateService extends CrudService<Rate> {
  constructor(@InjectModel(Rate.name) model: Model<Rate>) {
    super(model, { rateType: 1 });
  }

  override async create(data: Partial<Rate>) {
    const pulita = await this.valida(data);
    return super.create(pulita);
  }

  override async update(id: string, data: Partial<Rate>) {
    const pulita = await this.valida(data, id);
    return super.update(id, pulita);
  }

  /** Nome della scala obbligatorio e univoco; valori non vuoti e senza duplicati. */
  private async valida(data: Partial<Rate>, id?: string): Promise<Partial<Rate>> {
    const rateType = data.rateType?.trim();
    if (!rateType) throw new BadRequestException('Il nome della scala è obbligatorio');
    const rate = (data.rate ?? []).map((v) => String(v).trim()).filter(Boolean);
    const doppi = rate.filter((v, i) => rate.findIndex((x) => x.toLowerCase() === v.toLowerCase()) !== i);
    if (doppi.length) throw new BadRequestException(`Valori ripetuti nella scala: ${doppi.join(', ')}`);
    const esistente = await this.model.findOne({ rateType }).lean().exec();
    if (esistente && String(esistente._id) !== id) {
      throw new BadRequestException(`Esiste già una scala "${rateType}"`);
    }
    return { rateType, rate };
  }
}

type Classe = new (...args: never[]) => object;

/** Variante del modello con l'_id MongoDB, per documentare le risposte. */
function conId(Modello: Classe): Classe {
  class ConId extends (Modello as new () => object) {
    @ApiProperty({ example: '6ae88b192fcc045f0ca48409' })
    _id: string;
  }
  Object.defineProperty(ConId, 'name', { value: `${Modello.name}ConId` });
  return ConId;
}

/** Chi può modificare le anagrafiche del Pianificatore (blocco B5). */
const SCRITTURA =
  'PM e PMSenior (permesso gestireCaratteristicheTutteLeRisorse).';

/** Crea un controller CRUD standard (con documentazione Swagger) per un percorso e un servizio. */
function crudController<T>(
  path: string,
  ServiceClass: new (...args: never[]) => CrudService<T>,
  Modello: Classe,
  nome: string,
  noteValidazione = 'Dati non validi',
) {
  const Risposta = conId(Modello);

  @ApiTags(path)
  @Controller(path)
  class GeneratedController {
    constructor(readonly service: CrudService<T>) {}

    @Get()
    @ApiOperation({ summary: `Elenco ${nome}` })
    @ApiOkResponse({ type: [Risposta] })
    findAll() {
      return this.service.findAll();
    }

    @Post()
    @Permesso('gestireCaratteristicheTutteLeRisorse')
    @ApiOperation({ summary: `Crea un elemento in ${nome}`, description: SCRITTURA })
    @ApiBody({ type: Modello })
    @ApiCreatedResponse({ type: Risposta })
    @ApiBadRequestResponse({ description: noteValidazione })
    create(@Body() body: Partial<T>) {
      return this.service.create(body);
    }

    @Put(':id')
    @Permesso('gestireCaratteristicheTutteLeRisorse')
    @ApiOperation({ summary: `Modifica un elemento di ${nome}`, description: SCRITTURA })
    @ApiParam({ name: 'id', description: 'ObjectId MongoDB' })
    @ApiBody({ type: Modello })
    @ApiOkResponse({ type: Risposta })
    @ApiBadRequestResponse({ description: noteValidazione })
    @ApiNotFoundResponse({ description: 'Elemento non trovato' })
    update(@Param('id') id: string, @Body() body: Partial<T>) {
      return this.service.update(id, body);
    }

    @Delete(':id')
    @Permesso('gestireCaratteristicheTutteLeRisorse')
    @ApiOperation({ summary: `Elimina un elemento di ${nome}`, description: SCRITTURA })
    @ApiParam({ name: 'id', description: 'ObjectId MongoDB' })
    @ApiOkResponse({ schema: { example: { deleted: true } } })
    @ApiNotFoundResponse({ description: 'Elemento non trovato' })
    remove(@Param('id') id: string) {
      return this.service.remove(id);
    }
  }
  // Nest risolve la dipendenza del costruttore dalla classe del servizio concreto.
  Reflect.defineMetadata('design:paramtypes', [ServiceClass], GeneratedController);
  Object.defineProperty(GeneratedController, 'name', { value: `${Modello.name}Controller` });
  return GeneratedController;
}

export const SkillsController = crudController('skills', SkillsService, Skill, 'anagrafica skill');
export const CertificazioniController = crudController(
  'certificazioni',
  CertificazioniService,
  Certificazione,
  'anagrafica certificazioni',
);
export const RateController = crudController(
  'rate',
  RateService,
  Rate,
  'scale di valutazione',
  'Nome mancante o già esistente, oppure valori ripetuti',
);
