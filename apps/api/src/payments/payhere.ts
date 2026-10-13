import { createHash } from 'crypto'
import { unseal } from '../common/secrets'

export const payHereAmount = (cents: number) => (cents / 100).toFixed(2)
export const payHereHash = (merchantId: string, orderId: string, amount: string, currency: string, merchantSecret: string) =>
  createHash('md5').update(merchantId + orderId + amount + currency + createHash('md5').update(merchantSecret).digest('hex').toUpperCase()).digest('hex').toUpperCase()
export const payHereNotifyHash = (merchantId: string, orderId: string, amount: string, currency: string, statusCode: string, merchantSecret: string) =>
  createHash('md5').update(merchantId + orderId + amount + currency + statusCode + createHash('md5').update(merchantSecret).digest('hex').toUpperCase()).digest('hex').toUpperCase()

export function payHereCheckout(config: { merchantId?: string | null; merchantSecretCiphertext?: string | null; environment: string }, input: { orderId: string; amount: number; currency: string; name: string; email: string; phone: string; notifyUrl: string; returnUrl: string; cancelUrl: string }) {
  if (!config.merchantId || !config.merchantSecretCiphertext) throw new Error('PayHere merchant credentials are not configured')
  const secret = unseal(config.merchantSecretCiphertext)
  if (!secret) throw new Error('PayHere merchant secret is unavailable')
  const [firstName, ...last] = input.name.trim().split(/\s+/)
  const amount = payHereAmount(input.amount)
  return {
    action: config.environment === 'LIVE' ? 'https://www.payhere.lk/pay/checkout' : 'https://sandbox.payhere.lk/pay/checkout',
    fields: { merchant_id: config.merchantId, return_url: input.returnUrl, cancel_url: input.cancelUrl, notify_url: input.notifyUrl,
      first_name: firstName, last_name: last.join(' ') || firstName, email: input.email, phone: input.phone || '0000000000', address: 'Hotel booking', city: 'Sri Lanka', country: 'Sri Lanka',
      order_id: input.orderId, items: `Hotel reservation ${input.orderId}`, currency: input.currency, amount, hash: payHereHash(config.merchantId, input.orderId, amount, input.currency, secret) }
  }
}
