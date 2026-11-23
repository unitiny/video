import React from 'react';
import { PIPELINE_STRATEGY, TOOL_EVALUATION_MATRIX } from '../video/researchData';
import { DATA_MORNING_BRIEF } from '../video/data/fundFlowData';

interface BlueprintViewProps {
  onApplyMorningBrief: () => void;
}

export const BlueprintView: React.FC<BlueprintViewProps> = ({ onApplyMorningBrief }) => {
  return (
    <div className="space-y-8">
      {/* Core Strategy Card */}
      <section className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="text-xl font-bold text-neutral-900">
              深度调研方案：如何低 Token、高质量复刻并日更金融短视频
            </h2>
            <p className="text-sm text-neutral-700 mt-2 leading-relaxed">
              {PIPELINE_STRATEGY.summary}
            </p>
          </div>
          <button
            type="button"
            onClick={onApplyMorningBrief}
            className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
          >
            切到「盘前早报」实战成品
          </button>
        </div>

        {/* 3-Layer Cost & Token Savings Table */}
        <div className="overflow-x-auto pt-2">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                <th className="py-3 px-4">视频层级与帧数占比</th>
                <th className="py-3 px-4">传统全 AI 生成痛点</th>
                <th className="py-3 px-4">本方案工程实现</th>
                <th className="py-3 px-4 text-right">Token / 成本收益</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs">
              {PIPELINE_STRATEGY.tokenSavingsBreakdown.map((row) => (
                <tr key={row.layer} className="align-top">
                  <td className="py-3.5 px-4 font-semibold text-neutral-900">{row.layer}</td>
                  <td className="py-3.5 px-4 text-neutral-600 leading-relaxed">{row.traditionalAiVideo}</td>
                  <td className="py-3.5 px-4 text-neutral-800 leading-relaxed">{row.ourCodeSolution}</td>
                  <td className="py-3.5 px-4 text-right font-semibold text-[#C8342A] whitespace-nowrap">
                    {row.savingRate}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 18-Tool Ecosystem Evaluation */}
      <section className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-neutral-900">工具链调研与取舍矩阵（精选核心插件，拒绝冗余堆砌）</h3>
          <p className="text-xs text-neutral-500 mt-1">
            针对你列出的 18 个开源/创作工具做工程级筛选：把算力与工作流集中在真正决定成片一致性的环节。
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                <th className="py-3 px-4">工具 / 技能</th>
                <th className="py-3 px-4">定位职责</th>
                <th className="py-3 px-4 whitespace-nowrap">Token 消耗</th>
                <th className="py-3 px-4 whitespace-nowrap">采用状态</th>
                <th className="py-3 px-4">工程决策理由</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs">
              {TOOL_EVALUATION_MATRIX.map((tool) => (
                <tr key={tool.id} className="align-top hover:bg-neutral-50/70">
                  <td className="py-3 px-4 font-semibold text-neutral-900 whitespace-nowrap">{tool.name}</td>
                  <td className="py-3 px-4 text-neutral-700">{tool.role}</td>
                  <td className="py-3 px-4 font-mono-num text-neutral-600 whitespace-nowrap">{tool.tokenCost}</td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className={tool.adopted ? 'font-semibold text-[#2E8B64]' : 'text-neutral-400'}>
                      {tool.adopted ? '已内置采纳' : '按需扩展'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-neutral-600 leading-relaxed">{tool.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Morning Brief Data Mapping Proof */}
      <section className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-neutral-900">同款模板落地：盘前早报结构化数据（已接入第 2 套模板）</h3>
            <p className="text-xs text-neutral-500 mt-1">
              直接将「腾讯资本开支 814 亿 / 美联储沃勒 50bp / AI 补丁宕机引爆网络安全 / GTA6 预售 15 亿 / 水风光一体化」转化为逐帧动画数据。
            </p>
          </div>
          <span className="text-xs text-neutral-500 font-mono-num">
            {DATA_MORNING_BRIEF.attributionRows.length} 条热点事件 · {DATA_MORNING_BRIEF.stickers.length} 枚个股映射贴纸
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {DATA_MORNING_BRIEF.attributionRows.map((row) => (
            <div key={row.sector} className="border border-neutral-200 rounded-lg p-3.5 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-neutral-900">{row.sector}</span>
                <span
                  className={`text-xs font-mono-num font-semibold ${
                    row.sentiment === 'up'
                      ? 'text-[#C8342A]'
                      : row.sentiment === 'down'
                        ? 'text-[#2E8B64]'
                        : 'text-neutral-600'
                  }`}
                >
                  {row.limitCount}
                </span>
              </div>
              <div className="text-xs font-medium text-neutral-700">{row.leaders}</div>
              <div className="text-xs text-neutral-500">{row.reason}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
