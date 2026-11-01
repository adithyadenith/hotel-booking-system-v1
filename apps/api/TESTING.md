# Safe API testing

1. Copy `.env.test.example` to `.env.test` and use a separate, disposable test database.
2. Run `npm run test:db:reset`. It will only run when `.env.test` explicitly contains `TEST_MODE=true` and `TEST_DATABASE_CONFIRMATION=METHOD89_TEST_DATABASE`.
3. Start the test API with `npm run dev:test`.
4. Run `npm run test:api`, `npm run test:features`, and `npm test`.

Never run `test:db:reset` with production or live hotel data. The explicit confirmation is deliberately required because the reset operation removes all data in the configured test database.
