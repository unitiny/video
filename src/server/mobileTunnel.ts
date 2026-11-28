import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync, type ChildProcess } from 'child_process';

export type MobileTunnelStatusState = 'idle' | 'starting' | 'ready' | 'error';

export interface MobileTunnelSnapshot {
  status: MobileTunnelStatusState;
  url: string | null;
  verified: boolean;
  statusCode: number;
  error: string | null;
  startedAt: number | null;
  provider: 'cloudflare_quick_tunnel';
}

const CLOUDFLARED_RELEASE_URL =
  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';

const TRYCLOUDFLARE_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

class MobileTunnelManager {
  private proc: ChildProcess | null = null;
  private status: MobileTunnelStatusState = 'idle';
  private url: string | null = null;
  private verified = false;
  private statusCode = 0;
  private error: string | null = null;
  private startedAt: number | null = null;
  private startPromise: Promise<MobileTunnelSnapshot> | null = null;
  private registered = false;
  private port = 3000;
  private exitHookInstalled = false;

  getSnapshot(): MobileTunnelSnapshot {
    return {
      status: this.status,
      url: this.url,
      verified: this.verified,
      statusCode: this.statusCode,
      error: this.error,
      startedAt: this.startedAt,
      provider: 'cloudflare_quick_tunnel',
    };
  }

  private installExitHooks(): void {
    if (this.exitHookInstalled) return;
    this.exitHookInstalled = true;
    const cleanup = () => {
      this.killProcessOnly();
    };
    process.once('exit', cleanup);
    process.once('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
    process.once('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });
  }

  private killProcessOnly(): void {
    if (this.proc) {
      try {
        this.proc.kill('SIGTERM');
      } catch {
        // Ignore already-exited child
      }
      this.proc = null;
    }
  }

  stop(): MobileTunnelSnapshot {
    this.killProcessOnly();
    this.status = 'idle';
    this.url = null;
    this.verified = false;
    this.statusCode = 0;
    this.error = null;
    this.startedAt = null;
    this.registered = false;
    this.startPromise = null;
    return this.getSnapshot();
  }

  private probeBinary(candidate: string): boolean {
    try {
      const res = spawnSync(candidate, ['--version'], {
        stdio: 'ignore',
        timeout: 4000,
      });
      return !res.error && res.status === 0;
    } catch {
      return false;
    }
  }

  private async ensureCloudflaredBinary(): Promise<string> {
    const cachedBin = path.join(os.tmpdir(), 'quantreel-cloudflared');
    const preDownloaded = '/tmp/cf_bin/cloudflared';
    const candidates = [
      process.env.CLOUDFLARED_PATH?.trim(),
      cachedBin,
      preDownloaded,
      'cloudflared',
      '/usr/local/bin/cloudflared',
      '/usr/bin/cloudflared',
    ].filter((c): c is string => Boolean(c));

    for (const candidate of candidates) {
      if (this.probeBinary(candidate)) {
        return candidate;
      }
    }

    if (process.platform !== 'linux' || process.arch !== 'x64') {
      throw new Error(
        `当前系统 (${process.platform}/${process.arch}) 未预装 cloudflared，请手动安装或填写自定义公网域名。`
      );
    }

    const tmpDownload = `${cachedBin}.${Date.now()}.tmp`;
    const res = await fetch(CLOUDFLARED_RELEASE_URL, { redirect: 'follow' });
    if (!res.ok) {
      throw new Error(`下载 cloudflared 失败 (HTTP ${res.status})`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmpDownload, buf, { mode: 0o755 });
    fs.renameSync(tmpDownload, cachedBin);
    fs.chmodSync(cachedBin, 0o755);

    if (!this.probeBinary(cachedBin)) {
      throw new Error('下载的 cloudflared 可执行文件校验失败');
    }
    return cachedBin;
  }

  private async verifyPublicUrl(targetUrl: string): Promise<{ ok: boolean; statusCode: number }> {
    // Wait briefly so Cloudflare edge DNS propagates before first lookup
    await new Promise((r) => setTimeout(r, 2500));

    for (let attempt = 0; attempt < 10; attempt++) {
      if (!this.proc || this.url !== targetUrl) {
        return { ok: false, statusCode: 0 };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(`${targetUrl}/api/health`, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
        });
        if (res.status === 200) {
          return { ok: true, statusCode: 200 };
        }
        if (attempt === 9) {
          return { ok: false, statusCode: res.status };
        }
      } catch {
        // DNS may still be propagating — retry cleanly
      } finally {
        clearTimeout(timer);
      }
      await new Promise((r) => setTimeout(r, 1500));
    }

    return { ok: false, statusCode: 0 };
  }

  async start(port: number, force = false): Promise<MobileTunnelSnapshot> {
    this.port = port;
    this.installExitHooks();

    if (!force) {
      if (this.status === 'ready' && this.proc && this.url) {
        return this.getSnapshot();
      }
      if (this.startPromise) {
        return this.startPromise;
      }
    } else {
      this.stop();
    }

    this.status = 'starting';
    this.error = null;
    this.verified = false;
    this.statusCode = 0;
    this.registered = false;

    const run = (async (): Promise<MobileTunnelSnapshot> => {
      try {
        const binary = await this.ensureCloudflaredBinary();

        const child = spawn(
          binary,
          [
            'tunnel',
            '--no-autoupdate',
            '--protocol',
            'http2',
            '--url',
            `http://127.0.0.1:${port}`,
          ],
          {
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        );

        this.proc = child;
        this.startedAt = Date.now();

        let issuedUrl: string | null = null;

        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const finishOk = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve();
          };
          const finishErr = (msg: string) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            reject(new Error(msg));
          };

          const timeout = setTimeout(() => {
            if (issuedUrl) {
              finishOk();
            } else {
              finishErr('建立免费公网通道超时（25秒），请点击刷新重试');
            }
          }, 25000);

          const handleLogChunk = (chunk: Buffer) => {
            const text = chunk.toString('utf8');
            if (!issuedUrl) {
              const m = TRYCLOUDFLARE_RE.exec(text);
              if (m) {
                issuedUrl = m[0];
                this.url = issuedUrl;
              }
            }
            if (text.includes('Registered tunnel connection')) {
              this.registered = true;
              if (issuedUrl) {
                finishOk();
              }
            }
          };

          child.stdout?.on('data', handleLogChunk);
          child.stderr?.on('data', handleLogChunk);

          child.once('error', (err) => {
            finishErr(`启动公网通道失败: ${err.message}`);
          });

          child.once('exit', (code, signal) => {
            if (this.proc === child) {
              this.proc = null;
              if (!settled) {
                finishErr(
                  `公网通道进程提前退出 (code=${code ?? 'null'}, signal=${signal ?? 'null'})`
                );
              } else if (this.status === 'ready') {
                this.status = 'error';
                this.verified = false;
                this.error = '公网通道已断开，点击「刷新通道」可立刻重连';
              }
            }
          });
        });

        if (!issuedUrl || this.proc !== child) {
          throw new Error('未能获取免费公网预览域名');
        }

        const verify = await this.verifyPublicUrl(issuedUrl);
        if (this.proc !== child) {
          return this.getSnapshot();
        }

        this.statusCode = verify.statusCode;
        this.verified = verify.ok;
        this.status = 'ready';
        if (!verify.ok) {
          this.error = '公网域名已分配，DNS 仍在同步中，几秒后可自动生效';
        }
        console.log(
          `[MobileTunnel] Free public preview ready: ${issuedUrl} (verified=${verify.ok}, http=${verify.statusCode})`
        );
        return this.getSnapshot();
      } catch (err) {
        this.killProcessOnly();
        this.status = 'error';
        this.url = null;
        this.verified = false;
        this.statusCode = 0;
        this.error = err instanceof Error ? err.message : '免费公网通道启动失败';
        return this.getSnapshot();
      } finally {
        this.startPromise = null;
      }
    })();

    this.startPromise = run;
    return run;
  }
}

export const mobileTunnel = new MobileTunnelManager();
