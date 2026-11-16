import { ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { Allocazione, SkillValutata } from '../risorse/risorsa.schema.js';

/** Classi usate solo per documentare la risposta della griglia in Swagger. */

export class AllocazioneGrigliaDto extends Allocazione {
  @ApiProperty({ example: 15, description: 'Percentuale di questa allocazione pesata per la sua probabilità' })
  pesato: number;
}

export class CellaMeseDto {
  @ApiProperty({ example: 70, description: 'Somma delle percentuali allocate nel mese' })
  totale: number;

  @ApiProperty({ example: 50, description: 'Somma delle percentuali pesate per probabilità' })
  pesato: number;

  @ApiProperty({ type: [AllocazioneGrigliaDto], description: 'Allocazioni del mese (esclusi i segnaposto)' })
  allocazioni: AllocazioneGrigliaDto[];
}

export class RigaPianificazioneDto {
  @ApiProperty({ example: '6ae88b192fcc045f0ca48409' })
  _id: string;

  @ApiProperty({ example: 'Agasi' })
  cognome: string;

  @ApiProperty({ example: 'Claudio' })
  nome: string;

  @ApiPropertyOptional({
    type: [SkillValutata],
    description: 'Solo con un filtro per skill attivo: le skill della risorsa che lo soddisfano, con il livello',
  })
  skillTrovate?: SkillValutata[];

  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: getSchemaPath(CellaMeseDto) },
    description: 'Una cella per ogni mese dell\'intervallo, con il mese (AAAAMM) come chiave',
  })
  mesi: Record<string, CellaMeseDto>;
}

export class GrigliaDto {
  @ApiProperty({ type: [String], example: ['202701', '202702', '202703'] })
  mesi: string[];

  @ApiProperty({ type: [RigaPianificazioneDto] })
  righe: RigaPianificazioneDto[];
}
