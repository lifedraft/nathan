import { Command, Option } from 'clipanion';

import { getExpectedEnvVarNames, hasConfiguredCredentials } from '../core/credential-resolver.js';
import {
  findResource,
  findOperation,
  type Operation,
  type Parameter,
  type PluginDescriptor,
  type Resource,
} from '../core/plugin-interface.js';
import { registry } from '../core/registry-instance.js';
import { printOutput } from './output.js';

// Clipanion-style rich formatting (matches --help output)
const MAX_LINE_LENGTH = 80;
const richLine = Array(MAX_LINE_LENGTH).fill('━');
for (let t = 0; t <= 24; ++t) richLine[richLine.length - t] = `\x1b[38;5;${232 + t}m━`;

const header = (str: string): string =>
  `\x1b[1m━━━ ${str}${str.length < MAX_LINE_LENGTH - 5 ? ` ${richLine.slice(str.length + 5).join('')}` : ':'}\x1b[0m`;
const bold = (str: string): string => `\x1b[1m${str}\x1b[22m`;

/**
 * Format a single operation as a usage line:
 *   $ nathan <service> <resource> <op> --required <type> [--optional <type>]
 */
function formatUsageLine(service: string, resource: string, op: Operation): string {
  const parts = [`nathan ${service} ${resource} ${op.name}`];
  for (const p of op.parameters) {
    if (p.required) {
      parts.push(`--${p.name} <${p.type}>`);
    } else {
      parts.push(`[--${p.name} <${p.type}>]`);
    }
  }
  return `  ${bold('$ ')}${parts.join(' ')}`;
}

/**
 * Build compact describe output for a full service.
 */
function formatServiceCompact(service: string, descriptor: PluginDescriptor): string {
  const lines: string[] = [];
  lines.push(header(`${descriptor.displayName} — ${descriptor.description}`));
  lines.push('');

  const authRequired = descriptor.credentials.length > 0;
  if (authRequired) {
    const configured = hasConfiguredCredentials(descriptor);
    const label = configured ? 'Auth: configured' : 'Auth: not configured';
    lines.push(`  ${label} (${getExpectedEnvVarNames(descriptor.name).join(', ')})`);
    lines.push('');
  }

  for (const res of descriptor.resources) {
    lines.push(header(res.name));
    lines.push('');
    for (const op of res.operations) {
      lines.push(`  ${bold(`${op.name}`)}  ${op.description}`);
      lines.push(formatUsageLine(service, res.name, op));
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd();
}

/**
 * Build compact describe output for a single resource.
 */
function formatResourceCompact(service: string, res: Resource): string {
  const lines: string[] = [];
  lines.push(header(`${res.displayName} — ${res.description}`));
  lines.push('');

  for (const op of res.operations) {
    lines.push(`  ${bold(`${op.name}`)}  ${op.description}`);
    lines.push(formatUsageLine(service, res.name, op));
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

/**
 * Format a parameter line for operation detail.
 */
function formatParamLine(p: Parameter): string {
  const req = p.required ? 'required' : 'optional';
  const def = p.default !== undefined ? ` [default: ${p.default}]` : '';
  return `  ${bold(`--${p.name}`)} <${p.type}>    ${req} — ${p.description}${def}`;
}

/**
 * Build compact describe output for a single operation.
 */
function formatOperationCompact(service: string, resource: string, op: Operation): string {
  const lines: string[] = [];
  lines.push(`${op.displayName} — ${op.description}`);
  lines.push('');
  lines.push(header('Usage'));
  lines.push('');
  lines.push(formatUsageLine(service, resource, op));

  if (op.parameters.length > 0) {
    lines.push('');
    lines.push(header('Options'));
    lines.push('');
    for (const p of op.parameters) {
      lines.push(formatParamLine(p));
    }
  }

  return lines.join('\n');
}

export class DescribeCommand extends Command {
  static override paths = [['describe']];

  static override usage = Command.Usage({
    description: 'Describe a specific service, resource, or operation in detail',
    examples: [
      ['Describe a service', 'nathan describe jsonplaceholder'],
      ['Describe a resource', 'nathan describe jsonplaceholder post'],
      ['Describe an operation', 'nathan describe jsonplaceholder post create'],
    ],
  });

  service = Option.String({ required: true, name: 'service' });
  resource = Option.String({ required: false, name: 'resource' });
  operation = Option.String({ required: false, name: 'operation' });

  json = Option.Boolean('--json', false, {
    description: 'Output in JSON format',
  });

  async execute(): Promise<void> {
    const plugin = await registry.getOrLoad(this.service);
    if (!plugin) {
      printOutput({
        error: {
          code: 'PLUGIN_NOT_FOUND',
          message: `Plugin "${this.service}" not found`,
          suggestion: "Run 'nathan discover' to see available plugins",
        },
      });
      process.exitCode = 1;
      return;
    }

    if (!this.resource) {
      if (this.json) {
        const authRequired = plugin.descriptor.credentials.length > 0;
        printOutput({
          name: plugin.descriptor.name,
          displayName: plugin.descriptor.displayName,
          description: plugin.descriptor.description,
          version: plugin.descriptor.version,
          auth: {
            required: authRequired,
            configured: authRequired ? hasConfiguredCredentials(plugin.descriptor) : false,
            env_vars: authRequired ? getExpectedEnvVarNames(plugin.descriptor.name) : [],
          },
          resources: plugin.descriptor.resources.map((r) => ({
            name: r.name,
            displayName: r.displayName,
            operations: r.operations.map((o) => o.name),
          })),
        });
      } else {
        console.log(formatServiceCompact(this.service, plugin.descriptor));
      }
      return;
    }

    const res = findResource(plugin.descriptor, this.resource as string);
    if (!res) {
      printOutput({
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: `Resource "${this.resource}" not found in "${this.service}"`,
          available: plugin.descriptor.resources.map((r) => r.name),
        },
      });
      process.exitCode = 1;
      return;
    }

    if (!this.operation) {
      if (this.json) {
        printOutput({
          service: this.service,
          resource: res.name,
          displayName: res.displayName,
          description: res.description,
          operations: res.operations.map((o) => ({
            name: o.name,
            displayName: o.displayName,
            description: o.description,
            method: o.method,
            parameters: o.parameters.map((p) => ({
              name: p.name,
              type: p.type,
              required: p.required,
              description: p.description,
              ...(p.default !== undefined ? { default: p.default } : {}),
            })),
          })),
        });
      } else {
        console.log(formatResourceCompact(this.service, res));
      }
      return;
    }

    const op = findOperation(res, this.operation as string);
    if (!op) {
      printOutput({
        error: {
          code: 'OPERATION_NOT_FOUND',
          message: `Operation "${this.operation}" not found on "${this.resource}"`,
          available: res.operations.map((o) => o.name),
        },
      });
      process.exitCode = 1;
      return;
    }

    if (this.json) {
      const authRequired = plugin.descriptor.credentials.length > 0;
      printOutput({
        command: `nathan ${this.service} ${this.resource} ${this.operation}`,
        description: op.description,
        method: op.method,
        parameters: op.parameters.map((p) => ({
          name: p.name,
          type: p.type,
          required: p.required,
          description: p.description,
          default: p.default,
          location: p.location,
        })),
        auth: {
          required: authRequired,
          configured: authRequired ? hasConfiguredCredentials(plugin.descriptor) : false,
          env_vars: authRequired ? getExpectedEnvVarNames(plugin.descriptor.name) : [],
        },
      });
    } else {
      console.log(formatOperationCompact(this.service, res.name, op));
    }
  }
}
