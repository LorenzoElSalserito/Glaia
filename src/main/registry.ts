import { app } from 'electron'
import { dirname, join } from 'path'
import { promises as fs } from 'fs'
import {
  ProviderManifestSchema,
  ProviderCatalogSchema,
  type ProviderManifest,
  type ProviderManifestInput,
} from '../shared/contracts'
import { getProviderCatalogPath } from './appPaths'

const DEFAULT_PROVIDERS_INPUT: ProviderManifestInput[] = [
  {
    schemaVersion: '1.0',
    id: 'chatgpt',
    name: 'ChatGPT',
    startUrl: 'https://chatgpt.com/',
    partition: 'persist:provider.chatgpt.default',
  },
  {
    schemaVersion: '1.0',
    id: 'gemini',
    name: 'Gemini',
    startUrl: 'https://gemini.google.com/',
    partition: 'persist:provider.gemini.default',
  },
  {
    schemaVersion: '1.0',
    id: 'microsoft-copilot',
    name: 'Microsoft Copilot',
    startUrl: 'https://copilot.microsoft.com/',
    partition: 'persist:provider.copilot.default',
  },
  {
    schemaVersion: '1.0',
    id: 'claude-ai',
    name: 'Claude AI',
    startUrl: 'https://claude.ai/',
    partition: 'persist:provider.claude.default',
  },
  {
    schemaVersion: '1.0',
    id: 'grok',
    name: 'Grok',
    startUrl: 'https://grok.com/',
    partition: 'persist:provider.grok.default',
  },
  {
    schemaVersion: '1.0',
    id: 'mistral-le-chat',
    name: 'Mistral Le Chat',
    startUrl: 'https://chat.mistral.ai/',
    partition: 'persist:provider.mistral.default',
  },
  {
    schemaVersion: '1.0',
    id: 'deepseek',
    name: 'DeepSeek',
    startUrl: 'https://chat.deepseek.com/',
    partition: 'persist:provider.deepseek.default',
  },
  {
    schemaVersion: '1.0',
    id: 'meta-ai',
    name: 'Meta AI',
    startUrl: 'https://www.meta.ai/',
    partition: 'persist:provider.meta.default',
  },
  {
    schemaVersion: '1.0',
    id: 'alibaba-qwen',
    name: 'Alibaba Qwen',
    startUrl: 'https://chat.qwen.ai/',
    partition: 'persist:provider.qwen.default',
  },
  {
    schemaVersion: '1.0',
    id: 'kimi',
    name: 'Kimi',
    startUrl: 'https://kimi.com/',
    partition: 'persist:provider.kimi.default',
  },
  {
    schemaVersion: '1.0',
    id: '01-ai-wanzhi',
    name: '01.ai Wanzhi',
    startUrl: 'https://www.01.ai/',
    partition: 'persist:provider.wanzhi.default',
  },
  {
    schemaVersion: '1.0',
    id: 'perplexity-ai',
    name: 'Perplexity AI',
    startUrl: 'https://www.perplexity.ai/',
    partition: 'persist:provider.perplexity.default',
  },
  {
    schemaVersion: '1.0',
    id: 'duck-ai',
    name: 'Duck.ai',
    startUrl: 'https://duck.ai/',
    partition: 'persist:provider.duckai.default',
  },
  {
    schemaVersion: '1.0',
    id: 'huggingchat',
    name: 'HuggingChat',
    startUrl: 'https://huggingface.co/chat',
    partition: 'persist:provider.huggingchat.default',
  },
  {
    schemaVersion: '1.0',
    id: 'poe',
    name: 'Poe',
    startUrl: 'https://poe.com/',
    partition: 'persist:provider.poe.default',
  },
  {
    schemaVersion: '1.0',
    id: 'pi-ai',
    name: 'Pi AI',
    startUrl: 'https://pi.ai/',
    partition: 'persist:provider.pi.default',
  },
  {
    schemaVersion: '1.0',
    id: 'groq',
    name: 'Groq Console',
    startUrl: 'https://console.groq.com/',
    partition: 'persist:provider.groq.default',
  },
  {
    schemaVersion: '1.0',
    id: 'ninja-ai',
    name: 'Ninja AI',
    startUrl: 'https://www.ninjatech.ai/',
    partition: 'persist:provider.ninjaai.default',
  },
  {
    schemaVersion: '1.0',
    id: 'cohere-coral',
    name: 'Cohere Coral',
    startUrl: 'https://cohere.com/',
    partition: 'persist:provider.cohere.default',
  },
]

export const DEFAULT_PROVIDERS: ProviderManifest[] = DEFAULT_PROVIDERS_INPUT.map(
  (input) => ProviderManifestSchema.parse(input)
)

export class ProviderRegistry {
  private providers: ProviderManifest[] = []
  private readonly catalogPath: string

  constructor(catalogPath?: string) {
    this.catalogPath = catalogPath ?? getProviderCatalogPath()
  }

  public async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.catalogPath, 'utf8')
      const parsed: unknown = JSON.parse(data)
      this.providers = this.parseProviders(parsed)
      if (this.providers.length === 0) {
        this.providers = [...DEFAULT_PROVIDERS]
        await this.save()
      }
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      if (err.code !== 'ENOENT') {
        console.error('[registry] failed to read catalog', err)
      }
      const migrated = await this.tryLoadLegacyCatalog()
      if (migrated) return
      this.providers = [...DEFAULT_PROVIDERS]
      await this.save()
    }
  }

  private async tryLoadLegacyCatalog(): Promise<boolean> {
    const legacyPath = join(app.getPath('userData'), 'providers.catalog.json')
    if (legacyPath === this.catalogPath) return false
    try {
      const data = await fs.readFile(legacyPath, 'utf8')
      const parsed: unknown = JSON.parse(data)
      this.providers = this.parseProviders(parsed)
      if (this.providers.length === 0) return false
      await this.save()
      return true
    } catch {
      return false
    }
  }

  private parseProviders(raw: unknown): ProviderManifest[] {
    if (!raw || typeof raw !== 'object') return []
    const candidate = raw as { providers?: unknown }
    if (!Array.isArray(candidate.providers)) return []

    const valid: ProviderManifest[] = []
    for (const entry of candidate.providers) {
      const result = ProviderManifestSchema.safeParse(entry)
      if (result.success) {
        valid.push(result.data)
      } else {
        const id =
          entry && typeof entry === 'object' && 'id' in entry
            ? String((entry as { id: unknown }).id)
            : '<unknown>'
        console.warn(
          `[registry] skipping invalid provider "${id}":`,
          result.error.flatten()
        )
      }
    }
    return valid
  }

  public list(): ProviderManifest[] {
    return [...this.providers]
  }

  public get(providerId: string): ProviderManifest | null {
    return this.providers.find((p) => p.id === providerId) ?? null
  }

  public async create(input: unknown): Promise<ProviderManifest> {
    const provider = ProviderManifestSchema.parse(input)
    if (this.providers.some((p) => p.id === provider.id)) {
      throw new Error(`Provider with id "${provider.id}" already exists`)
    }
    this.providers.push(provider)
    await this.save()
    return provider
  }

  public async update(input: unknown): Promise<ProviderManifest> {
    const provider = ProviderManifestSchema.parse(input)
    const index = this.providers.findIndex((p) => p.id === provider.id)
    if (index < 0) {
      throw new Error(`Provider with id "${provider.id}" not found`)
    }
    this.providers[index] = provider
    await this.save()
    return provider
  }

  public async delete(providerId: string): Promise<boolean> {
    const before = this.providers.length
    this.providers = this.providers.filter((p) => p.id !== providerId)
    const removed = this.providers.length !== before
    if (removed) await this.save()
    return removed
  }

  public async importCatalog(raw: unknown): Promise<{
    imported: number
    updated: number
    skipped: number
  }> {
    const valid = this.parseProviders(raw)
    let imported = 0
    let updated = 0
    const skipped =
      Array.isArray((raw as { providers?: unknown[] }).providers)
        ? ((raw as { providers: unknown[] }).providers.length - valid.length)
        : 0

    for (const provider of valid) {
      const idx = this.providers.findIndex((p) => p.id === provider.id)
      if (idx >= 0) {
        this.providers[idx] = provider
        updated++
      } else {
        this.providers.push(provider)
        imported++
      }
    }
    await this.save()
    return { imported, updated, skipped }
  }

  public exportCatalog(): unknown {
    return ProviderCatalogSchema.parse({
      schemaVersion: '1.0',
      exportedAt: new Date().toISOString(),
      providers: this.providers,
    })
  }

  private async save(): Promise<void> {
    const catalog = this.exportCatalog()
    const tmp = `${this.catalogPath}.tmp`
    await fs.mkdir(dirname(this.catalogPath), { recursive: true })
    await fs.writeFile(tmp, JSON.stringify(catalog, null, 2), 'utf8')
    await fs.rename(tmp, this.catalogPath)
  }
}
