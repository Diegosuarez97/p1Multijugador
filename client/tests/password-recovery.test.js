import test from "node:test";
import assert from "node:assert/strict";
import { initPasswordRecovery } from "../src/passwordRecovery.js";

function setup(t, hash = "") {
  const nodes = new Map();
  const get = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      value: "", textContent: "", hidden: false, disabled: false,
      focus() { this.focused = true; },
      reset() { this.resetCalled = true; },
      querySelector() { return get(id + "-submit"); },
    });
    return nodes.get(id);
  };
  const shown = [], requests = [], replacements = [];
  const globals = {
    document: { getElementById: get },
    location: { hash, pathname: "/", search: "" },
    history: { replaceState: (...args) => replacements.push(args) },
    window: { addEventListener() {} },
  };
  for (const [name, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  }
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ message: "Success" }) };
  });
  initPasswordRecovery({ api: "http://server/api", show: (id) => shown.push(id), showLogin() {} });
  return { get, shown, requests, replacements };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("emailed token opens reset, removes the fragment and submits the token only in the POST body", async (t) => {
  const token = "a".repeat(64);
  const f = setup(t, `#reset-password=${token}`);
  assert.deepEqual(f.shown, ["recovery"]);
  assert.deepEqual(f.replacements, [[null, "", "/"]]);
  assert.equal(f.get("forgot-password-form").hidden, true);
  assert.equal(f.get("reset-password-form").hidden, false);
  f.get("recovery-password").value = "replacement-password";
  f.get("recovery-confirm").value = "replacement-password";
  f.get("reset-password-form").onsubmit({ preventDefault() {} });
  await settle();
  assert.deepEqual(f.requests, [{
    url: "http://server/api/reset-password",
    body: { token, password: "replacement-password", confirmPassword: "replacement-password" },
  }]);
  assert.equal(f.get("reset-password-form").hidden, true);
  assert.equal(f.get("recovery-message").textContent, "Success");
});

test("the server-site link opens the email form and posts the trimmed address", async (t) => {
  const f = setup(t, "#forgot-password");
  assert.equal(f.get("forgot-password-form").hidden, false);
  assert.equal(f.get("reset-password-form").hidden, true);
  f.get("recovery-email").value = " student@example.com ";
  f.get("forgot-password-form").onsubmit({ preventDefault() {} });
  await settle();
  assert.deepEqual(f.requests[0], {
    url: "http://server/api/forgot-password", body: { email: "student@example.com" },
  });
});

test("malformed links are cleared from history and cannot display the password form", (t) => {
  const f = setup(t, "#reset-password=invalid");
  assert.deepEqual(f.replacements, [[null, "", "/"]]);
  assert.equal(f.get("reset-password-form").hidden, true);
  assert.match(f.get("recovery-message").textContent, /no es válido/);
  f.get("request-another-reset").onclick();
  assert.equal(f.get("forgot-password-form").hidden, false);
  f.get("recovery-back").onclick();
  assert.equal(f.shown.at(-1), "menu");
});

test("password mismatch does not send a request", (t) => {
  const f = setup(t, `#reset-password=${"b".repeat(64)}`);
  f.get("recovery-password").value = "replacement-password";
  f.get("recovery-confirm").value = "different-password";
  f.get("reset-password-form").onsubmit({ preventDefault() {} });
  assert.equal(f.requests.length, 0);
  assert.match(f.get("recovery-message").textContent, /no coinciden/);
});
