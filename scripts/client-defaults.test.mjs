import assert from 'node:assert/strict';
import test from 'node:test';
import { CompanyOSClient } from '../typescript/dist/index.js';

test('environment clients default to the Company OS API and preserve explicit endpoints', () => {
  const previous = process.env.HSM_COMPANY_API_URL;
  try {
    delete process.env.HSM_COMPANY_API_URL;
    assert.equal(CompanyOSClient.fromEnv().baseUrl, 'http://localhost:3847');
    process.env.HSM_COMPANY_API_URL = 'https://api.example.test/custom/';
    assert.equal(CompanyOSClient.fromEnv().baseUrl, 'https://api.example.test/custom');
  } finally {
    if (previous === undefined) delete process.env.HSM_COMPANY_API_URL;
    else process.env.HSM_COMPANY_API_URL = previous;
  }
});
