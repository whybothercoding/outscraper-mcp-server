# Model Context Protocol (MCP) - Custom Server Development Guide

## Overview

**Model Context Protocol (MCP)** is an open standard that enables seamless integration between LLM applications and external data sources, tools, and services. Think of MCP as a "USB-C port for AI" — it provides a standardized way for AI models to connect to different systems.

**Key Features:**
- Standardized JSON-RPC 2.0 protocol
- Stateful connections with capability negotiation
- Cross-platform compatibility with any MCP-compatible client
- Security-first design with user consent requirements

---

## Architecture Overview

### Component Hierarchy

```
Host Application (Claude Desktop, IDE, Custom App)
        ↓
    MCP Client (within host)
        ↓
    Connection Layer (stdio, HTTP/SSE, WebSocket)
        ↓
    MCP Server (your custom implementation)
        ↓
    External Services/APIs/Data Sources
```

### Core Roles

- **Host**: LLM application that initiates connections (e.g., Claude Desktop, Cursor, ChatGPT)
- **Client**: Connector within the host that communicates with servers
- **Server**: Your application that exposes capabilities to clients

### Capability Negotiation

During initialization, servers and clients exchange capability information:
- Server advertises: Tools, Resources, Prompts, Sampling support
- Client advertises: Sampling capability, Roots support, Elicitation support

---

## MCP Server Capabilities

### 1. **Tools** (Functions/Actions)

Tools are functions that LLMs can call during conversations. They enable arbitrary code execution with user approval.

**When to use:** For actions like API calls, database operations, file manipulation, external service integration.

**Structure:**
```json
{
  "name": "tool_name",
  "description": "Clear description of what the tool does",
  "inputSchema": {
    "type": "object",
    "properties": {
      "param1": {"type": "string", "description": "What this parameter does"},
      "param2": {"type": "number"}
    },
    "required": ["param1"]
  }
}
```

**Security:** Tools represent arbitrary code execution. Descriptions and annotations are untrusted unless from a trusted server.

### 2. **Resources** (Context/Data)

Resources are read-only data exposed to LLMs and users. They provide context without requiring user confirmation.

**When to use:** For API documentation, file contents, database records, static data.

**Examples:**
- `docs://api/reference` → API documentation
- `file://path/to/document.md` → File contents
- `crm://customers/123` → Customer data

**Features:**
- Identified by URI
- MIME type specification
- Can be text, HTML, binary data

### 3. **Prompts** (Templates)

Pre-written prompt templates that help users accomplish specific tasks.

**When to use:** For recurring workflows, standardized processes, guided interactions.

**Use Cases:**
- Code analysis templates
- Writing assistance templates
- Task-specific workflows
- Multi-step processes

---

## Building Custom MCP Servers

### 1. SDK Selection

#### Python (FastMCP / FastAPI)
- **Best for:** Rapid iteration, data science workflows
- **Package:** `pip install mcp`
- **Framework:** FastMCP (lightweight) or FastAPI (full-featured)
- **Setup:**
  ```bash
  python3 -m venv venv
  source venv/bin/activate  # On Windows: venv\Scripts\activate
  pip install mcp
  ```

#### TypeScript/Node.js
- **Best for:** Web-native stacks, tight integration with web services
- **Package:** `npm install @modelcontextprotocol/sdk`
- **Benefits:** End-to-end type safety, node-native async
- **Setup:**
  ```bash
  npm install @modelcontextprotocol/sdk zod
  ```

#### Java
- **Best for:** Enterprise environments, Spring Boot integration
- **Framework:** Spring AI MCP auto-configuration
- **Dependency:**
  ```xml
  <dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-mcp-server</artifactId>
  </dependency>
  ```

#### Ruby & C#
- Official SDKs available (maintained with Shopify and Microsoft respectively)

### 2. Basic Server Structure (Python Example)

```python
from mcp.server import Server
from mcp.server.stdio import stdio_server
import mcp.types as types

# Initialize server
server = Server("my-server")

# Register a tool
@server.tool()
def get_weather(location: str) -> str:
    """Get weather for a location"""
    return f"Weather data for {location}"

# Register a resource
@server.resource("file://example")
def read_resource():
    return "Resource content"

# Run server
async def main():
    async with stdio_server(server) as streams:
        await streams.wait_closed()

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
```

### 3. Basic Server Structure (TypeScript Example)

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Tool, Resource, TextContent, Response } from "@modelcontextprotocol/sdk/types.js";

const server = new Server({
  name: "my-server",
  version: "1.0.0",
});

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_weather",
      description: "Get weather for a location",
      inputSchema: {
        type: "object",
        properties: {
          location: { type: "string" }
        },
        required: ["location"]
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "get_weather") {
    return {
      content: [{ type: "text", text: "Weather data..." }]
    };
  }
  throw new Error("Unknown tool");
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

---

## Transport Options

### 1. **Standard I/O (stdio)**
- **Best for:** Local servers, IDE integration, Claude Desktop
- **Startup:** Direct process launch via command
- **Example:** `node /path/to/server.js`
- **Limitation:** No network access

### 2. **HTTP with Server-Sent Events (SSE)**
- **Best for:** Remote servers, VPS deployment, persistent services
- **Port:** Typically 8000+
- **Example Endpoint:** `http://localhost:8000/sse`
- **Advantages:** Works across networks, easier debugging

### 3. **WebSocket**
- **Best for:** Real-time bi-directional communication
- **Support:** Some clients require gateways to bridge from HTTP/SSE

---

## Deployment Approaches

### 1. **Local Development (stdio)**
```bash
# In Claude Desktop config (~/.config/Claude/claude_desktop_config.json)
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/absolute/path/to/build/index.js"]
    }
  }
}
```

### 2. **VPS/Self-Hosted (HTTP/SSE)**

**Python FastAPI Example:**
```python
from fastapi import FastAPI
from mcp.server.fastapi import FastAPIServer

app = FastAPI()
mcp_server = FastAPIServer(server)

@app.get("/sse")
async def sse_endpoint():
    return mcp_server.handle_sse_stream()

# Run with: uvicorn app:app --host 0.0.0.0 --port 8000
```

**Dockerfile:**
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 3. **Cloudflare Workers**
- Deploy serverless MCP servers on Cloudflare infrastructure
- Auto-scaling, global distribution
- Deploy with: `wrangler deploy`

### 4. **Container Platforms**
- **Northflank:** Container deployment with HA, auto-scaling
- **Docker:** Package for consistency across environments
- **Kubernetes:** For enterprise-scale deployments

---

## Authentication & Authorization

### 1. **API Key Authentication**
```python
@server.tool()
def authenticated_tool(api_key: str, query: str) -> str:
    if not validate_api_key(api_key):
        raise ValueError("Invalid API key")
    # Proceed with tool logic
```

### 2. **OAuth 2.0 (Recommended)**
- **When:** Users need to authenticate with third-party services
- **Flow:** Users grant permission through OAuth provider
- **Setup:** Register with identity provider, handle auth code exchange
- **Example:** Connecting to Stripe, GitHub, Google APIs

**Typical OAuth Flow:**
1. Client receives auth request
2. Redirects user to OAuth provider
3. User grants permissions
4. Server receives auth code
5. Exchange code for access token
6. Use token for API calls

### 3. **Static Tokens/Environment Variables**
```python
import os
api_token = os.getenv("API_TOKEN")
```

### Security Best Practices

- Never expose credentials in code or config files
- Use environment variables for sensitive data
- Validate all inputs and API responses
- Implement rate limiting for public servers
- Log authentication failures
- Use HTTPS for remote servers

---

## Testing & Debugging

### 1. **MCP Inspector**

GUI tool for testing servers without integrating with LLM clients.

**Installation & Usage:**
```bash
npm install -g @modelcontextprotocol/inspector
mcp-inspector

# Then configure your server in the inspector UI
# Access at http://localhost:5173
```

**Tests:**
- List tools/resources/prompts
- Call tools with test inputs
- Verify response formats
- Debug error handling

### 2. **Local Integration Testing**

**With Claude Desktop:**
1. Add server to config
2. Restart Claude
3. Test in conversation

**With Custom Client:**
```python
import subprocess
import json

# Start server
process = subprocess.Popen(["python", "server.py"])

# Send JSON-RPC request
request = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
}

# Process handles stdio communication
```

### 3. **Logging**

**Important:** STDIO servers MUST NOT write to stdout (corrupts JSON-RPC).

**Correct Approaches:**
- Write to stderr: `sys.stderr.write()`, `console.error()`
- Write to files: Log files in separate directory
- HTTP servers: Logging doesn't interfere with HTTP responses

---

## Practical Examples

### Example 1: Weather API Tool

```python
from mcp.server import Server
import httpx

server = Server("weather-server")

@server.tool()
def get_weather(location: str, units: str = "celsius") -> str:
    """Get current weather for a location"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.weatherapi.com/v1/current.json",
                params={"q": location, "aqi": "no"}
            )
            data = response.json()
            return f"Temperature: {data['current']['temp_c']}°C, Condition: {data['current']['condition']['text']}"
    except Exception as e:
        return f"Error fetching weather: {str(e)}"
```

### Example 2: Database Query Tool

```python
@server.tool()
async def query_database(sql: str, limit: int = 100) -> str:
    """Execute a safe database query"""
    # Validate SQL (basic example - use proper query parameterization)
    allowed_keywords = ["SELECT", "FROM", "WHERE"]
    if not all(keyword in sql.upper() for keyword in ["SELECT", "FROM"]):
        raise ValueError("Only SELECT queries allowed")
    
    # Execute with parameterized queries
    async with database.connection() as conn:
        results = await conn.fetch(sql, limit=limit)
        return json.dumps(results)
```

### Example 3: File Resource

```python
@server.resource("file://docs/api-reference")
async def read_api_docs():
    """Expose API documentation as a resource"""
    with open("./docs/api-reference.md", "r") as f:
        content = f.read()
    return {
        "uri": "file://docs/api-reference",
        "mimeType": "text/markdown",
        "text": content
    }
```

---

## Common Patterns

### 1. **API Integration Pattern**

```
MCP Server ←→ External API ←→ Third-party Service
     ↑
   LLM Client
```

Example: MCP server wraps Stripe API for Claude to manage payments.

### 2. **Database Access Pattern**

```
MCP Server ←→ Database ←→ Business Data
     ↑
   LLM Client
```

Expose safe queries as tools; resources for schema/docs.

### 3. **File System Pattern**

```
MCP Server ←→ Local/Cloud Storage ←→ Files/Documents
     ↑
   LLM Client
```

Resource endpoints for reading; tools for writing (with validation).

---

## Best Practices

### Security

1. **Validate All Inputs:** Never trust tool inputs
2. **Sanitize Outputs:** Prevent injection attacks
3. **Implement Rate Limiting:** Prevent abuse
4. **Use HTTPS/TLS:** For remote servers
5. **Minimal Permissions:** Only expose necessary capabilities
6. **Audit Logging:** Log all tool calls and results

### Performance

1. **Async/Await:** Use non-blocking operations
2. **Connection Pooling:** Reuse database/API connections
3. **Caching:** Cache frequently accessed resources
4. **Pagination:** Handle large result sets
5. **Timeouts:** Prevent hanging requests

### Reliability

1. **Error Handling:** Graceful failure modes
2. **Health Checks:** Expose `/health` endpoint
3. **Retry Logic:** Handle transient failures
4. **Circuit Breakers:** Prevent cascading failures
5. **Monitoring:** Track performance metrics

### Documentation

1. **Clear Descriptions:** Tool/resource descriptions should be precise
2. **Example Usage:** Show common patterns
3. **Parameter Docs:** Document all parameters
4. **Error Cases:** Document what can go wrong
5. **Type Safety:** Use strict schemas

---

## Troubleshooting

### Server Won't Start

**Check:**
- Node/Python version compatibility
- Missing dependencies: `npm install` / `pip install -r requirements.txt`
- Port already in use: Change port or kill existing process
- File permissions: Ensure script is executable

### Client Can't Connect

**Check:**
- Config file path correct (check for typos)
- Absolute path used (not relative)
- Command exists and is executable
- No stdout interference (for stdio servers)

### Tool Calls Fail

**Check:**
- Tool schema matches actual parameters
- Required parameters present
- Input validation logic
- External API availability
- Network/firewall issues

### Performance Issues

**Optimize:**
- Use async operations
- Implement connection pooling
- Cache responses
- Add pagination for large results
- Profile with dev tools

---

## MCP Registry & Discovery

**MCP Registry:** Community-driven registry for discovering MCP servers
- Visit: `modelcontextprotocol.io/registry`
- Browse existing implementations for examples
- Publish your servers for community use
- Check authentication requirements of others' servers

---

## Configuration Files

### Claude Desktop Config

**Location:**
- macOS/Linux: `~/.config/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**Example:**
```json
{
  "mcpServers": {
    "my-local-server": {
      "command": "node",
      "args": ["/absolute/path/to/server.js"]
    },
    "my-remote-server": {
      "url": "http://localhost:8000/sse",
      "auth": {
        "type": "bearer",
        "token": "your-token-here"
      }
    }
  }
}
```

### Environment Variables

**Common Pattern:**
```bash
# .env file
API_KEY=your_api_key_here
DATABASE_URL=postgresql://user:pass@localhost/db
LOG_LEVEL=debug
```

**Usage:**
```python
import os
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("API_KEY")
```

---

## Resources & Links

- **Official MCP Specification:** https://modelcontextprotocol.io/specification
- **Python SDK:** https://github.com/modelcontextprotocol/python-sdk
- **TypeScript SDK:** https://github.com/modelcontextprotocol/typescript-sdk
- **MCP Inspector:** Development testing tool
- **Examples:** https://github.com/modelcontextprotocol (see example-server)
- **Community:** GitHub discussions, Discord communities

---

## Summary Checklist for Building MCP Servers

- [ ] Choose SDK (Python, TypeScript, Java, etc.)
- [ ] Design capabilities (Tools, Resources, Prompts needed?)
- [ ] Define tool schemas with clear descriptions
- [ ] Implement input validation
- [ ] Handle errors gracefully
- [ ] Set up proper logging (avoid stdout for stdio servers)
- [ ] Test with MCP Inspector
- [ ] Configure authentication if needed
- [ ] Choose transport (stdio for local, HTTP/SSE for remote)
- [ ] Implement security best practices
- [ ] Document tool/resource purposes
- [ ] Set up deployment (local, VPS, cloud)
- [ ] Configure client (Claude Desktop, IDE, custom)
- [ ] Test end-to-end with actual LLM client
- [ ] Monitor and iterate based on usage

