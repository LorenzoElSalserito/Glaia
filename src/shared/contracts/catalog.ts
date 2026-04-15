import { z } from 'zod'
import { ProviderManifestSchema } from './provider'

export const ProviderCatalogSchema = z.object({
  schemaVersion: z.literal('1.0'),
  exportedAt: z.string().datetime(),
  providers: z.array(ProviderManifestSchema),
})

export type ProviderCatalog = z.infer<typeof ProviderCatalogSchema>
