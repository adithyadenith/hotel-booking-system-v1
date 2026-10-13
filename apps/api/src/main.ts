import 'dotenv/config'
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ZodFilter } from './common/zod.filter'
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true })
  app.use(require('express').urlencoded({ extended: false }))
  app.useGlobalFilters(new ZodFilter())
  app.enableCors({ origin: true })
  await app.listen(process.env.PORT || 4000)
}
bootstrap()
