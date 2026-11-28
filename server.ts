import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execFile, spawnSync } from 'child_process';
import { promisify } from 'util';
import { GoogleGenAI } from '@google/genai';
import { encodeStereoWav, synthesizeTrackPcm } from './src/video/audio/synthAudio';
import { synthesizeIntelTrackPcm } from './src/video/intel/synthIntelAudio';
import { synthesizeIntelV2TrackPcm } from './src/video/intelV2/synthIntelV2Audio';
import type { EpisodeListItem, EpisodeManifest } from './src/video/engine/schema';
import { compileEpisodeTimeline } from './src/video/engine/timeline';
import {
  decodeWavToMonoFloat32,
  encodeMonoWav,
  mixVoiceoverIntoStereoPcm,
  synthesizeEpisodeAudioPcm,
} from './src/video/engine/audioSynth';
import { mobileTunnel } from './src/server/mobileTunnel';
import {
  getCachedCloudShareBundle,
  publishMp4ToCloudChannels,
  warmCloudUploaders,
} from './src/server/cloudVideoShare';
import { renderStandaloneMobilePlayerHtml } from './src/server/mobilePlayerHtml';

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.PORT || 3000);
const EPISODE_ID_RE = /^[A-Za-z0-9_-]+$/;
const episodesRootDir = path.resolve(process.cwd(), 'episodes');
const previewsRootDir = path.join(episodesRootDir, '_previews');
const assetsRootDir = path.resolve(process.cwd(), 'assets');
const ALLOWED_TTS_VOICES = new Set(['Charon', 'Kore', 'Puck', 'Fenrir', 'Aoede', 'Zephyr']);

function sendBufferWithRange(
  req: express.Request,
  res: express.Response,
  buf: Buffer,
  contentType: string,
  filename?: string
): void {
  const total = buf.length;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-store');
  if (filename) {
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  }

  const rangeHeader = req.headers.range;
  if (rangeHeader && rangeHeader.startsWith('bytes=')) {
    const parts = rangeHeader.replace(/^bytes=/, '').split('-');
    const start = parts[0] ? parseInt(parts[0], 10) : 0;
    const end = parts[1] ? Math.min(total - 1, parseInt(parts[1], 10)) : total - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= total) {
      res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
      return;
    }
    const chunk = buf.subarray(start, end + 1);
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', String(chunk.length));
    res.send(chunk);
    return;
  }

  res.setHeader('Content-Length', String(total));
  res.send(buf);
}

function getMobilePreviewPath(previewKey: string): string {
  return path.join(previewsRootDir, `${previewKey}.mp4`);
}

const videoDimCache = new Map<string, { mtimeMs: number; width: number; height: number }>();

function probeVideoDimensions(
  filePath: string,
  mtimeMs: number
): { width: number; height: number } | null {
  const cached = videoDimCache.get(filePath);
  if (cached && Math.floor(cached.mtimeMs) === Math.floor(mtimeMs)) {
    return { width: cached.width, height: cached.height };
  }
  try {
    const out = spawnSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=p=0:s=x',
        filePath,
      ],
      { encoding: 'utf-8', timeout: 4000, windowsHide: true }
    );
    const match = (out.stdout || '').trim().match(/^(\d+)x(\d+)$/);
    if (match) {
      const width = Number(match[1]);
      const height = Number(match[2]);
      if (width > 0 && height > 0) {
        videoDimCache.set(filePath, { mtimeMs, width, height });
        return { width, height };
      }
    }
  } catch {
    // Ignore probe failure
  }
  return null;
}

let cachedFfmpegBinary: string | null | undefined;

function probeFfmpegBinary(candidate: string): boolean {
  try {
    const res = spawnSync(candidate, ['-version'], {
      stdio: 'ignore',
      timeout: 5000,
      windowsHide: true,
    });
    return !res.error && res.status === 0;
  } catch {
    return false;
  }
}

export function resolveFfmpegBinary(): string | null {
  if (cachedFfmpegBinary !== undefined) {
    return cachedFfmpegBinary;
  }

  const candidates: string[] = [];
  const envPath = process.env.FFMPEG_PATH?.trim();
  if (envPath) {
    candidates.push(envPath);
  }
  candidates.push('ffmpeg');
  if (process.platform === 'win32') {
    candidates.push('ffmpeg.exe');
  }
  if (fs.existsSync('/usr/bin/ffmpeg')) {
    candidates.push('/usr/bin/ffmpeg');
  }

  for (const candidate of candidates) {
    if (probeFfmpegBinary(candidate)) {
      cachedFfmpegBinary = candidate;
      return cachedFfmpegBinary;
    }
  }

  cachedFfmpegBinary = null;
  return null;
}

function isValidEpisodeId(id: string): boolean {
  return EPISODE_ID_RE.test(id);
}

function getEpisodeManifestPath(id: string): string {
  return path.join(episodesRootDir, id, 'episode.json');
}

function getEpisodeVoiceoverPath(id: string): string {
  return path.join(episodesRootDir, id, 'voiceover.wav');
}

function loadEpisodeManifest(id: string): EpisodeManifest | null {
  if (!isValidEpisodeId(id)) return null;
  const manifestPath = getEpisodeManifestPath(id);
  if (!fs.existsSync(manifestPath)) return null;
  const raw = fs.readFileSync(manifestPath, 'utf-8');
  return JSON.parse(raw) as EpisodeManifest;
}

/**
 * Synthesizes an episode's stereo audio and automatically mixes in episodes/:id/voiceover.wav
 * with RMS sidechain ducking whenever a generated voiceover track exists.
 */
function buildEpisodeAudioPcmWithOptionalVoice(
  episodeId: string,
  episode: EpisodeManifest,
  includeVoice = true,
  sampleRate = 44100
) {
  const bgm = synthesizeEpisodeAudioPcm(episode, sampleRate);
  if (!includeVoice) return bgm;

  const voPath = getEpisodeVoiceoverPath(episodeId);
  if (!fs.existsSync(voPath)) return bgm;

  try {
    const wavBytes = new Uint8Array(fs.readFileSync(voPath));
    const decoded = decodeWavToMonoFloat32(wavBytes);
    const duckingDb = episode.audio?.duckingDb ?? -13;
    return mixVoiceoverIntoStereoPcm(bgm, decoded.samples, decoded.sampleRate, duckingDb);
  } catch (err) {
    console.warn(`Failed to mix voiceover for ${episodeId}, falling back to pure BGM:`, err);
    return bgm;
  }
}

function isValidEpisodeManifestBody(body: unknown): body is EpisodeManifest {
  if (!body || typeof body !== 'object') return false;
  const obj = body as Record<string, unknown>;
  const spec = obj.spec as Record<string, unknown> | undefined;
  if (!spec || typeof spec !== 'object') return false;
  if (
    typeof spec.width !== 'number' ||
    !Number.isFinite(spec.width) ||
    spec.width <= 0 ||
    typeof spec.height !== 'number' ||
    !Number.isFinite(spec.height) ||
    spec.height <= 0 ||
    typeof spec.fps !== 'number' ||
    !Number.isFinite(spec.fps) ||
    spec.fps <= 0
  ) {
    return false;
  }
  if (!Array.isArray(obj.scenes) || obj.scenes.length === 0) return false;
  for (const scene of obj.scenes) {
    if (!scene || typeof scene !== 'object') return false;
    const s = scene as Record<string, unknown>;
    if (
      typeof s.id !== 'string' ||
      !s.id.trim() ||
      typeof s.kind !== 'string' ||
      typeof s.durationFrames !== 'number' ||
      !Number.isFinite(s.durationFrames) ||
      s.durationFrames <= 0
    ) {
      return false;
    }
  }
  return true;
}

interface ExportSession {
  dir: string;
  totalFrames: number;
  width: number;
  height: number;
  fps: number;
  track: string;
  episodeId?: string;
  includeVoice?: boolean;
  persistPreviewKey?: string;
  receivedFrames: number;
  mp4Path?: string;
  createdAt: number;
}

const sessions = new Map<string, ExportSession>();

// Clean up sessions older than 20 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, sess] of sessions.entries()) {
    if (now - sess.createdAt > 20 * 60 * 1000) {
      fs.rmSync(sess.dir, { recursive: true, force: true });
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000).unref();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '80mb' }));

  // Pre-warm Gofile server list at boot so first cloud upload saves ~500ms RTT
  void warmCloudUploaders();

  // Serve dynamic episode assets and shared hook assets in both dev & production modes
  app.use('/episodes', express.static(episodesRootDir));
  app.use('/assets', express.static(assetsRootDir));

  app.get('/api/health', (_req, res) => {
    const ffmpegBin = resolveFfmpegBinary();
    res.json({
      ok: true,
      ffmpeg: Boolean(ffmpegBin),
      ffmpegPath: ffmpegBin ?? null,
      ttsConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    });
  });

  // Expose public runtime URLs & free Cloudflare Quick Tunnel status for mobile QR code generation
  app.get('/api/runtime-info', (req, res) => {
    const envAppUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
    const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol;
    const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() || req.get('host') || '';
    const requestOrigin = host ? `${proto}://${host}` : '';
    const baseUrl = envAppUrl || requestOrigin;
    const sharedAppUrl = baseUrl.includes('://ais-dev-')
      ? baseUrl.replace('://ais-dev-', '://ais-pre-')
      : baseUrl;
    const tunnel = mobileTunnel.getSnapshot();
    res.json({
      appUrl: baseUrl,
      sharedAppUrl,
      requestOrigin,
      tunnelUrl: tunnel.url,
      tunnel,
      ffmpegAvailable: Boolean(resolveFfmpegBinary()),
    });
  });

  // Built-in zero-account free HTTPS tunnel (Cloudflare Quick Tunnel over HTTP/2)
  app.get('/api/mobile-tunnel/status', (_req, res) => {
    res.json(mobileTunnel.getSnapshot());
  });

  app.post('/api/mobile-tunnel/start', async (req, res) => {
    const force = req.query.force === '1' || req.body?.force === true;
    const snapshot = await mobileTunnel.start(PORT, force);
    res.json(snapshot);
  });

  app.post('/api/mobile-tunnel/stop', (_req, res) => {
    res.json(mobileTunnel.stop());
  });

  // Safely check whether the public QR origin is truly open (200), Google auth-gated (302), or unpublished (404)
  app.get('/api/runtime-info/check-share', async (req, res) => {
    const envAppUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
    const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol;
    const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() || req.get('host') || '';
    const requestOrigin = host ? `${proto}://${host}` : '';
    const baseUrl = envAppUrl || requestOrigin;
    const defaultSharedUrl = baseUrl.includes('://ais-dev-')
      ? baseUrl.replace('://ais-dev-', '://ais-pre-')
      : baseUrl;

    let targetOrigin = defaultSharedUrl;
    const requestedOrigin = typeof req.query.origin === 'string' ? req.query.origin.trim().replace(/\/+$/, '') : '';
    if (requestedOrigin) {
      try {
        const parsed = new URL(requestedOrigin);
        const h = parsed.hostname.toLowerCase();
        const isPrivate =
          parsed.protocol !== 'https:' ||
          h === 'localhost' ||
          h.endsWith('.local') ||
          h.endsWith('.internal') ||
          /^(\d{1,3}\.){3}\d{1,3}$/.test(h) ||
          h.includes(':');
        if (!isPrivate) {
          targetOrigin = parsed.origin;
        }
      } catch {
        // Ignore invalid custom origin and fall back to defaultSharedUrl
      }
    }

    if (!targetOrigin || !targetOrigin.startsWith('http')) {
      res.json({ sharedAppUrl: targetOrigin, reachable: false, mode: 'unreachable', statusCode: 0 });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const probeRes = await fetch(`${targetOrigin}/api/health`, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
      });
      const location = probeRes.headers.get('location') || '';
      if (probeRes.status === 200) {
        res.json({
          sharedAppUrl: targetOrigin,
          reachable: true,
          mode: 'public_open',
          statusCode: 200,
        });
        return;
      }
      if (
        (probeRes.status === 301 || probeRes.status === 302 || probeRes.status === 307) &&
        (location.includes('__cookie_check') ||
          location.includes('applet-auth-bridge') ||
          location.includes('accounts.google.com'))
      ) {
        res.json({
          sharedAppUrl: targetOrigin,
          reachable: false,
          mode: 'auth_gated',
          statusCode: probeRes.status,
        });
        return;
      }
      res.json({
        sharedAppUrl: targetOrigin,
        reachable: false,
        mode: probeRes.status === 404 ? 'not_published' : 'unreachable',
        statusCode: probeRes.status,
      });
    } catch {
      res.json({
        sharedAppUrl: targetOrigin,
        reachable: false,
        mode: 'unreachable',
        statusCode: 0,
      });
    } finally {
      clearTimeout(timer);
    }
  });

  // Check if a pre-rendered native H.264/AAC MP4 mobile preview exists for a given key
  app.get('/api/mobile-preview/:key/status', (req, res) => {
    const key = String(req.params.key || '').trim();
    if (!isValidEpisodeId(key)) {
      res.status(400).json({ error: 'Invalid preview key' });
      return;
    }
    const filePath = getMobilePreviewPath(key);
    if (!fs.existsSync(filePath)) {
      res.json({ ready: false, key, cloudChannels: [] });
      return;
    }
    const stat = fs.statSync(filePath);
    const dims = probeVideoDimensions(filePath, stat.mtimeMs);
    const cachedBundle = getCachedCloudShareBundle(key, stat.mtimeMs, filePath);
    res.json({
      ready: true,
      key,
      sizeBytes: stat.size,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      updatedAt: stat.mtime.toISOString(),
      playerPath: `/m/${encodeURIComponent(key)}`,
      videoUrl: `/api/mobile-preview/${encodeURIComponent(key)}/video.mp4?v=${Math.floor(stat.mtimeMs)}`,
      downloadUrl: `/api/mobile-preview/${encodeURIComponent(key)}/download`,
      cloudChannels: cachedBundle?.channels ?? [],
      cloudErrors: cachedBundle?.errors ?? {},
      pendingBackups: Boolean(cachedBundle?.pendingBackups),
    });
  });

  // Ultra-lightweight 6KB standalone HTML5 mobile fullscreen player (bypasses Vite/React/150 modules completely)
  app.get('/m/:key', (req, res) => {
    const key = String(req.params.key || '').trim();
    if (!isValidEpisodeId(key)) {
      res.status(400).send('Invalid preview key');
      return;
    }
    const filePath = getMobilePreviewPath(key);
    if (!fs.existsSync(filePath)) {
      // Fall back to SPA live preview if MP4 hasn't been baked yet
      if (key.startsWith('ep_')) {
        res.redirect(302, `/?mobile=1&episode=${encodeURIComponent(key.slice(3))}`);
      } else if (key.startsWith('mode_')) {
        res.redirect(302, `/?mobile=1&mode=${encodeURIComponent(key.slice(5))}`);
      } else {
        res.redirect(302, '/?mobile=1');
      }
      return;
    }

    const stat = fs.statSync(filePath);
    let title = 'QuantReel 全屏审片';
    let fps = 30;
    if (key.startsWith('ep_')) {
      const ep = loadEpisodeManifest(key.slice(3));
      if (ep) {
        title = ep.title || ep.id;
        fps = ep.spec?.fps || 30;
      }
    } else if (key === 'mode_1120_v2') {
      title = '11.20 盘前风向（v2 精修爆款版）';
    } else if (key === 'mode_1120_intel') {
      title = '11.20 盘前风向（v1 存档版）';
    } else if (key === 'mode_morning_brief') {
      title = '11.19 盘前早报';
    } else if (key === 'mode_1117_close') {
      title = '11.17 收盘资金流向复刻';
    }

    const dims = probeVideoDimensions(filePath, stat.mtimeMs);
    const html = renderStandaloneMobilePlayerHtml({
      title,
      videoUrl: `/api/mobile-preview/${encodeURIComponent(key)}/video.mp4?v=${Math.floor(stat.mtimeMs)}`,
      downloadUrl: `/api/mobile-preview/${encodeURIComponent(key)}/download`,
      fps,
      sizeBytes: stat.size,
      width: dims?.width,
      height: dims?.height,
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  });

  // Stream persistent mobile preview MP4 with full HTTP byte-range support (iOS / Douyin compatible)
  app.get('/api/mobile-preview/:key/video.mp4', (req, res) => {
    const key = String(req.params.key || '').trim();
    if (!isValidEpisodeId(key)) {
      res.status(400).json({ error: 'Invalid preview key' });
      return;
    }
    const filePath = getMobilePreviewPath(key);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Mobile preview MP4 not yet rendered' });
      return;
    }
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `inline; filename="${key}_preview.mp4"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(filePath);
  });

  // Direct download of the pre-rendered mobile MP4 (works on both desktop and phone)
  app.get('/api/mobile-preview/:key/download', (req, res) => {
    const key = String(req.params.key || '').trim();
    if (!isValidEpisodeId(key)) {
      res.status(400).json({ error: 'Invalid preview key' });
      return;
    }
    const filePath = getMobilePreviewPath(key);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Mobile preview MP4 not yet rendered' });
      return;
    }
    res.download(filePath, `${key}_mobile_preview.mp4`);
  });

  // Publish pre-rendered MP4 to multiple zero-account independent cloud CDNs (Fast-First returns in ~2s!)
  app.post('/api/mobile-preview/:key/publish-cloud', async (req, res) => {
    const key = String(req.params.key || '').trim();
    if (!isValidEpisodeId(key)) {
      res.status(400).json({ error: 'Invalid preview key' });
      return;
    }
    const filePath = getMobilePreviewPath(key);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: '请先生成手机高清 MP4 缓存后再发布云端扫码链接' });
      return;
    }

    const force = req.body?.force === true;
    try {
      const bundle = await publishMp4ToCloudChannels(key, filePath, force, true);
      res.json({
        ok: true,
        ...bundle,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '云端直连通道发布失败';
      res.status(502).json({ error: message });
    }
  });

  // Ultra-fast single-request binary MP4 upload from GPU WebCodecs -> 5ms save (+ optional audio copy-mux) + Cloudflare Direct-MP4 publish
  app.post(
    '/api/mobile-preview/:key/upload-mp4',
    express.raw({ type: ['application/octet-stream', 'video/mp4'], limit: '80mb' }),
    async (req, res) => {
      const key = String(req.params.key || '').trim();
      if (!isValidEpisodeId(key)) {
        res.status(400).json({ error: 'Invalid preview key' });
        return;
      }
      const bodyBuf = Buffer.isBuffer(req.body) ? req.body : null;
      if (!bodyBuf || bodyBuf.length < 1024) {
        res.status(400).json({ error: 'Uploaded MP4 payload is empty or invalid' });
        return;
      }

      const muxAudio = req.query.muxAudio === '1';
      const shouldPublish = req.query.publish !== '0';
      const episodeId = typeof req.query.episodeId === 'string' ? req.query.episodeId.trim() : '';
      const track = typeof req.query.track === 'string' ? req.query.track.trim() : '1120_v2';

      try {
        fs.mkdirSync(previewsRootDir, { recursive: true });
        const destPath = getMobilePreviewPath(key);

        if (!muxAudio) {
          // Zero-reencode atomic direct write (~5ms!)
          const tmpPath = `${destPath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
          fs.writeFileSync(tmpPath, bodyBuf);
          fs.renameSync(tmpPath, destPath);
        } else {
          // Rare fallback: browser lacked AAC AudioEncoder -> stream-copy video (-c:v copy) + mux AAC audio
          const ffmpegBin = resolveFfmpegBinary();
          if (!ffmpegBin) {
            res.status(503).json({ error: 'FFmpeg binary not available for audio mux' });
            return;
          }
          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quantreel-fastmux-'));
          try {
            const rawMp4 = path.join(tmpDir, 'video.mp4');
            const wavPath = path.join(tmpDir, 'audio.wav');
            const outMp4 = path.join(tmpDir, 'out.mp4');
            fs.writeFileSync(rawMp4, bodyBuf);

            let pcm;
            if (episodeId && isValidEpisodeId(episodeId)) {
              const ep = loadEpisodeManifest(episodeId);
              if (ep) {
                pcm = buildEpisodeAudioPcmWithOptionalVoice(episodeId, ep, true, 44100);
              }
            }
            if (!pcm) {
              pcm =
                track === '1120_v2'
                  ? synthesizeIntelV2TrackPcm(44100)
                  : track === '1120'
                    ? synthesizeIntelTrackPcm(44100)
                    : synthesizeTrackPcm(44100);
            }
            fs.writeFileSync(wavPath, Buffer.from(encodeStereoWav(pcm)));

            await execFileAsync(ffmpegBin, [
              '-y',
              '-i',
              rawMp4,
              '-i',
              wavPath,
              '-map',
              '0:v:0',
              '-map',
              '1:a:0',
              '-c:v',
              'copy',
              '-c:a',
              'aac',
              '-b:a',
              '96k',
              '-movflags',
              '+faststart',
              '-shortest',
              outMp4,
            ]);
            fs.copyFileSync(outMp4, destPath);
          } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          }
        }

        const stat = fs.statSync(destPath);
        const dims = probeVideoDimensions(destPath, stat.mtimeMs);

        let bundle = null;
        if (shouldPublish) {
          bundle = await publishMp4ToCloudChannels(key, destPath, true, true);
        }

        res.json({
          ok: true,
          key,
          sizeBytes: stat.size,
          width: dims?.width ?? null,
          height: dims?.height ?? null,
          downloadUrl: `/api/mobile-preview/${encodeURIComponent(key)}/download`,
          channels: bundle?.channels ?? [],
          errors: bundle?.errors ?? {},
          pendingBackups: Boolean(bundle?.pendingBackups),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : '高速 MP4 上传与发布失败';
        res.status(500).json({ error: message });
      }
    }
  );

  // List all dynamic episodes from episodes/*/episode.json (newest date first)
  app.get('/api/episodes', (_req, res) => {
    try {
      if (!fs.existsSync(episodesRootDir)) {
        res.json({ episodes: [] });
        return;
      }

      const entries = fs.readdirSync(episodesRootDir, { withFileTypes: true });
      const episodes: EpisodeListItem[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('_') || !isValidEpisodeId(entry.name)) {
          continue;
        }
        const manifestPath = getEpisodeManifestPath(entry.name);
        if (!fs.existsSync(manifestPath)) continue;

        try {
          const raw = fs.readFileSync(manifestPath, 'utf-8');
          const episode = JSON.parse(raw) as EpisodeManifest;
          if (!isValidEpisodeManifestBody(episode)) continue;

          const tl = compileEpisodeTimeline(episode);
          const episodeId = episode.id || entry.name;
          const hookScene = episode.scenes.find((s) => s.kind === 'hook_live_video');
          const firstPosterScene = episode.scenes.find(
            (s) => s.kind === 'animated_poster_stage' || s.kind === 'v3_editorial_story'
          );
          const hasNarration = episode.scenes.some(
            (s) => typeof s.narration === 'string' && s.narration.trim().length > 0
          );
          const hasVoiceover = fs.existsSync(getEpisodeVoiceoverPath(episodeId));

          episodes.push({
            id: episodeId,
            date: episode.date || entry.name,
            title: episode.title || entry.name,
            seriesTitle: episode.seriesTitle || '',
            description: episode.description || '',
            totalFrames: tl.totalFrames,
            durationSec: tl.durationSec,
            fps: tl.fps,
            bpm: tl.bpm,
            width: tl.width,
            height: tl.height,
            shotCount: tl.shots.length,
            hookId: hookScene?.kind === 'hook_live_video' ? hookScene.data.hookId : undefined,
            posterSrc:
              hookScene?.kind === 'hook_live_video'
                ? hookScene.data.posterSrc
                : firstPosterScene &&
                    (firstPosterScene.kind === 'animated_poster_stage' ||
                      firstPosterScene.kind === 'v3_editorial_story')
                  ? firstPosterScene.data.imageSrc
                  : undefined,
            hasNarration,
            hasVoiceover,
            versionTag: episode.metadata?.versionTag,
          });
        } catch {
          // Skip malformed episode.json files without failing the list endpoint
        }
      }

      episodes.sort((a, b) => {
        const byDate = b.date.localeCompare(a.date);
        return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
      });

      res.json({ episodes });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list episodes';
      res.status(500).json({ error: message });
    }
  });

  // Load a single dynamic episode manifest by id
  app.get('/api/episodes/:id', (req, res) => {
    const id = String(req.params.id || '');
    if (!isValidEpisodeId(id)) {
      res.status(400).json({ error: 'Invalid episode id' });
      return;
    }

    try {
      const episode = loadEpisodeManifest(id);
      if (!episode) {
        res.status(404).json({ error: `Episode "${id}" not found` });
        return;
      }
      res.json(episode);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read episode';
      res.status(500).json({ error: message });
    }
  });

  // Save/update a dynamic episode manifest by id
  app.post('/api/episodes/:id', (req, res) => {
    const id = String(req.params.id || '');
    if (!isValidEpisodeId(id)) {
      res.status(400).json({ error: 'Invalid episode id' });
      return;
    }

    if (!isValidEpisodeManifestBody(req.body)) {
      res.status(400).json({ error: 'Invalid EpisodeManifest payload' });
      return;
    }

    try {
      const targetDir = path.join(episodesRootDir, id);
      fs.mkdirSync(targetDir, { recursive: true });
      const manifest: EpisodeManifest = {
        ...req.body,
        id,
      };
      fs.writeFileSync(
        path.join(targetDir, 'episode.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf-8'
      );
      res.json({ ok: true, id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save episode';
      res.status(500).json({ error: message });
    }
  });

  // Synthesize timeline-aligned Chinese anchor voiceover via server-side Gemini TTS (gemini-3.8-flash-lite-tts)
  app.post('/api/episodes/:id/voiceover', async (req, res) => {
    const id = String(req.params.id || '');
    if (!isValidEpisodeId(id)) {
      res.status(400).json({ error: 'Invalid episode id' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(503).json({
        error: '服务端未配置 GEMINI_API_KEY，暂无法合成 AI 主播配音（请在 AI Studio Secrets 中配置后重试）。',
      });
      return;
    }

    const episode = loadEpisodeManifest(id);
    if (!episode) {
      res.status(404).json({ error: `Episode "${id}" not found` });
      return;
    }

    const tl = compileEpisodeTimeline(episode);
    const narratedShots = tl.shots.filter(
      (s) => typeof s.scene.narration === 'string' && s.scene.narration.trim().length > 0
    );
    if (narratedShots.length === 0) {
      res.status(400).json({ error: '当前剧集没有配置分镜口播稿（narration）' });
      return;
    }

    const requestedVoice = typeof req.body?.voiceName === 'string' ? req.body.voiceName.trim() : 'Charon';
    const voiceName = ALLOWED_TTS_VOICES.has(requestedVoice) ? requestedVoice : 'Charon';

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const masterRate = 24000;
      const masterSamples = new Float32Array(Math.ceil(tl.durationSec * masterRate));

      for (const shot of narratedShots) {
        const script = shot.scene.narration!.trim();
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [{ parts: [{ text: script }] }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
            speechMetadata: {
              style: '干练专业、节奏明快的中文财经盘前早报主播，吐字清晰利落，语速紧凑自然',
            },
          } as Record<string, unknown>,
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
          throw new Error(`场景 ${shot.id} 配音返回空音频`);
        }

        const wavBuf = new Uint8Array(Buffer.from(base64Audio, 'base64'));
        const decoded = decodeWavToMonoFloat32(wavBuf);

        // Place clip starting 0.14s into the scene, clamped cleanly before the next scene cut
        const startOffsetSec = shot.startSec + 0.14;
        const shotDurationSec = Math.max(0.5, shot.endSec - shot.startSec);
        const maxClipDurSec = Math.max(0.5, shotDurationSec - 0.18);
        const startSample = Math.floor(startOffsetSec * masterRate);
        const maxWriteSamples = Math.min(
          Math.floor(maxClipDurSec * masterRate),
          masterSamples.length - startSample
        );
        const resampleRatio = decoded.sampleRate / masterRate;
        const srcFrames = Math.floor(decoded.samples.length / resampleRatio);
        const writeLen = Math.min(srcFrames, maxWriteSamples);
        const fadeSamples = Math.min(Math.floor(masterRate * 0.04), Math.floor(writeLen * 0.15));

        for (let i = 0; i < writeLen; i++) {
          const srcPos = i * resampleRatio;
          const idx = Math.floor(srcPos);
          const frac = srcPos - idx;
          const s0 = decoded.samples[idx] ?? 0;
          const s1 = decoded.samples[idx + 1] ?? s0;
          let sample = s0 + (s1 - s0) * frac;

          // Smooth fade-out at clip boundary if trimmed
          if (i >= writeLen - fadeSamples && fadeSamples > 0) {
            sample *= (writeLen - i) / fadeSamples;
          }
          const destIdx = startSample + i;
          if (destIdx >= 0 && destIdx < masterSamples.length) {
            masterSamples[destIdx] = Math.max(-1, Math.min(1, masterSamples[destIdx] + sample));
          }
        }
      }

      const masterWav = encodeMonoWav(masterSamples, masterRate);
      const outPath = getEpisodeVoiceoverPath(id);
      fs.writeFileSync(outPath, Buffer.from(masterWav));

      res.json({
        ok: true,
        id,
        voiceName,
        clipCount: narratedShots.length,
        sizeBytes: masterWav.byteLength,
        mixedAudioUrl: `/api/audio/bgm.wav?episodeId=${encodeURIComponent(id)}&t=${Date.now()}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI 主播配音合成失败';
      res.status(500).json({ error: message });
    }
  });

  // Read shared hook video library manifest
  app.get('/api/hooks', (_req, res) => {
    try {
      const hooksManifestPath = path.join(assetsRootDir, 'hooks', 'manifest.json');
      if (!fs.existsSync(hooksManifestPath)) {
        res.status(404).json({ error: 'Hooks manifest not found' });
        return;
      }
      const raw = fs.readFileSync(hooksManifestPath, 'utf-8');
      res.json(JSON.parse(raw));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load hooks manifest';
      res.status(500).json({ error: message });
    }
  });

  // Small in-memory WAV cache so multi-chunk HTTP Range requests from iOS/Douyin WebViews return in <1ms
  const wavBufferCache = new Map<string, { buf: Buffer; filename: string }>();
  const setWavCache = (key: string, buf: Buffer, filename: string) => {
    if (wavBufferCache.has(key)) wavBufferCache.delete(key);
    wavBufferCache.set(key, { buf, filename });
    if (wavBufferCache.size > 6) {
      const oldestKey = wavBufferCache.keys().next().value;
      if (oldestKey) wavBufferCache.delete(oldestKey);
    }
  };

  // Download synthesized stereo WAV audio track directly (?episodeId=... or ?track=1120_v2|1120|1117)
  app.get('/api/audio/bgm.wav', (req, res) => {
    const episodeId = typeof req.query.episodeId === 'string' ? req.query.episodeId.trim() : '';
    const includeVoice = req.query.includeVoice !== '0';
    if (episodeId) {
      if (!isValidEpisodeId(episodeId)) {
        res.status(400).json({ error: 'Invalid episodeId' });
        return;
      }
      try {
        const epPath = getEpisodeManifestPath(episodeId);
        if (!fs.existsSync(epPath)) {
          res.status(404).json({ error: `Episode "${episodeId}" not found` });
          return;
        }
        const voPath = getEpisodeVoiceoverPath(episodeId);
        const epMtime = fs.statSync(epPath).mtimeMs;
        const voMtime = includeVoice && fs.existsSync(voPath) ? fs.statSync(voPath).mtimeMs : 0;
        const cacheKey = `ep:${episodeId}:${includeVoice ? 1 : 0}:${epMtime}:${voMtime}`;

        const cached = wavBufferCache.get(cacheKey);
        if (cached) {
          sendBufferWithRange(req, res, cached.buf, 'audio/wav', cached.filename);
          return;
        }

        const episode = loadEpisodeManifest(episodeId);
        if (!episode) {
          res.status(404).json({ error: `Episode "${episodeId}" not found` });
          return;
        }
        const pcm = buildEpisodeAudioPcmWithOptionalVoice(episodeId, episode, includeVoice, 44100);
        const wavBuf = Buffer.from(encodeStereoWav(pcm));
        const filename = `${episodeId}_editorial_mix.wav`;
        setWavCache(cacheKey, wavBuf, filename);
        sendBufferWithRange(req, res, wavBuf, 'audio/wav', filename);
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to synthesize episode audio';
        res.status(500).json({ error: message });
        return;
      }
    }

    const track = String(req.query.track || '1120_v2');
    const cacheKey = `track:${track}`;
    const cached = wavBufferCache.get(cacheKey);
    if (cached) {
      sendBufferWithRange(req, res, cached.buf, 'audio/wav', cached.filename);
      return;
    }

    const pcm =
      track === '1120_v2'
        ? synthesizeIntelV2TrackPcm(44100)
        : track === '1120'
          ? synthesizeIntelTrackPcm(44100)
          : synthesizeTrackPcm(44100);
    const wavBuf = Buffer.from(encodeStereoWav(pcm));
    const filename =
      track === '1120_v2'
        ? '1120_v2_112bpm_editorial.wav'
        : track === '1120'
          ? '1120_108bpm_editorial_mix.wav'
          : '1117_129.2bpm_bgm.wav';
    setWavCache(cacheKey, wavBuf, filename);
    sendBufferWithRange(req, res, wavBuf, 'audio/wav', filename);
  });

  // Initialize FFmpeg MP4 render session
  app.post('/api/export/init', (req, res) => {
    const {
      totalFrames = 900,
      width = 1080,
      height = 1920,
      fps = 30,
      track = '1120',
      episodeId,
      includeVoice = true,
      persistPreviewKey,
    } = req.body ?? {};

    let validatedPreviewKey: string | undefined;
    if (typeof persistPreviewKey === 'string' && persistPreviewKey.trim()) {
      const cleanKey = persistPreviewKey.trim();
      if (!isValidEpisodeId(cleanKey)) {
        res.status(400).json({ error: 'Invalid persistPreviewKey' });
        return;
      }
      validatedPreviewKey = cleanKey;
    }

    let validatedEpisodeId: string | undefined;
    let resolvedFps = Number(fps) > 0 ? Number(fps) : 30;
    if (typeof episodeId === 'string' && episodeId.trim()) {
      const cleanId = episodeId.trim();
      if (!isValidEpisodeId(cleanId)) {
        res.status(400).json({ error: 'Invalid episodeId' });
        return;
      }
      const episode = loadEpisodeManifest(cleanId);
      if (!episode) {
        res.status(404).json({ error: `Episode "${cleanId}" not found` });
        return;
      }
      validatedEpisodeId = cleanId;
      if (!req.body?.fps && episode.spec?.fps > 0) {
        resolvedFps = episode.spec.fps;
      }
    }

    const sessionId = crypto.randomUUID();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `quantreel-${sessionId}-`));

    sessions.set(sessionId, {
      dir,
      totalFrames: Number(totalFrames),
      width: Number(width),
      height: Number(height),
      fps: resolvedFps,
      track: String(track),
      episodeId: validatedEpisodeId,
      includeVoice: includeVoice !== false,
      persistPreviewKey: validatedPreviewKey,
      receivedFrames: 0,
      createdAt: Date.now(),
    });

    res.json({ sessionId });
  });

  // Upload batch of rendered JPEG frames (base64 data URLs)
  app.post('/api/export/:sessionId/frames', (req, res) => {
    const sess = sessions.get(req.params.sessionId);
    if (!sess) {
      res.status(404).json({ error: 'Export session not found' });
      return;
    }

    const frames: Array<{ index: number; dataUrl: string }> = req.body?.frames ?? [];
    for (const item of frames) {
      const base64 = item.dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buf = Buffer.from(base64, 'base64');
      const fileName = `frame_${String(item.index).padStart(4, '0')}.jpg`;
      fs.writeFileSync(path.join(sess.dir, fileName), buf);
      sess.receivedFrames++;
    }

    res.json({ receivedFrames: sess.receivedFrames });
  });

  // Synthesize WAV + mux JPEG sequence into H.264/AAC MP4 via FFmpeg
  app.post('/api/export/:sessionId/finalize', async (req, res) => {
    const sess = sessions.get(req.params.sessionId);
    if (!sess) {
      res.status(404).json({ error: 'Export session not found' });
      return;
    }

    const ffmpegBin = resolveFfmpegBinary();
    if (!ffmpegBin) {
      res.status(503).json({
        error: 'FFmpeg binary not available on server; please use browser WebCodecs fallback.',
      });
      return;
    }

    try {
      const wavPath = path.join(sess.dir, 'bgm.wav');
      const mp4Path = path.join(sess.dir, 'output.mp4');

      let pcm;
      if (sess.episodeId) {
        const episode = loadEpisodeManifest(sess.episodeId);
        if (!episode) {
          res.status(404).json({ error: `Episode "${sess.episodeId}" not found` });
          return;
        }
        pcm = buildEpisodeAudioPcmWithOptionalVoice(
          sess.episodeId,
          episode,
          sess.includeVoice !== false,
          44100
        );
      } else {
        pcm =
          sess.track === '1120_v2'
            ? synthesizeIntelV2TrackPcm(44100)
            : sess.track === '1120'
              ? synthesizeIntelTrackPcm(44100)
              : synthesizeTrackPcm(44100);
      }
      const wav = encodeStereoWav(pcm);
      fs.writeFileSync(wavPath, Buffer.from(wav));

      const isMobileBake = Boolean(sess.persistPreviewKey);
      await execFileAsync(ffmpegBin, [
        '-y',
        '-framerate',
        String(sess.fps || 30),
        '-i',
        path.join(sess.dir, 'frame_%04d.jpg'),
        '-i',
        wavPath,
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:v',
        'libx264',
        '-profile:v',
        'main',
        '-level',
        '4.1',
        '-pix_fmt',
        'yuv420p',
        '-crf',
        isMobileBake ? '21' : '18',
        '-preset',
        isMobileBake ? 'ultrafast' : 'veryfast',
        '-c:a',
        'aac',
        '-b:a',
        isMobileBake ? '128k' : '192k',
        '-movflags',
        '+faststart',
        '-shortest',
        mp4Path,
      ]);

      const stat = fs.statSync(mp4Path);
      sess.mp4Path = mp4Path;

      let previewVideoUrl: string | undefined;
      if (sess.persistPreviewKey) {
        fs.mkdirSync(previewsRootDir, { recursive: true });
        const destPath = getMobilePreviewPath(sess.persistPreviewKey);
        fs.copyFileSync(mp4Path, destPath);
        previewVideoUrl = `/api/mobile-preview/${encodeURIComponent(sess.persistPreviewKey)}/video.mp4?v=${Date.now()}`;
      }

      res.json({
        ok: true,
        sizeBytes: stat.size,
        downloadUrl: `/api/export/${req.params.sessionId}/download`,
        ...(previewVideoUrl ? { previewVideoUrl } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'FFmpeg render failed';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/export/:sessionId/download', (req, res) => {
    const sess = sessions.get(req.params.sessionId);
    if (!sess?.mp4Path || !fs.existsSync(sess.mp4Path)) {
      res.status(404).json({ error: 'Rendered MP4 not found' });
      return;
    }
    const downloadName = sess.episodeId
      ? `${sess.episodeId}_morning_intel_final.mp4`
      : sess.track === '1120_v2'
        ? '1120_v2_morning_intel_final.mp4'
        : sess.track === '1120'
          ? '1120_morning_intel_final.mp4'
          : '1117_close_fund_flow_replica.mp4';
    res.download(sess.mp4Path, downloadName);
  });

  // Never fall through to SPA HTML on /api/* routes or Express body errors
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  app.use(
    '/api',
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const message = err instanceof Error ? err.message : 'Server API error';
      res.status(500).json({ error: message });
    }
  );

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`QuantReel Studio listening on http://0.0.0.0:${PORT}`);
    if (process.env.DISABLE_AUTO_TUNNEL !== 'true' && process.env.NODE_ENV !== 'production') {
      void mobileTunnel.start(PORT);
    }
  });
}

startServer();
