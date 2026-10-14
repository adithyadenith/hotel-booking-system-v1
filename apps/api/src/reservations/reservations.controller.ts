import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AuthGuard, Roles } from '../common/guards'
import { ReservationsService } from './reservations.service'

@Controller()
@UseGuards(AuthGuard)
export class ReservationsController {
  constructor(private s: ReservationsService) {}
  @Get('availability') availability(@Req() r: any, @Query('from') f: string, @Query('to') t: string) { return this.s.availability(r.hotelId, f, t) }
  @Get('calendar') calendar(@Req() r: any, @Query('from') f: string, @Query('to') t: string) { return this.s.calendar(r.hotelId, f, t) }
  @Post('quote') quote(@Req() r: any, @Body() b: unknown) { return this.s.quote(r.hotelId, b) }
  @Get('reservations') @Roles('ADMIN', 'MANAGER', 'RECEPTIONIST') list(@Req() r: any) { return this.s.list(r.hotelId) }
  @Post('reservations') @Roles('ADMIN', 'MANAGER', 'RECEPTIONIST') create(@Req() r: any, @Body() b: unknown) { return this.s.create(r.hotelId, r.user.id, b) }
  @Post('reservations/:id/:action') @Roles('ADMIN', 'MANAGER', 'RECEPTIONIST')
  act(@Req() r: any, @Param('id') id: string, @Param('action') a: string) { return this.s.transition(r.hotelId, r.user.id, id, a) }
  @Post('reservations/:id/add-ons') @Roles('ADMIN', 'MANAGER', 'RECEPTIONIST')
  addOn(@Req() r: any, @Param('id') id: string, @Body() b: unknown) { return this.s.addOn(r.hotelId, r.user.id, id, b) }
}
