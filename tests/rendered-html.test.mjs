import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname) {
  return fetch(`http://localhost:3000${pathname}`, {
    headers: { accept: "text/html" },
  });
}

test("renders the Corteza admin dashboard", async () => {
  const response = await render("/dashboard");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Corteza/);
  assert.match(html, /Tu barbería, bajo control/);
  assert.match(html, /Citas de hoy/);
  assert.doesNotMatch(html, /codex-preview/);
});

test("renders the public booking experience", async () => {
  const response = await render("/reservar/demo");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Tu mejor versión/);
  assert.match(html, /Reservar ahora/);
  assert.match(html, /Corte Signature/);
});
