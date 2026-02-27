# gmail-mcp

MCP server for Gmail with OAuth2 authentication. Search, read, send, and manage emails programmatically through any MCP client.

## Features

- **OAuth2 authentication** with automatic token refresh
- **Search** using full Gmail query syntax (`from:`, `subject:`, `has:attachment`, etc.)
- **Read** full email content with recursive multipart parsing
- **Send** emails with CC/BCC support
- **Threading** -- reply to existing conversations with proper `In-Reply-To` and `References` headers
- **Labels** -- list all Gmail labels/folders

## Tools

| Tool | Description |
|------|-------------|
| `search_emails` | Search Gmail with query syntax. Returns snippets, IDs, metadata. |
| `read_email` | Read full email content by message ID. Handles multipart/HTML. |
| `send_email` | Send a new email or reply to a thread. Supports CC/BCC. |
| `list_labels` | List all Gmail labels and their IDs. |

## Setup

### 1. Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or use an existing one)
3. Enable the **Gmail API**
4. Go to Credentials > Create Credentials > OAuth 2.0 Client ID
5. Set application type to **Web application**
6. Add `http://localhost:3847/callback` as an authorized redirect URI
7. Copy the Client ID and Client Secret

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

### 3. Build and Enroll

```bash
npm install
npm run enroll
```

This opens a browser window for Google OAuth consent. After authorizing, tokens are saved to `~/.gmail-mcp/credentials.json` and auto-refresh on expiry.

### 4. MCP Client Config

```json
{
  "mcpServers": {
    "gmail": {
      "command": "node",
      "args": ["path/to/gmail-mcp/dist/index.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "your-client-id",
        "GOOGLE_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

## Stack

- TypeScript
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- [googleapis](https://github.com/googleapis/google-api-nodejs-client) (Gmail API v1)
- Zod for input validation
- dotenv for config

## Architecture

```
src/
  index.ts    -- MCP server with 4 tools
  auth.ts     -- OAuth2 client, token persistence, auto-refresh
  enroll.ts   -- One-time enrollment flow (local HTTP callback)
```

Tokens are stored at `~/.gmail-mcp/credentials.json`. The OAuth2 client listens for token refresh events and persists updated tokens automatically, so you never have to re-enroll unless you revoke access.

## License

MIT
