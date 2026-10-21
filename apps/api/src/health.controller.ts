import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { db } from './reservations/reservations.service'

@Controller('health')
export class HealthController {
  @Get('live') live() { return { ok: true } }

  @Get('ready')
  async ready() {
    try {
      await db.$queryRaw`SELECT 1`
      return { ok: true, database: 'up' }
    } catch {
      throw new ServiceUnavailableException({ ok: false, database: 'down' })
    }
  }
}
