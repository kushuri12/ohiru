declare module "tmi.js" {
  export interface Options {
    options?: {
      debug?: boolean;
    };
    identity?: {
      username: string;
      password: string;
    };
    channels?: string[];
  }

  export class Client {
    constructor(options?: Options);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    say(target: string, message: string): void;
    on(event: string, callback: (...args: any[]) => void): void;
  }
}
