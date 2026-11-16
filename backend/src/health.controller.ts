import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Connection } from 'mongoose';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /** GET /api/health — verifica che il backend sia attivo e collegato a MongoDB. */
  @Get()
  @ApiOperation({ summary: 'Stato del backend e della connessione a MongoDB' })
  @ApiOkResponse({ schema: { example: { status: 'ok', database: 'toolpm', mongodb: 'connesso' } } })
  health() {
    return {
      status: 'ok',
      database: this.connection.name,
      mongodb: this.connection.readyState === 1 ? 'connesso' : 'non connesso',
    };
  }
}
