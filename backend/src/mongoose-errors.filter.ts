import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import mongoose from 'mongoose';
import type { Response } from 'express';

/**
 * Trasforma gli errori di Mongoose e MongoDB in risposte leggibili:
 * validazione e valori non validi → 400; chiave duplicata (indice unico) → 409.
 */
@Catch(mongoose.Error.ValidationError, mongoose.Error.CastError, mongoose.mongo.MongoServerError)
export class MongooseErrorsFilter implements ExceptionFilter {
  catch(err: mongoose.Error.ValidationError | mongoose.Error.CastError | mongoose.mongo.MongoServerError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (err instanceof mongoose.mongo.MongoServerError) {
      if (err.code === 11000) {
        const campi = Object.keys((err as { keyValue?: Record<string, unknown> }).keyValue ?? {});
        res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          error: 'Valore già usato',
          message: [`${campi.join(', ') || 'valore'}: esiste già un elemento con lo stesso valore`],
        });
        return;
      }
      if (err.code === 121) {
        res.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Dati non validi',
          message: ['Il documento non rispetta lo schema della collection ($jsonSchema)'],
        });
        return;
      }
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Errore del database',
        message: [err.message],
      });
      return;
    }
    const dettagli =
      err instanceof mongoose.Error.ValidationError
        ? Object.values(err.errors).map((e) => `${e.path}: ${e.message}`)
        : [`${err.path}: valore non valido (${String(err.value)})`];
    res.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Dati non validi',
      message: dettagli,
    });
  }
}
