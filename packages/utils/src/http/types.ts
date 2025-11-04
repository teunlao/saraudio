export interface HttpRequest {
  url: string;
  method: 'POST' | 'GET' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: ArrayBuffer | Uint8Array | string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface HttpResponse<TBody = ArrayBuffer | string> {
  status: number;
  headers: Record<string, string>;
  body: TBody;
}

export type HttpClient = <T extends ArrayBuffer | string = ArrayBuffer>(req: HttpRequest) => Promise<HttpResponse<T>>;
