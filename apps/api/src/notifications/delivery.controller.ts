import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { AuthGuard, Roles } from '../common/guards'
import { DeliveryService } from './delivery.service'

@Controller('deliveries')
@UseGuards(AuthGuard)
@Roles('ADMIN', 'MANAGER')
export class DeliveryController {
  constructor(private s: DeliveryService) {}
  @Get() status(@Req() r: any) { return this.s.status(r.hotelId) }
  @Post(':id/retry') retry(@Req() r: any, @Param('id') id: string) { return this.s.retry(r.hotelId, id) }
}
