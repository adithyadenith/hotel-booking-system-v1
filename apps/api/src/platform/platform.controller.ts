import { BadRequestException, Body, CanActivate, ConflictException, Controller, ExecutionContext, ForbiddenException, Get, Injectable, NotFoundException, Param, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '../reservations/reservations.service'

/** Method89 staff only. The flag is re-read from the database on every call, never trusted from the token. */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest()
    let p: any
    try { p = this.jwt.verify((req.headers.authorization || '').replace('Bearer ', '')) } catch { throw new UnauthorizedException() }
    const u = await db.user.findUnique({ where: { id: p.sub } })
    if (!u?.isPlatformAdmin || p.support) throw new ForbiddenException()
    req.user = { id: u.id }; return true
  }
}

const Onboard = z.object({
  name: z.string().min(2).max(100), slug: z.string().regex(/^[a-z0-9-]{3,40}$/, 'lowercase letters, numbers and dashes, 3-40 chars'),
  timezone: z.string().default('Asia/Colombo'), currency: z.string().length(3).default('LKR'), taxBp: z.number().int().min(0).max(5000).default(0),
  adminName: z.string().min(1), adminEmail: z.string().email().transform(s => s.toLowerCase()), adminPassword: z.string().min(12).optional(),
})

@Controller('platform')
@UseGuards(PlatformGuard)
export class PlatformController {
  constructor(private jwt: JwtService) {}

  @Get('hotels') list() {
    return db.hotel.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { rooms: true, memberships: true, reservations: true } } } })
  }

  @Post('hotels') async onboard(@Req() r: any, @Body() b: unknown) {
    const d = Onboard.parse(b)
    try {
      return await db.$transaction(async tx => {
        const hotel = await tx.hotel.create({ data: { name: d.name, slug: d.slug, timezone: d.timezone, currency: d.currency, taxBp: d.taxBp } })
        let u = await tx.user.findUnique({ where: { email: d.adminEmail } })
        if (!u) {
          if (!d.adminPassword) throw new BadRequestException('A password (min 12 characters) is required for a new administrator')
          u = await tx.user.create({ data: { email: d.adminEmail, name: d.adminName, passwordHash: await bcrypt.hash(d.adminPassword, 10) } })
        }
        await tx.membership.create({ data: { userId: u.id, hotelId: hotel.id, role: 'ADMIN' } })
        await tx.auditLog.create({ data: { hotelId: hotel.id, userId: r.user.id, action: 'HOTEL_ONBOARD', entity: 'Hotel', entityId: hotel.id } })
        return { id: hotel.id, slug: hotel.slug, widgetKey: hotel.widgetKey, adminEmail: u.email }
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('That slug is already taken')
      throw e
    }
  }

  @Patch('hotels/:id') async suspend(@Req() r: any, @Param('id') id: string, @Body() b: unknown) {
    const { suspended } = z.object({ suspended: z.boolean() }).parse(b)
    const x = await db.hotel.updateMany({ where: { id }, data: { suspendedAt: suspended ? new Date() : null } })
    if (!x.count) throw new NotFoundException()
    await db.auditLog.create({ data: { hotelId: id, userId: r.user.id, action: suspended ? 'HOTEL_SUSPEND' : 'HOTEL_ACTIVATE', entity: 'Hotel', entityId: id } })
    return { ok: true }
  }

  @Get('hotels/:id/audit') audit(@Param('id') id: string) { return db.auditLog.findMany({ where: { hotelId: id }, orderBy: { createdAt: 'desc' }, take: 100 }) }

  /** Time-limited (1 h) administrator access to one hotel for authorized support. Every issuance is audited. */
  @Post('hotels/:id/support-token') async support(@Req() r: any, @Param('id') id: string) {
    const h = await db.hotel.findUnique({ where: { id } })
    if (!h) throw new NotFoundException()
    await db.auditLog.create({ data: { hotelId: id, userId: r.user.id, action: 'SUPPORT_ACCESS', entity: 'Hotel', entityId: id } })
    const token = this.jwt.sign({ sub: r.user.id, support: true, memberships: [{ hotelId: id, role: 'ADMIN', hotelName: h.name }] }, { expiresIn: '1h' })
    return { token, hotelId: id, hotelName: h.name }
  }
}
