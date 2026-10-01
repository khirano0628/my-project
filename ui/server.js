import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { DefaultAzureCredential } from "@azure/identity";

const endpoint = process.env.FOUNDRY_AGENT_ENDPOINT ??
  "https://CustomerSupport2-resource.services.ai.azure.com/api/projects/CustomerSupport2/agents/azure-customer-service-agent/endpoint/protocols/openai/responses?api-version=v1";
if (new URL(endpoint).protocol !== "https:") {
  throw new Error("FOUNDRY_AGENT_ENDPOINT must use HTTPS.");
}

const files = new Map([
  ["/", ["./public/index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["./public/app.js", "text/javascript; charset=utf-8"]],
  ["/style.css", ["./public/style.css", "text/css; charset=utf-8"]]
]);
const root = new URL(".", import.meta.url);

function reply(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

export function extractAnswer(response) {
  if (response.status && response.status !== "completed") {
    throw new Error(`Agent response status: ${response.status}`);
  }
  const text = response.output_text ||
    response.output?.flatMap(item => item.content ?? [])
      .filter(part => part.type === "output_text" && typeof part.text === "string")
      .map(part => part.text).join("\n");
  if (!text || typeof response.id !== "string") {
    throw new Error("Agent response is missing text or response ID.");
  }
  return { answer: text, responseId: response.id, sessionId: response.agent_session_id ?? null };
}

export function createServer({ credential = new DefaultAzureCredential(), invoke = fetch, log = console.error } = {}) {
  return http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    const host = req.headers.host;
    if (!host || !/^(localhost|127\.0\.0\.1):\d+$/.test(host)) {
      return reply(res, 403, { error: "Local access only." });
    }
    if (req.method === "GET" && files.has(req.url)) {
      const [file, type] = files.get(req.url);
      try {
        const data = await readFile(new URL(file, root));
        res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
        return res.end(data);
      } catch (error) {
        log(error);
        return reply(res, 500, { error: "UI file could not be loaded." });
      }
    }
    if (req.method !== "POST" || req.url !== "/api/chat") {
      return reply(res, 404, { error: "Not found." });
    }
    const origin = req.headers.origin;
    if (origin && origin !== `http://${host}`) {
      return reply(res, 403, { error: "Invalid origin." });
    }
    if (!req.headers["content-type"]?.startsWith("application/json")) {
      return reply(res, 415, { error: "JSON is required." });
    }
    let body = "";
    try {
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 16384) {
          return reply(res, 413, { error: "Message is too long." });
        }
      }
      let input;
      try {
        input = JSON.parse(body);
      } catch {
        return reply(res, 400, { error: "Invalid JSON." });
      }
      if (!input || typeof input.message !== "string" || !input.message.trim() ||
          input.message.length > 4000 ||
          (input.responseId != null && (typeof input.responseId !== "string" || !/^[\w-]+$/.test(input.responseId))) ||
          (input.sessionId != null && (typeof input.sessionId !== "string" || !/^[\w-]+$/.test(input.sessionId))) ||
          (input.responseId && !input.sessionId)) {
        return reply(res, 400, { error: "Invalid message or conversation." });
      }
      const token = await credential.getToken("https://ai.azure.com/.default");
      if (!token) throw new Error("Could not acquire a Foundry access token.");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      let upstream;
      try {
        upstream = await invoke(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            input: input.message.trim(),
            stream: false,
            ...(input.responseId ? { previous_response_id: input.responseId, agent_session_id: input.sessionId } : {})
          }),
          signal: controller.signal
        });
        if (!upstream.ok) {
          log(`Foundry returned HTTP ${upstream.status}.`);
          return reply(res, 502, { error: "エージェントに接続できませんでした。認証と権限を確認してください。" });
        }
        return reply(res, 200, extractAnswer(await upstream.json()));
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      log(error);
      return reply(res, 502, { error: "応答を取得できませんでした。しばらくしてから再試行してください。" });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, "127.0.0.1", () => {
    console.log(`Azure customer service UI: http://localhost:${port}`);
  });
}
