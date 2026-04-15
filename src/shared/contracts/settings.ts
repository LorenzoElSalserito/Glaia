import { z } from 'zod'

export const AppSettingsSchema = z.object({
  schemaVersion: z.literal('1.0'),
  locale: z.enum(['it', 'en']).default('it'),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  selectedProviderId: z.string().nullable().default(null),
  compactSidebar: z.boolean().default(false),
  showProviderLabels: z.boolean().default(true),
  reducedMotion: z.boolean().default(false),
  confirmBeforeReset: z.boolean().default(true),
})

export type AppSettings = z.infer<typeof AppSettingsSchema>
export type AppSettingsInput = z.input<typeof AppSettingsSchema>
