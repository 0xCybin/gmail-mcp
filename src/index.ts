import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { google, gmail_v1 } from "googleapis";
import { z } from "zod";
import { createOAuth2Client } from "./auth.js";

const auth = createOAuth2Client();
const gmail = google.gmail({ version: "v1", auth });

// Extract text body from a Gmail message payload (handles multipart recursively)
function extractBody(payload: gmail_v1.Schema$MessagePart): string {
  if (payload.body?.data) {
    const mime = payload.mimeType || "";
    if (mime === "text/plain" || mime === "text/html") {
      const decoded = Buffer.from(payload.body.data, "base64url").toString("utf-8");
      if (mime === "text/html") {
        return decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
      return decoded;
    }
  }

  if (payload.parts) {
    // Prefer text/plain over text/html
    const plain = payload.parts.find((p) => p.mimeType === "text/plain");
    if (plain) return extractBody(plain);
    const html = payload.parts.find((p) => p.mimeType === "text/html");
    if (html) return extractBody(html);
    // Recurse into nested multipart
    for (const part of payload.parts) {
      const result = extractBody(part);
      if (result) return result;
    }
  }

  return "";
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

const server = new McpServer({ name: "gmail", version: "1.0.0" });

server.tool(
  "search_emails",
  "Search Gmail using query syntax (e.g. 'from:someone subject:hello'). Returns snippets and IDs.",
  {
    query: z.string().describe("Gmail search query (same syntax as Gmail search bar)"),
    maxResults: z.number().min(1).max(50).default(10).describe("Max results to return"),
  },
  async ({ query, maxResults }) => {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults,
    });

    if (!res.data.messages?.length) {
      return { content: [{ type: "text" as const, text: "No emails found." }] };
    }

    const details = await Promise.all(
      res.data.messages.map(async (msg) => {
        const full = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        });
        const h = full.data.payload?.headers;
        return {
          id: msg.id,
          from: getHeader(h, "From"),
          to: getHeader(h, "To"),
          subject: getHeader(h, "Subject"),
          date: getHeader(h, "Date"),
          snippet: full.data.snippet,
        };
      })
    );

    const text = details
      .map(
        (d, i) =>
          `[${i + 1}] ID: ${d.id}\n    From: ${d.from}\n    To: ${d.to}\n    Subject: ${d.subject}\n    Date: ${d.date}\n    Snippet: ${d.snippet}`
      )
      .join("\n\n");

    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "read_email",
  "Read the full content of an email by its ID.",
  {
    emailId: z.string().describe("The Gmail message ID"),
  },
  async ({ emailId }) => {
    const res = await gmail.users.messages.get({
      userId: "me",
      id: emailId,
      format: "full",
    });

    const h = res.data.payload?.headers;
    const body = res.data.payload ? extractBody(res.data.payload) : "(no body)";

    const text = [
      `From: ${getHeader(h, "From")}`,
      `To: ${getHeader(h, "To")}`,
      `Subject: ${getHeader(h, "Subject")}`,
      `Date: ${getHeader(h, "Date")}`,
      ``,
      body,
    ].join("\n");

    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "send_email",
  "Send an email. Supports plain text and reply-to (threading).",
  {
    to: z.string().describe("Recipient email address"),
    subject: z.string().describe("Email subject line"),
    body: z.string().describe("Email body (plain text)"),
    cc: z.string().optional().describe("CC recipients (comma-separated)"),
    bcc: z.string().optional().describe("BCC recipients (comma-separated)"),
    replyToMessageId: z.string().optional().describe("Message ID to reply to (for threading)"),
  },
  async ({ to, subject, body, cc, bcc, replyToMessageId }) => {
    const headers = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
    ];
    if (cc) headers.push(`Cc: ${cc}`);
    if (bcc) headers.push(`Bcc: ${bcc}`);

    let threadId: string | undefined;
    if (replyToMessageId) {
      const orig = await gmail.users.messages.get({
        userId: "me",
        id: replyToMessageId,
        format: "metadata",
        metadataHeaders: ["Message-ID"],
      });
      const messageIdHeader = getHeader(orig.data.payload?.headers, "Message-ID");
      if (messageIdHeader) {
        headers.push(`In-Reply-To: ${messageIdHeader}`);
        headers.push(`References: ${messageIdHeader}`);
      }
      threadId = orig.data.threadId || undefined;
    }

    const raw = Buffer.from(headers.join("\r\n") + "\r\n\r\n" + body).toString("base64url");

    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
        threadId,
      },
    });

    return {
      content: [{
        type: "text" as const,
        text: `Email sent successfully.\nMessage ID: ${res.data.id}\nThread ID: ${res.data.threadId}`,
      }],
    };
  }
);

server.tool(
  "list_labels",
  "List all Gmail labels (folders/categories).",
  {},
  async () => {
    const res = await gmail.users.labels.list({ userId: "me" });
    const labels = res.data.labels?.map((l) => `${l.name} (${l.id})`).join("\n") || "No labels.";
    return { content: [{ type: "text" as const, text: labels }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
