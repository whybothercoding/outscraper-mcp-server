import { readFile } from 'node:fs/promises';
import { embeddedOpenApiDocument } from './outscraperApiDocs.generated.js';

export type OpenApiDocument = {
  openapi?: string;
  info?: { title?: string; version?: string };
  servers?: { url: string }[];
  paths?: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    securitySchemes?: Record<string, unknown>;
    schemas?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    requestBodies?: Record<string, unknown>;
  };
  security?: unknown;
};

export type OpenApiParameter = {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required?: boolean;
  schema?: any;
  description?: string;
};

export type OpenApiOperation = {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Array<OpenApiParameter | { $ref: string }>;
  requestBody?: any;
  responses?: any;
  // we stash these at runtime
  __path?: string;
  __method?: string;
};

type RefObj = { $ref: string };

export async function loadOpenApi(path: string): Promise<OpenApiDocument> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as OpenApiDocument;
  } catch (err: any) {
    // Runtime fallback: use embedded OpenAPI spec (bundled at build time)
    // so the server can run even if outscraper-api-docs.json is not present.
    const code = err?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return embeddedOpenApiDocument as unknown as OpenApiDocument;
    }
    // If parsing fails or other IO errors occur, surface the error.
    throw err;
  }
}

export function deref<T = any>(doc: OpenApiDocument, obj: any): T {
  if (!obj || typeof obj !== 'object') return obj as T;
  if (!('$ref' in obj)) return obj as T;

  const ref = (obj as RefObj).$ref;
  if (!ref.startsWith('#/')) throw new Error(`Only local refs supported: ${ref}`);

  const parts = ref
    .slice(2)
    .split('/')
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));

  let cur: any = doc;
  for (const part of parts) {
    cur = cur?.[part];
  }
  if (cur === undefined) throw new Error(`Broken $ref: ${ref}`);
  return cur as T;
}

function pathToOperationBase(path: string): string {
  // Convert `/google-maps-search` -> `google_maps_search`
  // Convert `/businesses/{business_id}` -> `businesses_business_id`
  return path
    .replace(/^\//, '')
    .replace(/\{([^}]+)\}/g, '$1')
    .replace(/\//g, '_')
    .replace(/-/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
}

function toToolName(params: { operationId?: string; path: string; method: string; needsMethodSuffix: boolean }): string {
  const base = (params.operationId?.trim() || pathToOperationBase(params.path) || 'unnamed_operation')
    .replace(/_+/g, '_');

  const withSuffix = params.needsMethodSuffix ? `${base}_${params.method.toLowerCase()}` : base;
  const cleaned = withSuffix
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\.\-]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();

  return cleaned.startsWith('outscraper.') ? cleaned : `outscraper.${cleaned}`;
}

function openApiSchemaToJsonSchema(doc: OpenApiDocument, schema: any): any {
  const s = deref<any>(doc, schema);

  // Best-effort: OpenAPI 3 JSON Schema dialect is mostly compatible.
  // We recursively deref nested schemas.
  if (!s || typeof s !== 'object') return s;

  if (Array.isArray(s)) return s.map((v) => openApiSchemaToJsonSchema(doc, v));

  const out: any = { ...s };

  // Fix: MCP/JSON Schema - type can be an array in some OpenAPI versions
  if (Array.isArray(out.type)) {
    out.type = out.type.find((t: string) => t !== 'null') || out.type[0];
  }

  // Fix: Gemini/MCP strictness - 'items' is only valid for type 'array'
  if (out.type && out.type !== 'array' && out.items) {
    delete out.items;
  }

  if (out.properties) {
    out.properties = Object.fromEntries(
      Object.entries(out.properties).map(([k, v]) => [k, openApiSchemaToJsonSchema(doc, v)]),
    );
  }

  if (out.items) out.items = openApiSchemaToJsonSchema(doc, out.items);

  if (out.oneOf) out.oneOf = out.oneOf.map((v: any) => openApiSchemaToJsonSchema(doc, v));
  if (out.anyOf) out.anyOf = out.anyOf.map((v: any) => openApiSchemaToJsonSchema(doc, v));
  if (out.allOf) out.allOf = out.allOf.map((v: any) => openApiSchemaToJsonSchema(doc, v));

  return out;
}

function normalizeParameters(doc: OpenApiDocument, op: OpenApiOperation): OpenApiParameter[] {
  const params = (op.parameters ?? []).map((p) => deref<OpenApiParameter>(doc, p));
  return params.filter(Boolean);
}

function buildInputSchema(doc: OpenApiDocument, op: OpenApiOperation): any {
  const params = normalizeParameters(doc, op).filter((p) => p.in === 'query');

  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const p of params) {
    const schema = p.schema ? openApiSchemaToJsonSchema(doc, p.schema) : { type: 'string' };
    properties[p.name] = {
      ...schema,
      description: p.description,
    };
    if (p.required) required.push(p.name);
  }

  // Include requestBody schema fields if present (common for POST operations).
  const rbSchema = op.requestBody?.content?.['application/json']?.schema;
  if (rbSchema) {
    const s = openApiSchemaToJsonSchema(doc, rbSchema);
    // If it’s an object schema, merge its properties.
    if (s?.type === 'object' && s.properties) {
      for (const [k, v] of Object.entries<any>(s.properties)) {
        if (properties[k]) continue; // query param wins
        properties[k] = v;
      }
      if (Array.isArray(s.required)) {
        for (const r of s.required) {
          if (!required.includes(r)) required.push(r);
        }
      }
    } else {
      // Fallback: allow a raw `body`.
      properties.body = {
        description: 'Raw JSON request body (used when requestBody schema is not an object).',
        type: 'object',
      };
    }
  }

  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required: required.length ? required : undefined,
  };
}

export function operationToTool(
  doc: OpenApiDocument,
  params: { path: string; method: string; op: OpenApiOperation },
): { name: string; description?: string; inputSchema: any } {
  const methodCount = Object.keys(doc.paths?.[params.path] ?? {}).length;
  const name = toToolName({
    operationId: params.op.operationId,
    path: params.path,
    method: params.method,
    needsMethodSuffix: methodCount > 1,
  });

  const descriptionParts = [
    params.op.summary,
    params.op.description,
    `HTTP ${params.method} ${params.path}`,
  ].filter(Boolean);

  return {
    name,
    description: descriptionParts.join('\n'),
    inputSchema: buildInputSchema(doc, params.op),
  };
}

function encodeQueryValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) {
    // Outscraper commonly uses comma-separated arrays.
    return v.map((x) => String(x)).join(',');
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function buildRequestForOperation(
  doc: OpenApiDocument,
  params: {
    baseUrl: string;
    path: string;
    method: string;
    operation: OpenApiOperation;
    args: Record<string, unknown>;
  },
): { url: string; method: string; headers: Record<string, string>; body?: string } {
  const method = params.method.toUpperCase();
  const op = params.operation;

  const queryParams = normalizeParameters(doc, op).filter((p) => p.in === 'query');
  const query = new URLSearchParams();

  for (const p of queryParams) {
    if (params.args[p.name] === undefined) continue;
    query.set(p.name, encodeQueryValue(params.args[p.name]));
  }

  const url = new URL(params.baseUrl.replace(/\/$/, '') + params.path);
  if ([...query.keys()].length) url.search = query.toString();

  // Body: only for JSON request bodies and non-GET methods.
  let body: string | undefined;
  const headers: Record<string, string> = {};

  const hasJsonBody = !!op.requestBody?.content?.['application/json'];
  if (method !== 'GET' && hasJsonBody) {
    const rbSchema = op.requestBody?.content?.['application/json']?.schema;
    const derefSchema = rbSchema ? openApiSchemaToJsonSchema(doc, rbSchema) : undefined;

    // If requestBody is object: take all args that are NOT query params.
    const queryNames = new Set(queryParams.map((p) => p.name));

    if (derefSchema?.type === 'object' || derefSchema?.properties) {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(params.args)) {
        if (queryNames.has(k)) continue;
        payload[k] = v;
      }
      body = JSON.stringify(payload);
    } else if (params.args.body !== undefined) {
      body = JSON.stringify(params.args.body);
    }

    headers['content-type'] = 'application/json';
  }

  return { url: url.toString(), method, headers, body };
}
