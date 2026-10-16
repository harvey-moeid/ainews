import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT } from "jose";
import { verifyAccessToken } from "../worker/access.js";
import worker from "../worker/index.js";

const env = { AUTH_MODE: "cloudflare-access", ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com", ACCESS_AUD: "newsroom", ADMIN_EMAIL: "owner@example.com" };
const { privateKey, publicKey } = await generateKeyPair("RS256");
const token = (email = env.ADMIN_EMAIL, audience = env.ACCESS_AUD, expiry = "5m") => new SignJWT({ email }).setProtectedHeader({ alg: "RS256" }).setSubject("owner").setIssuer(`https://${env.ACCESS_TEAM_DOMAIN}`).setAudience(audience).setExpirationTime(expiry).sign(privateKey);

test("Access verifies signature, issuer, audience and owner identity", async () => {
  assert.equal((await verifyAccessToken(await token(), env, publicKey)).sub, "owner");
  await assert.rejects(verifyAccessToken(await token("other@example.com"), env, publicKey));
  await assert.rejects(verifyAccessToken(await token(env.ADMIN_EMAIL, "other-app"), env, publicKey));
  await assert.rejects(verifyAccessToken(await token(env.ADMIN_EMAIL, env.ACCESS_AUD, "-1m"), env, publicKey));
  const other = await generateKeyPair("RS256");
  await assert.rejects(verifyAccessToken(await token(), env, other.publicKey));
});

test("Production rejects spoofed Sites headers and local bypass on all routes", async () => {
  for (const path of ["/", "/api/bootstrap", "/api/live"]) {
    const response = await worker.fetch(new Request(`https://news.example${path}`, { headers: { "oai-authenticated-user-id": "fake", "oai-authenticated-user-email": env.ADMIN_EMAIL } }), { ...env, DEV_AUTH: "1" });
    assert.equal(response.status, 401);
  }
});
