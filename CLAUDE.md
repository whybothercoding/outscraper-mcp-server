# CLAUDE.md — Outscraper MCP Server Guide

## Development Commands
- **Build**: `npm run build`
- **Lint/Typecheck**: `npm run typecheck`
- **Verify Tools**: `npm run tools:list`
- **Run (Production)**: `OUTSCRAPER_API_KEY='...' npm start`
- **Run (Development)**: `npm run dev`

## Project Context
This is a Node.js MCP server that maps the Outscraper OpenAPI specification to MCP tools.

## Code Style & Standards
- **Imports**: Always use `.js` extension in import paths (ESM requirement).
- **TypeScript**: Strict typing; target Node 18+.
- **Naming**: `camelCase` for functions/variables, `PascalCase` for types/classes.
- **Tools**: Prefix all tool names with `outscraper.`. Names are derived from OpenAPI `operationId` or path.
- **Error Handling**: Throw descriptive `Error` objects. Normalize API errors with status and response body in `OutscraperClient`.

## Architecture
- `src/openapi.ts`: Handles OpenAPI parsing and tool generation.
- `src/server.ts`: Implements the MCP protocol handlers.
- `src/outscraperClient.ts`: Core HTTP client using `undici`.
- `scripts/embed-openapi.mjs`: Build-time script to embed the JSON spec into TypeScript.

## Tool Generation Rules
- 1 OpenAPI operation = 1 MCP tool.
- Input schemas are built from query parameters and JSON request bodies.
- Query arrays are comma-separated.
