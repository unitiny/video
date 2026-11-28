import { useCallback, useEffect, useMemo, useState } from 'react';
import { QrCode } from 'lucide-react';
import { ART_ASSETS, INTEL_ASSETS, INTEL_V2_ASSETS, INTEL_V2_VIDEO_SAMPLE } from './video/theme';
import type { LoadedVideoImages } from './video/renderer/renderFrame';
import type { LoadedIntelImages } from './video/intel/renderIntelFrame';
import { loadRealVideoFrameCache } from './video/intelV2/videoFrameCache';
import type {
  EpisodeListItem,
  EpisodeManifest,
  LoadedEpisodeAssets,
} from './video/engine/schema';
import { collectEpisodeAssetSources } from './video/engine/timeline';
import { parseJsonResponseSafe } from './video/export/clientMp4Export';
import {
  VideoPlayerWorkspace,
  type StudioProjectMode,
} from './components/VideoPlayerWorkspace';
import { StoryboardView } from './components/StoryboardView';
import { BlueprintView } from './components/BlueprintView';
import { ExportModal } from './components/ExportModal';
import { MobileFullscreenPreview } from './components/MobileFullscreenPreview';
import {
  MobileQrPreviewModal,
  type UnifiedVideoTabItem,
} from './components/MobileQrPreviewModal';

type StudioTab = 'player' | 'storyboard' | 'blueprint';

const EMPTY_EPISODE_ASSETS: LoadedEpisodeAssets = {
  imagesBySrc: {},
  videoFramesBySrc: {},
  videosBySrc: {},
};

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function formatEpisodeTabLabel(ep: EpisodeListItem): string {
  const md = /^\d{4}-(\d{2})-(\d{2})/.exec(ep.date);
  const shortDate = md ? `${Number(md[1])}.${md[2]}` : ep.date;
  if (ep.versionTag) return `${shortDate} ${ep.versionTag}`;
  if (ep.id === '2026-11-26') return `${shortDate} 纯黑原版`;
  if (ep.id === '2026-11-20') return `${shortDate} 动态剧集`;
  return `${shortDate} ${ep.seriesTitle || ep.title}`.slice(0, 14);
}

const LEGACY_VIDEO_TABS: UnifiedVideoTabItem[] = [
  {
    key: 'mode:1120_v2',
    label: '11.20 盘前风向（v2 精修爆款版）',
    shortLabel: '11.20 v2 精修',
    projectMode: '1120_v2',
  },
  {
    key: 'mode:1120_intel',
    label: '11.20 盘前风向（v1 存档版）',
    shortLabel: '11.20 v1 存档',
    projectMode: '1120_intel',
  },
  {
    key: 'mode:1117_close',
    label: '11.17 收盘资金流向复刻',
    shortLabel: '1117 收盘复刻',
    projectMode: '1117_close',
  },
  {
    key: 'mode:morning_brief',
    label: '11.19 盘前早报模板',
    shortLabel: '1119 早报',
    projectMode: 'morning_brief',
  },
];

function readMobilePreviewParams(): {
  isMobile: boolean;
  episodeId?: string;
  mode?: StudioProjectMode;
} {
  if (typeof window === 'undefined') return { isMobile: false };
  const params = new URLSearchParams(window.location.search);
  const isMobile = params.get('mobile') === '1' || params.get('mobile') === 'true';
  if (!isMobile) return { isMobile: false };
  const ep = params.get('episode')?.trim() || undefined;
  const rawMode = params.get('mode')?.trim() as StudioProjectMode | undefined;
  const validModes: StudioProjectMode[] = [
    'episode',
    '1120_v2',
    '1120_intel',
    '1117_close',
    'morning_brief',
  ];
  const mode = rawMode && validModes.includes(rawMode) ? rawMode : ep ? 'episode' : 'episode';
  return { isMobile: true, episodeId: ep, mode };
}

export default function App() {
  const mobileParams = useMemo(() => readMobilePreviewParams(), []);
  if (mobileParams.isMobile) {
    return (
      <MobileFullscreenPreview
        episodeId={mobileParams.episodeId}
        mode={mobileParams.mode}
      />
    );
  }

  return <DesktopStudioApp />;
}

function DesktopStudioApp() {
  const [activeTab, setActiveTab] = useState<StudioTab>('player');
  const [projectMode, setProjectMode] = useState<StudioProjectMode>('episode');
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);
  const [images, setImages] = useState<LoadedVideoImages>({});
  const [intelImages, setIntelImages] = useState<LoadedIntelImages>({});

  const [episodes, setEpisodes] = useState<EpisodeListItem[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState<boolean>(true);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>('');
  const [activeEpisode, setActiveEpisode] = useState<EpisodeManifest | null>(null);
  const [episodeAssets, setEpisodeAssets] = useState<LoadedEpisodeAssets>(EMPTY_EPISODE_ASSETS);
  const [episodeReloadNonce, setEpisodeReloadNonce] = useState<number>(0);

  const refreshEpisodes = useCallback(async () => {
    setEpisodesLoading(true);
    try {
      const res = await fetch('/api/episodes', { cache: 'no-store' });
      const data = res.ok
        ? await parseJsonResponseSafe<{ episodes?: EpisodeListItem[] }>(res)
        : null;
      const list = Array.isArray(data?.episodes) ? data.episodes : [];

      if (list.length > 0) {
        setEpisodes(list);
        setSelectedEpisodeId((prev) =>
          prev && list.some((item) => item.id === prev) ? prev : list[0].id
        );
        setEpisodeReloadNonce((n) => n + 1);
      } else {
        setEpisodes([]);
        setSelectedEpisodeId('');
        setActiveEpisode(null);
        setProjectMode((prev) => (prev === 'episode' ? '1120_v2' : prev));
      }
    } catch {
      setEpisodes([]);
      setSelectedEpisodeId('');
      setActiveEpisode(null);
      setProjectMode((prev) => (prev === 'episode' ? '1120_v2' : prev));
    } finally {
      setEpisodesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshEpisodes();
  }, [refreshEpisodes]);

  // Load selected dynamic episode manifest
  useEffect(() => {
    if (!selectedEpisodeId) {
      setActiveEpisode(null);
      return;
    }

    let cancelled = false;
    async function loadEpisode() {
      try {
        const res = await fetch(`/api/episodes/${encodeURIComponent(selectedEpisodeId)}`, {
          cache: 'no-store',
        });
        const manifest = res.ok ? await parseJsonResponseSafe<EpisodeManifest>(res) : null;
        if (!cancelled) {
          if (manifest && Array.isArray(manifest.scenes) && manifest.scenes.length > 0) {
            setActiveEpisode(manifest);
          } else {
            setActiveEpisode(null);
            setProjectMode((prev) => (prev === 'episode' ? '1120_v2' : prev));
          }
        }
      } catch {
        if (!cancelled) {
          setActiveEpisode(null);
          setProjectMode((prev) => (prev === 'episode' ? '1120_v2' : prev));
        }
      }
    }
    void loadEpisode();
    return () => {
      cancelled = true;
    };
  }, [selectedEpisodeId, episodeReloadNonce]);

  // Load dynamic episode images & hook video frame caches in parallel
  useEffect(() => {
    if (!activeEpisode) {
      setEpisodeAssets(EMPTY_EPISODE_ASSETS);
      return;
    }

    let cancelled = false;
    const { imageSrcs, hookVideos } = collectEpisodeAssetSources(activeEpisode);
    setEpisodeAssets({ imagesBySrc: {}, videoFramesBySrc: {}, videosBySrc: {} });

    async function loadImages() {
      const entries = await Promise.all(
        imageSrcs.map(async (src) => [src, await loadImageElement(src)] as const)
      );
      if (!cancelled) {
        const imagesBySrc: Record<string, HTMLImageElement | null> = {};
        for (const [src, img] of entries) {
          imagesBySrc[src] = img;
        }
        setEpisodeAssets((prev) => ({
          ...prev,
          imagesBySrc: { ...prev.imagesBySrc, ...imagesBySrc },
        }));
      }
    }

    async function loadHookVideos() {
      await Promise.all(
        hookVideos.map(async (hv) => {
          const cache = await loadRealVideoFrameCache(
            hv.videoSrc,
            hv.sample.sampleCount,
            hv.sample.maxSec,
            hv.sample.outW,
            hv.sample.outH,
            (partial) => {
              if (!cancelled) {
                setEpisodeAssets((prev) => ({
                  ...prev,
                  videoFramesBySrc: {
                    ...prev.videoFramesBySrc,
                    [hv.videoSrc]: partial.frames,
                  },
                  videosBySrc: {
                    ...prev.videosBySrc,
                    [hv.videoSrc]: partial.video,
                  },
                }));
              }
            },
            hv.sample.minSec,
            hv.sample.cropCenterRatio
          );
          if (!cancelled) {
            setEpisodeAssets((prev) => ({
              ...prev,
              videoFramesBySrc: {
                ...prev.videoFramesBySrc,
                [hv.videoSrc]: cache.frames,
              },
              videosBySrc: {
                ...prev.videosBySrc,
                [hv.videoSrc]: cache.video,
              },
            }));
          }
        })
      );
    }

    void loadImages();
    void loadHookVideos();
    return () => {
      cancelled = true;
    };
  }, [activeEpisode]);

  useEffect(() => {
    let cancelled = false;
    async function loadVideo() {
      const videoCache = await loadRealVideoFrameCache(
        INTEL_V2_ASSETS.realKeyDayVideo,
        INTEL_V2_VIDEO_SAMPLE.sampleCount,
        INTEL_V2_VIDEO_SAMPLE.maxSec,
        INTEL_V2_VIDEO_SAMPLE.outW,
        INTEL_V2_VIDEO_SAMPLE.outH,
        (partial) => {
          if (!cancelled) {
            setIntelImages((prev) => ({
              ...prev,
              realKeyDayVideo: partial.video,
              realKeyDayFrames: partial.frames,
            }));
          }
        },
        INTEL_V2_VIDEO_SAMPLE.minSec,
        INTEL_V2_VIDEO_SAMPLE.cropCenterRatio
      );
      if (!cancelled) {
        setIntelImages((prev) => ({
          ...prev,
          realKeyDayVideo: videoCache.video,
          realKeyDayFrames: videoCache.frames,
        }));
      }
    }

    async function loadAll() {
      const [
        openArcher,
        noonSlap,
        twoSheep,
        lithographyHero,
        morningBrief,
        memeKeyDay,
        eventAnthropic,
        eventPcb,
        eventRobot,
        realNyseClap,
        realTraderGesturing,
        realTraderShocked,
        eventMuskRealKitchen,
        realKeyDayPoster,
      ] = await Promise.all([
        loadImageElement(ART_ASSETS.openArcher),
        loadImageElement(ART_ASSETS.noonSlap),
        loadImageElement(ART_ASSETS.twoSheep),
        loadImageElement(ART_ASSETS.lithographyHero),
        loadImageElement(ART_ASSETS.morningBrief),
        loadImageElement(INTEL_ASSETS.memeKeyDay),
        loadImageElement(INTEL_ASSETS.eventAnthropic),
        loadImageElement(INTEL_ASSETS.eventPcb),
        loadImageElement(INTEL_ASSETS.eventRobot),
        loadImageElement(INTEL_V2_ASSETS.realNyseClap),
        loadImageElement(INTEL_V2_ASSETS.realTraderGesturing),
        loadImageElement(INTEL_V2_ASSETS.realTraderShocked),
        loadImageElement(INTEL_V2_ASSETS.eventMuskRealKitchen),
        loadImageElement(INTEL_V2_ASSETS.realKeyDayPoster),
      ]);
      if (!cancelled) {
        setImages({ openArcher, noonSlap, twoSheep, lithographyHero, morningBrief });
        setIntelImages((prev) => ({
          ...prev,
          memeKeyDay,
          eventAnthropic,
          eventPcb,
          eventRobot,
          realNyseClap,
          realTraderGesturing,
          realTraderShocked,
          eventMuskRealKitchen,
          realKeyDayPoster,
        }));
      }
    }
    void loadVideo();
    void loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleJumpToFrame = (frame: number) => {
    setCurrentFrame(frame);
    setActiveTab('player');
  };

  const handleProjectModeChange = (mode: StudioProjectMode) => {
    setProjectMode(mode);
    setCurrentFrame(0);
    if (mode === 'episode' && episodes.length === 0) {
      void refreshEpisodes();
    }
  };

  const handleSelectEpisode = (episodeId: string) => {
    setSelectedEpisodeId(episodeId);
    setProjectMode('episode');
    setCurrentFrame(0);
  };

  const unifiedVideoTabs = useMemo<UnifiedVideoTabItem[]>(() => {
    const dynamicTabs: UnifiedVideoTabItem[] = episodes.map((ep) => ({
      key: `ep:${ep.id}`,
      label: `${ep.date} · ${ep.title}`,
      shortLabel: formatEpisodeTabLabel(ep),
      projectMode: 'episode',
      episodeId: ep.id,
    }));
    return [...dynamicTabs, ...LEGACY_VIDEO_TABS];
  }, [episodes]);

  const activeUnifiedTab = useMemo<UnifiedVideoTabItem>(() => {
    if (projectMode === 'episode' && selectedEpisodeId) {
      const matched = unifiedVideoTabs.find(
        (t) => t.projectMode === 'episode' && t.episodeId === selectedEpisodeId
      );
      if (matched) return matched;
    }
    const modeMatch = unifiedVideoTabs.find((t) => t.projectMode === projectMode);
    return modeMatch ?? unifiedVideoTabs[0];
  }, [unifiedVideoTabs, projectMode, selectedEpisodeId]);

  const handleSelectUnifiedTab = (tab: UnifiedVideoTabItem) => {
    if (tab.projectMode === 'episode' && tab.episodeId) {
      handleSelectEpisode(tab.episodeId);
    } else {
      handleProjectModeChange(tab.projectMode);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F3] text-[#141518]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-neutral-200">
        <div className="max-w-[1320px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#player"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('player');
            }}
            className="text-lg font-extrabold tracking-tight text-neutral-900 whitespace-nowrap shrink-0 font-display"
          >
            QuantReel Studio
          </a>

          <nav className="flex items-center gap-6" aria-label="主工作区导航">
            {(
              [
                { id: 'player', label: '逐帧播放器' },
                { id: 'storyboard', label: '分镜脚本' },
                { id: 'blueprint', label: '制作方案' },
              ] as const
            ).map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'border-[#C8342A] text-neutral-900'
                      : 'border-transparent text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsQrModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-900 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <QrCode className="w-3.5 h-3.5 text-[#C8342A]" />
              <span>手机扫码预览</span>
            </button>
            <button
              type="button"
              onClick={() => setIsExportOpen(true)}
              className="px-4 py-2 rounded-lg bg-[#C8342A] hover:bg-[#b02a21] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              导出 MP4 成品
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1320px] w-full mx-auto px-6 py-8">
        {activeTab === 'player' && (
          <VideoPlayerWorkspace
            projectMode={projectMode}
            onProjectModeChange={handleProjectModeChange}
            currentFrame={currentFrame}
            onFrameChange={setCurrentFrame}
            images={images}
            intelImages={intelImages}
            episodes={episodes}
            episodesLoading={episodesLoading}
            selectedEpisodeId={selectedEpisodeId}
            onSelectEpisode={handleSelectEpisode}
            onRefreshEpisodes={refreshEpisodes}
            activeEpisode={activeEpisode}
            episodeAssets={episodeAssets}
            unifiedTabs={unifiedVideoTabs}
            activeUnifiedTab={activeUnifiedTab}
            onSelectUnifiedTab={handleSelectUnifiedTab}
            onOpenQrPreview={() => setIsQrModalOpen(true)}
          />
        )}

        {activeTab === 'storyboard' && (
          <StoryboardView
            projectMode={projectMode}
            activeEpisode={activeEpisode}
            onJumpToFrame={handleJumpToFrame}
          />
        )}

        {activeTab === 'blueprint' && (
          <BlueprintView
            onApplyMorningBrief={() => {
              setProjectMode('1120_intel');
              setCurrentFrame(0);
              setActiveTab('player');
            }}
          />
        )}
      </main>

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        projectMode={projectMode}
        images={images}
        intelImages={intelImages}
        activeEpisode={activeEpisode}
        episodeAssets={episodeAssets}
      />

      <MobileQrPreviewModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        activeTab={activeUnifiedTab}
        allTabs={unifiedVideoTabs}
        onSelectTab={handleSelectUnifiedTab}
        activeEpisode={activeEpisode}
        episodeAssets={episodeAssets}
        images={images}
        intelImages={intelImages}
        episodes={episodes}
      />
    </div>
  );
}
