/**
 * UCP Spec Compliance Validator
 *
 * Validates that the UCP middleware conforms to the Universal Commerce Protocol
 * specification at https://ucp.dev/latest/specification/
 *
 * Run against MockAdapter (no external deps):
 *   npx tsx scripts/validate-ucp-compliance.ts
 *
 * Run against a live server:
 *   UCP_BASE_URL=http://localhost:3000 npx tsx scripts/validate-ucp-compliance.ts
 *
 * Exit code: 0 = all checks pass, 1 = violations found
 */

const UCP_SPEC_VERSION = '2026-01-23';

interface CheckResult {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

const results: CheckResult[] = [];

function check(name: string, pass: boolean, detail = ''): void {
  results.push({ name, pass, detail });
}

// ── Build test app or connect to live server ──────────────────────────────

type InjectFn = (opts: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}) => Promise<{ statusCode: number; body: string; headers: Record<string, string> }>;

async function getInjectFn(): Promise<InjectFn> {
  const baseUrl = process.env['UCP_BASE_URL'] ?? 'http://localhost:3000';

  return async (opts) => {
    const url = `${baseUrl}${opts.url}`;
    const fetchOpts: RequestInit = {
      method: opts.method,
      headers: opts.headers,
    };
    if (opts.body) fetchOpts.body = opts.body;
    const res = await fetch(url, fetchOpts);
    const body = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return { statusCode: res.status, body, headers };
  };
}

// ── Checks ────────────────────────────────────────────────────────────────

async function runChecks(): Promise<void> {
  const inject = await getInjectFn();
  const HOST = { host: 'mock-store.localhost' };
  const AGENT = { ...HOST, 'ucp-agent': 'compliance-checker/1.0' };
  const JSON_AGENT = { ...AGENT, 'content-type': 'application/json' };

  // ── 1. Endpoint Paths ────────────────────────────────────────────────

  const discovery = await inject({ method: 'GET', url: '/.well-known/ucp', headers: HOST });
  check('ENDPOINT: GET /.well-known/ucp exists', discovery.statusCode === 200, `Got ${discovery.statusCode}`);

  const checkoutCreate = await inject({
    method: 'POST', url: '/checkout-sessions',
    headers: JSON_AGENT,
    body: JSON.stringify({ line_items: [{ item: { id: 'prod-001' }, quantity: 1 }] }),
  });
  check(
    'ENDPOINT: POST /checkout-sessions (no /ucp/ prefix)',
    checkoutCreate.statusCode === 201 || checkoutCreate.statusCode === 200,
    `Got ${checkoutCreate.statusCode}. If 404, endpoint still has /ucp/ prefix`,
  );

  const oldPrefix = await inject({ method: 'POST', url: '/ucp/checkout-sessions', headers: JSON_AGENT, body: '{}' });
  check(
    'ENDPOINT: /ucp/checkout-sessions should NOT exist',
    oldPrefix.statusCode === 404,
    `Got ${oldPrefix.statusCode}. Old prefix still active`,
  );

  // ── 2. Business Profile Structure ────────────────────────────────────

  const profileBody = JSON.parse(discovery.body) as Record<string, unknown>;

  const ucpObj = profileBody['ucp'] as Record<string, unknown> | undefined;
  const hasNestedUcp = ucpObj !== undefined && typeof ucpObj === 'object' && typeof ucpObj['version'] === 'string';
  check(
    'PROFILE: Root has ucp object with version',
    hasNestedUcp,
    hasNestedUcp ? `version: ${String(ucpObj?.['version'])}` : `Root keys: ${Object.keys(profileBody).join(', ')}. Need ucp.version, ucp.services, etc.`,
  );

  if (hasNestedUcp && ucpObj) {
    check('PROFILE: ucp.services exists', ucpObj['services'] !== undefined, '');
    check('PROFILE: ucp.capabilities exists', ucpObj['capabilities'] !== undefined, '');
    check('PROFILE: ucp.payment_handlers exists', ucpObj['payment_handlers'] !== undefined, '');
  } else {
    check('PROFILE: ucp.services exists', false, 'ucp object missing');
    check('PROFILE: ucp.capabilities exists', false, 'ucp object missing');
    check('PROFILE: ucp.payment_handlers exists', false, 'ucp object missing');
  }

  check('PROFILE: signing_keys exists', profileBody['signing_keys'] !== undefined || ucpObj?.['signing_keys'] !== undefined, '');

  // ── 3. Checkout Session Schema ───────────────────────────────────────

  if (checkoutCreate.statusCode === 201 || checkoutCreate.statusCode === 200) {
    const session = JSON.parse(checkoutCreate.body) as Record<string, unknown>;

    check('SESSION: has id field', typeof session['id'] === 'string', '');
    check('SESSION: has status field', typeof session['status'] === 'string', `Got: ${String(session['status'])}`);
    check('SESSION: has line_items array', Array.isArray(session['line_items']), `Got type: ${typeof session['line_items']}`);
    check('SESSION: has currency field', typeof session['currency'] === 'string', `Got: ${String(session['currency'])}`);
    check('SESSION: has totals array', Array.isArray(session['totals']), `Got type: ${typeof session['totals']}`);
    check('SESSION: has links array', Array.isArray(session['links']), `Got type: ${typeof session['links']}`);
    check('SESSION: has ucp envelope', typeof session['ucp'] === 'object' && session['ucp'] !== null, '');

    check(
      'SESSION: no cart_id field (spec uses line_items)',
      session['cart_id'] === undefined,
      session['cart_id'] !== undefined ? 'cart_id found — should use inline line_items' : '',
    );
    check(
      'SESSION: no tenant_id in response (internal field)',
      session['tenant_id'] === undefined,
      session['tenant_id'] !== undefined ? 'tenant_id leaked to client' : '',
    );

    if (session['order'] !== undefined && session['order'] !== null) {
      const order = session['order'] as Record<string, unknown>;
      check('SESSION.order: has permalink_url', typeof order['permalink_url'] === 'string', '');
    }

    const status = session['status'] as string;
    const validStatuses = ['incomplete', 'requires_escalation', 'ready_for_complete', 'complete_in_progress', 'completed', 'canceled'];
    check('SESSION: status is valid enum', validStatuses.includes(status), `Got: ${status}`);

    // Check expires_at default (should be ~6 hours, not 30 min)
    if (session['expires_at']) {
      const expiresAt = new Date(session['expires_at'] as string);
      const now = new Date();
      const diffHours = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      check('SESSION: expires_at default ~6 hours', diffHours > 5 && diffHours < 7, `Got ${diffHours.toFixed(1)} hours`);
    }
  }

  // ── 4. Totals Format ─────────────────────────────────────────────────

  if (checkoutCreate.statusCode === 201 || checkoutCreate.statusCode === 200) {
    const session = JSON.parse(checkoutCreate.body) as Record<string, unknown>;
    const totals = session['totals'];

    if (Array.isArray(totals) && totals.length > 0) {
      const first = totals[0] as Record<string, unknown>;
      check('TOTALS: entries have type field', typeof first['type'] === 'string', `Got: ${String(first['type'])}`);
      check('TOTALS: entries have amount field', typeof first['amount'] === 'number', `Got: ${typeof first['amount']}`);

      const validTypes = ['items_discount', 'subtotal', 'discount', 'fulfillment', 'tax', 'fee', 'total'];
      const allValid = totals.every((t: Record<string, unknown>) => validTypes.includes(t['type'] as string));
      check('TOTALS: all types are valid enum values', allValid, '');
    }
  }

  // ── 5. Error Format ──────────────────────────────────────────────────

  const badRequest = await inject({ method: 'GET', url: '/checkout-sessions/nonexistent-id', headers: AGENT });
  if (badRequest.statusCode >= 400) {
    const errBody = JSON.parse(badRequest.body) as Record<string, unknown>;

    check(
      'ERROR: uses messages array (not error object)',
      Array.isArray(errBody['messages']),
      errBody['error'] !== undefined ? 'Using old {error: {...}} format' : `Keys: ${Object.keys(errBody).join(', ')}`,
    );

    if (Array.isArray(errBody['messages'])) {
      const msg = (errBody['messages'] as Record<string, unknown>[])[0];
      if (msg) {
        check('ERROR.message: has type field', typeof msg['type'] === 'string', `Got: ${String(msg['type'])}`);
        check('ERROR.message: has code field', typeof msg['code'] === 'string', `Got: ${String(msg['code'])}`);
        check('ERROR.message: has content field', typeof msg['content'] === 'string', '');
        check('ERROR.message: has severity field', typeof msg['severity'] === 'string', `Got: ${String(msg['severity'])}`);
      }
    }
  }

  // ── 6. Address Fields ────────────────────────────────────────────────

  // We check the Zod schema by trying to create/update with spec field names
  if (checkoutCreate.statusCode === 201 || checkoutCreate.statusCode === 200) {
    const session = JSON.parse(checkoutCreate.body) as Record<string, unknown>;
    const sessionId = session['id'] as string;

    const updateRes = await inject({
      method: 'PUT', url: `/checkout-sessions/${sessionId}`,
      headers: JSON_AGENT,
      body: JSON.stringify({
        id: sessionId,
        line_items: [{ item: { id: 'prod-001' }, quantity: 1 }],
        buyer: {
          first_name: 'Jane', last_name: 'Doe',
          email: 'jane@test.com',
          shipping_address: {
            street_address: '123 Main St',
            address_locality: 'Austin',
            address_region: 'TX',
            postal_code: '78701',
            address_country: 'US',
          },
        },
      }),
    });

    check(
      'ADDRESS: accepts spec field names (street_address, address_locality)',
      updateRes.statusCode === 200,
      `Got ${updateRes.statusCode}. If 400/404, address fields not aligned with spec`,
    );
  }

  // ── 7. Headers ───────────────────────────────────────────────────────

  const noAgent = await inject({ method: 'GET', url: '/checkout-sessions/test', headers: HOST });
  check('HEADER: rejects missing UCP-Agent', noAgent.statusCode === 401, `Got ${noAgent.statusCode}`);

  const rfcAgent = await inject({
    method: 'GET', url: '/checkout-sessions/test',
    headers: { ...HOST, 'ucp-agent': 'profile="https://agent.example/profile.json"' },
  });
  check(
    'HEADER: accepts RFC 8941 UCP-Agent format',
    rfcAgent.statusCode !== 401,
    `Got ${rfcAgent.statusCode} (401 means header rejected)`,
  );

  // ── 8. HTTP Methods ──────────────────────────────────────────────────

  const putCheck = await inject({
    method: 'PUT', url: '/checkout-sessions/test',
    headers: JSON_AGENT, body: '{}',
  });
  check(
    'METHOD: PUT /checkout-sessions/{id} supported',
    putCheck.statusCode !== 404 && putCheck.statusCode !== 405,
    `Got ${putCheck.statusCode}. If 404/405, still using PATCH`,
  );

  const patchCheck = await inject({
    method: 'PATCH', url: '/checkout-sessions/test',
    headers: JSON_AGENT, body: '{}',
  });
  check(
    'METHOD: PATCH /checkout-sessions/{id} should NOT exist (spec uses PUT)',
    patchCheck.statusCode === 404 || patchCheck.statusCode === 405,
    `Got ${patchCheck.statusCode}`,
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('UCP Spec Compliance Validator');
  console.log(`Spec version: ${UCP_SPEC_VERSION}`);
  console.log(`Target: ${process.env['UCP_BASE_URL'] ?? 'MockAdapter (in-process)'}`);
  console.log('='.repeat(70));
  console.log('');

  try {
    await runChecks();
  } catch (err) {
    console.error('Fatal error running checks:', err);
    process.exit(2);
  }

  const passed = results.filter((r) => r.pass);
  const failed = results.filter((r) => !r.pass);

  for (const r of results) {
    const icon = r.pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    const detail = r.detail ? ` — ${r.detail}` : '';
    console.log(`  [${icon}] ${r.name}${detail}`);
  }

  console.log('');
  console.log('='.repeat(70));
  console.log(`Results: ${passed.length} passed, ${failed.length} failed, ${results.length} total`);

  if (failed.length > 0) {
    console.log('');
    console.log('Failed checks:');
    for (const r of failed) {
      console.log(`  - ${r.name}${r.detail ? `: ${r.detail}` : ''}`);
    }
    process.exit(1);
  }

  console.log('\nAll checks passed!');
  process.exit(0);
}

await main();
