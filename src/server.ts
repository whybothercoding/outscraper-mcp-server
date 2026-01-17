import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadOpenApi, operationToTool, type OpenApiDocument, type OpenApiOperation } from './openapi.js';
import { OutscraperClient } from './outscraperClient.js';

export type CreateServerOptions = {
  apiKey: string;
  baseUrl?: string;
  openApiSpecPath: string;
};

type ToolRuntime = {
  name: string;
  description?: string;
  op: OpenApiOperation;
  // built schema for MCP
  inputSchema: any;
};

export async function createOutscraperMcpServer(opts: CreateServerOptions): Promise<Server> {
  const doc: OpenApiDocument = await loadOpenApi(opts.openApiSpecPath);

  const client = new OutscraperClient({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl ?? doc.servers?.[0]?.url,
  });

  const tools: ToolRuntime[] = [];

  for (const [path, methods] of Object.entries(doc.paths ?? {})) {
    for (const [method, rawOp] of Object.entries(methods ?? {})) {
      const op = rawOp as OpenApiOperation;
      if (!op) continue;

      const tool = operationToTool(doc, { path, method: method.toUpperCase(), op });
      tools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        op: { ...op, __path: path, __method: method.toUpperCase() } as any,
      });
    }
  }

  // Stable ordering
  tools.sort((a, b) => a.name.localeCompare(b.name));

  const server = new Server(
    {
      name: 'outscraper-mcp-server',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    },
  );

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'outscraper://docs/openapi',
          name: 'Outscraper OpenAPI Specification',
          mimeType: 'application/json',
          description: 'The full OpenAPI 3.0 specification for the Outscraper API.',
        },
        {
          uri: 'outscraper://docs/api-reference',
          name: 'Outscraper API Reference Documentation',
          mimeType: 'text/markdown',
          description: 'Links and high-level documentation for the Outscraper API.',
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const { uri } = req.params;

    if (uri === 'outscraper://docs/openapi') {
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(doc, null, 2),
          },
        ],
      };
    }

    if (uri === 'outscraper://docs/api-reference') {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: `
# Outscraper API Reference

The Outscraper API provides powerful scraping tools for various platforms.

## Key Resources
- [Official Documentation](https://app.outscraper.com/api-docs)
- [API Dashboard](https://app.outscraper.com/api-keys)
- [Status Page](https://status.outscraper.com/)

## Core Platforms
- **Google Maps**: Search businesses, reviews, photos.
- **Google Search**: Web search, news, images.
- **Social Media**: Twitter, Instagram, Facebook profiles and posts.
- **E-commerce**: Amazon, eBay product data.
- **Contact Info**: Emails, phone numbers, and social links discovery.
`.trim(),
          },
        ],
      };
    }

    throw new Error(`Resource not found: ${uri}`);
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: 'business-search',
          description: 'Help user find businesses on Google Maps with specific criteria.',
          arguments: [
            {
              name: 'query',
              description: 'The search query (e.g., "restaurants in New York")',
              required: true,
            },
            {
              name: 'limit',
              description: 'Number of results to return (default 20)',
              required: false,
            },
          ],
        },
        {
          name: 'email-discovery',
          description: 'Discover emails and social contacts for a list of domains or business names.',
          arguments: [
            {
              name: 'query',
              description: 'Domain names or business names to search for',
              required: true,
            },
          ],
        },
        {
          name: 'check-api-key',
          description: 'Verify if the API key is valid and check account balance.',
          arguments: [],
        },
      ],
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;

    if (name === 'business-search') {
      const query = args?.query || 'restaurants in New York';
      const limit = args?.limit || '20';
      return {
        description: `Searching for businesses on Google Maps: ${query}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please use the outscraper.google_maps_search tool to find "${query}". Set the limit to ${limit}. Return the results as a formatted table including business names, addresses, and ratings.`,
            },
          },
        ],
      };
    }

    if (name === 'email-discovery') {
      const query = args?.query;
      return {
        description: `Discovering contact info for: ${query}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please use the outscraper.emails_and_contacts tool to find contact information for "${query}". Focus on extracting verified email addresses and LinkedIn profiles.`,
            },
          },
        ],
      };
    }

    if (name === 'check-api-key') {
      return {
        description: 'Verifying the Outscraper API key.',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Please use the outscraper.profile_balance tool to verify my current API key and balance.',
            },
          },
        ],
      };
    }

    throw new Error(`Prompt not found: ${name}`);
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const opAny = tool.op as any;
    const path: string = opAny.__path;
    const method: string = opAny.__method;

    const result = await client.callOperation({
      path,
      method,
      operation: tool.op,
      args: (args ?? {}) as Record<string, unknown>,
      doc,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  });

  return server;
}
