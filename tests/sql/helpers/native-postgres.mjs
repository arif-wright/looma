// A real libpq connection per psql process. No JavaScript PostgreSQL dependency.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

export const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
export const identifier = (value) => `"${String(value).replaceAll('"', '""')}"`;
export function parseMarker(line, marker) {
  if (!line.startsWith(`${marker} `)) return null;
  const [, error, code, ...message] = line.split(' ');
  return { failed: error === 'true', code, ...(error === 'true' && message.length ? { message: message.join(' ') } : {}) };
}

export class Session {
  constructor(database, name) {
    this.name = name;
    this.pending = null;
    this.stderr = '';
    const env = { ...process.env, PGDATABASE: database, PGAPPNAME: `mv-lock-test:${name}`, PGPASSFILE: '/dev/null' };
    delete env.PGSERVICE;
    delete env.PGSERVICEFILE;
    this.child = spawn(process.env.PSQL_BIN || 'psql', ['-X', '-w', '-q', '-A', '-t', '-P', 'pager=off', '-P', 'footer=off', '-h', env.PGHOST, '-p', env.PGPORT || '5432', '-U', env.PGUSER, '-d', database], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr.on('data', (chunk) => { this.stderr += chunk; });
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      if (!this.pending) return;
      const result = parseMarker(line, this.pending.marker);
      if (!result) { this.pending.lines.push(line); return; }
      const pending = this.pending;
      this.pending = null;
      clearTimeout(pending.timer);
      if (result.failed) {
        const error = new Error(`${name}: SQLSTATE ${result.code}\n${this.stderr.slice(pending.stderrStart)}`);
        error.code = result.code;
        error.primaryMessage = result.message;
        pending.reject(error);
      } else pending.resolve(pending.lines.filter(Boolean));
    });
    const failed = (error) => {
      this.closed = true;
      if (!this.pending) return;
      clearTimeout(this.pending.timer);
      this.pending.reject(error);
      this.pending = null;
    };
    this.child.on('error', failed);
    this.child.stdin.on('error', failed);
    this.child.on('exit', (code, signal) => failed(new Error(`${name}: psql exited (${code ?? signal})\n${this.stderr}`)));
  }
  async exec(sql, { failFast = false } = {}) {
    if (this.pending || this.closed) throw new Error(`${this.name}: connection is busy or closed`);
    const marker = `__MV_END_${randomUUID().replaceAll('-', '')}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.child.kill('SIGTERM');
        reject(new Error(`${this.name}: 30-second query watchdog expired`));
      }, 30_000);
      this.pending = { marker, resolve, reject, timer, lines: [], stderrStart: this.stderr.length };
      // ERROR and SQLSTATE are psql's last server-query status, not stderr timing.
      this.child.stdin.write(`\\set ON_ERROR_STOP ${failFast ? 'on' : 'off'}\n\\set VERBOSITY verbose\n${sql}\n\\echo ${marker} :ERROR :SQLSTATE :LAST_ERROR_MESSAGE\n`);
    });
  }
  async rows(sql) {
    const lines = await this.exec(`SELECT coalesce(json_agg(q),'[]'::json)::text FROM (${sql}) q;`);
    if (!lines.length) throw new Error(`${this.name}: expected a JSON result`);
    // json_agg may insert newlines between composite values. The framing marker,
    // not a single physical stdout line, delimits this one query result.
    return JSON.parse(lines.join('\n'));
  }
  async init() {
    await this.exec("SET statement_timeout = '15s'; SET lock_timeout = '10s'; SET deadlock_timeout = '250ms'; SET timezone = 'UTC';", { failFast: true });
    this.pid = (await this.rows('SELECT pg_backend_pid() AS pid'))[0].pid;
    return this;
  }
  close() { if (!this.closed) this.child.stdin.end('\\q\n'); }
  kill() { if (!this.closed) this.child.kill('SIGTERM'); }
}
