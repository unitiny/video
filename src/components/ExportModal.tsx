import React, { useEffect, useRef, useState } from 'react';
import { Download, Film, Music, X } from 'lucide-react';
import { INTEL_V2_ASSETS, INTEL_V2_VIDEO_SAMPLE, VIDEO_SPEC } from '../video/theme';
import { PROJECT_TEMPLATES } from '../video/data/fundFlowData';
import { renderVideoFrame, type LoadedVideoImages } from '../video/renderer/renderFrame';
import { INTEL_VIDEO_SPEC } from '../video/intel/intelData';
import { renderIntelVideoFrame, type LoadedIntelImages } from '../video/intel/renderIntelFrame';
import { INTEL_V2_SPEC } from '../video/intelV2/intelV2Data';
import { renderIntelV2VideoFrame } from '../video/intelV2/renderIntelV2Frame';
import { loadRealVideoFrameCache } from '../video/intelV2/videoFrameCache';
import {
  buildTrackWavBlob,
  exportClientMp4,
  getExportFileName,
  parseJsonResponseSafe,
  type ExportTrackKey,
} from '../video/export/clientMp4Export';
import type { StudioProjectMode } from './VideoPlayerWorkspace';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectMode: StudioProjectMode;
  images: LoadedVideoImages;
  intelImages: LoadedIntelImages;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  projectMode,
  images,
  intelImages,
}) => {
  const [resolutionMode, setResolutionMode] = useState<'full' | 'fast'>('full');
  const [status, setStatus] = useState<'idle' | 'rendering' | 'muxing' | 'done' | 'error'>('idle');
  const [renderedCount, setRenderedCount] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>('output.mp4');
  const [engineBadge, setEngineBadge] = useState<string>('');
  const [phaseLabel, setPhaseLabel] = useState<string>('');
  const [fileSizeMb, setFileSizeMb] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const blobUrlRef = useRef<string | null>(null);

  const revokeBlobUrl = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      revokeBlobUrl();
    };
  }, []);

  if (!isOpen) return null;

  const isV2 = projectMode === '1120_v2';
  const isV1Intel = projectMode === '1120_intel';
  const spec = isV2 ? INTEL_V2_SPEC : isV1Intel ? INTEL_VIDEO_SPEC : VIDEO_SPEC;
  const targetW = resolutionMode === 'full' ? spec.width : Math.round(spec.width / 2);
  const targetH = resolutionMode === 'full' ? spec.height : Math.round(spec.height / 2);
  const trackKey: ExportTrackKey = isV2 ? '1120_v2' : isV1Intel ? '1120' : '1117';
  const projectLabel = isV2
    ? '11.20 盘前风向（v2 精修爆款版）'
    : isV1Intel
      ? '11.20 盘前风向（v1 存档版）'
      : PROJECT_TEMPLATES[projectMode === 'morning_brief' ? 'morning_brief' : '1117_close'].name;

  const renderMasterToOutCanvas = (
    masterCanvas: HTMLCanvasElement,
    masterCtx: CanvasRenderingContext2D,
    outCtx: CanvasRenderingContext2D,
    frameIndex: number
  ) => {
    const legacyId = projectMode === 'morning_brief' ? 'morning_brief' : '1117_close';
    if (isV2) {
      renderIntelV2VideoFrame(masterCtx, frameIndex, intelImages);
    } else if (isV1Intel) {
      renderIntelVideoFrame(masterCtx, frameIndex, intelImages);
    } else {
      renderVideoFrame(masterCtx, frameIndex, PROJECT_TEMPLATES[legacyId], images);
    }
    if (resolutionMode === 'full') {
      outCtx.drawImage(masterCanvas, 0, 0);
    } else {
      outCtx.drawImage(masterCanvas, 0, 0, targetW, targetH);
    }
  };

  const handleDownloadWav = () => {
    const { blob, filename } = buildTrackWavBlob(trackKey);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const handleStartExport = async () => {
    revokeBlobUrl();
    setStatus('rendering');
    setRenderedCount(0);
    setDownloadUrl(null);
    setEngineBadge('');
    setPhaseLabel(`正在检测导出通道并准备 ${spec.totalFrames} 帧...`);
    setErrorMsg('');

    let exportIntelImages = intelImages;
    if (isV2 && (!exportIntelImages.realKeyDayFrames || exportIntelImages.realKeyDayFrames.length === 0)) {
      const videoCache = await loadRealVideoFrameCache(
        INTEL_V2_ASSETS.realKeyDayVideo,
        INTEL_V2_VIDEO_SAMPLE.sampleCount,
        INTEL_V2_VIDEO_SAMPLE.maxSec,
        INTEL_V2_VIDEO_SAMPLE.outW,
        INTEL_V2_VIDEO_SAMPLE.outH,
        undefined,
        INTEL_V2_VIDEO_SAMPLE.minSec,
        INTEL_V2_VIDEO_SAMPLE.cropCenterRatio
      );
      exportIntelImages = {
        ...exportIntelImages,
        realKeyDayVideo: videoCache.video,
        realKeyDayFrames: videoCache.frames,
      };
    }

    const renderWithLoadedAssets = (
      masterCanvas: HTMLCanvasElement,
      masterCtx: CanvasRenderingContext2D,
      outCtx: CanvasRenderingContext2D,
      frameIndex: number
    ) => {
      const legacyId = projectMode === 'morning_brief' ? 'morning_brief' : '1117_close';
      if (isV2) {
        renderIntelV2VideoFrame(masterCtx, frameIndex, exportIntelImages);
      } else if (isV1Intel) {
        renderIntelVideoFrame(masterCtx, frameIndex, exportIntelImages);
      } else {
        renderVideoFrame(masterCtx, frameIndex, PROJECT_TEMPLATES[legacyId], images);
      }
      if (resolutionMode === 'full') {
        outCtx.drawImage(masterCanvas, 0, 0);
      } else {
        outCtx.drawImage(masterCanvas, 0, 0, targetW, targetH);
      }
    };

    try {
      const masterCanvas = document.createElement('canvas');
      masterCanvas.width = spec.width;
      masterCanvas.height = spec.height;
      const masterCtx = masterCanvas.getContext('2d', { willReadFrequently: true });
      if (!masterCtx) throw new Error('Canvas 2D 上下文不可用');

      // 1) Try server FFmpeg route safely (won't crash on HTML <!doctype> from static/shared hosts)
      let serverSessionId: string | null = null;
      try {
        const initRes = await fetch('/api/export/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            totalFrames: spec.totalFrames,
            width: targetW,
            height: targetH,
            track: trackKey,
          }),
        });
        if (initRes.ok) {
          const initJson = await parseJsonResponseSafe<{ sessionId?: string }>(initRes);
          if (initJson?.sessionId) {
            serverSessionId = initJson.sessionId;
          }
        }
      } catch {
        serverSessionId = null;
      }

      if (serverSessionId) {
        try {
          const outCanvas = document.createElement('canvas');
          outCanvas.width = targetW;
          outCanvas.height = targetH;
          const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });
          if (!outCtx) throw new Error('输出画布上下文不可用');

          setPhaseLabel(`正在逐帧渲染并上传 ${spec.totalFrames} 帧图像序列...`);
          const batchSize = 8;
          let batch: Array<{ index: number; dataUrl: string }> = [];

          for (let f = 0; f < spec.totalFrames; f++) {
            renderWithLoadedAssets(masterCanvas, masterCtx, outCtx, f);
            const dataUrl = outCanvas.toDataURL('image/jpeg', 0.92);
            batch.push({ index: f, dataUrl });

            if (batch.length === batchSize || f === spec.totalFrames - 1) {
              const uploadRes = await fetch(`/api/export/${serverSessionId}/frames`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ frames: batch }),
              });
              const uploadJson = await parseJsonResponseSafe<{ receivedFrames?: number; error?: string }>(
                uploadRes
              );
              if (!uploadRes.ok || !uploadJson || typeof uploadJson.receivedFrames !== 'number') {
                throw new Error(uploadJson?.error || 'SERVER_UNAVAILABLE');
              }
              batch = [];
              setRenderedCount(f + 1);
              await new Promise((r) => setTimeout(r, 0));
            }
          }

          setStatus('muxing');
          setPhaseLabel('正在运行服务端 FFmpeg 音画混流 (libx264 + AAC)...');
          const finRes = await fetch(`/api/export/${serverSessionId}/finalize`, {
            method: 'POST',
          });
          const finJson = await parseJsonResponseSafe<{
            ok?: boolean;
            sizeBytes?: number;
            downloadUrl?: string;
            error?: string;
          }>(finRes);
          if (!finRes.ok || !finJson?.downloadUrl) {
            throw new Error(finJson?.error || 'SERVER_UNAVAILABLE');
          }

          setDownloadUrl(finJson.downloadUrl);
          setDownloadName(getExportFileName(trackKey, 'mp4'));
          setFileSizeMb(((finJson.sizeBytes ?? 0) / (1024 * 1024)).toFixed(2));
          setEngineBadge('服务端 FFmpeg (H.264 + AAC)');
          setStatus('done');
          return;
        } catch (serverErr) {
          // If server route broke mid-way due to proxy HTML/timeout, fall back transparently to local browser MP4!
          const msg = serverErr instanceof Error ? serverErr.message : '';
          if (msg !== 'SERVER_UNAVAILABLE' && !msg.includes('JSON') && !msg.includes('doctype')) {
            // Still allow local browser fallback so the user always gets their MP4
          }
          setRenderedCount(0);
          setStatus('rendering');
        }
      }

      // 2) Pure-browser WebCodecs (H.264 + AAC/Opus + mp4-muxer) or MediaRecorder fallback
      const clientRes = await exportClientMp4({
        totalFrames: spec.totalFrames,
        fps: spec.fps,
        width: targetW,
        height: targetH,
        trackKey,
        renderFrame: (f, _outCanvas, outCtx) => {
          renderWithLoadedAssets(masterCanvas, masterCtx, outCtx, f);
        },
        onProgress: (count) => setRenderedCount(count),
        onPhaseChange: (label) => setPhaseLabel(label),
      });

      const blobUrl = URL.createObjectURL(clientRes.blob);
      blobUrlRef.current = blobUrl;
      setDownloadUrl(blobUrl);
      setDownloadName(clientRes.filename);
      setFileSizeMb((clientRes.sizeBytes / (1024 * 1024)).toFixed(2));
      setEngineBadge(clientRes.engineLabel);
      setStatus('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '导出异常');
      setStatus('error');
    }
  };

  const progressPct = Math.round((renderedCount / spec.totalFrames) * 100);

  return (
    <div
      className="fixed inset-0 z-50 bg-neutral-950/50 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
    >
      <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-lg p-6 space-y-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="export-dialog-title" className="text-lg font-bold text-neutral-900">
              导出成品 MP4（H.264 立体声成片）
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              当前成片：{projectLabel} · {spec.totalFrames} 帧 · 30 fps · {spec.bpm} BPM 立体声
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭导出窗口"
            className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-neutral-700">输出规格</div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={status === 'rendering' || status === 'muxing'}
              onClick={() => setResolutionMode('full')}
              className={`p-3 rounded-lg border text-left transition-colors ${
                resolutionMode === 'full'
                  ? 'border-[#C8342A] bg-red-50/40'
                  : 'border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              <div className="text-sm font-bold text-neutral-900 font-mono-num">
                {spec.width} × {spec.height}
              </div>
              <div className="text-xs text-neutral-500 mt-0.5">原片全高清规格 (crf 18)</div>
            </button>
            <button
              type="button"
              disabled={status === 'rendering' || status === 'muxing'}
              onClick={() => setResolutionMode('fast')}
              className={`p-3 rounded-lg border text-left transition-colors ${
                resolutionMode === 'fast'
                  ? 'border-[#C8342A] bg-red-50/40'
                  : 'border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              <div className="text-sm font-bold text-neutral-900 font-mono-num">
                {Math.round(spec.width / 2)} × {Math.round(spec.height / 2)}
              </div>
              <div className="text-xs text-neutral-500 mt-0.5">极速预览校验输出</div>
            </button>
          </div>
        </div>

        {status !== 'idle' && (
          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs font-mono-num">
              <span className="font-medium text-neutral-800 truncate">
                {status === 'rendering' && (phaseLabel || `正在逐帧渲染 ${spec.totalFrames} 帧图像序列...`)}
                {status === 'muxing' && (phaseLabel || '正在进行音画混流 (H.264 + 立体声)...')}
                {status === 'done' && `成品导出完成（${fileSizeMb} MB）`}
                {status === 'error' && '导出失败'}
              </span>
              <span className="text-neutral-600 shrink-0">{progressPct}%</span>
            </div>
            <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#C8342A] transition-all duration-150"
                style={{ width: `${status === 'muxing' || status === 'done' ? 100 : progressPct}%` }}
              />
            </div>
            {engineBadge && status === 'done' && (
              <p className="text-[11px] text-neutral-500">编码引擎：{engineBadge}</p>
            )}
            {errorMsg && <p className="text-xs text-[#C8342A]">{errorMsg}</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-100">
          <button
            type="button"
            onClick={handleDownloadWav}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 underline-offset-4 hover:underline"
          >
            <Music className="w-3.5 h-3.5" />
            <span>单独下载 {spec.bpm} BPM 音轨 (.wav)</span>
          </button>

          <div className="flex items-center gap-2">
            {downloadUrl ? (
              <a
                href={downloadUrl}
                download={downloadName}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2E8B64] hover:bg-[#257352] text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>下载成片文件</span>
              </a>
            ) : (
              <button
                type="button"
                disabled={status === 'rendering' || status === 'muxing'}
                onClick={handleStartExport}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C8342A] hover:bg-[#b02a21] disabled:opacity-60 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
              >
                <Film className="w-4 h-4" />
                <span>
                  {status === 'rendering' || status === 'muxing' ? '正在合成 MP4...' : '开始逐帧合成 MP4'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

