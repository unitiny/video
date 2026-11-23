import { useEffect, useState } from 'react';
import { ART_ASSETS, INTEL_ASSETS, INTEL_V2_ASSETS, INTEL_V2_VIDEO_SAMPLE } from './video/theme';
import type { LoadedVideoImages } from './video/renderer/renderFrame';
import type { LoadedIntelImages } from './video/intel/renderIntelFrame';
import { loadRealVideoFrameCache } from './video/intelV2/videoFrameCache';
import {
  VideoPlayerWorkspace,
  type StudioProjectMode,
} from './components/VideoPlayerWorkspace';
import { StoryboardView } from './components/StoryboardView';
import { BlueprintView } from './components/BlueprintView';
import { ExportModal } from './components/ExportModal';

type StudioTab = 'player' | 'storyboard' | 'blueprint';

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
  const [projectMode, setProjectMode] = useState<StudioProjectMode>('1120_v2');
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [images, setImages] = useState<LoadedVideoImages>({});
  const [intelImages, setIntelImages] = useState<LoadedIntelImages>({});

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
          />
        )}

        {activeTab === 'storyboard' && (
          <StoryboardView projectMode={projectMode} onJumpToFrame={handleJumpToFrame} />
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
      />
    </div>
  );
}
