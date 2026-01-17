# CLAUDE.md — Outscraper MCP Server Guide

## Development Commands
- **Build**: `npm run build` (Prebuilds and compiles)
- **Typecheck**: `npm run typecheck` (No emit)
- **Verify Tools**: `npm run tools:list` (Check coverage & collisions)
- **Run (Production)**: `OUTSCRAPER_API_KEY='...' npm start`
- **Run (Development)**: `npm run dev` (Watches dist/)
- **Quick Test**: `OUTSCRAPER_API_KEY='...' node dist/test-script.js`

## Technical Standards
- **ESM**: File extensions `.js` required in imports.
- **Node.js**: 18+, async/await preferred.
- **MCP Naming**: Tools use `outscraper.[op_name]`. Resources use `outscraper://docs/`.
- **Formatting**: 2-space indentation, single quotes.
- **Errors**: Throw `Error` with descriptive messages. API errors must include status code.

## Core Structure
- `src/index.ts`: Server entry and env validation.
- `src/server.ts`: MCP handler implementation (Tools, Resources, Prompts).
- `src/openapi.ts`: OpenAPI -> Tool mapping logic.
- `src/outscraperClient.ts`: HTTP communication via `undici`.
- `src/outscraperApiDocs.generated.ts`: Embedded OpenAPI spec.

## Important Note
NEVER use `console.log` for runtime logging; it corrupts the Stdio transport. Use `console.error` for all diagnostic output.
