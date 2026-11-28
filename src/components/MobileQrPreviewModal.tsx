import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  Film,
  Globe,
  RefreshCw,
  Smartphone,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { INTEL_V2_ASSETS, INTEL_V2_VIDEO_SAMPLE, VIDEO_SPEC } from '../video/theme';
import { PROJECT_TEMPLATES } from '../video/data/fundFlowData';
import { renderVideoFrame, type LoadedVideoImages } from '../video/renderer/renderFrame';
import { INTEL_VIDEO_SPEC } from '../video/intel/intelData';
import { renderIntelVideoFrame, type LoadedIntelImages } from '../video/intel/renderIntelFrame';
import { INTEL_V2_SPEC } from '../video/intelV2/intelV2Data';
import { renderIntelV2VideoFrame } from '../video/intelV2/renderIntelV2Frame';
import { loadRealVideoFrameCache } from '../video/intelV2/videoFrameCache';
import type {
  EpisodeListItem,
  EpisodeManifest,
  LoadedEpisodeAssets,
} from '../video/engine/schema';
import { collectEpisodeAssetSources, compileEpisodeTimeline } from '../video/engine/timeline';
import { renderEpisodeFrame } from '../video/engine/scenes';
import {
  exportClientMp4,
  isFastWebCodecsSupported,
  parseJsonResponseSafe,
  type ExportTrackKey,
} from '../video/export/clientMp4Export';
import { buildMobilePreviewKey } from './MobileFullscreenPreview';
import type { StudioProjectMode } from './VideoPlayerWorkspace';

export interface UnifiedVideoTabItem {
  key: string;
  label: string;
  shortLabel: string;
  projectMode: StudioProjectMode;
  episodeId?: string;
}

type DirectMp4ChannelId = 'droptocdn_mp4' | 'uguu_mp4' | 'x0_mp4';

interface CloudShareChannel {
  id: DirectMp4ChannelId;
  label: string;
  shortLabel: string;
  url: string;
  description: string;
  verified: boolean;
  expiresHint: string;
  providerName: string;
}

interface MobileTunnelSnapshot {
  status: 'idle' | 'starting' | 'ready' | 'error';
  url: string | null;
  verified: boolean;
  statusCode: number;
  error: string | null;
  startedAt: number | null;
}

interface MobileQrPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: UnifiedVideoTabItem;
  allTabs: UnifiedVideoTabItem[];
  onSelectTab: (tab: UnifiedVideoTabItem) => void;
  activeEpisode: EpisodeManifest | null;
  episodeAssets: LoadedEpisodeAssets;
  images: LoadedVideoImages;
  intelImages: LoadedIntelImages;
  episodes: EpisodeListItem[];
}

type SelectedChannelMode = DirectMp4ChannelId | 'standalone_6kb' | 'custom';

const CHANNEL_SORT_ORDER: Record<DirectMp4ChannelId, number> = {
  droptocdn_mp4: 0,
  uguu_mp4: 1,
  x0_mp4: 2,
};

function mergeCloudChannels(
  prev: CloudShareChannel[],
  incoming: CloudShareChannel[]
): CloudShareChannel[] {
  const byId = new Map<DirectMp4ChannelId, CloudShareChannel>();
  for (const ch of prev) {
    if (ch?.id && ch.url && ch.id in CHANNEL_SORT_ORDER) byId.set(ch.id, ch);
  }
  for (const ch of incoming) {
    if (ch?.id && ch.url && ch.id in CHANNEL_SORT_ORDER) byId.set(ch.id, ch);
  }
  return Array.from(byId.values()).sort(
    (a, b) => (CHANNEL_SORT_ORDER[a.id] ?? 9) - (CHANNEL_SORT_ORDER[b.id] ?? 9)
  );
}

export const MobileQrPreviewModal: React.FC<MobileQrPreviewModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  allTabs,
  onSelectTab,
  activeEpisode,
  episodeAssets,
  images,
  intelImages,
  episodes,
}) => {
  const [tunnelState, setTunnelState] = useState<MobileTunnelSnapshot>({
    status: 'idle',
    url: null,
    verified: false,
    statusCode: 0,
    error: null,
    startedAt: null,
  });
  const [customOrigin, setCustomOrigin] = useState<string>(() => {
    try {
      return window.localStorage.getItem('quantreel_custom_qr_origin') || '';
    } catch {
      return '';
    }
  });

  const [mp4Ready, setMp4Ready] = useState(false);
  const [mp4SizeMb, setMp4SizeMb] = useState<string>('');
  const [mp4Dims, setMp4Dims] = useState<{ width: number; height: number } | null>(null);
  const [mp4DownloadUrl, setMp4DownloadUrl] = useState<string>('');
  const [cloudChannels, setCloudChannels] = useState<CloudShareChannel[]>([]);
  const [pendingBackups, setPendingBackups] = useState(false);
  const [selectedMode, setSelectedMode] = useState<SelectedChannelMode>('droptocdn_mp4');

  const [working, setWorking] = useState(false);
  const [workProgress, setWorkProgress] = useState(0);
  const [workPhase, setWorkPhase] = useState('');
  const [workError, setWorkError] = useState('');
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [lastGenSec, setLastGenSec] = useState<number | null>(null);

  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const localBlobUrlRef = useRef<string | null>(null);
  const previewKey = buildMobilePreviewKey(activeTab.projectMode, activeTab.episodeId);

  useEffect(() => {
    return () => {
      if (localBlobUrlRef.current) {
        URL.revokeObjectURL(localBlobUrlRef.current);
        localBlobUrlRef.current = null;
      }
    };
  }, []);

  // Live elapsed timer during generation
  useEffect(() => {
    if (!working) return;
    const t0 = performance.now();
    setElapsedSec(0);
    const id = window.setInterval(() => {
      setElapsedSec((performance.now() - t0) / 1000);
    }, 100);
    return () => window.clearInterval(id);
  }, [working]);

  const startOrRefreshTunnel = useCallback(async (force = false) => {
    setTunnelState((prev) => ({
      ...prev,
      status: 'starting',
      error: null,
      ...(force ? { url: null, verified: false, statusCode: 0 } : {}),
    }));
    try {
      const res = await fetch(`/api/mobile-tunnel/start${force ? '?force=1' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const snap = res.ok ? await parseJsonResponseSafe<MobileTunnelSnapshot>(res) : null;
      if (snap) setTunnelState(snap);
    } catch {
      setTunnelState((prev) => ({ ...prev, status: 'error', error: '通道连接失败' }));
    }
  }, []);

  useEffect(() => {
    try {
      if (customOrigin.trim()) {
        window.localStorage.setItem('quantreel_custom_qr_origin', customOrigin.trim());
      } else {
        window.localStorage.removeItem('quantreel_custom_qr_origin');
      }
    } catch {
      // Ignore storage errors
    }
  }, [customOrigin]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch('/api/mobile-tunnel/status', { cache: 'no-store' })
      .then((res) => (res.ok ? parseJsonResponseSafe<MobileTunnelSnapshot>(res) : null))
      .then((snap) => {
        if (!cancelled && snap) setTunnelState(snap);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Load existing MP4 & disk-cached direct-MP4 channels (<0.1s instant hit)
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    if (localBlobUrlRef.current) {
      URL.revokeObjectURL(localBlobUrlRef.current);
      localBlobUrlRef.current = null;
    }
    setMp4Ready(false);
    setMp4SizeMb('');
    setMp4Dims(null);
    setMp4DownloadUrl('');
    setCloudChannels([]);
    setPendingBackups(false);
    setWorkError('');
    setWorkPhase('');
    setWorkProgress(0);
    setLastGenSec(null);

    fetch(`/api/mobile-preview/${encodeURIComponent(previewKey)}/status`, { cache: 'no-store' })
      .then((res) =>
        res.ok
          ? parseJsonResponseSafe<{
              ready?: boolean;
              sizeBytes?: number;
              width?: number | null;
              height?: number | null;
              downloadUrl?: string;
              cloudChannels?: CloudShareChannel[];
              pendingBackups?: boolean;
            }>(res)
          : null
      )
      .then((data) => {
        if (cancelled || !data) return;
        if (data.ready) {
          setMp4Ready(true);
          setMp4SizeMb(((data.sizeBytes ?? 0) / (1024 * 1024)).toFixed(2));
          setMp4Dims(
            data.width && data.height ? { width: data.width, height: data.height } : null
          );
          setMp4DownloadUrl(
            data.downloadUrl || `/api/mobile-preview/${encodeURIComponent(previewKey)}/download`
          );
          const list = mergeCloudChannels([], Array.isArray(data.cloudChannels) ? data.cloudChannels : []);
          setCloudChannels(list);
          setPendingBackups(Boolean(data.pendingBackups));
          if (list.length > 0) {
            setSelectedMode(list[0].id);
          }
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isOpen, previewKey]);

  // Silently hydrate backup direct-MP4 routes (uguu / x0.at) in background without disturbing active QR
  useEffect(() => {
    if (!isOpen || !pendingBackups || working) return;
    let cancelled = false;
    let attempts = 0;
    let timer = 0;
    const poll = async () => {
      if (cancelled || attempts >= 6) {
        if (!cancelled) setPendingBackups(false);
        return;
      }
      attempts++;
      try {
        const res = await fetch(`/api/mobile-preview/${encodeURIComponent(previewKey)}/status`, {
          cache: 'no-store',
        });
        const data = res.ok
          ? await parseJsonResponseSafe<{
              ready?: boolean;
              downloadUrl?: string;
              cloudChannels?: CloudShareChannel[];
              pendingBackups?: boolean;
            }>(res)
          : null;
        if (cancelled || !data) return;
        if (data.ready && data.downloadUrl) {
          setMp4DownloadUrl(data.downloadUrl);
        }
        if (Array.isArray(data.cloudChannels) && data.cloudChannels.length > 0) {
          setCloudChannels((prev) => mergeCloudChannels(prev, data.cloudChannels!));
        }
        if (!data.pendingBackups) {
          setPendingBackups(false);
          return;
        }
      } catch {
        // Ignore transient poll errors
      }
      if (!cancelled) {
        timer = window.setTimeout(poll, 3500);
      }
    };
    timer = window.setTimeout(poll, 3500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, pendingBackups, working, previewKey]);

  const relativeMobilePath = useMemo(() => {
    if (mp4Ready) {
      return `/m/${encodeURIComponent(previewKey)}`;
    }
    if (activeTab.projectMode === 'episode' && activeTab.episodeId) {
      return `/?mobile=1&episode=${encodeURIComponent(activeTab.episodeId)}`;
    }
    return `/?mobile=1&mode=${encodeURIComponent(activeTab.projectMode)}`;
  }, [mp4Ready, previewKey, activeTab]);

  const localTestUrl = `${window.location.origin.replace(/\/+$/, '')}${relativeMobilePath}`;

  const activeCloudChannel = useMemo(
    () => cloudChannels.find((c) => c.id === selectedMode) ?? null,
    [cloudChannels, selectedMode]
  );

  const previewUrl = useMemo(() => {
    if (activeCloudChannel) {
      return activeCloudChannel.url;
    }
    if (selectedMode === 'standalone_6kb') {
      const origin = tunnelState.url?.replace(/\/+$/, '') || '';
      return origin ? `${origin}${relativeMobilePath}` : '';
    }
    if (selectedMode === 'custom' && customOrigin.trim()) {
      return `${customOrigin.trim().replace(/\/+$/, '')}${relativeMobilePath}`;
    }
    if (cloudChannels.length > 0) {
      return cloudChannels[0].url;
    }
    return '';
  }, [activeCloudChannel, selectedMode, tunnelState.url, relativeMobilePath, customOrigin, cloudChannels]);

  useEffect(() => {
    if (!isOpen || !previewUrl) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(previewUrl, {
      width: 340,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#111827', light: '#FFFFFF' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, previewUrl]);

  if (!isOpen) return null;

  const handleCopyUrl = async () => {
    if (!previewUrl) return;
    try {
      await navigator.clipboard.writeText(previewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  // Publish already-baked 1080p MP4 directly to Cloudflare Direct-MP4 edge (~3s!)
  const publishExistingMp4ToCloud = async (force = false) => {
    setWorkPhase('正在同步至 Cloudflare 极速纯 MP4 边缘节点...');
    setWorkProgress((p) => Math.max(p, 85));
    const pubRes = await fetch(
      `/api/mobile-preview/${encodeURIComponent(previewKey)}/publish-cloud`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      }
    );
    const pubJson = await parseJsonResponseSafe<{
      ok?: boolean;
      channels?: CloudShareChannel[];
      pendingBackups?: boolean;
      error?: string;
    }>(pubRes);
    if (!pubRes.ok || !pubJson?.channels || pubJson.channels.length === 0) {
      throw new Error(pubJson?.error || '纯 MP4 直链发布失败，请稍后重试');
    }
    const merged = mergeCloudChannels([], pubJson.channels);
    setCloudChannels(merged);
    setSelectedMode(merged[0].id);
    setPendingBackups(Boolean(pubJson.pendingBackups));
    setWorkProgress(100);
    setWorkPhase('纯 MP4 直链已就绪，手机扫码直接全屏播放！');
  };

  // 5~8s Direct-MP4 Pipeline:
  // 1) Local GPU WebCodecs 1080×1920 H.264+AAC (1.05Mbps + 1s GOP + faststart -> ~4.8MB in ~2s)
  // 2) Single binary POST to server -> 5ms save + 2.9s Cloudflare Global Edge pure MP4 direct link (93Mbps, ZERO webpage!)
  const handleOneClickGenerateCloudQr = async (forceRebake = false) => {
    if (working) return;
    const isEp = activeTab.projectMode === 'episode';
    if (isEp && (!activeEpisode || activeEpisode.id !== activeTab.episodeId)) {
      setWorkError('剧集素材仍在加载中，请稍候 1 秒后再试');
      return;
    }

    const startedAt = performance.now();
    const runKey = previewKey;
    setWorking(true);
    setWorkError('');
    setWorkProgress(2);
    setLastGenSec(null);

    try {
      const isExistingFullHd = Boolean(mp4Dims && mp4Dims.width >= 1080);
      if (mp4Ready && isExistingFullHd && !forceRebake) {
        await publishExistingMp4ToCloud(cloudChannels.length > 0);
        setLastGenSec(Number(((performance.now() - startedAt) / 1000).toFixed(1)));
        return;
      }

      setWorkPhase('1/2 GPU 硬件压制 1080×1920 极速流媒体 MP4...');
      const compiled = isEp && activeEpisode ? compileEpisodeTimeline(activeEpisode) : null;
      const spec = compiled
        ? {
            width: compiled.width,
            height: compiled.height,
            fps: compiled.fps,
            totalFrames: compiled.totalFrames,
          }
        : activeTab.projectMode === '1120_v2'
          ? INTEL_V2_SPEC
          : activeTab.projectMode === '1120_intel'
            ? INTEL_VIDEO_SPEC
            : VIDEO_SPEC;

      const targetW = Math.floor(spec.width / 2) * 2;
      const targetH = Math.floor(spec.height / 2) * 2;
      const trackKey: ExportTrackKey =
        activeTab.projectMode === '1120_intel'
          ? '1120'
          : activeTab.projectMode === '1117_close' || activeTab.projectMode === 'morning_brief'
            ? '1117'
            : '1120_v2';

      let exportIntelImages = intelImages;
      if (
        activeTab.projectMode === '1120_v2' &&
        (!exportIntelImages.realKeyDayFrames || exportIntelImages.realKeyDayFrames.length === 0)
      ) {
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

      let exportEpisodeAssets = episodeAssets;
      if (isEp && activeEpisode) {
        const { hookVideos } = collectEpisodeAssetSources(activeEpisode);
        const missingHooks = hookVideos.filter(
          (hv) =>
            !exportEpisodeAssets.videoFramesBySrc[hv.videoSrc] ||
            exportEpisodeAssets.videoFramesBySrc[hv.videoSrc].length === 0
        );
        if (missingHooks.length > 0) {
          const nextFrames = { ...exportEpisodeAssets.videoFramesBySrc };
          const nextVideos = { ...exportEpisodeAssets.videosBySrc };
          await Promise.all(
            missingHooks.map(async (hv) => {
              const cache = await loadRealVideoFrameCache(
                hv.videoSrc,
                hv.sample.sampleCount,
                hv.sample.maxSec,
                hv.sample.outW,
                hv.sample.outH,
                undefined,
                hv.sample.minSec,
                hv.sample.cropCenterRatio
              );
              nextFrames[hv.videoSrc] = cache.frames;
              nextVideos[hv.videoSrc] = cache.video;
            })
          );
          exportEpisodeAssets = {
            ...exportEpisodeAssets,
            videoFramesBySrc: nextFrames,
            videosBySrc: nextVideos,
          };
        }
      }

      const episodeMeta =
        isEp && activeEpisode ? episodes.find((e) => e.id === activeEpisode.id) : undefined;
      const voiceoverUrl =
        isEp && activeEpisode && episodeMeta?.hasVoiceover
          ? `/episodes/${encodeURIComponent(activeEpisode.id)}/voiceover.wav`
          : undefined;

      const canUseGpuWebCodecs = await isFastWebCodecsSupported(targetW, targetH, spec.fps);
      if (canUseGpuWebCodecs) {
        const needsResize = targetW !== spec.width || targetH !== spec.height;
        const masterCanvas = needsResize ? document.createElement('canvas') : null;
        if (masterCanvas) {
          masterCanvas.width = spec.width;
          masterCanvas.height = spec.height;
        }
        const masterCtx = masterCanvas ? masterCanvas.getContext('2d', { alpha: false }) : null;

        const gpuResult = await exportClientMp4({
          totalFrames: spec.totalFrames,
          fps: spec.fps,
          width: targetW,
          height: targetH,
          trackKey,
          episode: isEp && activeEpisode ? activeEpisode : undefined,
          fastMode: true,
          voiceoverUrl,
          renderFrame: (f, _outCanvas, outCtx) => {
            const drawCtx = needsResize && masterCtx ? masterCtx : outCtx;
            if (isEp && activeEpisode) {
              renderEpisodeFrame(drawCtx, f, activeEpisode, exportEpisodeAssets);
            } else if (activeTab.projectMode === '1120_v2') {
              renderIntelV2VideoFrame(drawCtx, f, exportIntelImages);
            } else if (activeTab.projectMode === '1120_intel') {
              renderIntelVideoFrame(drawCtx, f, exportIntelImages);
            } else {
              const legacyId =
                activeTab.projectMode === 'morning_brief' ? 'morning_brief' : '1117_close';
              renderVideoFrame(drawCtx, f, PROJECT_TEMPLATES[legacyId], images);
            }
            if (needsResize && masterCanvas) {
              outCtx.drawImage(masterCanvas, 0, 0, targetW, targetH);
            }
          },
          onProgress: (rendered) => {
            setWorkProgress(Math.min(60, Math.round((rendered / spec.totalFrames) * 60)));
          },
          onPhaseChange: (label) => {
            setWorkPhase(`1/2 ${label}`);
          },
        });

        // Expose immediate local MP4 download from browser memory
        if (localBlobUrlRef.current) {
          URL.revokeObjectURL(localBlobUrlRef.current);
        }
        const localUrl = URL.createObjectURL(gpuResult.blob);
        localBlobUrlRef.current = localUrl;
        setMp4Ready(true);
        setMp4Dims({ width: targetW, height: targetH });
        setMp4SizeMb((gpuResult.sizeBytes / (1024 * 1024)).toFixed(2));
        setMp4DownloadUrl(localUrl);
        setWorkProgress(66);
        setWorkPhase('2/2 正在推送至 Cloudflare 亚太极速纯 MP4 节点并预热首帧...');

        const uploadQuery = new URLSearchParams({
          muxAudio: gpuResult.hasAudio ? '0' : '1',
          publish: '1',
          track: trackKey,
          ...(isEp && activeEpisode ? { episodeId: activeEpisode.id } : {}),
        });

        const upRes = await fetch(
          `/api/mobile-preview/${encodeURIComponent(runKey)}/upload-mp4?${uploadQuery.toString()}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'video/mp4' },
            body: gpuResult.blob,
          }
        );
        const srvData = await parseJsonResponseSafe<{
          ok?: boolean;
          sizeBytes?: number;
          width?: number | null;
          height?: number | null;
          downloadUrl?: string;
          channels?: CloudShareChannel[];
          pendingBackups?: boolean;
          error?: string;
        }>(upRes);

        if (!upRes.ok || !srvData?.ok || !srvData.channels || srvData.channels.length === 0) {
          throw new Error(srvData?.error || '纯 MP4 直链发布失败，请稍后重试');
        }

        if (srvData.downloadUrl) setMp4DownloadUrl(srvData.downloadUrl);
        if (srvData.sizeBytes) setMp4SizeMb((srvData.sizeBytes / (1024 * 1024)).toFixed(2));
        if (srvData.width && srvData.height) {
          setMp4Dims({ width: srvData.width, height: srvData.height });
        }
        const chans = mergeCloudChannels([], srvData.channels);
        setCloudChannels(chans);
        setSelectedMode(chans[0].id);
        setPendingBackups(Boolean(srvData.pendingBackups));
        setWorkProgress(100);
        setLastGenSec(Number(((performance.now() - startedAt) / 1000).toFixed(1)));
        setWorkPhase('纯 MP4 直链已生成！手机扫码直接全屏秒播');
        return;
      }

      // Legacy Fallback (if browser has no WebCodecs): 4-way concurrent JPEG upload + ultrafast FFmpeg
      const initRes = await fetch('/api/export/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalFrames: spec.totalFrames,
          width: targetW,
          height: targetH,
          fps: spec.fps,
          track: trackKey,
          ...(isEp && activeEpisode ? { episodeId: activeEpisode.id } : {}),
          persistPreviewKey: runKey,
        }),
      });
      const initJson = await parseJsonResponseSafe<{ sessionId?: string; error?: string }>(initRes);
      if (!initRes.ok || !initJson?.sessionId) {
        throw new Error(initJson?.error || '服务端渲染通道不可用');
      }

      const masterCanvas = document.createElement('canvas');
      masterCanvas.width = spec.width;
      masterCanvas.height = spec.height;
      const masterCtx = masterCanvas.getContext('2d', { alpha: false });
      const needsResize = targetW !== spec.width || targetH !== spec.height;
      const outCanvas = needsResize ? document.createElement('canvas') : masterCanvas;
      if (needsResize) {
        outCanvas.width = targetW;
        outCanvas.height = targetH;
      }
      const outCtx = needsResize ? outCanvas.getContext('2d', { alpha: false }) : masterCtx;
      if (!masterCtx || !outCtx) throw new Error('画布初始化失败');

      setWorkPhase(`1/3 正在并行上传 1080×1920 视频帧...`);
      const batchSize = 12;
      const maxConcurrent = 4;
      let batch: Array<{ index: number; dataUrl: string }> = [];
      const inFlight: Promise<void>[] = [];

      const flushBatch = (items: Array<{ index: number; dataUrl: string }>) => {
        const p = fetch(`/api/export/${initJson.sessionId}/frames`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frames: items }),
        }).then((upRes) => {
          if (!upRes.ok) throw new Error('上传视频帧失败');
        });
        inFlight.push(p);
        p.finally(() => {
          const idx = inFlight.indexOf(p);
          if (idx >= 0) inFlight.splice(idx, 1);
        });
        return p;
      };

      for (let f = 0; f < spec.totalFrames; f++) {
        if (isEp && activeEpisode) {
          renderEpisodeFrame(masterCtx, f, activeEpisode, exportEpisodeAssets);
        } else if (activeTab.projectMode === '1120_v2') {
          renderIntelV2VideoFrame(masterCtx, f, exportIntelImages);
        } else if (activeTab.projectMode === '1120_intel') {
          renderIntelVideoFrame(masterCtx, f, exportIntelImages);
        } else {
          const legacyId =
            activeTab.projectMode === 'morning_brief' ? 'morning_brief' : '1117_close';
          renderVideoFrame(masterCtx, f, PROJECT_TEMPLATES[legacyId], images);
        }
        if (needsResize) {
          outCtx.drawImage(masterCanvas, 0, 0, targetW, targetH);
        }
        batch.push({ index: f, dataUrl: outCanvas.toDataURL('image/jpeg', 0.86) });

        if (batch.length === batchSize || f === spec.totalFrames - 1) {
          flushBatch(batch);
          batch = [];
          setWorkProgress(Math.round(((f + 1) / spec.totalFrames) * 76));
          if (inFlight.length >= maxConcurrent) {
            await Promise.race(inFlight);
          }
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      await Promise.all(inFlight);

      setWorkPhase('2/3 正在压制 1080×1920 H.264 + AAC 成片...');
      setWorkProgress(82);
      const finRes = await fetch(`/api/export/${initJson.sessionId}/finalize`, {
        method: 'POST',
      });
      const finJson = await parseJsonResponseSafe<{
        ok?: boolean;
        sizeBytes?: number;
        error?: string;
      }>(finRes);
      if (!finRes.ok || !finJson?.ok) {
        throw new Error(finJson?.error || 'FFmpeg 混流失败');
      }

      setMp4Ready(true);
      setMp4Dims({ width: targetW, height: targetH });
      setMp4SizeMb(((finJson.sizeBytes ?? 0) / (1024 * 1024)).toFixed(2));
      setMp4DownloadUrl(`/api/mobile-preview/${encodeURIComponent(runKey)}/download`);

      setWorkPhase('3/3 正在推送至 Cloudflare 极速纯 MP4 节点...');
      setWorkProgress(92);
      await publishExistingMp4ToCloud(true);
      setLastGenSec(Number(((performance.now() - startedAt) / 1000).toFixed(1)));
    } catch (err) {
      setWorkError(err instanceof Error ? err.message : '生成手机直看二维码失败');
    } finally {
      setWorking(false);
    }
  };

  const hasReadyCloudQr = cloudChannels.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-qr-title"
      onClick={onClose}
    >
      <div
        className="bg-white border border-neutral-200 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C8342A]">
              <Smartphone className="w-3.5 h-3.5" />
              <span>手机扫码直看纯 MP4 原片（零跳转网页 · Cloudflare 边缘加速）</span>
            </div>
            <h2 id="mobile-qr-title" className="text-lg font-bold text-neutral-900 mt-1">
              {activeTab.label}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭二维码窗口"
            className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Episode Tab Quick-Switcher */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-neutral-500">切换剧集生成对应手机直看二维码</div>
          <div className="flex flex-wrap gap-1.5">
            {allTabs.map((tab) => {
              const isCurrent = tab.key === activeTab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  disabled={working}
                  onClick={() => onSelectTab(tab)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    isCurrent
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                  }`}
                >
                  {tab.shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main QR Stage + Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          {/* Left: QR Box */}
          <div className="sm:col-span-5 flex flex-col items-center">
            <div className="bg-white p-3 rounded-xl border border-neutral-200 shadow-xs">
              {working ? (
                <div className="w-44 h-44 flex flex-col items-center justify-center gap-2 text-center px-3">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#C8342A]" />
                  <div className="text-xs font-bold text-neutral-900 font-mono-num">
                    {workProgress}% · {elapsedSec.toFixed(1)}s
                  </div>
                  <div className="text-[11px] text-neutral-500 leading-snug">{workPhase}</div>
                </div>
              ) : qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`${activeTab.label} 手机纯MP4直看二维码`}
                  className="w-44 h-44 block"
                />
              ) : (
                <div className="w-44 h-44 flex flex-col items-center justify-center gap-2.5 text-center px-3 bg-neutral-50 rounded-lg border border-dashed border-neutral-300">
                  <CloudUpload className="w-6 h-6 text-[#C8342A]" />
                  <div className="text-xs font-semibold text-neutral-800">
                    尚未生成本集纯 MP4 直看码
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleOneClickGenerateCloudQr(false)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#C8342A] hover:bg-[#b02a21] text-white text-xs font-semibold cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>极速生成（约6秒）</span>
                  </button>
                </div>
              )}
            </div>
            <div className="text-[11px] text-neutral-600 mt-2 text-center leading-snug">
              {qrDataUrl
                ? lastGenSec !== null
                  ? `生成耗时 ${lastGenSec}s · 扫码直接播放纯 MP4（不跳任何平台页）`
                  : '扫码直接调用手机原生全屏播放器（含完整立体声）'
                : '直出标准 1080×1920 纯 MP4 流，绝不跳转第三方网盘页'}
            </div>
          </div>

          {/* Right: Action & Direct-MP4 Route Switcher */}
          <div className="sm:col-span-7 space-y-3">
            <div
              className={`rounded-lg border p-3 space-y-2 ${
                hasReadyCloudQr
                  ? 'bg-emerald-50/75 border-emerald-200'
                  : 'bg-white border-neutral-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-neutral-900 inline-flex items-center gap-1.5">
                  <Sparkles
                    className={`w-3.5 h-3.5 ${hasReadyCloudQr ? 'text-emerald-600' : 'text-[#C8342A]'}`}
                  />
                  <span>
                    {hasReadyCloudQr
                      ? `纯 MP4 直链已就绪（${mp4Dims ? `${mp4Dims.width}×${mp4Dims.height}` : '1080×1920'} · ${mp4SizeMb} MB${lastGenSec !== null ? ` · ${lastGenSec}s` : ''}）`
                      : mp4Ready && mp4Dims && mp4Dims.width < 1080
                        ? `检测到旧版低清缓存 (${mp4Dims.width}×${mp4Dims.height})，点下方升级 1080×1920`
                        : mp4Ready
                          ? `1080×1920 纯 MP4 已缓存（${mp4SizeMb} MB）`
                          : '抖音全屏 1080×1920 · 纯 MP4 极速直连'}
                  </span>
                </span>
              </div>

              <p className="text-[11px] text-neutral-600 leading-relaxed">
                {hasReadyCloudQr
                  ? '已针对手机流畅播放优化（1.05Mbps 精控码率 + 1秒关键帧 + 首帧前置 faststart），通过 Cloudflare 亚太高速节点直出视频流，扫码直接全屏播不卡顿。'
                  : '采用本地 GPU 极速编码轻量化 1080×1920 精控码率 MP4（约 4~5MB）并直推 Cloudflare 亚太节点，约 5~8 秒出码，手机扫码直接进视频不跳平台页。'}
              </p>

              {working ? (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[11px] text-neutral-700 font-mono-num">
                    <span className="truncate">{workPhase}</span>
                    <span>
                      {workProgress}% · {elapsedSec.toFixed(1)}s
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#C8342A] transition-all duration-150"
                      style={{ width: `${workProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      void handleOneClickGenerateCloudQr(
                        hasReadyCloudQr || Boolean(mp4Dims && mp4Dims.width < 1080)
                      )
                    }
                    className="flex-1 min-w-[180px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#C8342A] hover:bg-[#b02a21] text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>
                      {hasReadyCloudQr
                        ? '重新生成 1080×1920 纯 MP4 码'
                        : mp4Ready && mp4Dims && mp4Dims.width >= 1080
                          ? '3 秒同步 Cloudflare 纯 MP4 码'
                          : '生成 1080×1920 纯 MP4 直看二维码'}
                    </span>
                  </button>

                  {mp4Ready && mp4DownloadUrl && (
                    <a
                      href={mp4DownloadUrl}
                      download={`${previewKey}_1080p.mp4`}
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold transition-colors"
                      title="下载 MP4 到电脑后，用微信文件传输助手或隔空投送 AirDrop 1秒发手机，完全零在线加载"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>下载 MP4</span>
                    </a>
                  )}
                </div>
              )}

              {workError && <p className="text-[11px] text-[#C8342A]">{workError}</p>}
            </div>

            {/* Direct-MP4 Route Switcher */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-600">
                <span>全部线路均为纯 MP4 直链（不跳网盘/平台）</span>
                {pendingBackups && !working && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    <span>后台补齐备用直链中</span>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {cloudChannels.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setSelectedMode(ch.id)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer ${
                      selectedMode === ch.id
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-emerald-900 border-emerald-200 hover:bg-emerald-50'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{ch.shortLabel}</span>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    setSelectedMode('standalone_6kb');
                    if (tunnelState.status === 'idle' || tunnelState.status === 'error') {
                      void startOrRefreshTunnel(false);
                    }
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border cursor-pointer ${
                    selectedMode === 'standalone_6kb'
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-white text-neutral-700 border-neutral-200'
                  }`}
                >
                  <Globe className="w-3 h-3" />
                  <span>6KB审片页</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedMode('custom')}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium border cursor-pointer ${
                    selectedMode === 'custom'
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-white text-neutral-700 border-neutral-200'
                  }`}
                >
                  自定义域名
                </button>
              </div>

              {selectedMode === 'custom' && (
                <input
                  type="url"
                  value={customOrigin}
                  onChange={(e) => setCustomOrigin(e.target.value)}
                  placeholder="例如 https://your-domain.com"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-neutral-300 rounded-md"
                />
              )}

              {previewUrl && (
                <div className="text-[11px] font-mono-num text-neutral-700 break-all bg-white border border-neutral-200 rounded-md px-2.5 py-1.5">
                  {previewUrl}
                </div>
              )}

              <div
                className={`rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed flex items-start gap-1.5 ${
                  activeCloudChannel?.verified
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-amber-50 border-amber-200 text-amber-950'
                }`}
              >
                {activeCloudChannel?.verified ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  {activeCloudChannel ? (
                    <>
                      <div className="font-semibold">
                        {activeCloudChannel.label} · {activeCloudChannel.expiresHint}
                      </div>
                      <div>{activeCloudChannel.description}</div>
                    </>
                  ) : selectedMode === 'standalone_6kb' ? (
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        {tunnelState.status === 'ready' && tunnelState.url
                          ? '6KB 极速单文件审片页（自带抖音遮挡线与逐帧微调）。日常快速预览建议优先使用左侧「线路1 · 极速直链」。'
                          : '正在连接备用隧道... 推荐优先使用上方「生成 1080×1920 纯 MP4 直看二维码」。'}
                      </span>
                      <button
                        type="button"
                        onClick={() => void startOrRefreshTunnel(true)}
                        className="shrink-0 px-2 py-0.5 rounded bg-white border border-amber-300 text-[10px] font-semibold"
                      >
                        重连
                      </button>
                    </div>
                  ) : (
                    <span>
                      点击上方红色按钮 <strong>「生成 1080×1920 纯 MP4 直看二维码」</strong>，约 5~8 秒即可出码，手机扫码直接进入原生全屏播放（零跳转网页）。
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <a
            href={localTestUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-xs font-semibold text-neutral-800"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>电脑新标签模拟手机打开</span>
          </a>

          <div className="flex items-center gap-2">
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-semibold"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>直接播放此 MP4</span>
              </a>
            )}

            <button
              type="button"
              disabled={!previewUrl}
              onClick={handleCopyUrl}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copied ? '已复制 MP4 直链' : '复制 MP4 直链'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
