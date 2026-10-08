import test from 'node:test';
import assert from 'node:assert/strict';
import { CompanyOSClient } from '../typescript/dist/index.js';
import { Agent, CompanyOSHookBus } from '../typescript/dist/kit.js';

for (const failure of [false, true]) {
  test(`chat hook retry cannot replay ${failure ? 'ambiguous failure' : 'successful mutation'}`, async () => {
    let calls = 0;
    const error = new Error('connection lost after commit');
    const client = { agentChat: async () => { calls++; if (failure) throw error; return { run_id: 'committed' }; } };
    const hooks = new CompanyOSHookBus().on(failure ? 'retry' : 'after_tool_call', () => ({ retry: { maxAttempts: 3, delayMs: 0 } }));
    const agent = new Agent({ client, hooks, companyId: 'company', agentRef: 'agent' });
    if (failure) await assert.rejects(agent.run('hello'), /connection lost/);
    else assert.equal((await agent.run('hello')).run_id, 'committed');
    assert.equal(calls, 1);
  });
}

test('transport respects caller cancellation before fetching', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('{}'); };
  try {
    const controller = new AbortController(); controller.abort();
    const client = new CompanyOSClient({ baseUrl: 'http://localhost' });
    await assert.rejects(client.request('GET', '/stall', { signal: controller.signal }), error => error.name === 'CompanyOSTransportError' && error.kind === 'cancelled');
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test('configured deadline covers response body consumption', { timeout: 100 }, async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => ({
    ok: true, headers: new Headers({ 'content-type': 'application/json' }),
    json: () => new Promise((_resolve, reject) => {
      if (init.signal.aborted) reject(init.signal.reason);
      else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    }),
  });
  try {
    const client = new CompanyOSClient({ baseUrl: 'http://localhost', timeoutMs: 15 });
    await assert.rejects(client.request('GET', '/stall'), error => error.name === 'CompanyOSTransportError' && error.kind === 'timeout');
  } finally { globalThis.fetch = original; }
});

test('sensitive company reads send distinct transport and principal credentials', async () => {
  const original = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (_url, init) => { sent.push(new Headers(init.headers)); return new Response('{}', { headers: { 'content-type': 'application/json' } }); };
  try {
    const client = new CompanyOSClient({ baseUrl: 'http://localhost', token: 'transport', principalToken: 'principal' });
    await client.request('GET', '/api/company/companies/company/goals');
    await client.request('GET', '/api/company/companies/company/memory');
    for (const headers of sent) {
      assert.equal(headers.get('authorization'), 'Bearer transport');
      assert.equal(headers.get('x-hsm-principal-token'), 'principal');
    }
  } finally { globalThis.fetch = original; }
});
