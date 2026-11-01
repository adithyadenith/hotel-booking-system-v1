import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

/**
 * Login attempts must be limited per account as well as per network.
 * A shared hotel Wi-Fi network should never lock out every staff member
 * because one person mistyped a password.
 */
@Injectable()
export class HotelThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const path = req.path || req.originalUrl || ''
    const email = String(req.body?.email || '').trim().toLowerCase()
    if (req.method === 'POST' && path.startsWith('/auth/login') && email) {
      return `${req.ip || req.socket?.remoteAddress || 'unknown'}:login:${email}`
    }
    return super.getTracker(req)
  }
}
