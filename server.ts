import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createServer as createViteServer } from 'vite';
import { encodeStereoWav, synthesizeTrackPcm } from './src/video/audio/synthAudio';
import { synthesizeIntelTrackPcm } from './src/video/intel/synthIntelAudio';
import { synthesizeIntelV2TrackPcm } from './src/video/intelV2/synthIntelV2Audio';

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.PORT || 3000);

interface ExportSession {
  dir: string;
  totalFrames: number;
  width: number;
  height: number;
  track: string;
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

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ffmpeg: fs.existsSync('/usr/bin/ffmpeg') });
  });

  // Download synthesized stereo WAV audio track directly (?track=1120_v2, 1120, or 1117)
  app.get('/api/audio/bgm.wav', (req, res) => {
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
      track = '1120',
    } = req.body ?? {};
    const sessionId = crypto.randomUUID();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `quantreel-${sessionId}-`));

    sessions.set(sessionId, {
      dir,
      totalFrames: Number(totalFrames),
      width: Number(width),
      height: Number(height),
      track: String(track),
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

    try {
      const wavPath = path.join(sess.dir, 'bgm.wav');
      const mp4Path = path.join(sess.dir, 'output.mp4');

      const pcm =
        sess.track === '1120_v2'
          ? synthesizeIntelV2TrackPcm(44100)
          : sess.track === '1120'
            ? synthesizeIntelTrackPcm(44100)
            : synthesizeTrackPcm(44100);
      const wav = encodeStereoWav(pcm);
      fs.writeFileSync(wavPath, Buffer.from(wav));

      await execFileAsync('/usr/bin/ffmpeg', [
        '-y',
        '-framerate',
        '30',
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
    const downloadName =
      sess.track === '1120_v2'
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
