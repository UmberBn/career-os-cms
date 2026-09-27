#!/usr/bin/env node
/**
 * Validates CareerOS Content API for the Custom GPT consumer.
 * Does not print career payloads — only status codes and structural checks.
 *
 * Usage:
 *   node --env-file=.env scripts/validate-consumer.mjs
 *
 * Env:
 *   CAREEROS_API_TOKEN   required — Strapi Read-only API Token
 *   CAREEROS_BASE_URL    optional — default http://localhost:1337
 *   CAREEROS_PUBLIC_URL  optional — ngrok HTTPS origin; runs the same checks again
 */

const token = process.env.CAREEROS_API_TOKEN;
const baseUrl = (process.env.CAREEROS_BASE_URL || 'http://localhost:1337').replace(
  /\/$/,
  ''
);
const publicUrl = (process.env.CAREEROS_PUBLIC_URL || '').replace(/\/$/, '');

if (!token) {
  console.error(
    'Missing CAREEROS_API_TOKEN. Create a Read-only API Token in Strapi Admin → Settings → API Tokens, then set it in .env.'
  );
  process.exit(1);
}

const resources = ['profile', 'companies', 'experiences', 'projects'];

async function request(origin, path, { auth = false } = {}) {
  const headers = {
    Accept: 'application/json',
    'ngrok-skip-browser-warning': 'true',
  };
  if (auth) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${origin}/api/${path}`, {
    headers,
    signal: AbortSignal.timeout(20000),
  });
  const contentType = res.headers.get('content-type') || '';
  let body = null;
  if (contentType.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { status: res.status, body, contentType };
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`OK: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertNoReferenceContacts(node, path = 'root') {
  if (Array.isArray(node)) {
    node.forEach((item, index) =>
      assertNoReferenceContacts(item, `${path}[${index}]`)
    );
    return;
  }
  if (!isObject(node)) {
    return;
  }
  if (Object.prototype.hasOwnProperty.call(node, 'referenceContacts')) {
    fail(`referenceContacts present at ${path}`);
  }
  for (const [key, value] of Object.entries(node)) {
    assertNoReferenceContacts(value, `${path}.${key}`);
  }
}

async function validateOrigin(origin, label) {
  console.log(`\n=== ${label}: ${origin} ===`);

  for (const resource of resources) {
    const unauth = await request(origin, resource, { auth: false });
    if (unauth.status === 403) {
      ok(`${resource} without token → 403`);
    } else {
      fail(`${resource} without token → expected 403, got ${unauth.status}`);
    }
  }

  const profile = await request(origin, 'profile', { auth: true });
  if (profile.status !== 200 || !isObject(profile.body?.data)) {
    fail(
      `profile with token → expected 200 + data object, got ${profile.status}`
    );
  } else {
    ok('profile with token → 200');
    const data = profile.body.data;
    if (!Object.prototype.hasOwnProperty.call(data, 'availability')) {
      fail('profile missing availability');
    } else {
      ok('profile has availability');
    }
    if (!Object.prototype.hasOwnProperty.call(data, 'languages')) {
      fail('profile missing languages');
    } else {
      ok('profile has languages');
    }
  }

  const experiences = await request(origin, 'experiences', { auth: true });
  if (experiences.status !== 200 || !Array.isArray(experiences.body?.data)) {
    fail(
      `experiences with token → expected 200 + data array, got ${experiences.status}`
    );
  } else {
    ok('experiences with token → 200');
    const withCompany = experiences.body.data.find(
      (item) => item && item.company
    );
    if (experiences.body.data.length === 0) {
      console.warn(
        'WARN: no published experiences — publish content in admin if expected'
      );
    } else if (!withCompany) {
      console.warn(
        'WARN: no experience with company relation in current data'
      );
    } else {
      ok('at least one experience includes company');
    }
  }

  const projects = await request(origin, 'projects', { auth: true });
  if (projects.status !== 200 || !Array.isArray(projects.body?.data)) {
    fail(
      `projects with token → expected 200 + data array, got ${projects.status}`
    );
  } else {
    ok('projects with token → 200');
    if (projects.body.data.length === 0) {
      console.warn(
        'WARN: no published projects — publish content in admin if expected'
      );
    } else {
      const project = projects.body.data[0];
      for (const field of [
        'experience',
        'narrative',
        'technologies',
        'achievements',
        'links',
      ]) {
        if (!Object.prototype.hasOwnProperty.call(project, field)) {
          fail(`project missing ${field}`);
        } else {
          ok(`project has ${field}`);
        }
      }
    }
  }

  const companies = await request(origin, 'companies', { auth: true });
  if (companies.status !== 200 || !Array.isArray(companies.body?.data)) {
    fail(
      `companies with token → expected 200 + data array, got ${companies.status}`
    );
  } else {
    ok('companies with token → 200');
    assertNoReferenceContacts(companies.body.data, 'companies');
    ok('companies responses omit referenceContacts');
  }
}

await validateOrigin(baseUrl, 'local');

if (publicUrl) {
  await validateOrigin(publicUrl, 'public (ngrok)');
} else {
  console.log(
    '\nSKIP: CAREEROS_PUBLIC_URL not set — local checks only. Set it to the ngrok HTTPS origin to validate the tunnel.'
  );
}

if (process.exitCode) {
  console.error('\nValidation finished with failures.');
  process.exit(process.exitCode);
}

console.log('\nValidation passed.');
