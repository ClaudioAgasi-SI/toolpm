import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Anagrafiche } from '../anagrafiche.js';
import { Risorsa } from '../schemi/risorsa.schema.js';
import { type Corpo, controllaDate, corpo, data, email, idRotta, numero, objectId, presente, testo } from '../validazione.js';

/** Campi anagrafici restituiti da /api/comuni/risorse (skill e allocazioni restano al Pianificatore). */
const PROIEZIONE = {
  cognome: 1,
  nome: 1,
  email: 1,
  cellulare: 1,
  matricola: 1,
  dataIngresso: 1,
  dataUscita: 1,
  oreContrattualiGiorno: 1,
  storicoRuoli: 1,
  creatoIl: 1,
  creatoDa: 1,
  modificatoIl: 1,
  modificatoDa: 1,
};

/**
 * Anagrafica delle risorse (fase 1, blocco B4): dati della persona, ruolo professionale con lo storico,
 * orario contrattuale. Creazione e modifica: PM e PMSenior (permesso gestireRisorse, sul controller).
 * Le risorse non si cancellano qui: si imposta la data di uscita.
 */
@Injectable()
export class RisorseComuniService {
  constructor(
    @InjectModel(Risorsa.name) private readonly model: Model<Risorsa>,
    private readonly anagrafiche: Anagrafiche,
  ) {}

  elenco(soloAttive: boolean) {
    const oggi = new Date();
    const filtro = soloAttive ? { $or: [{ dataUscita: { $exists: false } }, { dataUscita: null }, { dataUscita: { $gte: oggi } }] } : {};
    return this.model.find(filtro, PROIEZIONE).sort({ cognome: 1, nome: 1 }).lean().exec();
  }

  async dettaglio(id: string) {
    const _id = idRotta(id);
    const doc = _id ? await this.model.findById(_id, PROIEZIONE).lean().exec() : null;
    if (!doc) throw new NotFoundException(`Risorsa ${id} non trovata`);
    return doc;
  }

  async crea(body: unknown) {
    const c = corpo(body);
    const dati: Record<string, unknown> = {
      cognome: testo(c.cognome, 'cognome', { obbligatorio: true, max: 100 }),
      nome: testo(c.nome, 'nome', { obbligatorio: true, max: 100 }),
      email: email(c.email, 'email', true),
      ...(await this.campiFacoltativi(c)),
    };
    controllaDate(dati.dataIngresso as Date | undefined, dati.dataUscita as Date | undefined);
    await this.emailLibera(dati.email as string);
    const creata = await this.model.create(dati);
    return this.dettaglio(String(creata._id));
  }

  async modifica(id: string, body: unknown) {
    const c = corpo(body);
    const attuale = await this.dettaglio(id);
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};
    if (presente(c, 'cognome')) $set.cognome = testo(c.cognome, 'cognome', { obbligatorio: true, max: 100 });
    if (presente(c, 'nome')) $set.nome = testo(c.nome, 'nome', { obbligatorio: true, max: 100 });
    if (presente(c, 'email')) {
      $set.email = email(c.email, 'email', true);
      if ($set.email !== attuale.email) await this.emailLibera($set.email as string);
    }
    for (const [campo, valore] of Object.entries(await this.campiFacoltativi(c))) {
      if (valore === undefined) $unset[campo] = 1;
      else $set[campo] = valore;
    }
    const inizio = presente(c, 'dataIngresso') ? ($set.dataIngresso as Date | undefined) : attuale.dataIngresso;
    const fine = presente(c, 'dataUscita') ? ($set.dataUscita as Date | undefined) : attuale.dataUscita;
    controllaDate(inizio, fine);
    await this.model
      .updateOne({ _id: attuale._id }, { $set, ...(Object.keys($unset).length ? { $unset } : {}) }, { runValidators: true })
      .exec();
    return this.dettaglio(id);
  }

  /** Campi facoltativi presenti nel corpo; undefined = da svuotare. */
  private async campiFacoltativi(c: Corpo) {
    const f: Record<string, unknown> = {};
    if (presente(c, 'cellulare')) f.cellulare = testo(c.cellulare, 'cellulare', { max: 30 });
    if (presente(c, 'matricola')) f.matricola = testo(c.matricola, 'matricola', { max: 30 });
    if (presente(c, 'dataIngresso')) f.dataIngresso = data(c.dataIngresso, 'dataIngresso');
    if (presente(c, 'dataUscita')) f.dataUscita = data(c.dataUscita, 'dataUscita');
    if (presente(c, 'oreContrattualiGiorno')) {
      f.oreContrattualiGiorno = numero(c.oreContrattualiGiorno, 'oreContrattualiGiorno', { min: 0, max: 24 });
    }
    if (presente(c, 'storicoRuoli')) f.storicoRuoli = await this.storicoRuoli(c.storicoRuoli);
    return f;
  }

  /** Storico dei ruoli: ruoli esistenti, una sola voce per data, ordinato dalla più vecchia. */
  private async storicoRuoli(valore: unknown) {
    if (valore === null) return [];
    if (!Array.isArray(valore)) throw new BadRequestException('storicoRuoli: deve essere un elenco');
    const voci = valore.map((v: Corpo, i) => ({
      ruoloId: objectId(v?.ruoloId, `storicoRuoli[${i}].ruoloId`, true),
      dal: data(v?.dal, `storicoRuoli[${i}].dal`, true) as Date,
    }));
    const date = voci.map((v) => v.dal.getTime());
    if (new Set(date).size !== date.length) throw new BadRequestException('storicoRuoli: due ruoli con la stessa data di decorrenza');
    for (const [i, v] of voci.entries()) await this.anagrafiche.ruoli.verificaEsiste(v.ruoloId, `storicoRuoli[${i}].ruoloId`);
    return voci.sort((a, b) => a.dal.getTime() - b.dal.getTime());
  }

  private async emailLibera(valore: string) {
    if (await this.model.exists({ email: valore })) throw new ConflictException(`Esiste già una risorsa con email ${valore}`);
  }
}
