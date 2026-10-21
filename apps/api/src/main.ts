import 'dotenv/config'
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ZodFilter } from './common/zod.filter'
import { db } from './reservations/reservations.service'

function validateEnvironment() {
  if (process.env.NODE_ENV !== 'production') return
  const required = ['DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET', 'CREDENTIALS_ENCRYPTION_KEY', 'PUBLIC_API_URL', 'PUBLIC_WEB_URL', 'CORS_ORIGINS']
  const missing = required.filter(name => !process.env[name]?.trim())
  if (missing.length) throw new Error(`Missing production environment variables: ${missing.join(', ')}`)
  const weak = ['change-me', 'replace-with', 'development-only', 'dev-sandbox', 'localhost', '127.0.0.1']
  const unsafe = ['JWT_SECRET', 'CREDENTIALS_ENCRYPTION_KEY', 'PUBLIC_API_URL', 'PUBLIC_WEB_URL', 'CORS_ORIGINS']
    .filter(name => weak.some(value => (process.env[name] || '').toLowerCase().includes(value)))
  if (unsafe.length) throw new Error(`Unsafe production environment values: ${unsafe.join(', ')}`)
  if ((process.env.JWT_SECRET || '').length < 32 || (process.env.CREDENTIALS_ENCRYPTION_KEY || '').length < 32) {
    throw new Error('JWT_SECRET and CREDENTIALS_ENCRYPTION_KEY must each be at least 32 characters in production')
  }
  for (const name of ['PUBLIC_API_URL', 'PUBLIC_WEB_URL']) {
    if (!process.env[name]!.startsWith('https://')) throw new Error(`${name} must use HTTPS in production`)
  }
  if (!/[?&]sslmode=require(?:&|$)/.test(process.env.DATABASE_URL!)) throw new Error('DATABASE_URL must require TLS with sslmode=require in production')
  const origins = process.env.CORS_ORIGINS!.split(',').map(x => x.trim()).filter(Boolean)
  if (!origins.length || origins.some(x => !x.startsWith('https://'))) throw new Error('CORS_ORIGINS must contain HTTPS origins in production')
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true })
  validateEnvironment()
  app.use(require('express').urlencoded({ extended: false }))
  app.useGlobalFilters(new ZodFilter())
  const configuredOrigins = new Set([process.env.PUBLIC_WEB_URL, ...(process.env.CORS_ORIGINS || '').split(',').map(x => x.trim())].filter(Boolean))
  app.use(async (req: any, res: any, next: any) => {
    const origin = req.headers.origin as string | undefined
    if (!origin) return next()
    let allowed = configuredOrigins.has(origin)
    if (req.path.startsWith('/public/')) {
      const key = req.path.split('/')[2]
      if (key) {
        const hotel = await db.hotel.findUnique({ where: { widgetKey: key }, select: { allowedWidgetDomains: true } })
        allowed = allowed || Boolean(hotel?.allowedWidgetDomains.includes(origin))
      }
    }
    if (!allowed) {
      if (req.method === 'OPTIONS') return res.status(403).end()
      return next()
    }
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Hotel-Id, X-Idempotency-Key')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
    if (req.method === 'OPTIONS') return res.status(204).end()
    next()
  })
  await app.listen(process.env.PORT || 4000)
}
bootstrap()
