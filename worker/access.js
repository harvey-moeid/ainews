import { createRemoteJWKSet, jwtVerify } from "jose";

export async function verifyAccessToken(token, env, keys) {
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAIL)
    throw new Error("Access authentication required");
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  const { payload } = await jwtVerify(
    token,
    keys || createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)),
    { issuer, audience: env.ACCESS_AUD, algorithms: ["RS256"], requiredClaims: ["exp", "sub", "email"] },
  );
  if (payload.email !== env.ADMIN_EMAIL) throw new Error("Access denied");
  return payload;
}

export async function accessRequest(request, env) {
  const identity = await verifyAccessToken(request.headers.get("cf-access-jwt-assertion"), env);
  const headers = new Headers(request.headers);
  // Replace caller-supplied Sites identity with the verified Access identity.
  headers.set("oai-authenticated-user-id", identity.sub);
  headers.set("oai-authenticated-user-email", identity.email);
  return new Request(request, { headers });
}
