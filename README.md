# Outscraper MCP Server (Node.js)

[![CI](https://github.com/whybothercoding/outscraper-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/whybothercoding/outscraper-mcp-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A **Model Context Protocol (MCP)** server that exposes the complete Outscraper API as MCP tools — so an AI agent (Claude, or any other MCP client) can search Google Maps, scrape LinkedIn/Amazon/Google Search, and run the other 90+ Outscraper endpoints directly as tool calls, with no hand-written wrapper per endpoint.

Tools are **auto-generated** from the Outscraper OpenAPI spec, ensuring 100% coverage of available endpoints.

## Features
- **Auto-generated Tools**: 1 OpenAPI operation = 1 MCP tool (99 total).
- **Resources**: Direct access to the OpenAPI specification and API reference.
- **Prompts**: Pre-configured workflows for common scraping tasks.
- **Full Coverage**: Includes Google Maps, Google Search, Amazon, LinkedIn, and 90+ other scraping endpoints.
- **Embedded Spec**: The OpenAPI spec is embedded into the build, making the binary portable.
- **Data Normalization**: Handles comma-separated query arrays and JSON body mapping automatically.

## Installation

```bash
npm install
npm run build
```

## Configuration

Set the following environment variables:

- `OUTSCRAPER_API_KEY` (Required): Your API key from [Outscraper Dashboard](https://app.outscraper.com/api-keys).
- `OUTSCRAPER_BASE_URL` (Optional): Override the default API endpoint.

## Running

```bash
export OUTSCRAPER_API_KEY='your_api_key'
npm start
```

For development:
```bash
npm run dev
```

## Tool Naming Convention

Tools are namespaced under `outscraper_` and use the `operationId` or a normalized path:
- `outscraper_google_maps_search`
- `outscraper_google_maps_reviews`
- `outscraper_google_search`
- `outscraper_emails_and_contacts`

If an endpoint supports both GET and POST, they are suffixed accordingly:
- `outscraper_google_maps_search_get`
- `outscraper_google_maps_search_post`

## Resources

Exposed read-only data for context:
- `outscraper://docs/openapi`: The full OpenAPI specification.
- `outscraper://docs/api-reference`: High-level documentation and links.

## Prompts

Guided workflows for users:
- `business-search`: Search businesses on Google Maps.
- `email-discovery`: Extract contacts from domains or names.
- `check-api-key`: Verify API key and balance.

## Verification

To verify that all tools are correctly generated and there are no name collisions:

```bash
npm run tools:list
```

## Maintenance

To update the tools when the Outscraper API changes:
1. Replace `outscraper-api-docs.json` with the latest version.
2. Run `npm run build`.
3. Verify with `npm run tools:list`.

## License

MIT — see [LICENSE](LICENSE)
