import chalk from "chalk";

export interface ProviderStatus {
  id: string;
  isAvailable: boolean;
  latencyMs: number;
  lastChecked: string;
  error?: string;
}

export class ProviderHealth {
  private statusMap = new Map<string, ProviderStatus>();

  public async checkProvider(providerId: string, pingFn: () => Promise<number>): Promise<ProviderStatus> {
    const startTime = Date.now();
    try {
      const latency = await pingFn();
      const status: ProviderStatus = {
        id: providerId,
        isAvailable: true,
        latencyMs: latency,
        lastChecked: new Date().toISOString(),
      };
      this.statusMap.set(providerId, status);
      return status;
    } catch (err: any) {
      const status: ProviderStatus = {
        id: providerId,
        isAvailable: false,
        latencyMs: 0,
        lastChecked: new Date().toISOString(),
        error: err.message,
      };
      this.statusMap.set(providerId, status);
      console.warn(chalk.yellow(`[Health] Provider ${providerId} is DOWN: ${err.message}`));
      return status;
    }
  }

  public getStatus(providerId: string): ProviderStatus | undefined {
    return this.statusMap.get(providerId);
  }

  public getAllStatus(): ProviderStatus[] {
    return Array.from(this.statusMap.values());
  }
}
