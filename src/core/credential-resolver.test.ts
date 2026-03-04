import { describe, test, expect } from 'bun:test';

import { resolveCredentialsForPlugin } from './credential-resolver.js';
import type { PluginDescriptor } from './plugin-interface.js';

// Mock descriptor with one credential type
const mockDescriptor: PluginDescriptor = {
  name: 'github',
  displayName: 'GitHub',
  description: 'GitHub API',
  version: '1.0.0',
  type: 'adapted',
  credentials: [
    {
      name: 'githubApi',
      displayName: 'GitHub API',
      type: 'bearer',
      fields: [],
    },
  ],
  resources: [],
};

// Use explicit env bags to avoid cross-test contamination via process.env
// and to isolate from CI environment variables (e.g. GITHUB_TOKEN).
const CLEAN_ENV: Record<string, string | undefined> = {};

describe('resolveCredentialsForPlugin', () => {
  test('returns empty array for plugins with no credentials', async () => {
    const desc: PluginDescriptor = { ...mockDescriptor, credentials: [] };
    const result = await resolveCredentialsForPlugin(desc, { env: CLEAN_ENV });
    expect(result).toEqual([]);
  });

  test('resolves credentials from NATHAN_<SERVICE>_TOKEN', async () => {
    const env = { ...CLEAN_ENV, NATHAN_GITHUB_TOKEN: 'ghp_test123' };
    const result = await resolveCredentialsForPlugin(mockDescriptor, { env });
    expect(result).toHaveLength(1);
    expect(result[0].typeName).toBe('githubApi');
    expect(result[0].primarySecret).toBe('ghp_test123');
  });

  test('resolves credentials from <SERVICE>_TOKEN fallback', async () => {
    const env = { ...CLEAN_ENV, GITHUB_TOKEN: 'ghp_fallback' };
    const result = await resolveCredentialsForPlugin(mockDescriptor, { env });
    expect(result).toHaveLength(1);
    expect(result[0].primarySecret).toBe('ghp_fallback');
  });

  test('collects field overrides from NATHAN_<SERVICE>_<FIELD>', async () => {
    const env = {
      ...CLEAN_ENV,
      NATHAN_GITHUB_TOKEN: 'ghp_test123',
      NATHAN_GITHUB_SERVER: 'https://github.example.com',
    };
    const result = await resolveCredentialsForPlugin(mockDescriptor, { env });
    expect(result).toHaveLength(1);
    expect(result[0].fields.server).toBe('https://github.example.com');
  });

  test('ResolvedCredentials has correct shape', async () => {
    const env = { ...CLEAN_ENV, NATHAN_GITHUB_TOKEN: 'ghp_test123' };
    const result = await resolveCredentialsForPlugin(mockDescriptor, { env });
    const cred = result[0];
    // Verify shape: typeName, primarySecret, fields
    expect(typeof cred.typeName).toBe('string');
    expect(typeof cred.primarySecret).toBe('string');
    expect(typeof cred.fields).toBe('object');
    // No __field_ prefix anywhere
    for (const key of Object.keys(cred.fields)) {
      expect(key.startsWith('__field_')).toBe(false);
    }
  });
});
