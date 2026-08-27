export declare function extractIndexAssets(html: string): { scripts: string[]; styles: string[] };

export declare function collectPrecache(
  distDir: string,
): { ok: true; entries: { url: string; path: string }[] } | { ok: false; error: string };

export declare function computeVersion(paths: readonly string[]): string;

export declare function renderServiceWorker(precacheUrls: readonly string[], version: string): string;

export declare function main(distDir: string): number;
