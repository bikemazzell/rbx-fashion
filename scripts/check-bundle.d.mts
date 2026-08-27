export declare const INITIAL_JS_GZIP_BUDGET: number;
export declare const PREVIEW_CHUNK_GZIP_BUDGET: number;
export declare const PRECACHE_RAW_BUDGET: number;

export declare function runBundleCheck(
  distDir: string,
): { ok: boolean; failures: string[]; measurements: Record<string, number> };
