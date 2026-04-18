import { execa } from "execa";
import chalk from "chalk";

export class AudioPlayer {
  public async play(filePath: string): Promise<void> {
    try {
      if (process.platform === "darwin") {
        await execa("afplay", [filePath]);
      } else if (process.platform === "win32") {
        const psCommand = `(New-Object Media.SoundPlayer '${filePath}').PlaySync();`;
        await execa("powershell", ["-Command", psCommand]);
      } else {
        await execa("aplay", [filePath]).catch(() => execa("paplay", [filePath]));
      }
    } catch (err) {
      console.error(chalk.red(`[AudioPlayer] Playback failed: ${err}`));
      throw err;
    }
  }
}
