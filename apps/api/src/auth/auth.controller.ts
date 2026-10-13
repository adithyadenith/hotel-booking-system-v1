import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Throttle } from '@nestjs/throttler'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '../reservations/reservations.service'

@Controller('auth')
export class AuthController {
  constructor(private jwt: JwtService) {}
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // brute-force protection
  @Post('login')
  async login(@Body() body: unknown) {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(body)
    const user = await db.user.findUnique({ where: { email }, include: { memberships: { include: { hotel: true } } } })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException('Invalid credentials')
    const memberships = user.memberships.map(m => ({ hotelId: m.hotelId, role: m.role, hotelName: m.hotel.name }))
    return { token: this.jwt.sign({ sub: user.id, memberships }), user: { name: user.name, email }, memberships, isPlatformAdmin: user.isPlatformAdmin }
  }
}
