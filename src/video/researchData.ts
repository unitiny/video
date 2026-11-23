export interface ToolAssessment {
  id: number;
  name: string;
  role: string;
  tokenCost: '0 Token（纯代码）' | '极低（仅关键帧）' | '辅助分析/音频';
  adopted: boolean;
  reason: string;
}

export const PIPELINE_STRATEGY = {
  summary:
    '「70% 确定性代码渲染 + 30% AI关键帧插画 + 节拍驱动合成」：把每帧都用视频大模型生成（高Token、文字乱码、数字漂移）彻底替换为「结构化数据JSON → Remotion/Canvas2D 逐像素图表长图 → 4张低成本AI静帧梗图 + 代码2.5D动效 → FFmpeg 音画压制」，单条视频AI消耗降低 92% 以上，同时实现 100% 字体锐利与数值精准。',
  tokenSavingsBreakdown: [
    {
      layer: '资金流向折线图 & 收盘归因表（约 460 帧 / 69%）',
      traditionalAiVideo: '使用图生视频/文生视频反复抽卡，汉字乱码、坐标漂移、单条消耗数万Token/高算力费',
      ourCodeSolution: 'Canvas2D / Remotion 纯代码驱动 JSON 曲线数据，0 AI 视频 Token，支持 1px 级坐标对齐与实时换数日更',
      savingRate: '节省 100% 视频生成成本',
    },
    {
      layer: '3秒开场 + 3张情绪插画（约 208 帧 / 31%）',
      traditionalAiVideo: '直接生成 4 段 3 秒 AI 视频（I2V/T2V），不可控且难以对齐 129.2 BPM 硬切节拍',
      ourCodeSolution: '仅生成 4 张高表现力 3:4 静态梗图，配合代码 SVG 拉弓飞箭、14 枚弹簧贴纸与镜头震动合成动效',
      savingRate: '节省 88% 生图/生视频成本',
    },
    {
      layer: '129.2 BPM BGM + 2.0-3.0s 气口 + 8处 Whoosh',
      traditionalAiVideo: '购买商用版权曲库或反复用 AI 音乐生成再手动剪卡点',
      ourCodeSolution: 'librosa 分析参考 BPM 与段落能量包络后，纯数学 PCM 合成无版权电子节奏与毫秒级转场音效',
      savingRate: '0 版权风险 · 帧级精确卡点',
    },
  ],
};

export const TOOL_EVALUATION_MATRIX: ToolAssessment[] = [
  {
    id: 1,
    name: 'Remotion Skills + Canvas2D',
    role: '核心视频时间线与逐帧渲染引擎',
    tokenCost: '0 Token（纯代码）',
    adopted: true,
    reason: 'React/Canvas 帧函数完全决定画面，硬切点（97/166/213/272/440/496/556/609）零误差，适合日更金融数据模板化复用。',
  },
  {
    id: 2,
    name: 'FFmpeg (libx264 + AAC)',
    role: '最终无损封装与音画混流',
    tokenCost: '0 Token（纯代码）',
    adopted: true,
    reason: '将 668 张 1080×2352 帧序列与 44.1kHz 立体声 WAV 合成标准抖音竖屏 MP4（crf 18，高清晰低体积）。',
  },
  {
    id: 3,
    name: 'librosa + 纯数字PCM合成',
    role: 'BPM 节拍提取与无版权卡点音轨',
    tokenCost: '0 Token（纯代码）',
    adopted: true,
    reason: '复刻 129.2 BPM、2.0–3.0s 1秒气口及 8 处硬切 Whoosh，避免商用音乐侵权与人手剪辑对齐误差。',
  },
  {
    id: 4,
    name: 'motion-design-skill',
    role: '时序缓动规范（easeOutBack / Spring）',
    tokenCost: '0 Token（纯代码）',
    adopted: true,
    reason: '统一管理 14 只个股贴纸、ETF 卡片弹出与弓弦张力的物理回弹曲线，消除生硬匀速线性运动。',
  },
  {
    id: 5,
    name: 'reanimate & anidoodle',
    role: '矢量路径与涂鸦循环（SVG 弓箭/飞雪）',
    tokenCost: '0 Token（纯代码）',
    adopted: true,
    reason: '在 AI 静态底图上叠加程序化矢量弓弦形变、飞箭破空与暴风雪粒子，让静帧“活起来”。',
  },
  {
    id: 6,
    name: 'Gemini Image / 关键帧生图',
    role: '高冲击力情绪梗图（4张静帧）',
    tokenCost: '极低（仅关键帧）',
    adopted: true,
    reason: '只生成「建筑工拉弓」「午后打脸」「两只羊撑盘」「光刻机机甲」4 张无文字梗图，文字全交由代码叠加。',
  },
  {
    id: 7,
    name: 'WhisperX',
    role: '口播短视频毫秒级字幕对齐',
    tokenCost: '辅助分析/音频',
    adopted: false,
    reason: '本片为纯视觉大字报+BGM无口播型（靠视觉大字和节拍驱动）；若拓展早报口播版可直接接入逐字高亮字幕。',
  },
  {
    id: 8,
    name: 'Tweakpane',
    role: '实时调参面板（曲线张力/字体大小）',
    tokenCost: '0 Token（纯代码）',
    adopted: true,
    reason: '在本工作台中直接体现为分镜跳转、帧步进与双模板切换（1117收盘 / 盘前早报），所见即所得调试。',
  },
  {
    id: 9,
    name: 'mg-styles-15 / motionmaxxing',
    role: '动效风格提示词与视觉精修规范',
    tokenCost: '辅助分析/音频',
    adopted: true,
    reason: '用于规范硬切前 3 帧预备动作、白色描边标签对比度与金融红绿语义一致性。',
  },
  {
    id: 10,
    name: 'Three.quarks / Blender / Manim',
    role: '重型3D粒子与数学动画引擎',
    tokenCost: '0 Token（纯代码）',
    adopted: false,
    reason: '杀鸡焉用牛刀：金融曲线属 2D 高频平面排版，Canvas2D 渲染速度比 Blender/3D 快 20 倍以上，更符合省Token与日更效率目标。',
  },
];
