import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createOutscraperMcpServer } from './server.js';

const apiKey = process.env.OUTSCRAPER_API_KEY;
if (!apiKey) {
  // Keep message explicit: MCP servers are often launched by clients.
  // No secrets are read from files; we only look at the environment.
  throw new Error('Missing required env var OUTSCRAPER_API_KEY');
}

const baseUrl = process.env.OUTSCRAPER_BASE_URL;

const server = await createOutscraperMcpServer({
  apiKey,
  baseUrl,
  openApiSpecPath: 'outscraper-api-docs.json',
});

const transport = new StdioServerTransport();
await server.connect(transport);
