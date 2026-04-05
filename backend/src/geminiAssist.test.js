import assert from "node:assert/strict";
import test from "node:test";
import { formatGeminiErrorForClient } from "./geminiRetry.js";
import {
  normalizeAssistPayload,
  buildGeminiContents,
  parseModelJsonResponse,
} from "./geminiAssist.js";

test("normalizeAssistPayload fills defaults for minimal JSON", () => {
  const r = normalizeAssistPayload({
    intent: "general",
    assistantText: "Hello",
    browserSession: {
      id: "sess-x",
      mode: "gemini",
      status: "preview",
      task: "Find care",
      steps: [{ order: 1, description: "Step one", state: "pending" }],
      actions: [
        { id: "a1", label: "Maps", url: "https://www.google.com/maps/" },
      ],
    },
  });
  assert.equal(r.intent, "general");
  assert.equal(r.assistantText, "Hello");
  assert.equal(r.browserSession.mode, "gemini");
  assert.equal(r.browserSession.steps.length, 1);
  assert.equal(r.browserSession.actions[0].url, "https://www.google.com/maps/");
});

test("buildGeminiContents interleaves history and current user turn", () => {
  const c = buildGeminiContents("?", [
    { role: "user", text: "find a hospital" },
    { role: "assistant", text: "Here are maps links..." },
  ]);
  assert.equal(c.length, 3);
  assert.equal(c[0].role, "user");
  assert.equal(c[1].role, "model");
  assert.equal(c[2].role, "user");
  assert.ok(String(c[2].parts?.[0]?.text).includes("?"));
});

test("normalizeAssistPayload passes through priceCheckItems on browserSession", () => {
  const r = normalizeAssistPayload({
    intent: "musculoskeletal",
    assistantText: "Try gentle stretches.",
    browserSession: {
      id: "s1",
      mode: "gemini",
      status: "preview",
      task: "Neck comfort",
      steps: [{ order: 1, description: "Ergo tips", state: "pending" }],
      actions: [{ id: "nih", label: "NIH", url: "https://www.nih.gov/" }],
      priceCheckItems: ["olive oil", "frozen berries"],
    },
  });
  assert.deepEqual(r.browserSession.priceCheckItems, ["olive oil", "frozen berries"]);
});

test("parseModelJsonResponse strips markdown fences", () => {
  const raw = `\`\`\`json
{"intent":"general","assistantText":"Hi","browserSession":{"id":"1","mode":"gemini","status":"preview","task":"t","steps":[],"actions":[]}}
\`\`\``;
  const p = parseModelJsonResponse(raw);
  assert.equal(p.intent, "general");
  assert.equal(p.assistantText, "Hi");
});

test("parseModelJsonResponse extracts object when extra prose prefix", () => {
  const raw = `Here you go: {"intent":"general","assistantText":"Ok","browserSession":{"id":"x","mode":"gemini","status":"preview","task":"t","steps":[],"actions":[]}}`;
  const p = parseModelJsonResponse(raw);
  assert.equal(p.intent, "general");
});

test("normalizeAssistPayload repairs bad action URLs", () => {
  const r = normalizeAssistPayload({
    intent: "care_search",
    assistantText: "Ok",
    browserSession: {
      id: "",
      mode: "gemini",
      status: "preview",
      task: "t",
      steps: [],
      actions: [{ id: "x", label: "y", url: "not-a-url" }],
    },
  });
  assert.ok(r.browserSession.id.startsWith("sess-"));
  assert.match(r.browserSession.actions[0].url, /^https:\/\//);
});

test("formatGeminiErrorForClient maps API_KEY_INVALID JSON to a short user message", () => {
  const raw = JSON.stringify({
    error: {
      code: 400,
      message: "API key not valid. Please pass a valid API key.",
      status: "INVALID_ARGUMENT",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "API_KEY_INVALID",
          domain: "googleapis.com",
        },
      ],
    },
  });
  const out = formatGeminiErrorForClient({ message: raw });
  assert.match(out, /Gemini API key/i);
  assert.ok(out.length < 500);
  assert.ok(!out.includes('"error"'));
});

test("formatGeminiErrorForClient PERMISSION_DENIED is not mislabeled as invalid key", () => {
  const raw = JSON.stringify({
    error: {
      code: 403,
      message: "Requests from this IP address are not allowed.",
      status: "PERMISSION_DENIED",
    },
  });
  const out = formatGeminiErrorForClient({ message: raw });
  assert.ok(!/^Gemini API key is missing/i.test(out));
  assert.match(out, /IP address|Cloud Console|Generative Language API/i);
});

test("formatGeminiErrorForClient 429 explains dashboard vs per-minute limits and includes Google hint", () => {
  const raw = JSON.stringify({
    error: {
      code: 429,
      message:
        "You exceeded generate_content_free_tier_requests for model gemini-2.5-flash.",
      status: "RESOURCE_EXHAUSTED",
    },
  });
  const out = formatGeminiErrorForClient({ message: raw });
  assert.match(out, /429|RESOURCE_EXHAUSTED/i);
  assert.match(out, /generate_content_free_tier|Google says/i);
  assert.match(out, /RAG_DISABLED=1/);
  assert.match(out, /rate-limits/);
});
