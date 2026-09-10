import { z } from 'zod'

export const GUI_ZOOM_FACTORS = [0.25, 0.5, 0.75, 1, 1.25, 1.5] as const
export const GuiZoomSchema = z.union([z.literal(0.25), z.literal(0.5), z.literal(0.75), z.literal(1), z.literal(1.25), z.literal(1.5)])

export const AppSettingsSchema = z.object({
  schemaVersion: z.literal('1.0'),
  locale: z.enum(['it', 'en']).default('it'),
  zoomFactor: GuiZoomSchema.default(1),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  selectedProviderId: z.string().nullable().default(null),
  compactSidebar: z.boolean().default(false),
  showProviderLabels: z.boolean().default(true),
  reducedMotion: z.boolean().default(false),
  confirmBeforeReset: z.boolean().default(true),
})

export type AppSettings = z.infer<typeof AppSettingsSchema>
export type AppSettingsInput = z.input<typeof AppSettingsSchema>
