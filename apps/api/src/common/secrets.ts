import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const key = () => createHash('sha256').update(process.env.CREDENTIALS_ENCRYPTION_KEY || 'development-only-change-me').digest()

/** Encrypts provider credentials at rest. The encryption key must be supplied outside the database. */
export function seal(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`
}

export function unseal(value?: string | null) {
  if (!value) return undefined
  const [iv, tag, encrypted] = value.split('.').map(x => Buffer.from(x, 'base64'))
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
