import { BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'

/** Nightly rate per night in minor units. Priority: SPECIAL > SEASON > WEEKEND (Fri/Sat nights). Multipliers in basis points. */
export async function nightlyRates(tx: Prisma.TransactionClient, hotelId: string, rt: { id: string; baseRate: number }, nights: Date[]) {
  const rules = await tx.rateRule.findMany({ where: { hotelId, active: true, OR: [{ roomTypeId: null }, { roomTypeId: rt.id }] } })
  const rank: Record<string, number> = { SPECIAL: 3, SEASON: 2, WEEKEND: 1 }
  return nights.map(n => {
    const hits = rules.filter(r => r.type === 'WEEKEND' ? [5, 6].includes(n.getUTCDay())
      : r.startDate && r.endDate && r.startDate <= n && n <= r.endDate)
    hits.sort((a, b) => rank[b.type] - rank[a.type] || b.multiplierBp - a.multiplierBp)
    return Math.round(rt.baseRate * (hits[0]?.multiplierBp ?? 10000) / 10000)
  })
}

export async function promoDiscount(tx: Prisma.TransactionClient, hotelId: string, code: string, subtotal: number) {
  const p = await tx.promoCode.findFirst({ where: { hotelId, code: code.toUpperCase(), active: true } })
  const now = new Date()
  if (!p || (p.validFrom && p.validFrom > now) || (p.validTo && p.validTo < now)) throw new BadRequestException('Invalid or expired promo code')
  return Math.round(subtotal * p.percentOff / 100)
}
