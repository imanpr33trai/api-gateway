import { and, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'

import { db } from '../db'
import { apiKeys, users } from '../db/schema'

export interface UserRecord {
  id: number
  email: string
  displayName: string
  role: string
  isActive: boolean
  createdAt: Date
}

export interface ApiKeyRecord {
  id: number
  userId: number
  keyPrefix: string
  label: string
  scopes: string[]
  lastUsedAt: Date | null
  expiresAt: Date | null
  isActive: boolean
  createdAt: Date
}

export interface CreatedApiKey {
  record: ApiKeyRecord
  rawKey: string
}

const API_KEY_PREFIX = 'sk-'

function generateApiKey(): { raw: string; prefix: string } {
  const entropy = randomBytes(32).toString('hex')
  const raw = `${API_KEY_PREFIX}${entropy}`
  const prefix = raw.slice(0, 11)
  return { raw, prefix }
}

export async function createUser(
  email: string,
  displayName?: string,
  passwordHash?: string
): Promise<UserRecord> {
  const [row] = await db
    .insert(users)
    .values({
      email,
      displayName: displayName ?? email.split('@')[0] ?? email,
      passwordHash: passwordHash ?? null
    })
    .returning()
  if (!row) throw new Error('Faied to create User')
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    isActive: row.isActive,
    createdAt: row.createdAt
  }
}

export const getUserByID = async (
  userId: number
): Promise<UserRecord | null> => {
  const [row] = await db
    .select({
      id: users.id,
      createdAt: users.createdAt,
      displayName: users.displayName,
      email: users.email,
      isActive: users.isActive,
      role: users.role
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  return row ?? null
}

export const getUserByEmail = async (
  email: string
): Promise<UserRecord | null> => {
  const [row] = await db
    .select({
      id: users.id,
      createdAt: users.createdAt,
      displayName: users.displayName,
      email: users.email,
      isActive: users.isActive,
      role: users.role
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  return row ?? null
}

export const listUsers = async (): Promise<UserRecord[]> => {
  return (await db
    .select({
      id: users.id,
      createdAt: users.createdAt,
      displayName: users.displayName,
      email: users.email,
      isActive: users.isActive,
      role: users.role
    })
    .from(users)
    .orderBy(users.createdAt)) as UserRecord[]
}

export const updateUser = async (
  userId: number,
  data: Partial<Pick<UserRecord, 'displayName' | 'role' | 'isActive'>>
): Promise<UserRecord | null> => {
  const [row] = await db
    .update(users)
    .set(data)
    .where(eq(users.id, userId))
    .returning()

  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    isActive: row.isActive,
    createdAt: row.createdAt
  }
}

export const deleteUser = async (userId: number): Promise<boolean> => {
  const result = await db.delete(users).where(eq(users.id, userId))
  return result.rows.length > 0
}

export const createApiKey = async (
  userId: number,
  label?: string,
  scopes?: string[]
): Promise<CreatedApiKey> => {
  const { raw, prefix } = generateApiKey()

  const [row] = await db
    .insert(apiKeys)
    .values({
      userId,
      keyHash: raw,
      keyPrefix: prefix,
      label: label ?? 'default',
      scopes: scopes ?? ['*']
    })
    .returning()

  if (!row) throw new Error('Failed to create API key.')

  return {
    record: {
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      id: row.id,
      isActive: row.isActive,
      keyPrefix: row.keyPrefix,
      label: row.label,
      lastUsedAt: row.lastUsedAt,
      scopes: row.scopes,
      userId: row.userId
    },
    rawKey: raw
  }
}

export const resolveUserFromApiKey = async (
  bearerToken: string
): Promise<{ user: UserRecord; apiKey: ApiKeyRecord } | null> => {
  const token = bearerToken.startsWith('Bearer ')
    ? bearerToken.slice(7)
    : bearerToken

  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, token), eq(apiKeys.isActive, true)))
    .limit(1)

  if (!row) return null

  const keyRecord = row as ApiKeyRecord

  if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
    return null
  }

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyRecord.id))

  const user = await getUserByID(keyRecord.userId)
  if (!user || !user.isActive) return null

  return { apiKey: keyRecord, user }
}

export const listApiKeys = async (userId: number): Promise<ApiKeyRecord[]> => {
  return await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(apiKeys.createdAt)
}

export const revoikeApiKey = async (
  keyId: number,
  userId: number
): Promise<boolean> => {
  const result = await db
    .update(apiKeys)
    .set({ isActive: false })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))

  return result.rows.length > 0
}
