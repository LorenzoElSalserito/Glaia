import { z } from 'zod'

const providerIdRegex = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

export const ProviderManifestSchema = z.object({
  schemaVersion: z.literal('1.0'),
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(providerIdRegex, 'id must be lowercase kebab-case'),
  name: z.string().min(1).max(100),
  startUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://'), 'startUrl must use https'),
  partition: z
    .string()
    .startsWith(
      'persist:provider.',
      'partition must start with "persist:provider."'
    ),
  homeUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://'), 'homeUrl must use https')
    .optional(),
  description: z.string().max(500).optional(),
  allowPopups: z.boolean().default(false),
  allowNotifications: z.boolean().default(false),
  allowClipboardRead: z.boolean().default(false),
  allowClipboardWrite: z.boolean().default(false),
  externalUrlPatterns: z.array(z.string()).optional(),
  allowedHosts: z.array(z.string()).optional(),
  userAgentMode: z.enum(['default', 'custom']).default('default'),
  customUserAgent: z.string().optional(),
  enabled: z.boolean().default(true),
})

export type ProviderManifest = z.infer<typeof ProviderManifestSchema>

export type ProviderManifestInput = z.input<typeof ProviderManifestSchema>

export interface ProviderViewState {
  providerId: string
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
  currentUrl: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
}
