# AGENTS.md — Project Context & Engineering Guidelines

## Overview
This repository contains a **Node.js (TypeScript) Model Context Protocol (MCP) server** that exposes the **Outscraper API** as MCP tools, resources, and prompts. The server is designed to be fully data-driven, mapping OpenAPI operations directly to MCP tools.

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
- **Running a "Single Test"**: 
  1. Create a temporary file like `src/test-feature.ts`.
  2. Import the required modules (remembering `.js` extensions).
  3. Run `npm run build`.
  4. Execute via `node --enable-source-maps dist/test-feature.js`.
- **Debugging Protocol**: Use `DEBUG=mcp:*` environment variable to see protocol-level logs. **IMPORTANT**: Stdio servers must not log to stdout as it corrupts the JSON-RPC stream. Use `console.error` for all logging.

## Code Style & Guidelines

### TypeScript & Node.js
- **ESM Modules**: Use `"type": "module"` in `package.json`.
- **Import Paths**: All local imports **MUST** include the `.js` extension (e.g., `import { x } from './y.js'`). This is strictly required by the Node.js ESM loader.
- **Target**: Node.js 18+ features (async/await, top-level await, stable `fetch` or `undici`).
- **Formatting**: Adhere to existing 2-space indentation and single-quote convention.

### Naming Conventions
- **Files**: `camelCase.ts` (e.g., `outscraperClient.ts`) or `kebab-case.ts`.
- **Functions/Variables**: `camelCase`.
- **Classes/Types/Interfaces**: `PascalCase`.
- **MCP Tools**: Namespaced as `outscraper_[normalized_name]` (e.g., `outscraper_google_maps_search`).
- **MCP Resources**: URI format `outscraper://docs/[name]`.
- **MCP Prompts**: `kebab-case` names (e.g., `business-search`).

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
- **Timeouts**: Use the `timeoutMs` (default 120s) configured in `OutscraperClient`.

## Tool Generation Logic

### OpenAPI Mapping
- **Tool Name**: Derived from the OpenAPI `operationId`. If missing, it's generated from the path.
- **Method Suffix**: If a single path supports multiple HTTP methods (e.g., GET and POST), a `_get` or `_post` suffix is automatically appended to disambiguate.
- **Input Schema**: 
  - Query parameters are mapped to top-level properties.
  - JSON `requestBody` fields are merged into the same schema.
  - Arrays in query parameters are serialized as comma-separated strings (Outscraper convention).
  - **Gemini/OpenCode Compatibility**: Tool schemas must be valid JSON Schema. Specifically, the `items` property is ONLY valid for `type: "array"`. The generator must strip `items` from non-array types (like `boolean`).
- **Tool Annotations**: `operationToTool()` in `openapi.ts` is the single construction point — it also stamps every tool's `ToolAnnotations` (`title` reusing the tool name, `readOnlyHint: true`, `openWorldHint: true`; every operation here is a read-only fetch against a live external API). Requires `@modelcontextprotocol/sdk` `^1.25.2`+ (verified clean through 1.30.0 for the low-level `Server`/`setRequestHandler` API this server uses — `McpServer.tool()`-only breaking changes in that range don't apply here).

### Data Serialization
- **Query Params**: Booleans are converted to strings, arrays to CSV.
- **Body Params**: If the endpoint accepts JSON, arguments not matching query parameter names are collected into a JSON object.
- **Deref Logic**: The generator recursively resolves local `$ref` pointers within the spec to ensure nested objects are fully described to the LLM.

## Key Files & Responsibilities
- `src/index.ts`: Entry point. Validates environment variables and starts the MCP server.
- `src/server.ts`: Implements MCP `list_tools`, `call_tool`, `list_resources`, and `list_prompts` handlers.
- `src/openapi.ts`: Core logic for OpenAPI parsing, tool generation, and request building.
- `src/outscraperClient.ts`: Lightweight wrapper around `undici` for HTTP communication.
- `scripts/embed-openapi.mjs`: Build script that converts `outscraper-api-docs.json` into a TypeScript constant in `src/outscraperApiDocs.generated.ts`.

## Design Patterns to Preserve
- **Data-Driven Architecture**: Avoid hardcoding specific endpoint logic. Improvements should be made to the generic mapping logic in `openapi.ts`.
- **Build-Time Embedding**: The OpenAPI spec is embedded into the source. This ensures the server is portable and doesn't rely on the JSON file's presence at runtime.
- **Transparency**: Tool descriptions include the original HTTP method and path to help the LLM understand the underlying API contract.

## Security & Safety
- **Secrets**: Never log or commit the `OUTSCRAPER_API_KEY`.
- **Environment**: All commands requiring API access must have `OUTSCRAPER_API_KEY` set.
- **Validation**: Strict schema validation ensures LLM-provided arguments match API expectations.

## Common Tasks for Agents

### 1. Adding a Specialized Tool Wrapper
If an API endpoint needs custom pre-processing or post-processing (e.g., formatting complex JSON responses into readable tables), follow this pattern:
- Locate the generic handler in `src/server.ts`.
- Identify the operation ID.
- Create a specific logic block for that tool name in `CallToolRequestSchema` handler.
- Preference is still to keep the mapping generic in `openapi.ts` if the logic applies to multiple tools.

### 2. Updating the OpenAPI Definition
- Download the latest `outscraper-api-docs.json` from the provider.
- Place it in the root directory.
- Run `npm run build`. This triggers `scripts/embed-openapi.mjs` which regenerates `src/outscraperApiDocs.generated.ts`.
- Run `npm run tools:list` and compare with previous counts to ensure no regressions.

### 3. Troubleshooting Tool Failures
- **401 Unauthorized**: Ensure `OUTSCRAPER_API_KEY` is correctly passed and hasn't expired.
- **402 Payment Required**: Account balance is likely exhausted.
- **422 Unprocessable Entity**: The schema validation passed but the API rejected the combination of arguments. Check the error message body in the LLM's response.
- **Protocol Errors**: If the MCP client reports a parse error, check `console.error` for hidden `console.log` output that might be polluting stdout.

## Troubleshooting & Debugging

### Stdio Transport Issues
The server communicates via `stdin` and `stdout`. Any noise on `stdout` will break the JSON-RPC communication.
- Use `console.error()` for all debugging.
- Use `DEBUG=mcp:*` to see the internal protocol flow.
- If using an IDE, look for the MCP output panel (usually in the "Output" or "Logs" tab).

### Type Errors in Generation
The `openapi.ts` logic makes several assumptions about the structure of the OpenAPI document:
- It supports OpenAPI 3.0+.
- It uses basic JSON reference resolution (`$ref`).
- If a schema is missing, it defaults to `{ "type": "string" }`.
- If you encounter a complex nested schema that the generator misinterprets, simplify the mapping in `buildInputSchema`.

### Testing New Endpoints
Before assuming a tool works, verify it manually:
1. Identify the tool name from `npm run tools:list`.
2. Create a temporary script `src/manual-test.ts`.
3. Use `OutscraperClient` directly to call the endpoint.
4. Verify the response format matches the expected TypeScript types.
