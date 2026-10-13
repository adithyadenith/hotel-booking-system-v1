import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common'
import { ZodError } from 'zod'
@Catch(ZodError)
export class ZodFilter implements ExceptionFilter {
  catch(e: ZodError, host: ArgumentsHost) {
    host.switchToHttp().getResponse().status(400).json({ statusCode: 400, message: e.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`) })
  }
}
