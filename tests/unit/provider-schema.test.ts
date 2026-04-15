import { describe, expect, it } from 'vitest'
import {
  ProviderManifestSchema,
  ProviderCatalogSchema,
} from '../../src/shared/contracts'

function makeProvider(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1.0',
    id: 'test-provider',
    name: 'Test Provider',
    startUrl: 'https://example.com/',
    partition: 'persist:provider.test.default',
    ...overrides,
  }
}

describe('ProviderManifestSchema', () => {
  it('accepts a minimal valid provider and applies defaults', () => {
    const result = ProviderManifestSchema.parse(makeProvider())
    expect(result.id).toBe('test-provider')
    expect(result.allowPopups).toBe(false)
    expect(result.allowNotifications).toBe(false)
    expect(result.allowClipboardRead).toBe(false)
    expect(result.allowClipboardWrite).toBe(false)
    expect(result.userAgentMode).toBe('default')
    expect(result.enabled).toBe(true)
  })

  it('rejects http startUrl', () => {
    const result = ProviderManifestSchema.safeParse(
      makeProvider({ startUrl: 'http://insecure.example/' })
    )
    expect(result.success).toBe(false)
  })

  it('rejects partition not starting with persist:provider.', () => {
    const result = ProviderManifestSchema.safeParse(
      makeProvider({ partition: 'persist:other.test' })
    )
    expect(result.success).toBe(false)
  })

  it('rejects id with invalid characters', () => {
    const result = ProviderManifestSchema.safeParse(
      makeProvider({ id: 'Bad ID' })
    )
    expect(result.success).toBe(false)
  })

  it('rejects id starting with hyphen', () => {
    const result = ProviderManifestSchema.safeParse(
      makeProvider({ id: '-foo' })
    )
    expect(result.success).toBe(false)
  })

  it('preserves explicit permission booleans', () => {
    const result = ProviderManifestSchema.parse(
      makeProvider({ allowPopups: true, allowClipboardRead: true })
    )
    expect(result.allowPopups).toBe(true)
    expect(result.allowClipboardRead).toBe(true)
  })
})

describe('ProviderCatalogSchema', () => {
  it('accepts a valid catalog', () => {
    const catalog = {
      schemaVersion: '1.0',
      exportedAt: new Date().toISOString(),
      providers: [makeProvider()],
    }
    const parsed = ProviderCatalogSchema.parse(catalog)
    expect(parsed.providers).toHaveLength(1)
  })

  it('rejects a catalog with invalid datetime', () => {
    const catalog = {
      schemaVersion: '1.0',
      exportedAt: 'not-a-date',
      providers: [],
    }
    const result = ProviderCatalogSchema.safeParse(catalog)
    expect(result.success).toBe(false)
  })
})
