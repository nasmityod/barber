import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import test, { after, before } from "node:test";

let server;
let serverOutput = "";

async function hasServer() {
  try {
    await fetch("http://localhost:3000/login");
    return true;
  } catch {
    return false;
  }
}

before(async () => {
  if (await hasServer()) return;
  server = spawn(process.execPath, [join(process.cwd(), "node_modules/wrangler/bin/wrangler.js"), "dev", "--local", "--port", "3000"], {
    cwd: process.cwd(),
    env: { ...process.env, WRANGLER_LOG_PATH: join(process.cwd(), ".wrangler/wrangler-test.log") },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
  server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (await hasServer()) return;
    if (server.exitCode !== null) throw new Error(`El servidor de pruebas terminó antes de iniciar.\n${serverOutput}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`El servidor de pruebas no estuvo disponible a tiempo.\n${serverOutput}`);
});

after(async () => {
  if (!server || server.exitCode !== null) return;
  server.kill();
  await Promise.race([
    once(server, "exit"),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
});

async function render(pathname) {
  return fetch(`http://localhost:3000${pathname}`, { headers: { accept: "text/html" } });
}

test("renders the public sign-in screen", async () => {
  const response = await fetch("http://localhost:3000/login");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Bienvenido a Corteza/);
  assert.match(html, /Entrar al dashboard/);
  assert.match(html, /Correo electrónico/);
  assert.doesNotMatch(html, /ChatGPT|OpenAI/i);
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
  assert.match(anonymous.headers.get("location") ?? "", /\/login/);

  const adminApi = await fetch("http://localhost:3000/api/admin/appointments");
  assert.equal(adminApi.status, 401);

  const timeBlocksApi = await fetch("http://localhost:3000/api/admin/time-blocks");
  assert.equal(timeBlocksApi.status, 401);

  const clientsApi = await fetch("http://localhost:3000/api/admin/clients");
  assert.equal(clientsApi.status, 401);

  const servicesApi = await fetch("http://localhost:3000/api/admin/services");
  assert.equal(servicesApi.status, 401);

  const professionalsApi = await fetch("http://localhost:3000/api/admin/professionals");
  assert.equal(professionalsApi.status, 401);

  const cashApi = await fetch("http://localhost:3000/api/admin/cash");
  assert.equal(cashApi.status, 401);

  const recurringApi = await fetch("http://localhost:3000/api/admin/recurring-appointments");
  assert.equal(recurringApi.status, 401);

  const availabilityApi = await fetch("http://localhost:3000/api/admin/availability");
  assert.equal(availabilityApi.status, 401);

  const appointmentUpdate = await fetch("http://localhost:3000/api/admin/appointments", {
    method: "PUT",
    headers: { origin: "http://localhost:3000" },
  });
  assert.equal(appointmentUpdate.status, 401);

  const legacyApi = await fetch("http://localhost:3000/api/appointments");
  assert.equal(legacyApi.status, 410);
});

test("rejects cross-origin booking mutations and sends security headers", async () => {
  const page = await fetch("http://localhost:3000/reservar/demo");
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.match(page.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);

  const rejected = await fetch("http://localhost:3000/api/public/bookings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://evil.example",
      "idempotency-key": "0123456789abcdef",
    },
    body: "{}",
  });
  const rejectedBody = await rejected.text();
  assert.equal(rejected.status, 403, `Respuesta inesperada: ${rejectedBody}\n${serverOutput.slice(-2000)}`);
});
