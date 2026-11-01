const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const dotenv = require('dotenv')

const envFile = path.resolve(process.cwd(), process.env.TEST_ENV_FILE || '.env.test')
if (!fs.existsSync(envFile)) throw new Error(`Test environment file not found: ${envFile}. Copy .env.test.example first.`)
const values = dotenv.parse(fs.readFileSync(envFile))
Object.assign(process.env, values)
if (process.env.TEST_MODE !== 'true' || process.env.TEST_DATABASE_CONFIRMATION !== 'METHOD89_TEST_DATABASE') {
  throw new Error('Refusing to run test tooling. Set TEST_MODE=true and TEST_DATABASE_CONFIRMATION=METHOD89_TEST_DATABASE in .env.test.')
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required in .env.test.')

const [command, ...args] = process.argv.slice(2)
if (!command) throw new Error('Provide a command to run in the protected test environment.')
const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32', env: process.env })
process.exit(result.status ?? 1)
