// Verifies the Cloudflare Access JWT (Cf-Access-Jwt-Assertion). Fails closed:
// with no Access configuration the editor API refuses every request.
import { HttpError } from '../src/editor/core.mjs';

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const json = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

let jwks = { team: '', at: 0, keys: [] };

async function keysFor(team, force = false) {
  if (!force && jwks.team === team && Date.now() - jwks.at < 10 * 60_000) return jwks.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new HttpError(503, 'Could not load Access signing keys.');
  jwks = { team, at: Date.now(), keys: (await res.json()).keys ?? [] };
  return jwks.keys;
}

/** Returns the verified JWT payload, or throws HttpError(401 | 403 | 503). */
export async function verifyAccess(request, env) {
  const team = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  if (!team || !aud) throw new HttpError(503, 'Cloudflare Access is not configured.');
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) throw new HttpError(401, 'Sign in through Cloudflare Access.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Bad Access token.');
  let header;
  let payload;
  try {
    header = json(parts[0]);
    payload = json(parts[1]);
  } catch {
    throw new HttpError(401, 'Bad Access token.');
  }
  if (header.alg !== 'RS256') throw new HttpError(401, 'Bad Access token.');
  // Access rotates signing keys: on an unknown key id, refetch once before refusing.
  const jwk = (await keysFor(team)).find((k) => k.kid === header.kid) ?? (await keysFor(team, true)).find((k) => k.kid === header.kid);
  if (!jwk) throw new HttpError(401, 'Unknown Access signing key.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new HttpError(401, 'Bad Access token.');
  const now = Date.now() / 1000;
  const auds = [].concat(payload.aud ?? []);
  if (!(payload.exp > now) || (payload.nbf && payload.nbf > now)) throw new HttpError(401, 'Access token expired.');
  if (payload.iss !== `https://${team}` || !auds.includes(aud)) throw new HttpError(403, 'Access token is for another application.');
  if (env.ACCESS_EMAIL && String(payload.email).toLowerCase() !== env.ACCESS_EMAIL.toLowerCase()) throw new HttpError(403, 'Not allowed.');
  return payload;
}
