import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname) {
  return fetch(`http://localhost:3000${pathname}`, {
    headers: {
      accept: "text/html",
      "oai-authenticated-user-id": "test-owner",
      "oai-authenticated-user-email": "owner@example.test",
      "oai-authenticated-user-full-name": "Test%20Owner",
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    },
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

test("renders the public sign-in screen", async () => {
  const response = await fetch("http://localhost:3000/login");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Bienvenido a Corteza/);
  assert.match(html, /Continuar de forma segura/);
  assert.match(html, /signin-with-chatgpt/);
});

test("renders the public booking experience", async () => {
  const response = await render("/reservar/demo");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Tu mejor versión/);
  assert.match(html, /Reservar ahora/);
  assert.match(html, /Corte Signature/);
});

test("protects administrative and legacy data boundaries", async () => {
  const anonymous = await fetch("http://localhost:3000/dashboard", { redirect: "manual" });
  assert.equal(anonymous.status, 307);
  assert.match(anonymous.headers.get("location") ?? "", /signin-with-chatgpt/);

  const adminApi = await fetch("http://localhost:3000/api/admin/appointments");
  assert.equal(adminApi.status, 401);

  const legacyApi = await fetch("http://localhost:3000/api/appointments");
  assert.equal(legacyApi.status, 410);
});

test("rejects cross-origin booking mutations and sends security headers", async () => {
  const rejected = await fetch("http://localhost:3000/api/public/bookings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://evil.example",
      "idempotency-key": "0123456789abcdef",
    },
    body: "{}",
  });
  assert.equal(rejected.status, 403);

  const page = await fetch("http://localhost:3000/reservar/demo");
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.match(page.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
});
