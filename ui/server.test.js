import test from "node:test";
import assert from "node:assert/strict";
import { createServer, extractAnswer } from "./server.js";

test("extracts OpenAI response content and rejects empty responses", () => {
  assert.deepEqual(extractAnswer({
    id: "caresp_1", agent_session_id: "session_1", status: "completed",
    output: [{ content: [{ type: "output_text", text: "こんにちは" }] }]
  }), { answer: "こんにちは", responseId: "caresp_1", sessionId: "session_1" });
  assert.throws(() => extractAnswer({ id: "caresp_2", output: [] }), /missing text/);
});

test("serves UI and threads remote responses without leaking credentials", async () => {
  const calls = [];
  const server = createServer({
    credential: { getToken: async scope => {
      assert.equal(scope, "https://ai.azure.com/.default");
      return { token: "secret-token" };
    } },
    invoke: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        id: `caresp_${calls.length}`, agent_session_id: "session_1", status: "completed",
        output: [{ content: [{ type: "output_text", text: `返答 ${calls.length}` }] }]
      }), { status: 200 });
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Azure サポートアシスタント/);
    const send = body => fetch(`${url}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const first = await send({ message: "ログインできません" });
    assert.equal(first.status, 200);
    const result = await first.json();
    assert.equal(result.answer, "返答 1");
    assert.ok(!JSON.stringify(result).includes("secret-token"));
    const second = await send({ message: "続けて", responseId: result.responseId, sessionId: result.sessionId });
    assert.equal(second.status, 200);
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      input: "続けて", stream: false, previous_response_id: "caresp_1", agent_session_id: "session_1"
    });
    assert.equal(calls[0].options.headers.Authorization, "Bearer secret-token");
    assert.equal((await send({ message: "" })).status, 400);
    assert.equal((await fetch(`${url}/api/chat`, { method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://example.org" },
      body: JSON.stringify({ message: "hi" }) })).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
