import { describe, test, expect, mock } from 'bun:test';

import type { ResolvedCredentials } from '../core/plugin-interface.js';
import { resolveExpression, executeDeclarativeRouting } from './declarative-executor.js';
import type { INodeTypeDescription, INodeProperties } from './types.js';

// ---------------------------------------------------------------------------
// Expression resolution
// ---------------------------------------------------------------------------

describe('resolveExpression', () => {
  test('resolves credential expressions', () => {
    const ctx = {
      $credentials: { domain: 'https://example.atlassian.net', apiToken: 'tok' },
    };
    const result = resolveExpression('={{$credentials.domain}}', ctx);
    expect(result).toBe('https://example.atlassian.net');
  });

  test('resolves parameter expressions', () => {
    const ctx = {
      $parameter: { resource: 'space', operation: 'getSpaces' },
    };
    const result = resolveExpression(
      '=/wiki/api/v2/{{ $parameter.resource === "space" ? "spaces" : $parameter.resource }}',
      ctx,
    );
    expect(result).toBe('/wiki/api/v2/spaces');
  });

  test('strips leading = from resolved result', () => {
    const ctx = { $credentials: { domain: 'https://test.com' } };
    const result = resolveExpression('={{$credentials.domain}}/path', ctx);
    expect(result).toBe('https://test.com/path');
    expect(result.startsWith('=')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Post-receive transforms (tested via executeDeclarativeRouting)
// ---------------------------------------------------------------------------

function makeNodeDescription(overrides?: Partial<INodeTypeDescription>): INodeTypeDescription {
  const operationProp: INodeProperties = {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    default: 'getAll',
    displayOptions: { show: { resource: ['item'] } },
    options: [
      {
        name: 'Get All',
        value: 'getAll',
        routing: {
          request: { method: 'GET', url: '/items' },
          output: {
            postReceive: [
              { type: 'rootProperty', properties: { property: 'results' } },
              { type: 'limit', properties: { maxResults: 100 } },
            ],
          },
        },
      },
      {
        name: 'Get',
        value: 'get',
        routing: {
          request: { method: 'GET', url: '/items/{{$parameter.itemId}}' },
        },
      },
    ],
  };

  return {
    displayName: 'Test Node',
    name: 'testNode',
    group: ['transform'],
    version: 1,
    description: 'Test node',
    defaults: { name: 'Test' },
    inputs: ['main'],
    outputs: ['main'],
    requestDefaults: {
      baseURL: 'https://api.test.com',
    },
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        default: 'item',
        options: [{ name: 'Item', value: 'item' }],
      },
      operationProp,
    ],
    ...overrides,
  };
}

describe('executeDeclarativeRouting', () => {
  test('returns UNKNOWN_OPERATION for non-existent operation', async () => {
    const desc = makeNodeDescription();
    const result = await executeDeclarativeRouting({
      nodeDescription: desc,
      resource: 'item',
      operation: 'nonExistent',
      params: {},
      credentials: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNKNOWN_OPERATION');
    }
  });

  test('constructs correct URL from requestDefaults and routing', async () => {
    const desc = makeNodeDescription();
    let capturedUrl = '';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({ results: [{ id: 1 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      await executeDeclarativeRouting({
        nodeDescription: desc,
        resource: 'item',
        operation: 'getAll',
        params: {},
        credentials: [],
      });
      expect(capturedUrl).toBe('https://api.test.com/items');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('applies rootProperty post-receive transform', async () => {
    const desc = makeNodeDescription();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ results: [{ id: 1 }, { id: 2 }], total: 2 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await executeDeclarativeRouting({
        nodeDescription: desc,
        resource: 'item',
        operation: 'getAll',
        params: {},
        credentials: [],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        // rootProperty 'results' should extract the array
        expect(Array.isArray(result.data)).toBe(true);
        expect((result.data as unknown[]).length).toBe(2);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('applies limit post-receive transform', async () => {
    const desc = makeNodeDescription();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ results: [{ id: 1 }, { id: 2 }, { id: 3 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await executeDeclarativeRouting({
        nodeDescription: desc,
        resource: 'item',
        operation: 'getAll',
        params: { limit: 1 },
        credentials: [],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as unknown[]).length).toBe(1);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('returns error result for HTTP errors', async () => {
    const desc = makeNodeDescription();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        statusText: 'Not Found',
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await executeDeclarativeRouting({
        nodeDescription: desc,
        resource: 'item',
        operation: 'getAll',
        params: {},
        credentials: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('HTTP_404');
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('returns error result for network failures', async () => {
    const desc = makeNodeDescription();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('Connection refused');
    }) as typeof fetch;

    try {
      const result = await executeDeclarativeRouting({
        nodeDescription: desc,
        resource: 'item',
        operation: 'getAll',
        params: {},
        credentials: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('REQUEST_FAILED');
        expect(result.error.message).toContain('Connection refused');
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('routes collection child params to query string', async () => {
    // Simulates the pattern used by Confluence Cloud search:
    // additionalFields (collection, no routing) → cql (child, routing.request.qs)
    const desc = makeNodeDescription({
      properties: [
        {
          displayName: 'Resource',
          name: 'resource',
          type: 'options',
          default: 'item',
          options: [{ name: 'Item', value: 'item' }],
        },
        {
          displayName: 'Operation',
          name: 'operation',
          type: 'options',
          default: 'search',
          displayOptions: { show: { resource: ['item'] } },
          options: [
            {
              name: 'Search',
              value: 'search',
              routing: { request: { method: 'GET', url: '/search' } },
            },
          ],
        },
        {
          displayName: 'Additional Fields',
          name: 'additionalFields',
          type: 'collection',
          default: {},
          displayOptions: { show: { resource: ['item'], operation: ['search'] } },
          options: [
            {
              displayName: 'Query',
              name: 'query',
              type: 'string',
              default: '',
              routing: { request: { qs: { q: '={{$value}}' } } },
            },
            {
              displayName: 'Format',
              name: 'format',
              type: 'string',
              default: '',
              routing: { send: { type: 'query', property: 'fmt' } },
            },
          ],
        } as INodeProperties,
      ],
    });

    let capturedUrl = '';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await executeDeclarativeRouting({
        nodeDescription: desc,
        resource: 'item',
        operation: 'search',
        params: { query: 'type=page', format: 'json' },
        credentials: [],
      });
      expect(result.success).toBe(true);
      expect(capturedUrl).toContain('query=type%3Dpage');
      expect(capturedUrl).toContain('fmt=json');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('routes fixedCollection child params to body', async () => {
    const desc = makeNodeDescription({
      properties: [
        {
          displayName: 'Resource',
          name: 'resource',
          type: 'options',
          default: 'item',
          options: [{ name: 'Item', value: 'item' }],
        },
        {
          displayName: 'Operation',
          name: 'operation',
          type: 'options',
          default: 'create',
          displayOptions: { show: { resource: ['item'] } },
          options: [
            {
              name: 'Create',
              value: 'create',
              routing: { request: { method: 'POST', url: '/items' } },
            },
          ],
        },
        {
          displayName: 'Fields',
          name: 'fields',
          type: 'fixedCollection',
          default: {},
          displayOptions: { show: { resource: ['item'], operation: ['create'] } },
          options: [
            {
              displayName: 'Values',
              name: 'values',
              values: [
                {
                  displayName: 'Title',
                  name: 'title',
                  type: 'string',
                  default: '',
                  routing: { send: { type: 'body', property: 'title' } },
                },
              ],
            },
          ],
        } as INodeProperties,
      ],
    });

    let capturedBody = '';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = (init?.body as string) ?? '';
      return new Response(JSON.stringify({ id: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await executeDeclarativeRouting({
        nodeDescription: desc,
        resource: 'item',
        operation: 'create',
        params: { title: 'New Item' },
        credentials: [],
      });
      expect(result.success).toBe(true);
      const body = JSON.parse(capturedBody);
      expect(body.title).toBe('New Item');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('ignores collection children without routing', async () => {
    const desc = makeNodeDescription({
      properties: [
        {
          displayName: 'Resource',
          name: 'resource',
          type: 'options',
          default: 'item',
          options: [{ name: 'Item', value: 'item' }],
        },
        {
          displayName: 'Operation',
          name: 'operation',
          type: 'options',
          default: 'getAll',
          displayOptions: { show: { resource: ['item'] } },
          options: [
            {
              name: 'Get All',
              value: 'getAll',
              routing: { request: { method: 'GET', url: '/items' } },
            },
          ],
        },
        {
          displayName: 'Options',
          name: 'options',
          type: 'collection',
          default: {},
          displayOptions: { show: { resource: ['item'], operation: ['getAll'] } },
          options: [
            {
              displayName: 'Verbose',
              name: 'verbose',
              type: 'boolean',
              default: false,
              // No routing — should not appear in qs or body
            },
          ],
        } as INodeProperties,
      ],
    });

    let capturedUrl = '';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await executeDeclarativeRouting({
        nodeDescription: desc,
        resource: 'item',
        operation: 'getAll',
        params: { verbose: true },
        credentials: [],
      });
      expect(result.success).toBe(true);
      // verbose has no routing, so it should not appear in the URL
      expect(capturedUrl).toBe('https://api.test.com/items');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('injects credentials via auth config', async () => {
    const desc = makeNodeDescription();
    let capturedHeaders: Record<string, string> = {};
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const creds: ResolvedCredentials[] = [
      {
        typeName: 'testApi',
        primarySecret: 'secret123',
        fields: {},
      },
    ];

    try {
      await executeDeclarativeRouting({
        nodeDescription: desc,
        resource: 'item',
        operation: 'getAll',
        params: {},
        credentials: creds,
      });
      // Should have an Authorization header from credential injection
      expect(capturedHeaders['Authorization']).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
