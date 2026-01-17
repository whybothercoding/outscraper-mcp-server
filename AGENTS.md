# AGENTS.md — Project Context & Engineering Guidelines

## Overview
This repository contains a **Node.js (TypeScript) Model Context Protocol (MCP) server** that exposes the **Outscraper API** as MCP tools. The server is designed to be fully data-driven, mapping OpenAPI operations directly to MCP tools.

### Core Design Principle
**1 OpenAPI operation = 1 MCP tool.**
The tool surface is dynamically generated from the Outscraper OpenAPI spec (`outscraper-api-docs.json`).

## Development Workflows

### Build & Verification
- **Full Build**: `npm run build` (runs prebuild and tsc)
- **Prebuild Only**: `npm run prebuild` (embeds OpenAPI spec)
- **Type Checking**: `npm run typecheck` (no emit)
- **Tool Verification**: `npm run tools:list` (checks for collisions and coverage)
- **Development Mode**: `npm run dev` (watches for changes in `dist/`)

### Testing & Debugging
The project currently favors manual verification and the `tools:list` script.
- **Running a specific script**: Use `node --enable-source-maps dist/someFile.js`.
- **Unit Testing**: If you add unit tests (e.g., using a file like `src/test-feature.ts`), you can run it after building via `node dist/test-feature.js`.
- **Environment**: All commands requiring API access must have `OUTSCRAPER_API_KEY` set in the environment.

## Code Style & Guidelines

### TypeScript & Node.js
- **ESM Modules**: Use `"type": "module"` in `package.json`.
- **Import Paths**: All local imports **MUST** include the `.js` extension (e.g., `import { x } from './y.js'`). This is strictly required by the Node.js ESM loader.
- **Target**: Node.js 18+ features (async/await, top-level await, stable `fetch` or `undici`).

### Naming Conventions
- **Files**: `camelCase.ts` (e.g., `outscraperClient.ts`) or `kebab-case.ts`.
- **Functions/Variables**: `camelCase`.
- **Classes/Types/Interfaces**: `PascalCase`.
- **MCP Tools**: `outscraper.normalized_name` (e.g., `outscraper.google_maps_search`).

### Imports & Exports
- **Named Exports**: Strongly prefer named exports over default exports for better IDE support and tree-shaking.
- **Grouping**: Group imports in this order:
  1. Built-in Node.js modules (`node:fs/promises`)
  2. Third-party libraries (`@modelcontextprotocol/sdk`)
  3. Local modules (`./openapi.js`)

### Error Handling
- **Descriptive Errors**: Use standard `Error` objects with clear messages explaining the failure.
- **API Normalization**: In `OutscraperClient`, always catch non-2xx responses and throw an error string containing the status code and the first 2000 characters of the response body. This allows the LLM to see exactly why a tool call failed (e.g., "Insufficient balance").
- **IO Safety**: Use `try/catch` blocks around all file system operations and network requests.

### Asynchronous Code
- **Async/Await**: Use `async/await` exclusively; avoid raw Promises or callbacks.
- **Concurrency**: Use `Promise.all` for independent parallel operations to improve performance.

## Tool Generation Logic

### OpenAPI Mapping
- **Tool Name**: Derived from the OpenAPI `operationId`. If missing, it's generated from the path.
- **Method Suffix**: If a single path supports multiple HTTP methods (e.g., GET and POST), a `_get` or `_post` suffix is automatically appended to disambiguate.
- **Input Schema**: 
  - Query parameters are mapped to top-level properties.
  - JSON `requestBody` fields are merged into the same schema.
  - Arrays in query parameters are serialized as comma-separated strings (Outscraper convention).

### Runtime Request Construction
When a tool is called, the `buildRequestForOperation` function:
1. Resolves `$ref` pointers in the spec to get the full operation definition.
2. Segregates arguments into query parameters and request body fields.
3. Automatically appends the `X-API-KEY` header.
4. Handles `application/json` payloads for POST/PUT/PATCH requests.

### Strict Schema Validation
- **Gemini/OpenCode Compatibility**: Tool schemas must be valid JSON Schema. Specifically, the `items` property is ONLY valid for `type: "array"`. The generator must strip `items` from non-array types (like `boolean`) to prevent LLM client crashes.

## Key Files & Responsibilities
- `src/index.ts`: Entry point. Validates environment variables and starts the MCP server.
- `src/server.ts`: Implements MCP `list_tools` and `call_tool` handlers.
- `src/openapi.ts`: Core logic for OpenAPI parsing, tool generation, and request building.
- `src/outscraperClient.ts`: Lightweight wrapper around `undici` for HTTP communication.
- `scripts/embed-openapi.mjs`: Build script that converts `outscraper-api-docs.json` into a TypeScript constant in `src/outscraperApiDocs.generated.ts`.

## Design Patterns to Preserve
- **Data-Driven Architecture**: Avoid hardcoding specific endpoint logic. Improvements should be made to the generic mapping logic in `openapi.ts`.
- **Build-Time Embedding**: The OpenAPI spec is embedded into the source. This ensures the server is portable and doesn't rely on the JSON file's presence at runtime.
- **Transparency**: Tool descriptions include the original HTTP method and path to help the LLM understand the underlying API contract.

## Maintenance & Evolution
- **Updating the API**: Replace `outscraper-api-docs.json` and run `npm run build`.
- **Dependencies**: Keep dependencies minimal (`@modelcontextprotocol/sdk`, `undici`).
- **Safety**: Never log or commit the `OUTSCRAPER_API_KEY`.

## Agent-Specific Instructions
- **Modifying Logic**: If you modify the tool generation or request building, always run `npm run tools:list` to verify that 1) all 99 operations are still mapped, 2) there are no name collisions, and 3) the schema generation is still valid.
- **New Features**: Ensure new logic follows the established ESM and TypeScript patterns. Always verify builds with `npm run typecheck`.
- **Debugging**: Use `DEBUG=mcp:*` environment variable if you need to see protocol-level logs, but be aware this might clutter the Stdio transport if not redirected.

## Common Tasks for Agents
1. **Adding a specialized wrapper**: If a tool needs custom logic (e.g. data post-processing), add it to `src/openapi.ts` within the generic mapping or create a registry of "special cases".
2. **Updating API definitions**: Replace `outscraper-api-docs.json`, run `npm run build`, and check `npm run tools:list`.
3. **Troubleshooting Tool Calls**: Check `src/outscraperClient.ts` to see how errors are normalized. Most issues are due to missing API keys or malformed arguments.
