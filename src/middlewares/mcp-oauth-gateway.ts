import type { Core } from '@strapi/strapi';

import {
  authorizationServerMetadata,
  completeAuthorization,
  consentPage,
  expiredAuthorizationPage,
  exchangeToken,
  isJwt,
  isLocalHostHeader,
  protectedResourceMetadata,
  readGatewayConfig,
  startAuthorization,
  verifyGatewayAccessToken,
  wwwAuthenticate,
  type GatewayConfig,
} from '../mcp-gateway/oauth';

const CONSENT_COOKIE = 'careeros_oauth_req';

type KoaContext = {
  path: string;
  method: string;
  query: Record<string, unknown>;
  status: number;
  body: unknown;
  type: string;
  request: {
    header: { host?: string | string[]; authorization?: string | string[] };
    body?: unknown;
  };
  set: (name: string, value: string) => void;
  redirect: (url: string) => void;
  response: { get: (name: string) => string };
  res: {
    getHeader: (name: string) => string | number | string[] | undefined;
    setHeader: (name: string, value: string) => void;
  };
  cookies: {
    secure?: boolean;
    get: (name: string, options?: { signed?: boolean }) => string | undefined;
    set: (name: string, value: string | null, options?: Record<string, unknown>) => void;
  };
};

let warned = false;

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function bearerToken(value: string | string[] | undefined): string | null {
  const header = headerValue(value);
  if (!header) {
    return null;
  }
  const parts = header.split(/\s+/);
  if (parts[0]?.toLowerCase() !== 'bearer' || parts.length !== 2 || !parts[1]) {
    return null;
  }
  return parts[1];
}

function cookieOptions(config: GatewayConfig): Record<string, unknown> {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.origin.startsWith('https://'),
    signed: false,
    path: '/oauth/authorize',
    maxAge: 10 * 60 * 1000,
    overwrite: true,
  };
}

function setConsentCookie(ctx: KoaContext, value: string | null, config: GatewayConfig): void {
  if (config.origin.startsWith('https://')) {
    ctx.cookies.secure = true;
  }
  ctx.cookies.set(CONSENT_COOKIE, value, cookieOptions(config));
}

function headerText(value: string | number | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join(';');
  }
  return value === undefined ? '' : String(value);
}

function allowChatGptFormAction(ctx: KoaContext): void {
  const current = [ctx.response.get('Content-Security-Policy'), headerText(ctx.res.getHeader('Content-Security-Policy'))]
    .filter(Boolean)
    .join(';');
  const next = current.includes('form-action')
    ? current.replace(/form-action[^;]*/, (directive) =>
        directive.includes('https://chatgpt.com') ? directive : `${directive} https://chatgpt.com`
      )
    : `${current}${current ? ';' : ''}form-action 'self' https://chatgpt.com`;
  ctx.set('Content-Security-Policy', next);
  ctx.res.setHeader('Content-Security-Policy', next);
}

function sendJson(ctx: KoaContext, status: number, body: Record<string, string>): void {
  ctx.status = status;
  ctx.set('Cache-Control', 'no-store');
  ctx.body = body;
}

function rejectMcp(ctx: KoaContext, config: GatewayConfig | null, error?: string): void {
  ctx.status = 401;
  ctx.set('Cache-Control', 'no-store');
  ctx.set(
    'WWW-Authenticate',
    config ? wwwAuthenticate(config, error) : 'Bearer error="invalid_token"'
  );
  ctx.body = { error: error ?? 'invalid_token' };
}

export default (_config: unknown, { strapi }: { strapi: Core.Strapi }) => {
  return async (ctx: KoaContext, next: () => Promise<void>) => {
    const { path } = ctx;
    const isMcp = path === '/mcp';
    const isProtectedResource =
      path === '/.well-known/oauth-protected-resource' ||
      path === '/.well-known/oauth-protected-resource/mcp';
    const isAuthorizationServer = path === '/.well-known/oauth-authorization-server';
    const isAuthorize = path === '/oauth/authorize';
    const isToken = path === '/oauth/token';

    if (!isMcp && !isProtectedResource && !isAuthorizationServer && !isAuthorize && !isToken) {
      return next();
    }

    const config = readGatewayConfig();
    if (!config) {
      if (!warned) {
        warned = true;
        strapi.log.warn(
          'CareerOS MCP OAuth gateway disabled: set CAREEROS_PUBLIC_URL, CAREEROS_OAUTH_PASSWORD, CAREEROS_OAUTH_SIGNING_KEY, and CAREEROS_MCP_ADMIN_TOKEN.'
        );
      }
      if (isMcp) {
        const token = bearerToken(ctx.request.header.authorization);
        if (isLocalHostHeader(headerValue(ctx.request.header.host)) && token && !isJwt(token)) {
          return next();
        }
        rejectMcp(ctx, null);
        return;
      }
      sendJson(ctx, 503, { error: 'server_error' });
      return;
    }

    ctx.set('Cache-Control', 'no-store');

    if (isProtectedResource || isAuthorizationServer) {
      if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
        sendJson(ctx, 405, { error: 'invalid_request' });
        return;
      }
      ctx.body = isAuthorizationServer
        ? authorizationServerMetadata(config)
        : protectedResourceMetadata(config);
      return;
    }

    if (isAuthorize) {
      if (ctx.method === 'GET') {
        const started = await startAuthorization(config, ctx.query);
        if (!started.ok) {
          sendJson(ctx, started.status, {
            error: started.error,
            error_description: started.description,
          });
          return;
        }
        setConsentCookie(ctx, started.cookie, config);
        allowChatGptFormAction(ctx);
        ctx.type = 'html';
        ctx.body = consentPage(started.cookie);
        return;
      }

      if (ctx.method === 'POST') {
        const cookie = ctx.cookies.get(CONSENT_COOKIE, { signed: false });
        const body = ctx.request.body;
        const formRequest =
          typeof body === 'object' && body !== null && 'request' in body
            ? (body as { request?: unknown }).request
            : undefined;
        const sealed = cookie || (typeof formRequest === 'string' ? formRequest : undefined);
        const password =
          typeof body === 'object' && body !== null && 'password' in body
            ? (body as { password?: unknown }).password
            : undefined;
        const completed = completeAuthorization(config, sealed, password);
        setConsentCookie(ctx, null, config);
        if (!completed.ok) {
          if (completed.redirect) {
            allowChatGptFormAction(ctx);
            ctx.status = 303;
            ctx.redirect(completed.redirect);
            return;
          }
          if (completed.description === 'invalid authorization request') {
            ctx.status = 400;
            ctx.type = 'html';
            ctx.body = expiredAuthorizationPage();
            return;
          }
          sendJson(ctx, completed.status, {
            error: completed.error,
            error_description: completed.description,
          });
          return;
        }
        allowChatGptFormAction(ctx);
        ctx.status = 303;
        ctx.redirect(completed.location);
        return;
      }

      sendJson(ctx, 405, { error: 'invalid_request' });
      return;
    }

    if (isToken) {
      if (ctx.method !== 'POST') {
        sendJson(ctx, 405, { error: 'invalid_request' });
        return;
      }
      const result = await exchangeToken(config, ctx.request.body);
      if (!result.ok) {
        sendJson(ctx, result.status, {
          error: result.error,
          error_description: result.description,
        });
        return;
      }
      ctx.body = result.body;
      return;
    }

    const token = bearerToken(ctx.request.header.authorization);
    if (token && isJwt(token)) {
      const verified = verifyGatewayAccessToken(config, token);
      if (!verified.ok) {
        rejectMcp(ctx, config, verified.reason === 'scope' ? 'insufficient_scope' : 'invalid_token');
        return;
      }
      ctx.request.header.authorization = `Bearer ${config.adminToken}`;
      return next();
    }

    if (isLocalHostHeader(headerValue(ctx.request.header.host)) && token && !isJwt(token)) {
      return next();
    }

    rejectMcp(ctx, config);
  };
};
