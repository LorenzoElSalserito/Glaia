import type { ProviderManifest, ProviderViewState } from './provider'
import type { AppSettings } from './settings'

export const IpcChannels = {
  ProvidersList: 'providers:list',
  ProvidersCreate: 'providers:create',
  ProvidersUpdate: 'providers:update',
  ProvidersDelete: 'providers:delete',
  ProvidersResetSession: 'providers:reset-session',
  ProvidersExport: 'providers:export',
  ProvidersImport: 'providers:import',

  ProviderViewOpen: 'provider-view:open',
  ProviderViewClose: 'provider-view:close',
  ProviderViewReload: 'provider-view:reload',
  ProviderViewHardReload: 'provider-view:hard-reload',
  ProviderViewBack: 'provider-view:navigate-back',
  ProviderViewForward: 'provider-view:navigate-forward',
  ProviderViewGoHome: 'provider-view:go-home',
  ProviderViewOpenExternal: 'provider-view:open-external',
  ProviderViewState: 'provider-view:state-changed',
  ProviderViewSetBounds: 'provider-view:set-bounds',
  ProviderViewSetVisible: 'provider-view:set-visible',

  SettingsGet: 'settings:get',
  SettingsUpdate: 'settings:update',

  AppGetVersion: 'app:get-version',
  AppReportBug: 'app:report-bug',
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

export interface ProviderListResponse {
  providers: ProviderManifest[]
}

export interface ResetProviderSessionRequest {
  providerId: string
}

export type SettingsGetResponse = AppSettings
export type SettingsUpdateRequest = Partial<AppSettings>

export type ProviderViewStateEvent = ProviderViewState

export interface ProviderViewBounds {
  x: number
  y: number
  width: number
  height: number
}
