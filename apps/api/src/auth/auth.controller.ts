import { BadRequestException, Body, Controller, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Throttle } from '@nestjs/throttler'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '../reservations/reservations.service'
import { AuthGuard } from '../common/guards'

const PasswordChange = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10).max(128) })
const ProfileChange = z.object({ name: z.string().trim().min(2).max(80) })

@Controller('auth')
export class AuthController {
  constructor(private jwt: JwtService) {}
  @Throttle({ default: { limit: Number(process.env.AUTH_LOGIN_THROTTLE_LIMIT || 10), ttl: 60000 } }) // per account + network brute-force protection
  @Post('login')
  async login(@Body() body: unknown) {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(body)
    const user = await db.user.findUnique({ where: { email }, include: { memberships: { include: { hotel: true } } } })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException('Invalid credentials')
    const memberships = user.memberships.map(m => ({ hotelId: m.hotelId, role: m.role, hotelName: m.hotel.name }))
    return { token: this.jwt.sign({ sub: user.id, memberships }), user: { id: user.id, name: user.name, email }, memberships, isPlatformAdmin: user.isPlatformAdmin }
  }

  /** Staff can change their own password without an administrator handling it. */
  @Post('change-password')
  @UseGuards(AuthGuard)
  async changePassword(@Req() req: any, @Body() body: unknown) {
    const dto = PasswordChange.parse(body)
    if (dto.currentPassword === dto.newPassword) throw new BadRequestException('Choose a new password that is different from your current password')
    const user = await db.user.findUnique({ where: { id: req.user.id } })
    if (!user || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) throw new UnauthorizedException('Your current password is incorrect')
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(dto.newPassword, 12) } })
    await db.auditLog.create({ data: { hotelId: req.hotelId, userId: user.id, action: 'PASSWORD_CHANGED', entity: 'User', entityId: user.id } })
    return { ok: true }
  }

  @Patch('profile')
  @UseGuards(AuthGuard)
  async profile(@Req() req: any, @Body() body: unknown) {
    const dto = ProfileChange.parse(body)
    const user = await db.user.update({ where: { id: req.user.id }, data: { name: dto.name }, select: { name: true, email: true } })
    await db.auditLog.create({ data: { hotelId: req.hotelId, userId: req.user.id, action: 'PROFILE_UPDATED', entity: 'User', entityId: req.user.id } })
    return user
  }
}
