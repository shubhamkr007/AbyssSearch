export interface HttpResult {
  status: number;
  json: () => Promise<unknown>;
}

/** fetch with an AbortController timeout and correlation-id propagation. */
export async function httpJson(
  url: string,
  init: {
    method?: string;
    body?: unknown;
    timeoutMs: number;
    correlationId?: string;
    headers?: Record<string, string>;
  },
): Promise<HttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    const res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(init.correlationId ? { 'x-request-id': init.correlationId } : {}),
        ...(init.headers ?? {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    return { status: res.status, json: () => res.json() };
  } finally {
    clearTimeout(timer);
  }
}
