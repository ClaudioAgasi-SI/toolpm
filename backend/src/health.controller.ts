import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Connection } from 'mongoose';
import { Pubblica } from './auth/decoratori.js';

@ApiTags('health')
@Pubblica()
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * GET /api/health — verifica che il backend sia attivo e collegato a MongoDB.
   * Indica anche se MongoDB è un replica set, richiesto dalla fase 1 per le transazioni.
   */
  @Get()
  @ApiOperation({ summary: 'Stato del backend, della connessione a MongoDB e del replica set' })
  @ApiOkResponse({
    schema: { example: { status: 'ok', database: 'toolpm', mongodb: 'connesso', replicaSet: 'rs0' } },
  })
  async health() {
    const connesso = this.connection.readyState === 1;
    return {
      status: 'ok',
      database: this.connection.name,
      mongodb: connesso ? 'connesso' : 'non connesso',
      replicaSet: connesso ? await this.nomeReplicaSet() : null,
    };
  }

  /** Nome del replica set, oppure null se MongoDB è un'istanza singola o non risponde. */
  private async nomeReplicaSet(): Promise<string | null> {
    try {
      const hello = await this.connection.db!.admin().command({ hello: 1 });
      return typeof hello.setName === 'string' ? hello.setName : null;
    } catch {
      return null;
    }
  }
}
