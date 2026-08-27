import type { Server } from "node:http";

export declare function createPatternServer(options: {
  allowedOrigins: readonly string[];
  model?: string;
  port?: number;
  host?: string;
  upstreamFetch?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
}): Server;
