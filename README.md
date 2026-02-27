# Nathan

A pluggable CLI that turns popular services into simple, scriptable commands. 400+ integrations out of the box via n8n's node ecosystem, with a consistent interface across all of them.

```bash
nathan github repo get --owner=torvalds --repo=linux
```

## Install

```bash
# Download the latest release
curl -fsSL https://github.com/user/nathan/releases/latest/download/nathan -o nathan
chmod +x nathan
```

Or build from source with [Bun](https://bun.sh/):

```bash
bun install && bun run build
# Binary at dist/nathan
```

## How It Works

Every service follows the same pattern: **discover** what's available, **describe** it, then **execute**.

### 1. Discover services

```bash
nathan discover                 # JSON output (default)
nathan discover --human         # Formatted table
```

### 2. Describe a service

Drill down from service to resource to operation:

```bash
nathan describe github                  # What resources does GitHub have?
nathan describe github repo             # What can I do with repos?
nathan describe github repo get         # What parameters does "get" need?
```

### 3. Execute

```bash
nathan github repo get --owner=torvalds --repo=linux
nathan jsonplaceholder post list --_limit=5
nathan jsonplaceholder post create --title="Hello" --body="World" --userId=1
```

Output is JSON by default. Use `--human` for readable formatting.

## Authentication

Store credentials locally with encrypted storage. They're automatically injected into requests.

```bash
nathan auth add github --token=ghp_xxxxxxxxxxxx
nathan auth test github                            # Verify they work
nathan auth list                                   # See what's stored (values hidden)
nathan auth remove github                          # Delete them
```

Environment variables always take priority over stored credentials:

```bash
NATHAN_GITHUB_TOKEN=ghp_xxx nathan github repo get --owner=torvalds --repo=linux
```

The lookup order is: `NATHAN_<SERVICE>_TOKEN` → `<SERVICE>_TOKEN` → `NATHAN_<SERVICE>_API_KEY` → credential store.

Credentials are encrypted with AES-256-GCM and stored at `~/.nathan/credentials.enc`.

## Adding Services

### YAML plugins

The simplest way to add a new service. Create a `.yaml` file in `plugins/`:

```yaml
name: jsonplaceholder
displayName: JSONPlaceholder
description: Free fake API for testing
version: "1.0.0"
baseURL: https://jsonplaceholder.typicode.com

resources:
  - name: post
    displayName: Post
    description: Blog posts
    operations:
      - name: list
        displayName: List Posts
        description: Get all posts
        method: GET
        path: /posts
        parameters:
          - name: _limit
            type: number
            required: false
            default: 10
            location: query    # query | path | header | body | cookie

      - name: get
        displayName: Get Post
        method: GET
        path: /posts/{id}
        parameters:
          - name: id
            type: number
            required: true
            location: path
```

### n8n nodes

Use any of the 400+ nodes from the n8n ecosystem with a two-line manifest:

```yaml
type: n8n-compat
module: n8n-nodes-base/dist/nodes/Github/Github.node.js
```

No modifications to the original node needed.

### Plugin management

```bash
nathan plugin list              # List installed plugins
nathan plugin install <path>    # Install a plugin
```

Set `NATHAN_PLUGIN_DIRS` (colon-separated paths) to load plugins from additional directories.

## Configuration

| Variable | Purpose |
|---|---|
| `NATHAN_<SERVICE>_TOKEN` | Override credentials for a service |
| `NATHAN_PLUGIN_DIRS` | Additional plugin directories (colon-separated) |
| `NATHAN_MASTER_KEY` | Custom master key for credential encryption |
| `NATHAN_ALLOW_HTTP` | Allow unencrypted HTTP when credentials are attached |
| `NATHAN_DEBUG` | Enable verbose logging |

## License

MIT
