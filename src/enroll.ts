import "dotenv/config";
import http from "http";
import { google } from "googleapis";
import { writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const TOKEN_PATH = join(homedir(), ".gmail-mcp", "credentials.json");
const PORT = 3847;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

import { SCOPES } from "./auth.js";

const clientId = process.env.GOOGLE_CLIENT_ID!;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const url = oauth2.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent",
});

console.log("\n--- Gmail MCP Enrollment ---\n");
console.log("Open this URL in your browser:\n");
console.log(url);
console.log(`\nWaiting for callback on ${REDIRECT_URI} ...\n`);

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) return;

  const params = new URL(req.url, `http://localhost:${PORT}`).searchParams;
  const code = params.get("code");
  const error = params.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`<h1>Error: ${error}</h1><p>Close this tab.</p>`);
    console.error("Auth error:", error);
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end("<h1>No code received</h1>");
    return;
  }

  try {
    const { tokens } = await oauth2.getToken(code);
    writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>Authenticated. Close this tab.</h1>");
    console.log("Tokens saved to", TOKEN_PATH);
    console.log("You're good to go. Restart Claude Code to use the gmail MCP.\n");
    setTimeout(() => process.exit(0), 500);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end(`<h1>Token exchange failed</h1><pre>${err}</pre>`);
    console.error("Token exchange failed:", err);
    process.exit(1);
  }
});

server.listen(PORT);
