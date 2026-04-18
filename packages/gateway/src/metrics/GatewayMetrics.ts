export class GatewayMetrics {
  private messagesProcessed = 0;
  private messagesPerChannel: Record<string, number> = {};
  private totalResponseTimeMs = 0;
  private errorCount = 0;
  private startTime = Date.now();

  public recordMessage(channelId: string, responseTimeMs: number) {
    this.messagesProcessed++;
    this.messagesPerChannel[channelId] = (this.messagesPerChannel[channelId] || 0) + 1;
    this.totalResponseTimeMs += responseTimeMs;
  }

  public recordError() {
    this.errorCount++;
  }

  public getSnapshot() {
    return {
      messages_processed: this.messagesProcessed,
      messages_per_channel: this.messagesPerChannel,
      avg_response_time_ms: this.messagesProcessed > 0 ? (this.totalResponseTimeMs / this.messagesProcessed) : 0,
      errors: this.errorCount,
      uptime_seconds: (Date.now() - this.startTime) / 1000
    };
  }
}
