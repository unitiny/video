import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { SHOTS } from '../video/timeline';
import { ART_ASSETS, INTEL_ASSETS, INTEL_V2_ASSETS } from '../video/theme';
import { INTEL_SHOTS } from '../video/intel/intelTimeline';
import { INTEL_V2_SPEC } from '../video/intelV2/intelV2Data';
import { INTEL_V2_SHOTS } from '../video/intelV2/intelV2Timeline';
import type { StudioProjectMode } from './VideoPlayerWorkspace';

interface StoryboardViewProps {
  projectMode: StudioProjectMode;
  onJumpToFrame: (frame: number) => void;
}

export const StoryboardView: React.FC<StoryboardViewProps> = ({
  projectMode,
  onJumpToFrame,
}) => {
  if (projectMode === '1120_v2') {
    return (
      <div className="space-y-8">
        <section className="bg-white border border-neutral-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">
              11.20 v2 精修爆款版 · 「震撼实拍玩梗 × 全球日K分时拆解 × 聚光推演」{INTEL_V2_SHOTS.length} 段分镜
            </h2>
            <p className="text-sm text-neutral-600 mt-1">
              01 压缩至 2.6 秒极速开屏（抱头震惊实拍 + 52–54px 精炼核心数据弹幕 + 光刃清屏转场）；02 100% 核对实盘日K与全天真实分时并在 A50 展毕多停 1 秒；旧版保留在「11.20 v1 存档」中。
            </p>
          </div>
          <div className="text-xs text-neutral-500 font-mono-num">
            {INTEL_V2_SPEC.width} × {INTEL_V2_SPEC.height} · {INTEL_V2_SPEC.fps} fps · {INTEL_V2_SPEC.totalFrames} 帧 · {INTEL_V2_SPEC.durationSec.toFixed(2)}s · {INTEL_V2_SPEC.bpm} BPM
          </div>
        </section>

        <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                  <th className="py-3.5 px-4 whitespace-nowrap">段号</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">帧范围 / 时长</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">主题与核心文案</th>
                  <th className="py-3.5 px-4">高级动态设计（Vox / 财联社级）</th>
                  <th className="py-3.5 px-4">视觉降噪与重点提炼</th>
                  <th className="py-3.5 px-4 text-right whitespace-nowrap">预览定位</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-sm">
                {INTEL_V2_SHOTS.map((shot) => (
                  <tr key={shot.id} className="hover:bg-neutral-50/80 transition-colors align-top">
                    <td className="py-4 px-4 font-mono-num font-bold text-neutral-900 whitespace-nowrap">
                      {String(shot.index).padStart(2, '0')}
                    </td>
                    <td className="py-4 px-4 font-mono-num whitespace-nowrap">
                      <div className="font-semibold text-neutral-900">
                        {shot.startFrame}–{shot.endFrame} 帧
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {shot.startSec.toFixed(1)}s–{shot.endSec.toFixed(1)}s
                      </div>
                    </td>
                    <td className="py-4 px-4 min-w-[200px]">
                      <div className="font-semibold text-neutral-900">{shot.title}</div>
                      <div className="text-xs text-neutral-500 mt-1">{shot.subtitle}</div>
                    </td>
                    <td className="py-4 px-4 min-w-[220px]">
                      <div className="text-xs text-neutral-800 leading-relaxed">{shot.editorialCraft}</div>
                    </td>
                    <td className="py-4 px-4 min-w-[220px]">
                      <div className="text-xs font-medium text-[#C8342A] leading-relaxed">{shot.focusGoal}</div>
                    </td>
                    <td className="py-4 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onJumpToFrame(shot.startFrame)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-[#C8342A] hover:text-[#C8342A] text-xs font-medium text-neutral-700 transition-colors whitespace-nowrap shrink-0"
                      >
                        <span>跳至第 {shot.startFrame} 帧</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
          <div>
            <h3 className="text-base font-bold text-neutral-900">v2 震撼实拍视频与定制视觉（01 抱头震惊实拍 · 05 真人马斯克肖像）</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                title: '01 · 2.6秒「今天很关键」极速开屏',
                frame: 28,
                src: INTEL_V2_ASSETS.realKeyDayPoster,
                prompt: '抱头震惊连续实拍 + 5道 52–54px 精炼弹幕瞬时齐览 + 光刃清屏转场',
              },
              {
                title: '02 · 全球实盘日 K 与真实分时',
                frame: 478,
                src: INTEL_V2_ASSETS.realNyseClap,
                prompt: '纳指-5.28%/费半-10.73%→日韩→黄金-4.62%/天然气+3.44%→A50(-1.35%)多停1秒',
              },
              {
                title: '03 · Vox 方格纸抽血漏斗',
                frame: 573,
                src: INTEL_ASSETS.eventAnthropic,
                prompt: '纸面斜切贴片 + 分道无交叉流向箭头 + 荧光笔高光',
              },
              {
                title: '05 · 真人马斯克肖像厨房同框',
                frame: 873,
                src: INTEL_V2_ASSETS.eventMuskRealKitchen,
                prompt: '基于马斯克真实肖像生成 · 1–2月 / 11.25 / 12–18月时间轴',
              },
            ].map((item) => (
              <div key={item.title} className="border border-neutral-200 rounded-lg overflow-hidden flex flex-col">
                <div className="aspect-[3/4] bg-neutral-900 overflow-hidden">
                  <img
                    src={item.src}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-neutral-900">{item.title}</div>
                    <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">{item.prompt}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onJumpToFrame(item.frame)}
                    className="w-full py-1.5 rounded-md bg-neutral-100 hover:bg-neutral-200 text-xs font-medium text-neutral-800 transition-colors"
                  >
                    预览该幕画面
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  const isIntel = projectMode === '1120_intel';

  if (isIntel) {
    return (
      <div className="space-y-8">
        <section className="bg-white border border-neutral-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">
              11.20 盘前风向（v1 存档版）· 6 段分镜
            </h2>
            <p className="text-sm text-neutral-600 mt-1">
              旧版本完整归档：开篇真人定格梗抓人，交待隔夜美股、早8点日韩、富时A50与异动金油，三事件采用报纸头版、工程蓝图印章与漫画气泡。
            </p>
          </div>
          <div className="text-xs text-neutral-500 font-mono-num">
            1080 × 1920 · 30 fps · 900 帧 · 30.00s · 108 BPM 动感剪辑
          </div>
        </section>

        <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                  <th className="py-3.5 px-4 whitespace-nowrap">段号</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">帧范围 / 时长</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">主题与核心文案</th>
                  <th className="py-3.5 px-4">视觉风格与定制动效</th>
                  <th className="py-3.5 px-4">对股民的实战帮助</th>
                  <th className="py-3.5 px-4 text-right whitespace-nowrap">预览定位</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-sm">
                {INTEL_SHOTS.map((shot) => (
                  <tr key={shot.id} className="hover:bg-neutral-50/80 transition-colors align-top">
                    <td className="py-4 px-4 font-mono-num font-bold text-neutral-900 whitespace-nowrap">
                      {String(shot.index).padStart(2, '0')}
                    </td>
                    <td className="py-4 px-4 font-mono-num whitespace-nowrap">
                      <div className="font-semibold text-neutral-900">
                        {shot.startFrame}–{shot.endFrame} 帧
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {shot.startSec.toFixed(1)}s–{shot.endSec.toFixed(1)}s
                      </div>
                    </td>
                    <td className="py-4 px-4 min-w-[200px]">
                      <div className="font-semibold text-neutral-900">{shot.title}</div>
                      <div className="text-xs text-neutral-500 mt-1">{shot.subtitle}</div>
                    </td>
                    <td className="py-4 px-4 min-w-[220px]">
                      <div className="text-xs text-neutral-800 leading-relaxed">{shot.creativeHook}</div>
                    </td>
                    <td className="py-4 px-4 min-w-[220px]">
                      <div className="text-xs font-medium text-[#C8342A] leading-relaxed">{shot.traderValue}</div>
                    </td>
                    <td className="py-4 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onJumpToFrame(shot.startFrame)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-[#C8342A] hover:text-[#C8342A] text-xs font-medium text-neutral-700 transition-colors whitespace-nowrap shrink-0"
                      >
                        <span>跳至第 {shot.startFrame} 帧</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
          <div>
            <h3 className="text-base font-bold text-neutral-900">4 组差异化视觉原画（各配专属转场与版式）</h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              分别采用真人反应剧照、纽约客版画插图、深蓝微距工程对比图与暖阳人物漫画肖像，绝不复用同套排版。
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                title: '01 · 「今天很关键」真人反应梗',
                frame: 18,
                src: INTEL_ASSETS.memeKeyDay,
                prompt: '睡衣西装绿屏瞳孔地震 · 0.6s 爆字定格闪白',
              },
              {
                title: '03 · 金融报纸头版抽血插画',
                frame: 280,
                src: INTEL_ASSETS.eventAnthropic,
                prompt: 'Anthropic 巨无霸吸金 · 斜切纸面进入 + 红笔划线',
              },
              {
                title: '04 · PCB 缺货 vs 空箱工程图',
                frame: 450,
                src: INTEL_ASSETS.eventPcb,
                prompt: '左右对比一眼识真伪 · 物理印章砸落排雷京蓝',
              },
              {
                title: '05 · 马斯克洗碗机器人肖像',
                frame: 600,
                src: INTEL_ASSETS.eventRobot,
                prompt: '厨房阳光漫画肖像 · 弹跳对话气泡 + 催化进度条',
              },
            ].map((item) => (
              <div key={item.title} className="border border-neutral-200 rounded-lg overflow-hidden flex flex-col">
                <div className="aspect-[3/4] bg-neutral-900 overflow-hidden">
                  <img
                    src={item.src}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-neutral-900">{item.title}</div>
                    <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">{item.prompt}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onJumpToFrame(item.frame)}
                    className="w-full py-1.5 rounded-md bg-neutral-100 hover:bg-neutral-200 text-xs font-medium text-neutral-800 transition-colors"
                  >
                    预览该幕画面
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="bg-white border border-neutral-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">1117 逐帧复刻 · 10段硬切分镜脚本</h2>
          <p className="text-sm text-neutral-600 mt-1">
            严格对齐原片实测硬切点位（97 / 166 / 213 / 272 / 342 / 440 / 496 / 556 / 609），全片共 668 帧（22.27 秒）。
          </p>
        </div>
        <div className="text-xs text-neutral-500 font-mono-num">
          1080 × 2352 · 30 fps · 129.2 BPM · 2.0–3.0s 气口
        </div>
      </section>

      <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                <th className="py-3.5 px-4 whitespace-nowrap">镜号</th>
                <th className="py-3.5 px-4 whitespace-nowrap">帧范围 / 时长</th>
                <th className="py-3.5 px-4 whitespace-nowrap">画面主题与核心文案</th>
                <th className="py-3.5 px-4">技术实现与动效缓动</th>
                <th className="py-3.5 px-4">音频节拍与 AI 素材提示词</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap">预览定位</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-sm">
              {SHOTS.map((shot) => (
                <tr key={shot.id} className="hover:bg-neutral-50/80 transition-colors align-top">
                  <td className="py-4 px-4 font-mono-num font-bold text-neutral-900 whitespace-nowrap">
                    {String(shot.index).padStart(2, '0')}
                  </td>
                  <td className="py-4 px-4 font-mono-num whitespace-nowrap">
                    <div className="font-semibold text-neutral-900">
                      {shot.startFrame}–{shot.endFrame} 帧
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      {shot.startSec.toFixed(2)}s–{shot.endSec.toFixed(2)}s
                    </div>
                  </td>
                  <td className="py-4 px-4 min-w-[200px]">
                    <div className="font-semibold text-neutral-900">{shot.title}</div>
                    <div className="text-xs text-neutral-500 mt-1">{shot.subtitle}</div>
                  </td>
                  <td className="py-4 px-4 min-w-[240px]">
                    <div className="text-xs font-semibold text-neutral-800">{shot.implementation}</div>
                    <div className="text-xs text-neutral-600 mt-1 leading-relaxed">{shot.motionNotes}</div>
                  </td>
                  <td className="py-4 px-4 min-w-[240px]">
                    <div className="text-xs text-neutral-700">{shot.audioCue}</div>
                    <div className="text-xs text-neutral-500 mt-1">素材：{shot.aiPrompt}</div>
                  </td>
                  <td className="py-4 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onJumpToFrame(shot.startFrame)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-[#C8342A] hover:text-[#C8342A] text-xs font-medium text-neutral-700 transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>跳至第 {shot.startFrame} 帧</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-neutral-900">1117 复刻素材库</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { title: 'Shot 01 · 建筑工拉弓', frame: 0, src: ART_ASSETS.openArcher },
            { title: 'Shot 02 · 午盘拉满打脸', frame: 97, src: ART_ASSETS.noonSlap },
            { title: 'Shot 04 · 两只羊撑住', frame: 213, src: ART_ASSETS.twoSheep },
            { title: 'Shot 09 · 光刻机撑住', frame: 556, src: ART_ASSETS.lithographyHero },
            { title: 'Template · 盘前早报', frame: 0, src: ART_ASSETS.morningBrief },
          ].map((item) => (
            <div key={item.title} className="border border-neutral-200 rounded-lg overflow-hidden flex flex-col">
              <div className="aspect-[3/4] bg-neutral-100 overflow-hidden">
                <img src={item.src} alt={item.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              </div>
              <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                <div className="text-xs font-bold text-neutral-900">{item.title}</div>
                <button
                  type="button"
                  onClick={() => onJumpToFrame(item.frame)}
                  className="w-full py-1.5 rounded-md bg-neutral-100 hover:bg-neutral-200 text-xs font-medium text-neutral-800 transition-colors"
                >
                  预览分镜效果
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
