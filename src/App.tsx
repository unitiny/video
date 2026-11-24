import { useCallback, useEffect, useState } from 'react';
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

export default function App() {
  const [activeTab, setActiveTab] = useState<StudioTab>('player');
  const [projectMode, setProjectMode] = useState<StudioProjectMode>('episode');
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
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

          <div className="shrink-0">
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
    </div>
  );
}
