import { ProviderManifest, AppSettings, ProviderViewState } from '../shared/contracts';

declare global {
  interface Window {
    glaia: {
      providers: {
        list: () => Promise<ProviderManifest[]>;
        create: (provider: ProviderManifest) => Promise<void>;
        update: (provider: ProviderManifest) => Promise<void>;
        delete: (providerId: string) => Promise<void>;
        resetSession: (providerId: string) => Promise<void>;
        open: (providerId: string) => Promise<void>;
        export: () => Promise<boolean>;
        import: () => Promise<boolean>;
      };
      providerView: {
        reload: () => Promise<void>;
        navigateBack: () => Promise<void>;
        navigateForward: () => Promise<void>;
        onStateChanged: (callback: (state: ProviderViewState) => void) => () => void;
      };
      settings: {
        get: () => Promise<AppSettings>;
        update: (patch: Partial<AppSettings>) => Promise<AppSettings>;
      };
    };
  }
}
