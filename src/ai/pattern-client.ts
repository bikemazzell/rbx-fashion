import {
  GENERATE_FAILED_MESSAGE,
  GENERATE_INVALID_PROMPT_MESSAGE,
  GENERATE_PARENT_SETUP_MESSAGE,
  GENERATE_TIMEOUT_MESSAGE,
} from "../editor/ui/text";

export const PATTERN_PROXY_URL: string | undefined = import.meta.env.VITE_PATTERN_PROXY_URL;

const DEFAULT_TIMEOUT_MS = 60_000;
const MIN_PROMPT_CODE_POINTS = 1;
const MAX_PROMPT_CODE_POINTS = 500;

export type PatternOutcome =
  | { ok: true; bytes: Uint8Array<ArrayBuffer> }
  | {
      ok: false;
      kind:
        | "invalid-prompt"
        | "unauthorized"
        | "upstream"
        | "invalid-image"
        | "network"
        | "timeout"
        | "cancelled";
      message: string;
    };

export function patternPromptLength(prompt: string): number {
  return [...prompt].length;
}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < 24) {
    return false;
  }
  if (
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    return false;
  }
  const ihdrLength = (bytes[8]! << 24) | (bytes[9]! << 16) | (bytes[10]! << 8) | bytes[11]!;
  if (ihdrLength !== 13) {
    return false;
  }
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    return false;
  }
  const width = (bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!;
  const height = (bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!;
  return width >= 1 && height >= 1;
}

function raceAbort(promise: Promise<Response>, signal: AbortSignal): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject);
  });
}

function abortOutcome(
  userSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal,
): PatternOutcome | null {
  if (userSignal?.aborted) {
    return { ok: false, kind: "cancelled", message: "" };
  }
  if (timeoutSignal.aborted) {
    return { ok: false, kind: "timeout", message: GENERATE_TIMEOUT_MESSAGE };
  }
  return null;
}

export async function generatePattern(input: {
  proxyUrl: string;
  apiKey: string;
  prompt: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<PatternOutcome> {
  const codePoints = patternPromptLength(input.prompt);
  if (codePoints < MIN_PROMPT_CODE_POINTS || codePoints > MAX_PROMPT_CODE_POINTS) {
    return { ok: false, kind: "invalid-prompt", message: GENERATE_INVALID_PROMPT_MESSAGE };
  }
  const userSignal = input.signal;
  if (userSignal?.aborted) {
    return { ok: false, kind: "cancelled", message: "" };
  }
  const timeoutSignal = AbortSignal.timeout(input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal =
    userSignal === undefined ? timeoutSignal : AbortSignal.any([timeoutSignal, userSignal]);
  const doFetch = input.fetchImpl ?? fetch;
  const url = `${input.proxyUrl.replace(/\/+$/, "")}/api/patterns`;

  let response: Response;
  try {
    response = await raceAbort(
      doFetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gemini-api-key": input.apiKey,
        },
        body: JSON.stringify({ prompt: input.prompt }),
        signal,
      }),
      signal,
    );
  } catch {
    const aborted = abortOutcome(userSignal, timeoutSignal);
    if (aborted !== null) {
      return aborted;
    }
    return { ok: false, kind: "network", message: GENERATE_FAILED_MESSAGE };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, kind: "unauthorized", message: GENERATE_PARENT_SETUP_MESSAGE };
  }
  if (response.status !== 200) {
    return { ok: false, kind: "upstream", message: GENERATE_FAILED_MESSAGE };
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await response.arrayBuffer();
  } catch {
    const aborted = abortOutcome(userSignal, timeoutSignal);
    if (aborted !== null) {
      return aborted;
    }
    return { ok: false, kind: "network", message: GENERATE_FAILED_MESSAGE };
  }
  const bytes = new Uint8Array(buffer);
  if (!isPng(bytes)) {
    return { ok: false, kind: "invalid-image", message: GENERATE_FAILED_MESSAGE };
  }
  return { ok: true, bytes };
}
