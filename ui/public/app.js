const form = document.querySelector("#chat-form");
const field = document.querySelector("#message");
const send = document.querySelector("#send");
const messages = document.querySelector("#messages");
const errorBox = document.querySelector("#error");
const welcomeTemplate = document.querySelector("#welcome").cloneNode(true);
let responseId = null;
let sessionId = null;
let busy = false;
let generation = 0;

function addMessage(role, text) {
  document.querySelector("#welcome")?.remove();
  const row = document.createElement("div");
  row.className = `message ${role}`;
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.textContent = role === "assistant" ? "✦" : "あなた";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  row.append(avatar, bubble);
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
  return row;
}

async function submit(text) {
  const message = text.trim();
  if (!message || busy) return;
  const currentGeneration = generation;
  busy = true;
  send.disabled = true;
  field.disabled = true;
  errorBox.hidden = true;
  addMessage("user", message);
  field.value = "";
  const waiting = addMessage("assistant", "回答を作成しています…");
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, responseId, sessionId })
    });
    const result = await response.json();
    if (currentGeneration !== generation) return;
    if (!response.ok) throw new Error(result.error || "通信に失敗しました。");
    if (!result.answer || !result.responseId || !result.sessionId) throw new Error("エージェントの応答が不完全です。");
    responseId = result.responseId;
    sessionId = result.sessionId;
    waiting.querySelector(".bubble").textContent = result.answer;
  } catch (error) {
    if (currentGeneration !== generation) return;
    waiting.remove();
    field.value = message;
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    if (currentGeneration === generation) {
      busy = false;
      send.disabled = false;
      field.disabled = false;
      field.focus();
      messages.scrollTop = messages.scrollHeight;
    }
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  submit(field.value);
});
field.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});
messages.addEventListener("click", event => {
  const button = event.target.closest("[data-prompt]");
  if (button) submit(button.dataset.prompt);
});
document.querySelector("#reset").addEventListener("click", () => {
  generation++;
  responseId = null;
  sessionId = null;
  busy = false;
  field.disabled = false;
  send.disabled = false;
  field.value = "";
  errorBox.hidden = true;
  messages.replaceChildren();
  messages.append(welcomeTemplate.cloneNode(true));
  field.focus();
});
