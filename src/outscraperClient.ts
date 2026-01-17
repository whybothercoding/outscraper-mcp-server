import { request } from 'undici';
import { buildRequestForOperation, type OpenApiDocument, type OpenApiOperation } from './openapi.js';

export type OutscraperClientOptions = {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
};

export class OutscraperClient {
  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(opts: OutscraperClientOptions) {
    if (!opts.apiKey) throw new Error('apiKey is required');
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? 'https://api.app.outscraper.com').replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? 120_000;
  }

  async callOperation(params: {
    path: string;
    method: string;
    operation: OpenApiOperation;
    doc: OpenApiDocument;
    args: Record<string, unknown>;
  }): Promise<unknown> {
    const { url, method, headers, body } = buildRequestForOperation(params.doc, {
      baseUrl: this.baseUrl,
      path: params.path,
      method: params.method,
      operation: params.operation,
      args: params.args,
    });

    const finalHeaders: Record<string, string> = {
      'X-API-KEY': this.apiKey,
      ...headers,
    };

    const res = await request(url, {
      // Undici uses a strict HttpMethod union; our OpenAPI-driven methods are runtime strings.
      method: method as any,
      headers: finalHeaders,
      body,
      bodyTimeout: this.timeoutMs,
      headersTimeout: this.timeoutMs,
    });

    const contentType = res.headers['content-type'] ?? '';
    const text = await res.body.text();

    if (res.statusCode < 200 || res.statusCode >= 300) {
      // Normalize error so MCP clients get actionable details.
      throw new Error(
        `Outscraper API error ${res.statusCode}: ${text.slice(0, 2000)}`,
      );
    }

    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    }

    return { raw: text };
  }
}
