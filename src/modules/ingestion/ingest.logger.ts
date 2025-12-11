/*
 Simple per-request ingest logger with three sinks:
 - in-memory lines buffer (always on);
 - console output (guarded by env INGEST_DEBUG_TO_CONSOLE=true);
 - file output of the last request (overwrite), guarded by env INGEST_DEBUG_FILE_LOG=true.
*/

import fs from 'node:fs';
import path from 'node:path';

export class IngestLogger {
  private readonly linesBuf: string[] = [];
  private readonly toConsole: boolean;
  private readonly toFile: boolean;
  private readonly filePath: string;

  constructor(opts?: { toConsole?: boolean; toFile?: boolean; filePath?: string }) {
    this.toConsole = opts?.toConsole ?? (process.env.INGEST_DEBUG_TO_CONSOLE === 'true');
    this.toFile = opts?.toFile ?? (process.env.INGEST_DEBUG_FILE_LOG === 'true');
    this.filePath = opts?.filePath ?? process.env.INGEST_DEBUG_FILE_PATH ?? 'logs/ingest-debug.log';
  }

  log(line: string) {
    const ts = new Date().toISOString();
    const msg = `[${ts}] ${line}`;
    this.linesBuf.push(msg);
    if (this.toConsole) {
      // eslint-disable-next-line no-console
      console.log(msg);
    }
  }

  lines(): string[] { return [...this.linesBuf]; }

  summary(max: number): string[] { return this.linesBuf.slice(0, max); }

  flushToFile(overwrite = true) {
    if (!this.toFile) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = this.linesBuf.join('\n') + '\n';
      if (overwrite) fs.writeFileSync(this.filePath, data, 'utf8');
      else fs.appendFileSync(this.filePath, data, 'utf8');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Failed to write ingest debug log:', (e as any)?.message || e);
    }
  }
}
