import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { expect, test, vi } from "vitest";
import { createPatternServer } from "../../proxy/server.mjs";

const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const ALLOWED_ORIGIN = "http://localhost:5173";

function pngUpstreamFetch(): typeof fetch {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG_1X1_BASE64 } }] } },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  ) as unknown as typeof fetch;
}

async function startServer(upstreamFetch: typeof fetch): Promise<Server> {
  const server = createPatternServer({
    allowedOrigins: [ALLOWED_ORIGIN],
    upstreamFetch,
    port: 0,
  });
  await once(server, "listening");
  return server;
}

function baseUrl(server: Server): string {
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/api/patterns`;
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  server.close();
  await once(server, "close");
}

test("a real fetch round trip through the server returns the generated PNG", async () => {
  const upstream = pngUpstreamFetch();
  const server = await startServer(upstream);
  try {
    const response = await fetch(baseUrl(server), {
      method: "POST",
      headers: {
        origin: ALLOWED_ORIGIN,
        "content-type": "application/json",
        "x-gemini-api-key": "key-1",
      },
      body: JSON.stringify({ prompt: "dotty" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
    const binary = Buffer.from(PNG_1X1_BASE64, "base64");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(binary);
    expect(upstream).toHaveBeenCalledTimes(1);
  } finally {
    await closeServer(server);
  }
});

test("a disallowed origin gets a normalized 403 through the server", async () => {
  const server = await startServer(pngUpstreamFetch());
  try {
    const response = await fetch(baseUrl(server), {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/json",
        "x-gemini-api-key": "key-1",
      },
      body: JSON.stringify({ prompt: "dotty" }),
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    const parsed = JSON.parse(await response.text()) as { error?: { code?: string } };
    expect(parsed.error?.code).toBe("invalid-origin");
  } finally {
    await closeServer(server);
  }
});

test("the adapter rejects bodies above its 64 KiB cap before the handler", async () => {
  const server = await startServer(pngUpstreamFetch());
  try {
    const response = await fetch(baseUrl(server), {
      method: "POST",
      headers: {
        origin: ALLOWED_ORIGIN,
        "content-type": "application/json",
        "x-gemini-api-key": "key-1",
      },
      body: '{"prompt":"a","x":"' + "b".repeat(70 * 1024) + '"}',
    });
    expect(response.status).toBe(413);
    const parsed = JSON.parse(await response.text()) as { error?: { code?: string } };
    expect(parsed.error?.code).toBe("payload-too-large");
  } finally {
    await closeServer(server);
  }
});
