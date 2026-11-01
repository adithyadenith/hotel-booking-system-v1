const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const dotenv = require('dotenv')

const envFile = path.resolve(process.cwd(), process.env.TEST_ENV_FILE || '.env.test')
if (!fs.existsSync(envFile)) throw new Error(`Test environment file not found: ${envFile}. Copy .env.test.example first.`)
Object.assign(process.env, dotenv.parse(fs.readFileSync(envFile)))
if (process.env.TEST_MODE !== 'true' || process.env.TEST_DATABASE_CONFIRMATION !== 'METHOD89_TEST_DATABASE') {
  throw new Error('Refusing to reset a database unless .env.test explicitly confirms METHOD89_TEST_DATABASE.')
}
for (const [command, args] of [
  ['npx', ['prisma', 'migrate', 'reset', '--force', '--skip-seed']],
  ['npx', ['prisma', 'db', 'execute', '--file', 'prisma/sql/constraints.sql', '--schema', 'prisma/schema.prisma']],
  ['npx', ['ts-node', '--files', 'prisma/seed.ts']],
]) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32', env: process.env })
  if (result.status !== 0) process.exit(result.status || 1)
}
