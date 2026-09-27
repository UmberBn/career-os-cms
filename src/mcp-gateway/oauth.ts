import crypto from 'node:crypto';

const SCOPE = 'careeros:read';
const ACCESS_TTL_SECONDS = 60 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const CODE_TTL_MS = 60 * 1000;
const CONSENT_TTL_MS = 10 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;
const ASSERTION_MAX_TTL_SECONDS = 10 * 60;
const JWKS_URL = 'https://chatgpt.com/oauth/jwks.json';
const CLIENT_ID_PATTERN =
  /^https:\/\/chatgpt\.com\/oauth\/(?:client\.json|[A-Za-z0-9_-]{1,128}\/client\.json)$/;
const CACHE_TTL_MS = 5 * 60 * 1000;

export type GatewayConfig = {
  origin: string;
  resource: string;
  tokenEndpoint: string;
  signingKey: string;
  password: string;
  adminToken: string;
};

export type OAuthDeps = {
  fetchImpl?: typeof fetch;
  now?: () => number;
};

type Failure = {
  ok: false;
  status: number;
  error: string;
  description: string;
  redirect?: string;
};

type CimdDocument = {
  clientId: string;
  redirectUris: string[];
};

type AuthCodeRecord = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  scope: string;
  exp: number;
};

type ConsentPayload = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  scope: string;
  state: string;
  exp: number;
};

type JsonWebKeyWithKid = crypto.JsonWebKey & { kid?: string; alg?: string; use?: string };

const authorizationCodes = new Map<string, AuthCodeRecord>();
const usedAssertionIds = new Map<string, number>();
const jsonCache = new Map<string, { exp: number; value: unknown }>();

function nowMs(deps?: OAuthDeps): number {
  return deps?.now ? deps.now() : Date.now();
}

function resolveFetch(deps?: OAuthDeps): typeof fetch {
  return deps?.fetchImpl ?? globalThis.fetch;
}

function base64url(value: Buffer | string): string {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.toString('base64url');
}

function sha256(value: string): Buffer {
  return crypto.createHash('sha256').update(value).digest();
}

function passwordsMatch(input: string, expected: string): boolean {
  return crypto.timingSafeEqual(sha256(input), sha256(expected));
}

function signaturesMatch(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function pruneExpirations(store: Map<string, number>, now: number): void {
  for (const [key, exp] of store) {
    if (exp <= now) {
      store.delete(key);
    }
  }
}

function pruneCodes(now: number): void {
  for (const [code, record] of authorizationCodes) {
    if (record.exp <= now) {
      authorizationCodes.delete(code);
    }
  }
}

export function readGatewayConfig(): GatewayConfig | null {
  const origin = process.env.CAREEROS_PUBLIC_URL?.trim().replace(/\/+$/, '') ?? '';
  const password = process.env.CAREEROS_OAUTH_PASSWORD ?? '';
  const signingKey = process.env.CAREEROS_OAUTH_SIGNING_KEY ?? '';
  const adminToken = process.env.CAREEROS_MCP_ADMIN_TOKEN ?? '';

  if (!origin || password.length < 12 || signingKey.length < 32 || adminToken.length === 0) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    return null;
  }

  return {
    origin,
    resource: `${origin}/mcp`,
    tokenEndpoint: `${origin}/oauth/token`,
    signingKey,
    password,
    adminToken,
  };
}

export function isLocalHostHeader(host: string | undefined): boolean {
  if (!host) {
    return false;
  }

  const value = host.split(',')[0]?.trim().toLowerCase() ?? '';
  if (value.startsWith('[::1]')) {
    return true;
  }

  const hostname = value.split(':')[0] ?? '';
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function isJwt(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

export function protectedResourceMetadata(config: GatewayConfig): Record<string, unknown> {
  return {
    resource: config.resource,
    authorization_servers: [config.origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
  };
}

export function authorizationServerMetadata(config: GatewayConfig): Record<string, unknown> {
  return {
    issuer: config.origin,
    authorization_endpoint: `${config.origin}/oauth/authorize`,
    token_endpoint: config.tokenEndpoint,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['private_key_jwt'],
    token_endpoint_auth_signing_alg_values_supported: ['RS256'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    scopes_supported: [SCOPE],
  };
}

export function wwwAuthenticate(config: GatewayConfig, error?: string): string {
  const metadata = `${config.origin}/.well-known/oauth-protected-resource`;
  const parts = [`Bearer resource_metadata="${metadata}"`, `scope="${SCOPE}"`];
  if (error) {
    parts.push(`error="${error}"`);
  }
  return parts.join(', ');
}

function queryValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isSafeState(state: string): boolean {
  return /^[\u0020-\u007E]{0,512}$/.test(state);
}

function isCodeChallenge(value: string): boolean {
  return /^[A-Za-z0-9_-]{43,128}$/.test(value);
}

function isCodeVerifier(value: string): boolean {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

function normalizeScope(scope: string | null): string | Failure {
  if (scope === null || scope.trim() === '') {
    return SCOPE;
  }

  const requested = scope.split(/\s+/).filter((item) => item.length > 0);
  if (requested.length === 1 && requested[0] === SCOPE) {
    return SCOPE;
  }

  return {
    ok: false,
    status: 400,
    error: 'invalid_scope',
    description: 'unsupported scope',
  };
}

function failure(status: number, error: string, description: string, redirect?: string): Failure {
  return { ok: false, status, error, description, redirect };
}

async function fetchJson(url: string, deps?: OAuthDeps): Promise<unknown> {
  const cached = jsonCache.get(url);
  const now = nowMs(deps);
  if (cached && cached.exp > now) {
    return cached.value;
  }

  const response = await resolveFetch(deps)(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
    headers: {
      accept: 'application/json',
      'user-agent': 'CareerOS-OAuth/0.1',
    },
  });

  if (!response.ok) {
    throw new Error('metadata_fetch_failed');
  }

  const text = await response.text();
  if (text.length > 65536) {
    throw new Error('metadata_too_large');
  }

  const value: unknown = JSON.parse(text);
  jsonCache.set(url, { exp: now + CACHE_TTL_MS, value });
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function loadCimd(clientId: string, deps?: OAuthDeps): Promise<CimdDocument> {
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    throw new Error('invalid_client');
  }

  const document = await fetchJson(clientId, deps);
  if (!isRecord(document)) {
    throw new Error('invalid_client');
  }

  if (document.client_id !== clientId || document.jwks_uri !== JWKS_URL) {
    throw new Error('invalid_client');
  }

  if (!Array.isArray(document.redirect_uris)) {
    throw new Error('invalid_client');
  }

  const redirectUris = document.redirect_uris.filter((item): item is string => typeof item === 'string');
  if (redirectUris.length !== document.redirect_uris.length || redirectUris.length === 0) {
    throw new Error('invalid_client');
  }

  return { clientId, redirectUris };
}

async function loadJwks(deps?: OAuthDeps): Promise<JsonWebKeyWithKid[]> {
  const document = await fetchJson(JWKS_URL, deps);
  if (!isRecord(document) || !Array.isArray(document.keys)) {
    throw new Error('invalid_client');
  }

  return document.keys.filter(isRecord) as JsonWebKeyWithKid[];
}

function decodeJwtPart(part: string): unknown {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function authorizationLocation(redirectUri: string, params: Record<string, string | undefined>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function seal(payload: ConsentPayload, signingKey: string): string {
  const body = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', signingKey).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function openConsent(cookie: string, signingKey: string, now: number): ConsentPayload | null {
  const parts = cookie.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  const expected = crypto.createHmac('sha256', signingKey).update(parts[0]).digest('base64url');
  if (!signaturesMatch(parts[1], expected)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!isRecord(payload)) {
    return null;
  }

  const consent: ConsentPayload = {
    clientId: typeof payload.clientId === 'string' ? payload.clientId : '',
    redirectUri: typeof payload.redirectUri === 'string' ? payload.redirectUri : '',
    codeChallenge: typeof payload.codeChallenge === 'string' ? payload.codeChallenge : '',
    resource: typeof payload.resource === 'string' ? payload.resource : '',
    scope: typeof payload.scope === 'string' ? payload.scope : '',
    state: typeof payload.state === 'string' ? payload.state : '',
    exp: typeof payload.exp === 'number' ? payload.exp : 0,
  };

  if (consent.exp <= now || !CLIENT_ID_PATTERN.test(consent.clientId)) {
    return null;
  }

  return consent;
}

export async function startAuthorization(
  config: GatewayConfig,
  query: Record<string, unknown>,
  deps?: OAuthDeps
): Promise<{ ok: true; cookie: string } | Failure> {
  const responseType = queryValue(query.response_type);
  const clientId = queryValue(query.client_id);
  const redirectUri = queryValue(query.redirect_uri);
  const codeChallenge = queryValue(query.code_challenge);
  const method = queryValue(query.code_challenge_method);
  const resource = queryValue(query.resource);
  const state = queryValue(query.state) ?? '';
  const scopeResult = normalizeScope(queryValue(query.scope));

  if (
    responseType !== 'code' ||
    clientId === null ||
    redirectUri === null ||
    codeChallenge === null ||
    method !== 'S256' ||
    !isCodeChallenge(codeChallenge) ||
    !isSafeState(state) ||
    typeof scopeResult !== 'string'
  ) {
    return typeof scopeResult === 'string'
      ? failure(400, 'invalid_request', 'invalid authorization request')
      : scopeResult;
  }

  if (resource !== config.resource) {
    return failure(400, 'invalid_target', 'invalid target resource');
  }

  let cimd: CimdDocument;
  try {
    cimd = await loadCimd(clientId, deps);
  } catch {
    return failure(400, 'invalid_client', 'client authentication failed');
  }

  if (!cimd.redirectUris.includes(redirectUri)) {
    return failure(400, 'invalid_request', 'invalid redirect uri');
  }

  const cookie = seal(
    {
      clientId,
      redirectUri,
      codeChallenge,
      resource,
      scope: scopeResult,
      state,
      exp: nowMs(deps) + CONSENT_TTL_MS,
    },
    config.signingKey
  );

  return { ok: true, cookie };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

export function consentPage(request: string): string {
  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8"><title>CareerOS</title></head>
<body>
  <h1>Autorizar leitura do CareerOS</h1>
  <form method="post" action="/oauth/authorize">
    <input type="hidden" name="request" value="${escapeHtml(request)}">
    <label>Senha <input type="password" name="password" autocomplete="current-password" required></label>
    <button type="submit">Autorizar</button>
  </form>
</body>
</html>`;
}

export function expiredAuthorizationPage(): string {
  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8"><title>CareerOS</title></head>
<body>
  <h1>Autorização expirada</h1>
  <p>Volte ao ChatGPT e inicie a conexão de novo. Não reenvie esta página.</p>
</body>
</html>`;
}

export function completeAuthorization(
  config: GatewayConfig,
  cookie: string | undefined,
  password: unknown,
  deps?: OAuthDeps
): { ok: true; location: string } | Failure {
  const now = nowMs(deps);
  const consent = cookie ? openConsent(cookie, config.signingKey, now) : null;
  if (!consent) {
    return failure(400, 'invalid_request', 'invalid authorization request');
  }

  const redirectError = (error: string, description: string): Failure =>
    failure(
      303,
      error,
      description,
      authorizationLocation(consent.redirectUri, {
        error,
        error_description: description,
        state: consent.state,
        iss: config.origin,
      })
    );

  if (typeof password !== 'string' || !passwordsMatch(password, config.password)) {
    return redirectError('access_denied', 'access denied');
  }

  pruneCodes(now);
  const code = base64url(crypto.randomBytes(32));
  authorizationCodes.set(code, {
    clientId: consent.clientId,
    redirectUri: consent.redirectUri,
    codeChallenge: consent.codeChallenge,
    resource: consent.resource,
    scope: consent.scope,
    exp: now + CODE_TTL_MS,
  });

  return {
    ok: true,
    location: authorizationLocation(consent.redirectUri, {
      code,
      state: consent.state,
      iss: config.origin,
    }),
  };
}

function signJwt(payload: Record<string, unknown>, signingKey: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const signature = crypto.createHmac('sha256', signingKey).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function issueTokens(
  config: GatewayConfig,
  scope: string,
  now: number,
  refreshToken?: string
): {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
} {
  const issuedAt = Math.floor(now / 1000);
  const accessToken = signJwt(
    {
      iss: config.origin,
      aud: config.resource,
      sub: 'careeros-owner',
      scope,
      typ: 'access',
      iat: issuedAt,
      exp: issuedAt + ACCESS_TTL_SECONDS,
    },
    config.signingKey
  );

  const nextRefresh =
    refreshToken ??
    signJwt(
      {
        iss: config.origin,
        aud: config.resource,
        sub: 'careeros-owner',
        scope,
        typ: 'refresh',
        iat: issuedAt,
        exp: issuedAt + REFRESH_TTL_SECONDS,
      },
      config.signingKey
    );

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_SECONDS,
    refresh_token: nextRefresh,
    scope,
  };
}

export function createAccessToken(
  config: GatewayConfig,
  overrides: { exp?: number; aud?: string; scope?: string; typ?: string; iss?: string } = {},
  deps?: OAuthDeps
): string {
  const issuedAt = Math.floor(nowMs(deps) / 1000);
  return signJwt(
    {
      iss: overrides.iss ?? config.origin,
      aud: overrides.aud ?? config.resource,
      sub: 'careeros-owner',
      scope: overrides.scope ?? SCOPE,
      typ: overrides.typ ?? 'access',
      iat: issuedAt,
      exp: overrides.exp ?? issuedAt + ACCESS_TTL_SECONDS,
    },
    config.signingKey
  );
}

type JwtCheck = { ok: true; payload: Record<string, unknown> } | { ok: false; reason: 'invalid' | 'expired' };

function readHs256(token: string, signingKey: string, nowSeconds: number): JwtCheck {
  if (!isJwt(token)) {
    return { ok: false, reason: 'invalid' };
  }

  const [headerPart, payloadPart, signature] = token.split('.');
  let header: unknown;
  let payload: unknown;
  try {
    header = decodeJwtPart(headerPart);
    payload = decodeJwtPart(payloadPart);
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  if (!isRecord(header) || header.alg !== 'HS256' || !isRecord(payload)) {
    return { ok: false, reason: 'invalid' };
  }

  const expected = crypto.createHmac('sha256', signingKey).update(`${headerPart}.${payloadPart}`).digest('base64url');
  if (!signaturesMatch(signature, expected)) {
    return { ok: false, reason: 'invalid' };
  }

  const exp = payload.exp;
  if (typeof exp !== 'number' || exp <= nowSeconds) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, payload };
}

export function verifyGatewayAccessToken(
  config: GatewayConfig,
  token: string,
  deps?: OAuthDeps
): { ok: true } | { ok: false; reason: 'invalid' | 'expired' | 'audience' | 'scope' } {
  const verified = readHs256(token, config.signingKey, Math.floor(nowMs(deps) / 1000));
  if (!verified.ok) {
    return verified;
  }

  const { payload } = verified;
  if (payload.iss !== config.origin || payload.typ !== 'access') {
    return { ok: false, reason: 'invalid' };
  }
  if (payload.aud !== config.resource) {
    return { ok: false, reason: 'audience' };
  }

  const scope = typeof payload.scope === 'string' ? payload.scope.split(/\s+/) : [];
  if (!scope.includes(SCOPE)) {
    return { ok: false, reason: 'scope' };
  }

  return { ok: true };
}

function formValue(body: unknown, key: string): string | null {
  if (!isRecord(body)) {
    return null;
  }
  const value = body[key];
  return typeof value === 'string' ? value : null;
}

async function verifyClientAssertion(
  config: GatewayConfig,
  clientId: string,
  assertion: string,
  deps?: OAuthDeps
): Promise<void> {
  if (!isJwt(assertion)) {
    throw new Error('invalid_client');
  }

  const [headerPart, payloadPart, signaturePart] = assertion.split('.');
  const header = decodeJwtPart(headerPart);
  const payload = decodeJwtPart(payloadPart);
  if (!isRecord(header) || header.alg !== 'RS256' || typeof header.kid !== 'string' || !isRecord(payload)) {
    throw new Error('invalid_client');
  }

  const keys = await loadJwks(deps);
  const jwk = keys.find((key) => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk || (jwk.alg !== undefined && jwk.alg !== 'RS256') || (jwk.use !== undefined && jwk.use !== 'sig')) {
    throw new Error('invalid_client');
  }

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const valid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerPart}.${payloadPart}`),
    publicKey,
    Buffer.from(signaturePart, 'base64url')
  );
  if (!valid) {
    throw new Error('invalid_client');
  }

  if (payload.iss !== clientId || payload.sub !== clientId) {
    throw new Error('invalid_client');
  }

  const audience = payload.aud;
  const audiences = Array.isArray(audience) ? audience : [audience];
  if (!audiences.includes(config.tokenEndpoint)) {
    throw new Error('invalid_client');
  }

  const now = Math.floor(nowMs(deps) / 1000);
  const exp = payload.exp;
  const iat = payload.iat;
  const jti = payload.jti;
  if (typeof exp !== 'number' || typeof iat !== 'number' || typeof jti !== 'string' || jti.length === 0) {
    throw new Error('invalid_client');
  }
  if (iat > now + CLOCK_SKEW_SECONDS || exp + CLOCK_SKEW_SECONDS <= now || exp - iat > ASSERTION_MAX_TTL_SECONDS) {
    throw new Error('invalid_client');
  }

  pruneExpirations(usedAssertionIds, now);
  if (usedAssertionIds.has(jti)) {
    throw new Error('invalid_client');
  }
  usedAssertionIds.set(jti, exp);
}

function pkceMatches(verifier: string, challenge: string): boolean {
  return signaturesMatch(base64url(sha256(verifier)), challenge);
}

export async function exchangeToken(
  config: GatewayConfig,
  body: unknown,
  deps?: OAuthDeps
): Promise<
  | {
      ok: true;
      body: {
        access_token: string;
        token_type: 'Bearer';
        expires_in: number;
        refresh_token: string;
        scope: string;
      };
    }
  | Failure
> {
  const grantType = formValue(body, 'grant_type');
  const assertionType = formValue(body, 'client_assertion_type');
  const assertion = formValue(body, 'client_assertion');
  let clientId = formValue(body, 'client_id');
  const resource = formValue(body, 'resource');

  if (assertionType !== 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer' || assertion === null) {
    return failure(401, 'invalid_client', 'client authentication failed');
  }

  if (clientId === null) {
    try {
      const payload = decodeJwtPart(assertion.split('.')[1] ?? '');
      clientId = isRecord(payload) && typeof payload.iss === 'string' ? payload.iss : null;
    } catch {
      clientId = null;
    }
  }

  if (clientId === null || !CLIENT_ID_PATTERN.test(clientId)) {
    return failure(401, 'invalid_client', 'client authentication failed');
  }

  try {
    await loadCimd(clientId, deps);
    await verifyClientAssertion(config, clientId, assertion, deps);
  } catch {
    return failure(401, 'invalid_client', 'client authentication failed');
  }

  if (resource !== config.resource) {
    return failure(400, 'invalid_target', 'invalid target resource');
  }

  const now = nowMs(deps);
  if (grantType === 'authorization_code') {
    const code = formValue(body, 'code');
    const verifier = formValue(body, 'code_verifier');
    const redirectUri = formValue(body, 'redirect_uri');
    if (code === null || verifier === null || redirectUri === null || !isCodeVerifier(verifier)) {
      return failure(400, 'invalid_request', 'invalid token request');
    }

    pruneCodes(now);
    const record = authorizationCodes.get(code);
    authorizationCodes.delete(code);
    if (!record || record.exp <= now) {
      return failure(400, 'invalid_grant', 'invalid authorization code');
    }
    if (
      record.clientId !== clientId ||
      record.redirectUri !== redirectUri ||
      record.resource !== resource ||
      !pkceMatches(verifier, record.codeChallenge)
    ) {
      return failure(400, 'invalid_grant', 'invalid authorization code');
    }

    return { ok: true, body: issueTokens(config, record.scope, now) };
  }

  if (grantType === 'refresh_token') {
    const refreshToken = formValue(body, 'refresh_token');
    if (refreshToken === null) {
      return failure(400, 'invalid_request', 'invalid token request');
    }

    const verified = readHs256(refreshToken, config.signingKey, Math.floor(now / 1000));
    if (!verified.ok || verified.payload.typ !== 'refresh' || verified.payload.iss !== config.origin) {
      return failure(400, 'invalid_grant', 'invalid refresh token');
    }
    if (verified.payload.aud !== config.resource) {
      return failure(400, 'invalid_target', 'invalid target resource');
    }

    const scope = typeof verified.payload.scope === 'string' ? verified.payload.scope : '';
    if (scope !== SCOPE) {
      return failure(400, 'invalid_scope', 'unsupported scope');
    }

    return { ok: true, body: issueTokens(config, scope, now, refreshToken) };
  }

  return failure(400, 'unsupported_grant_type', 'unsupported grant type');
}
