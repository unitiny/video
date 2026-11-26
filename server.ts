import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execFile, spawnSync } from 'child_process';
import { promisify } from 'util';
import { createServer as createViteServer } from 'vite';
import { encodeStereoWav, synthesizeTrackPcm } from './src/video/audio/synthAudio';
import { synthesizeIntelTrackPcm } from './src/video/intel/synthIntelAudio';
import { synthesizeIntelV2TrackPcm } from './src/video/intelV2/synthIntelV2Audio';
import type { EpisodeListItem, EpisodeManifest } from './src/video/engine/schema';
import { compileEpisodeTimeline } from './src/video/engine/timeline';
import { synthesizeEpisodeAudioPcm } from './src/video/engine/audioSynth';

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.PORT || 3000);
const EPISODE_ID_RE = /^[A-Za-z0-9_-]+$/;
const episodesRootDir = path.resolve(process.cwd(), 'episodes');
const assetsRootDir = path.resolve(process.cwd(), 'assets');

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

function loadEpisodeManifest(id: string): EpisodeManifest | null {
  if (!isValidEpisodeId(id)) return null;
  const manifestPath = getEpisodeManifestPath(id);
  if (!fs.existsSync(manifestPath)) return null;
  const raw = fs.readFileSync(manifestPath, 'utf-8');
  return JSON.parse(raw) as EpisodeManifest;
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

  // Serve dynamic episode assets and shared hook assets in both dev & production modes
  app.use('/episodes', express.static(episodesRootDir));
  app.use('/assets', express.static(assetsRootDir));

  app.get('/api/health', (_req, res) => {
    const ffmpegBin = resolveFfmpegBinary();
    res.json({ ok: true, ffmpeg: Boolean(ffmpegBin), ffmpegPath: ffmpegBin ?? null });
  });

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
        if (!entry.isDirectory() || !isValidEpisodeId(entry.name)) continue;
        const manifestPath = getEpisodeManifestPath(entry.name);
        if (!fs.existsSync(manifestPath)) continue;

        try {
          const raw = fs.readFileSync(manifestPath, 'utf-8');
          const episode = JSON.parse(raw) as EpisodeManifest;
          if (!isValidEpisodeManifestBody(episode)) continue;

          const tl = compileEpisodeTimeline(episode);
          const hookScene = episode.scenes.find((s) => s.kind === 'hook_live_video');
          const firstPosterScene = episode.scenes.find(
            (s) => s.kind === 'animated_poster_stage'
          );

          episodes.push({
            id: episode.id || entry.name,
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
                : firstPosterScene?.kind === 'animated_poster_stage'
                  ? firstPosterScene.data.imageSrc
                  : undefined,
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

  // Download synthesized stereo WAV audio track directly (?episodeId=... or ?track=1120_v2|1120|1117)
  app.get('/api/audio/bgm.wav', (req, res) => {
    const episodeId = typeof req.query.episodeId === 'string' ? req.query.episodeId.trim() : '';
    if (episodeId) {
      if (!isValidEpisodeId(episodeId)) {
        res.status(400).json({ error: 'Invalid episodeId' });
        return;
      }
      try {
        const episode = loadEpisodeManifest(episodeId);
        if (!episode) {
          res.status(404).json({ error: `Episode "${episodeId}" not found` });
          return;
        }
        const pcm = synthesizeEpisodeAudioPcm(episode, 44100);
        const wav = encodeStereoWav(pcm);
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${episodeId}_editorial_bgm.wav"`
        );
        res.send(Buffer.from(wav));
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to synthesize episode audio';
        res.status(500).json({ error: message });
        return;
      }
    }

    const track = String(req.query.track || '1120_v2');
    const pcm =
      track === '1120_v2'
        ? synthesizeIntelV2TrackPcm(44100)
        : track === '1120'
          ? synthesizeIntelTrackPcm(44100)
          : synthesizeTrackPcm(44100);
    const wav = encodeStereoWav(pcm);
    const filename =
      track === '1120_v2'
        ? '1120_v2_112bpm_editorial.wav'
        : track === '1120'
          ? '1120_108bpm_editorial_mix.wav'
          : '1117_129.2bpm_bgm.wav';
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(wav));
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
    } = req.body ?? {};

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
        pcm = synthesizeEpisodeAudioPcm(episode, 44100);
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
        '-pix_fmt',
        'yuv420p',
        '-crf',
        '18',
        '-preset',
        'veryfast',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        '-shortest',
        mp4Path,
      ]);

      const stat = fs.statSync(mp4Path);
      sess.mp4Path = mp4Path;

      res.json({
        ok: true,
        sizeBytes: stat.size,
        downloadUrl: `/api/export/${req.params.sessionId}/download`,
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`QuantReel Studio listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
