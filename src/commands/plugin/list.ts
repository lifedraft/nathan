/**
 * nathan plugin list — List installed and available plugins.
 */

import { Command, Option } from 'clipanion';

import { registry } from '../../core/registry-instance.js';
import { bold, header } from '../format.js';
import { printOutput } from '../output.js';

/** Wrap comma-separated names into lines. First line uses `prefix`, continuations use `pad`. */
function wrapNames(lines: string[], names: string[], prefix: string, pad: string): void {
  const maxWidth = 80;
  let first = true;
  let currentLine = '';
  for (const name of names) {
    const separator = currentLine ? ', ' : '';
    const linePrefix = first ? prefix : pad;
    if (
      currentLine &&
      linePrefix.length + currentLine.length + separator.length + name.length > maxWidth
    ) {
      lines.push(linePrefix + currentLine);
      currentLine = name;
      first = false;
    } else {
      currentLine += separator + name;
    }
  }
  if (currentLine) {
    lines.push((first ? prefix : pad) + currentLine);
  }
}

export class PluginListCommand extends Command {
  static override paths = [['plugin', 'list']];

  static override usage = Command.Usage({
    description: 'List installed and available plugins',
    examples: [
      ['List all plugins', 'nathan plugin list'],
      ['JSON output', 'nathan plugin list --json'],
    ],
  });

  json = Option.Boolean('--json', false, {
    description: 'Output in JSON format (default: human-readable)',
  });

  async execute(): Promise<void> {
    const loadedPlugins = registry.getAll();
    const allNames = registry.getAllNames();
    const loadedNames = new Set(loadedPlugins.map((p) => p.descriptor.name));
    const availableNames = allNames.filter((name) => !loadedNames.has(name));

    if (this.json) {
      const loaded = loadedPlugins.map((p) => ({
        name: p.descriptor.name,
        displayName: p.descriptor.displayName,
        description: p.descriptor.description,
        version: p.descriptor.version,
        resources: p.descriptor.resources.map((r) => ({
          name: r.name,
          operations: r.operations.map((o) => o.name),
        })),
        authenticated: p.descriptor.credentials.length > 0,
        status: 'loaded' as const,
      }));

      const lazyEntries = availableNames.map((name) => ({ name, status: 'available' as const }));

      printOutput({ plugins: [...loaded, ...lazyEntries] }, { json: true });
      return;
    }

    if (loadedPlugins.length === 0 && availableNames.length === 0) {
      console.log('No plugins found. Install a plugin with: nathan plugin install <name>');
      return;
    }

    const lines: string[] = [];

    if (loadedPlugins.length > 0) {
      lines.push(header('Loaded Plugins'));
      lines.push('');
      for (const p of loadedPlugins) {
        lines.push(`  ${bold(p.descriptor.name)}  ${p.descriptor.description}`);
        const resourceNames = p.descriptor.resources.map((r) => r.name);
        wrapNames(lines, resourceNames, '    resources: ', '               ');
      }
      lines.push('');
    }

    if (availableNames.length > 0) {
      lines.push(header(`Available (${availableNames.length} plugins)`));
      lines.push('');

      wrapNames(lines, availableNames, '  ', '  ');
      lines.push('');
      lines.push(`Use ${bold('nathan describe <service>')} to see available commands.`);
    }

    console.log(lines.join('\n').trimEnd());
  }
}
