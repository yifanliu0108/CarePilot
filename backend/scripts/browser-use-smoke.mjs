/**
 * Minimal Browser Use Cloud check (v2 tasks API).
 * Uses backend/.env — same keys as the CarePilot server.
 *
 *   cd backend && node scripts/browser-use-smoke.mjs
 *
 * On success: prints task id, liveUrl (if any), and final status/output.
 * On failure: prints the API error (wrong key, rate limit, invalid model, etc.).
 */
import "../src/loadEnv.js";
import {
  createCloudSession,
  getBrowserUseApiKey,
  getBrowserUseProfileId,
  getCloudSession,
} from "../src/browserUseCloud.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const key = getBrowserUseApiKey();
  if (!key) {
    console.error("Missing BROWSER_USE_API_KEY (or BROWSER_USE_CLOUD_API_KEY) in backend/.env");
    process.exit(1);
  }

  if (key.startsWith("AIza")) {
    console.error(
      "Wrong key: BROWSER_USE_API_KEY looks like a Google / Gemini key (starts with AIza).",
    );
    console.error(
      "Browser Use keys come from https://cloud.browser-use.com/settings → API keys and usually start with bu_.",
    );
    console.error("Put your Gemini key only on GEMINI_API_KEY= in backend/.env.");
    process.exit(1);
  }

  if (!key.startsWith("bu_")) {
    console.warn(
      "Note: Most Browser Use keys start with bu_. If Cloud returns 401, double-check you did not swap GEMINI and Browser Use keys.",
    );
  }

  const profile = getBrowserUseProfileId();
  console.log("API key:", key.slice(0, 8) + "…" + key.slice(-4));
  console.log("Profile id:", profile ? profile : "(none — anonymous task)");
  console.log("Starting tiny smoke task (example.com, few steps)…\n");

  const task =
    "Open https://example.com . Return only the text of the main visible heading on the page (one line).";

  let view;
  try {
    view = await createCloudSession(task, {
      maxSteps: 12,
      flashMode: true,
      model: "browser-use-llm",
    });
  } catch (e) {
    console.error("createCloudSession failed:", e.message);
    process.exit(1);
  }

  const id = view?.id;
  console.log("Created task id:", id);
  console.log("Initial liveUrl:", view?.liveUrl ?? "(null)");
  console.log("Initial status:", view?.status);

  if (!id) {
    console.error("No task id in response — check Browser Use API response shape.");
    process.exit(1);
  }

  let last = view;
  for (let i = 0; i < 45; i++) {
    if (!last?.stillRunning) break;
    await sleep(2000);
    try {
      last = await getCloudSession(id);
    } catch (e) {
      console.error("poll failed:", e.message);
      process.exit(1);
    }
    if (i % 3 === 0) {
      console.log(
        `… poll ${i + 1} status=${last?.status} steps=${last?.stepCount} liveUrl=${last?.liveUrl ? "yes" : "no"}`,
      );
    }
  }

  console.log("\n--- Final ---");
  console.log("status:", last?.status);
  console.log("stepCount:", last?.stepCount);
  console.log("liveUrl:", last?.liveUrl ?? "(null)");
  console.log("output:", last?.output ?? "(null)");
  console.log("\nIf this works but Amazon fails, the issue is Amazon/login/bot-detection—not your API key.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
