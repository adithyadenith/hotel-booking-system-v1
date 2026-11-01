import { Controller, ForbiddenException, Get, MessageEvent, Param, Post, Query, Req, Sse, UnauthorizedException, UseGuards } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Observable } from 'rxjs'
import { filter, map } from 'rxjs/operators'
import { AuthGuard } from '../common/guards'
import { NotificationsService, bus, notificationVisibleToRole } from './notifications.service'

@Controller()
export class NotificationsController {
  constructor(private jwt: JwtService, private s: NotificationsService) {}
  /** EventSource cannot send headers, so the JWT comes in the query string and is checked against memberships. */
  @Sse('events')
  events(@Query('token') token: string, @Query('hotelId') hotelId: string): Observable<MessageEvent> {
    let p: any
    try { p = this.jwt.verify(token) } catch { throw new UnauthorizedException() }
    if (!p.memberships.some((m: any) => m.hotelId === hotelId)) throw new ForbiddenException()
    const role = p.memberships.find((m: any) => m.hotelId === hotelId)?.role
    return bus.pipe(filter(e => e.hotelId === hotelId && notificationVisibleToRole(e.data, role)), map(e => ({ data: e.data }) as MessageEvent))
  }
  @Get('notifications') @UseGuards(AuthGuard) list(@Req() r: any) { return this.s.list(r.hotelId, r.role) }
  @Post('notifications/read-all') @UseGuards(AuthGuard) readAll(@Req() r: any) { return this.s.readAll(r.hotelId, r.role) }
  @Post('notifications/:id/read') @UseGuards(AuthGuard) read(@Req() r: any, @Param('id') id: string) { return this.s.read(r.hotelId, id, r.role) }
}
