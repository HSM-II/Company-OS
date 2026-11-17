import assert from 'node:assert/strict';
import test from 'node:test';
import { CompanyOSAPIError, CompanyOSClient } from '../typescript/dist/index.js';

test('resolveContext sends an authenticated, encoded request and returns the server budget', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return Response.json({
      company_id: 'company-id', actor_role: 'worker', phase: 'review', task_id: 'task-id',
      query: null, policy: null, text: 'approved context', memory_ids: [], max_tokens: 512,
    });
  };
  try {
    const client = new CompanyOSClient({ baseUrl: 'https://api.example.test', token: 'test-token' });
    const result = await client.resolveContext('company-id', {
      taskId: 'task-id', query: 'quarterly margin & tax', phase: 'review',
    });
    assert.equal(result.text, 'approved context');
    assert.equal(result.max_tokens, 512);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.pathname, '/api/company/companies/company-id/context/resolve');
    assert.equal(calls[0].url.searchParams.get('task_id'), 'task-id');
    assert.equal(calls[0].url.searchParams.get('query'), 'quarterly margin & tax');
    assert.equal(calls[0].url.searchParams.get('phase'), 'review');
    assert.equal(calls[0].init.method, 'GET');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolveContext preserves a server authorization refusal', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: 'company access denied' }, { status: 403 });
  try {
    const client = new CompanyOSClient({ baseUrl: 'https://api.example.test', token: 'test-token' });
    await assert.rejects(
      client.resolveContext('company-id', { query: 'sensitive' }),
      (error) => error instanceof CompanyOSAPIError && error.status === 403 &&
        error.body?.error === 'company access denied',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
