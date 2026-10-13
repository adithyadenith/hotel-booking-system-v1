import { Body, Controller, Get, Header, Headers, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { AuthGuard, Roles } from '../common/guards'
import { PaymentsService } from './payments.service'

@Controller()
export class PaymentsController {
  constructor(private s: PaymentsService) {}
  @Post('reservations/:id/payments') @UseGuards(AuthGuard) @Roles('ADMIN', 'MANAGER', 'RECEPTIONIST')
  record(@Req() r: any, @Param('id') id: string, @Body() b: unknown) { return this.s.recordManual(r.hotelId, r.user.id, id, b) }
  @Post('reservations/:id/payments/checkout') @UseGuards(AuthGuard) @Roles('ADMIN', 'MANAGER', 'RECEPTIONIST')
  checkout(@Req() r: any, @Param('id') id: string, @Body() b: unknown) { return this.s.startCheckout(r.hotelId, id, b) }
  @Post('payments/:paymentId/refund') @UseGuards(AuthGuard) @Roles('ADMIN', 'MANAGER')
  refund(@Req() r: any, @Param('paymentId') id: string, @Body() b: unknown) { return this.s.refund(r.hotelId, r.user.id, id, b) }
  @Get('payment-gateway') @UseGuards(AuthGuard) @Roles('ADMIN', 'MANAGER')
  gateway(@Req() r: any) { return this.s.gatewayConfig(r.hotelId) }
  @Patch('payment-gateway') @UseGuards(AuthGuard) @Roles('ADMIN')
  configure(@Req() r: any, @Body() b: unknown) { return this.s.configureGateway(r.hotelId, r.user.id, b) }
  @Post('webhooks/sandbox') webhook(@Req() r: any, @Headers('x-signature') sig: string) { return this.s.applyWebhook(r.rawBody, sig) }
  @Post('webhooks/payhere') payHere(@Body() b: Record<string, string>) { return this.s.applyPayHere(b) }
  @Get('sandbox/pay/:ref') @Header('Content-Type', 'text/html') page(@Param('ref') ref: string) { return this.s.sandboxPage(ref) }
  @Post('sandbox/complete/:ref') @Header('Content-Type', 'text/html') complete(@Param('ref') ref: string) { return this.s.sandboxComplete(ref) }
  @Get('payhere/pay/:id') @Header('Content-Type', 'text/html') payHerePage(@Param('id') id: string) { return this.s.payHerePage(id) }
}
