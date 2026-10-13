import { CanActivate, ExecutionContext, Injectable, SetMetadata, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { db } from '../reservations/reservations.service'

export const Roles = (...r: string[]) => SetMetadata('roles', r)

/** Verifies the JWT, then resolves hotel + role from its memberships (the client never supplies a role). Suspended hotels are locked out. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest()
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    let payload: any
    try { payload = this.jwt.verify(token) } catch { throw new UnauthorizedException() }
    const hotelId = req.headers['x-hotel-id'] as string
    const m = (payload.memberships || []).find((x: any) => x.hotelId === hotelId)
    if (!m) throw new ForbiddenException('No access to this hotel')
    const hotel = await db.hotel.findUnique({ where: { id: hotelId }, select: { suspendedAt: true } })
    if (!hotel || hotel.suspendedAt) throw new ForbiddenException('This hotel account is suspended')
    req.user = { id: payload.sub, support: !!payload.support }; req.hotelId = hotelId; req.role = m.role
    const allowed = this.reflector.getAllAndOverride<string[]>('roles', [ctx.getHandler(), ctx.getClass()])
    if (allowed && !allowed.includes(m.role)) throw new ForbiddenException('Insufficient role')
    return true
  }
}
