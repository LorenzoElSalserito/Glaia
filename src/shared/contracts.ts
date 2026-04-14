import { z } from 'zod';

export const ProviderManifestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  id: z.string().min(1),
  name: z.string().min(1),
  startUrl: z.string().url(),
  icon: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  partition: z.string(),
  homeUrl: z.string().url().optional(),
  allowPopups: z.boolean().optional().default(false),
  allowNotifications: z.boolean().optional().default(false),
  allowClipboardRead: z.boolean().optional().default(false),
  allowClipboardWrite: z.boolean().optional().default(false),
  externalUrlPatterns: z.array(z.string()).optional(),
  allowedHosts: z.array(z.string()).optional(),
  userAgentMode: z.enum(["default", "custom"]).optional(),
  customUserAgent: z.string().optional(),
  enabled: z.boolean().default(true)
});

export type ProviderManifest = z.infer<typeof ProviderManifestSchema>;

export const ProviderCatalogSchema = z.object({
  schemaVersion: z.literal("1.0"),
  exportedAt: z.string(),
  providers: z.array(ProviderManifestSchema)
});

export type ProviderCatalog = z.infer<typeof ProviderCatalogSchema>;

// Settings Contract
export const AppSettingsSchema = z.object({
  schemaVersion: z.literal("1.0"),
  locale: z.string().default("en"),
  theme: z.enum(["system", "light", "dark"]).default("system"),
  compactSidebar: z.boolean().default(false),
  lastSelectedProviderId: z.string().optional(),
  showProviderLabels: z.boolean().default(true),
  reducedMotion: z.boolean().default(false)
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;

// View State Contract
export interface ProviderViewState {
  providerId: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  currentUrl?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
}
