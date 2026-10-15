import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
const db = new PrismaClient()
async function main() {
  const hotel = await db.hotel.upsert({ where: { slug: 'ceylon-palms' }, update: {}, create: { slug: 'ceylon-palms', name: 'Ceylon Palms Resort (DEMO)', taxBp: 1000 } })
  const specs = [['Standard', 1200000, 2, 10], ['Deluxe', 1800000, 3, 8], ['Family', 2400000, 5, 4], ['Suite', 3600000, 3, 3]] as const
  let n = 0
  for (const [name, baseRate, maxOccupancy, count] of specs) {
    const rt = await db.roomType.create({ data: { hotelId: hotel.id, name, baseRate, maxOccupancy } })
    for (let i = 0; i < count; i++) {
      n++
      await db.room.upsert({ where: { hotelId_number: { hotelId: hotel.id, number: String(100 + n) } }, update: {},
        create: { hotelId: hotel.id, roomTypeId: rt.id, number: String(100 + n), floor: Math.ceil(n / 5) } })
    }
  }
  await db.rateRule.createMany({ data: [
    { hotelId: hotel.id, name: 'Weekend (Fri/Sat nights)', type: 'WEEKEND', multiplierBp: 12000 },
    { hotelId: hotel.id, name: 'December peak season', type: 'SEASON', startDate: new Date('2026-12-15'), endDate: new Date('2027-01-05'), multiplierBp: 14000 }] })
  await db.promoCode.create({ data: { hotelId: hotel.id, code: 'WELCOME10', percentOff: 10 } })
  const extras = [
    ['Breakfast', 'Daily breakfast for every guest', 'FOOD', 'PER_NIGHT', 350000, null],
    ['Airport transfer', 'Private airport pickup or drop-off', 'TRANSPORT', 'PER_BOOKING', 500000, 3],
    ['Extra bed', 'Rollaway bed prepared in the room', 'ROOM', 'PER_NIGHT', 250000, 5],
    ['Dinner package', 'Three-course dinner package', 'FOOD', 'PER_BOOKING', 450000, 12],
    ['Laundry', 'Laundry bag and same-day service', 'SERVICE', 'PER_BOOKING', 150000, 10],
    ['Tours', 'Local sightseeing tour reservation', 'EXPERIENCE', 'PER_BOOKING', 750000, 8],
  ] as const
  for (const [name, description, category, pricingType, price, stockLimit] of extras) {
    if (!(await db.addOn.findFirst({ where: { hotelId: hotel.id, name } }))) await db.addOn.create({ data: { hotelId: hotel.id, name, description, category, pricingType, price, stockLimit } })
  }
  const packages = [
    ['Bed & Breakfast', 'Room with daily breakfast included', 10, 0],
    ['Long Stay Offer', 'Save on a longer direct stay', 15, 0],
  ] as const
  for (const [name, description, discountPercent, fixedDiscount] of packages) {
    if (!(await db.bookingPackage.findFirst({ where: { hotelId: hotel.id, name } }))) await db.bookingPackage.create({ data: { hotelId: hotel.id, name, description, discountPercent, fixedDiscount } })
  }
  const users: [string, string, 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'HOUSEKEEPING'][] = [
    ['admin@demo.lk', 'Nimal Perera', 'ADMIN'], ['manager@demo.lk', 'Kumari Silva', 'MANAGER'],
    ['reception@demo.lk', 'Tharindu Fernando', 'RECEPTIONIST'], ['clean@demo.lk', 'Sunil Jayasinghe', 'HOUSEKEEPING']]
  for (const [email, name, role] of users) {
    const u = await db.user.upsert({ where: { email }, update: {}, create: { email, name, passwordHash: await bcrypt.hash('Demo@12345', 10) } })
    await db.membership.upsert({ where: { userId_hotelId: { userId: u.id, hotelId: hotel.id } }, update: {}, create: { userId: u.id, hotelId: hotel.id, role } })
  }
  await db.user.upsert({ where: { email: 'platform@method89.lk' }, update: {}, create: { email: 'platform@method89.lk', name: 'Method89 Platform', isPlatformAdmin: true,
    passwordHash: await bcrypt.hash(process.env.PLATFORM_ADMIN_PASSWORD || 'Demo@12345', 10) } })
  console.log(`Seeded ${n} rooms. DEMO logins: *@demo.lk / Demo@12345 (change before real use). Hotel id: ${hotel.id}`)
}
main().finally(() => db.$disconnect())
