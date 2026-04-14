import { app } from 'electron';
import { join } from 'path';
import { promises as fs } from 'fs';
import { ProviderManifest, ProviderManifestSchema } from '../shared/contracts';

export class ProviderRegistry {
  private providers: ProviderManifest[] = [];
  private catalogPath: string;

  constructor() {
    this.catalogPath = join(app.getPath('userData'), 'providers.catalog.json');
  }

  public async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.catalogPath, 'utf8');
      const parsed = JSON.parse(data);
      
      const validProviders: ProviderManifest[] = [];
      if (parsed && Array.isArray(parsed.providers)) {
        for (const providerData of parsed.providers) {
          const result = ProviderManifestSchema.safeParse(providerData);
          if (result.success) {
            validProviders.push(result.data);
          } else {
            console.warn(`Invalid provider manifest skipped: ${providerData.id}`, result.error);
          }
        }
      }
      this.providers = validProviders;
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        console.error('Failed to read provider catalog', e);
      }
      this.providers = [];
      await this.save(); // Initialize empty catalog
    }
  }

  public list(): ProviderManifest[] {
    return this.providers;
  }

  public async create(provider: ProviderManifest): Promise<void> {
    const validProvider = ProviderManifestSchema.parse(provider);
    if (this.providers.some(p => p.id === validProvider.id)) {
      throw new Error(`Provider with id ${validProvider.id} already exists`);
    }
    this.providers.push(validProvider);
    await this.save();
  }

  public async update(provider: ProviderManifest): Promise<void> {
    const validProvider = ProviderManifestSchema.parse(provider);
    const index = this.providers.findIndex(p => p.id === validProvider.id);
    if (index >= 0) {
      this.providers[index] = validProvider;
      await this.save();
    } else {
      throw new Error(`Provider with id ${validProvider.id} not found`);
    }
  }

  public async delete(providerId: string): Promise<void> {
    const initialLength = this.providers.length;
    this.providers = this.providers.filter(p => p.id !== providerId);
    if (this.providers.length !== initialLength) {
      await this.save();
    }
  }

  private async save(): Promise<void> {
    const catalog = {
      schemaVersion: "1.0",
      exportedAt: new Date().toISOString(),
      providers: this.providers
    };
    await fs.writeFile(this.catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
  }
}
