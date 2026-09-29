export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

/** JSON fetch helper. Adds the CSRF header required by the admin API and normalises errors. */
export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'x-requested-with': 'way-ezy',
    ...(options.headers ?? {}),
  };
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) body = options.body;
  else if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ApiError(
      0,
      'network',
      'You appear to be offline. Check the connection and try again.',
    );
  }
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const error = (
      json as {
        error?: { code?: string; message?: string; details?: { path: string; message: string }[] };
      } | null
    )?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'error',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details,
    );
  }
  return json as T;
}

export const get = <T>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body ?? {} });
export const put = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PUT', body: body ?? {} });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });
