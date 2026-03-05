/**
 * nathan --help — Concise custom help replacing Clipanion's verbose default.
 */

import { Command } from 'clipanion';

import { registry } from '../core/registry-instance.js';
import { bold, header } from './format.js';

export class HelpCommand extends Command {
  static override paths = [['--help'], ['-h'], ['help']];

  async execute(): Promise<void> {
    const bin = this.cli.binaryName;
    const serviceCount = registry.getAllNames().length;

    const lines = [
      header(bin),
      '',
      '  AI-agent-friendly CLI for unified API orchestration.',
      '',
      bold('  Commands'),
      '',
      `    ${bin} <service> <resource> <operation> [flags]  Run an operation`,
      `    ${bin} describe <service> [resource] [operation] Inspect a service`,
      `    ${bin} run <service> <resource> <operation>      Run (explicit form)`,
      `    ${bin} plugin list                               List all plugins`,
      '',
      bold('  Flags'),
      '',
      `    --json         Output as JSON`,
      `    --limit <n>    Truncate array results`,
      `    --version      Print version`,
      `    --help, -h     Show this help`,
      '',
      `  ${serviceCount} plugin(s) available. Run ${bold(`${bin} plugin list`)} to browse.`,
      '',
    ];

    console.log(lines.join('\n'));
  }
}
