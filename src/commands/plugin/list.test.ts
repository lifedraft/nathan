import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';

import chalk from 'chalk';

import type { Plugin, PluginDescriptor } from '../../core/plugin-interface.js';
import { createPluginRegistry } from '../../core/plugin-registry.js';

// Mock the registry singleton so PluginListCommand sees our test registry.
const testRegistry = createPluginRegistry();
mock.module('../../core/registry-instance.js', () => ({ registry: testRegistry }));

// Import after mocking so it picks up the mock.
const { PluginListCommand } = await import('./list.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDescriptor(overrides: Partial<PluginDescriptor> = {}): PluginDescriptor {
  return {
    name: 'test-svc',
    displayName: 'Test Service',
    description: 'A test service',
    version: '1.0.0',
    type: 'native',
    credentials: [],
    resources: [
      {
        name: 'items',
        displayName: 'Items',
        description: 'Item resource',
        operations: [
          {
            name: 'list',
            displayName: 'List',
            description: 'List items',
            method: 'GET',
            path: '/items',
            parameters: [],
            output: { format: 'json' },
            requiresAuth: false,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makePlugin(overrides: Partial<PluginDescriptor> = {}): Plugin {
  return {
    descriptor: makeDescriptor(overrides),
    execute: async () => ({ success: true, data: {} }),
  };
}

// ---------------------------------------------------------------------------
// Spies & cleanup
// ---------------------------------------------------------------------------

let logSpy: ReturnType<typeof spyOn>;
let originalLevel: typeof chalk.level;

beforeEach(() => {
  logSpy = spyOn(console, 'log').mockImplementation(() => {});
  originalLevel = chalk.level;
  chalk.level = 0 as typeof chalk.level;
  testRegistry.clear();
});

afterEach(() => {
  logSpy.mockRestore();
  chalk.level = originalLevel;
});

function logged(): string {
  return logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
}

/** Run the command with optional --json flag. */
async function run(json = false): Promise<void> {
  const cmd = new PluginListCommand();
  cmd.json = json;
  await cmd.execute();
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
describe('plugin list — empty state', () => {
  test('prints "No plugins found" when registry is empty', async () => {
    await run();
    expect(logged()).toContain('No plugins found');
    expect(logged()).toContain('nathan plugin install');
  });
});

// ---------------------------------------------------------------------------
// Human-readable output
// ---------------------------------------------------------------------------
describe('plugin list — human-readable', () => {
  test('shows loaded plugin with name, description, and resource names', async () => {
    testRegistry.register(makePlugin());
    await run();
    const out = logged();
    expect(out).toContain('Loaded Plugins');
    expect(out).toContain('test-svc');
    expect(out).toContain('A test service');
    expect(out).toContain('resources:');
    expect(out).toContain('items');
  });

  test('shows available (lazy) plugins section', async () => {
    testRegistry.registerLazy('lazy-svc', async () => makePlugin({ name: 'lazy-svc' }));
    await run();
    const out = logged();
    expect(out).toContain('Available (1 plugins)');
    expect(out).toContain('lazy-svc');
  });

  test('shows both loaded and available sections', async () => {
    testRegistry.register(makePlugin());
    testRegistry.registerLazy('lazy-svc', async () => makePlugin({ name: 'lazy-svc' }));
    await run();
    const out = logged();
    expect(out).toContain('Loaded Plugins');
    expect(out).toContain('test-svc');
    expect(out).toContain('Available (1 plugins)');
    expect(out).toContain('lazy-svc');
    expect(out).toContain('nathan describe <service>');
  });

  test('shows multiple resource names for a loaded plugin', async () => {
    testRegistry.register(
      makePlugin({
        resources: [
          {
            name: 'users',
            displayName: 'Users',
            description: 'User resource',
            operations: [],
          },
          {
            name: 'posts',
            displayName: 'Posts',
            description: 'Post resource',
            operations: [],
          },
        ],
      }),
    );
    await run();
    const out = logged();
    expect(out).toContain('users');
    expect(out).toContain('posts');
  });
});

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------
describe('plugin list --json', () => {
  test('outputs wrapped {plugins: [...]} with status field for loaded plugin', async () => {
    testRegistry.register(makePlugin());
    await run(true);
    const parsed = JSON.parse(logged());
    expect(parsed.plugins).toBeArray();
    expect(parsed.plugins).toHaveLength(1);
    const p = parsed.plugins[0];
    expect(p.name).toBe('test-svc');
    expect(p.status).toBe('loaded');
    expect(p.displayName).toBe('Test Service');
    expect(p.description).toBe('A test service');
    expect(p.version).toBe('1.0.0');
    expect(p.authenticated).toBe(false);
    expect(p.resources).toEqual([{ name: 'items', operations: ['list'] }]);
  });

  test('available plugins have status "available"', async () => {
    testRegistry.registerLazy('lazy-svc', async () => makePlugin({ name: 'lazy-svc' }));
    await run(true);
    const parsed = JSON.parse(logged());
    expect(parsed.plugins).toHaveLength(1);
    expect(parsed.plugins[0]).toEqual({ name: 'lazy-svc', status: 'available' });
  });

  test('mixed loaded and available plugins', async () => {
    testRegistry.register(
      makePlugin({
        credentials: [
          {
            name: 'testCred',
            displayName: 'Test Cred',
            type: 'api_key',
            fields: [{ name: 'token', displayName: 'Token', type: 'password', required: true }],
          },
        ],
      }),
    );
    testRegistry.registerLazy('lazy-svc', async () => makePlugin({ name: 'lazy-svc' }));
    await run(true);
    const parsed = JSON.parse(logged());
    expect(parsed.plugins).toHaveLength(2);

    const loaded = parsed.plugins.find((p: { name: string }) => p.name === 'test-svc');
    const available = parsed.plugins.find((p: { name: string }) => p.name === 'lazy-svc');

    expect(loaded.status).toBe('loaded');
    expect(loaded.authenticated).toBe(true);
    expect(available.status).toBe('available');
  });

  test('empty registry outputs empty plugins array', async () => {
    await run(true);
    const parsed = JSON.parse(logged());
    expect(parsed.plugins).toEqual([]);
  });
});
