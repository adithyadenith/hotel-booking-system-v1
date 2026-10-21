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
  // Keep the lifecycle routes explicit. A wildcard action route here would
  // also match /reservations/:id/payments before PaymentsController sees it.
  @Post('reservations/:id/confirm') @Roles('ADMIN', 'MANAGER', 'RECEPTIONIST')
  confirm(@Req() r: any, @Param('id') id: string) { return this.s.transition(r.hotelId, r.user.id, id, 'confirm') }
  @Post('reservations/:id/check-in') @Roles('ADMIN', 'MANAGER', 'RECEPTIONIST')
  checkIn(@Req() r: any, @Param('id') id: string) { return this.s.transition(r.hotelId, r.user.id, id, 'check-in') }
  @Post('reservations/:id/check-out') @Roles('ADMIN', 'MANAGER', 'RECEPTIONIST')
  checkOut(@Req() r: any, @Param('id') id: string) { return this.s.transition(r.hotelId, r.user.id, id, 'check-out') }
  @Post('reservations/:id/cancel') @Roles('ADMIN', 'MANAGER', 'RECEPTIONIST')
  cancel(@Req() r: any, @Param('id') id: string) { return this.s.transition(r.hotelId, r.user.id, id, 'cancel') }
  @Post('reservations/:id/add-ons') @Roles('ADMIN', 'MANAGER', 'RECEPTIONIST')
  addOn(@Req() r: any, @Param('id') id: string, @Body() b: unknown) { return this.s.addOn(r.hotelId, r.user.id, id, b) }
}
