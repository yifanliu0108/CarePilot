import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

async function loadSessionStore(storeFile, tag) {
  process.env.SESSION_STORE_FILE = storeFile;
  return import(new URL(`./sessionStore.js?${tag}`, import.meta.url).href);
}

test("session store persists profile data across module reloads and relogin", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "carepilot-session-store-"));
  const storeFile = path.join(dir, "auth-store.json");

  try {
    const first = await loadSessionStore(storeFile, "first");
    const firstSessionId = first.createSession("demo", "Demo@Example.com");
    first.updateProfile(firstSessionId, {
      age: 42,
      completedOnboarding: true,
      healthFocus: "sleep support",
    });

    const second = await loadSessionStore(storeFile, "second");
    const secondSessionId = second.createSession("renamed-demo", "demo@example.com");
    const session = second.getSession(secondSessionId);

    assert.ok(session);
    assert.equal(session.email, "demo@example.com");
    assert.equal(session.username, "renamed-demo");
    assert.equal(session.profile.age, 42);
    assert.equal(session.profile.completedOnboarding, true);
    assert.equal(session.profile.healthFocus, "sleep support");

    assert.equal(second.deleteSession(secondSessionId), true);
    assert.equal(second.getSession(secondSessionId), null);
  } finally {
    delete process.env.SESSION_STORE_FILE;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
