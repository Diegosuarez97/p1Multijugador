import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateNewPassword } from "../passwordPolicy.js";

test("registration, recovery and change share a twelve character minimum", async () => {
  for (const value of [undefined, null, 123, "", "short", "abcdefghijk", "😀".repeat(11)]) {
    assert.match(await validateNewPassword(value, { fetchImpl: () => assert.fail("Short passwords must not query HIBP") }), /12 caracteres/);
  }
});

test("twelve characters suffice when not breached, without extra composition requirements", async () => {
  for (const password of ["abcdefghijkl", "123456789012", "            ", "😀".repeat(12), "una frase larga con espacios"]) {
    assert.equal(await validateNewPassword(password, {
      fetchImpl: async () => ({ ok: true, text: async () => "" }),
    }), null);
  }
});

test("a twelve-character breached password is rejected using only a five-character hash prefix", async () => {
  const password = "123456789012";
  const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
  const error = await validateNewPassword(password, {
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
      assert.equal(options.headers['Add-Padding'], "true");
      return { ok: true, text: async () => `${hash.slice(5)}:100` };
    },
  });
  assert.match(error, /no es segura/);
});

test("padding is ignored and provider outages preserve the original registration behavior", async () => {
  const password = "K9!q2z-long-enough";
  const suffix = createHash("sha1").update(password).digest("hex").toUpperCase().slice(5);
  assert.equal(await validateNewPassword(password, {
    fetchImpl: async () => ({ ok: true, text: async () => `${suffix}:0` }),
  }), null);
  const logs = [];
  assert.equal(await validateNewPassword(password, {
    fetchImpl: async () => { throw new Error("sensitive details"); },
    logger: { warn: (message) => logs.push(message) },
  }), null);
  assert.deepEqual(logs, ["Password policy: HIBP_UNAVAILABLE"]);
});
