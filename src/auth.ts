import "dotenv/config";
import { google } from "googleapis";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Store tokens alongside the existing .gmail-mcp directory
const TOKEN_PATH = join(homedir(), ".gmail-mcp", "credentials.json");

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

export function getCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env");
  }
  return { clientId, clientSecret };
}

export function createOAuth2Client() {
  const { clientId, clientSecret } = getCredentials();
  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "http://localhost:3847/callback"
  );

  if (existsSync(TOKEN_PATH)) {
    const tokens = JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
    oauth2.setCredentials(tokens);

    // Auto-persist refreshed tokens
    oauth2.on("tokens", (newTokens) => {
      const existing = JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
      const merged = { ...existing, ...newTokens };
      writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    });
  }

  return oauth2;
}

export function getAuthUrl() {
  const { clientId, clientSecret } = getCredentials();
  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "http://localhost:3847/callback"
  );
  return oauth2.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function exchangeCode(code: string) {
  const { clientId, clientSecret } = getCredentials();
  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "http://localhost:3847/callback"
  );
  const { tokens } = await oauth2.getToken(code);
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  return tokens;
}

export { SCOPES, TOKEN_PATH };
