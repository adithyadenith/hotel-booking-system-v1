import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AuthController } from './auth/auth.controller'
import { ReservationsController } from './reservations/reservations.controller'
import { PaymentsController } from './payments/payments.controller'
import { PaymentsService } from './payments/payments.service'
import { NotificationsController } from './notifications/notifications.controller'
import { NotificationsService } from './notifications/notifications.service'
import { HousekeepingController } from './housekeeping/housekeeping.controller'
import { GuestsController } from './guests/guests.controller'
import { ReportsController } from './reports/reports.controller'
import { PublicController, WidgetAdminController } from './public/public.controller'
import { PublicService } from './public/public.service'
import { AdminController } from './admin/admin.controller'
import { PlatformController } from './platform/platform.controller'
import { ReservationsService } from './reservations/reservations.service'
import { DeliveryService } from './notifications/delivery.service'
import { DeliveryController } from './notifications/delivery.controller'
import { AuditController } from './audit/audit.controller'
import { SearchController } from './search/search.controller'
import { AddOnsController } from './add-ons/add-ons.controller'

@Module({
  imports: [JwtModule.register({ global: true, secret: process.env.JWT_SECRET!, signOptions: { expiresIn: '12h' } }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
  controllers: [AuthController, ReservationsController, PaymentsController, NotificationsController, DeliveryController, HousekeepingController, GuestsController, ReportsController, PublicController, WidgetAdminController, AdminController, PlatformController, AuditController, SearchController, AddOnsController],
  providers: [ReservationsService, PaymentsService, NotificationsService, PublicService, DeliveryService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
