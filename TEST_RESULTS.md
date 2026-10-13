# Test results

- `node node_modules/typescript/bin/tsc --noEmit` in `apps/api`: passed.
- Prisma format/generate/validate: passed.
- `node node_modules/next/dist/bin/next build` in `apps/web`: passed.
- `npm test`: not run because PostgreSQL/Docker is unavailable in this workspace.
- `npm run test:api`: not run because it requires a running freshly reset API/database.
- `npm run test:features`: added and ready; covers widget Origin allow-listing, manual payment/refund correctness, audit records, and delivery queue scoping.
