import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import mongoose from 'mongoose';
import type { Response } from 'express';

/** Trasforma gli errori di validazione di Mongoose in risposte 400 leggibili. */
@Catch(mongoose.Error.ValidationError, mongoose.Error.CastError)
export class MongooseErrorsFilter implements ExceptionFilter {
  catch(err: mongoose.Error.ValidationError | mongoose.Error.CastError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
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
