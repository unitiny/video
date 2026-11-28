function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface StandaloneMobilePlayerOptions {
  title: string;
  videoUrl: string;
  downloadUrl: string;
  fps: number;
  sizeBytes: number;
  width?: number;
  height?: number;
}

/**
 * Pure standalone HTML5 fullscreen mobile video player served directly by Express.
 * Zero Vite, zero React, zero external fonts/CDNs — loads in 1 single HTTP request on Douyin,
 * WeChat, iOS Safari, and Android Chrome.
 */
export function renderStandaloneMobilePlayerHtml(opts: StandaloneMobilePlayerOptions): string {
  const safeTitle = escapeHtml(opts.title);
  const safeVideoUrl = escapeHtml(opts.videoUrl);
  const safeDownloadUrl = escapeHtml(opts.downloadUrl);
  const fps = Math.max(1, Math.round(opts.fps || 30));
  const sizeMb = (opts.sizeBytes / (1024 * 1024)).toFixed(2);
  const resTag = opts.width && opts.height ? `${opts.width}×${opts.height} · ` : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="theme-color" content="#000000" />
  <title>${safeTitle} — 全屏审片</title>
  <style>
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0}
    html,body{width:100%;height:100%;background:#000;color:#fff;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif;user-select:none}
    .stage{position:fixed;inset:0;width:100vw;height:100dvh;background:#000;overflow:hidden}
    video{width:100%;height:100%;display:block;object-fit:cover;background:#000}
    video.contain{object-fit:contain}
    .overlay{position:fixed;inset:0;z-index:20;background:rgba(0,0,0,.45);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center}
    .overlay.hide{display:none}
    .play-big{width:80px;height:80px;border-radius:999px;border:none;background:#fff;color:#0a0a0a;font-size:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 12px 32px rgba(0,0,0,.55);padding-left:5px}
    .play-big:active{transform:scale(.94)}
    .ov-title{font-size:16px;font-weight:700;text-shadow:0 2px 10px rgba(0,0,0,.8)}
    .ov-sub{font-size:12px;color:#fcd34d}
    .ov-note{font-size:11px;color:rgba(255,255,255,.7)}
    .top-bar{position:fixed;left:0;right:0;top:0;z-index:15;padding:max(12px,env(safe-area-inset-top)) 14px 26px;background:linear-gradient(to bottom,rgba(0,0,0,.78),rgba(0,0,0,0));display:flex;align-items:center;justify-content:space-between;gap:10px;pointer-events:none;transition:opacity .2s}
    .top-title{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .frame-pill{font-size:11px;font-variant-numeric:tabular-nums;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.18);padding:4px 8px;border-radius:8px;white-space:nowrap}
    .hud{position:fixed;left:0;right:0;bottom:0;z-index:15;padding:28px 14px max(14px,env(safe-area-inset-bottom));background:linear-gradient(to top,rgba(0,0,0,.92),rgba(0,0,0,.7) 65%,rgba(0,0,0,0));display:flex;flex-direction:column;gap:10px;transition:opacity .2s}
    .hud.hide,.top-bar.hide{opacity:0;pointer-events:none}
    .scrub-row{display:flex;align-items:center;gap:8px}
    .time-txt{font-size:11px;font-variant-numeric:tabular-nums;color:rgba(255,255,255,.9);width:44px;flex-shrink:0}
    .time-txt.r{text-align:right;color:rgba(255,255,255,.65)}
    input[type=range]{flex:1;accent-color:#fbbf24;height:6px;cursor:pointer}
    .btn-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px}
    .grp{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .btn{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.12);color:#fff;border-radius:999px;padding:7px 11px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:4px}
    .btn:active{background:rgba(255,255,255,.25)}
    .btn.primary{background:#fff;color:#0a0a0a;border-color:#fff;padding:7px 14px;font-weight:700}
    .btn.gold{background:#fbbf24;color:#0a0a0a;border-color:#fbbf24;font-weight:700}
    .btn.on{background:rgba(16,185,129,.35);border-color:#34d399;color:#d1fae5}
    .safe-zone{position:fixed;inset:0;z-index:10;pointer-events:none;display:none}
    .safe-zone.show{display:block}
    .sz-top{position:absolute;top:0;left:0;right:0;height:5.6%;background:rgba(239,68,68,.24);border-bottom:1px dashed #f87171;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fee2e2}
    .sz-bot{position:absolute;bottom:0;left:0;right:0;height:17.7%;background:rgba(239,68,68,.24);border-top:1px dashed #f87171;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fee2e2}
    .sz-right{position:absolute;right:0;top:44.8%;bottom:17.7%;width:13.3%;background:rgba(249,115,22,.24);border-left:1px dashed #fb923c;display:flex;flex-direction:column;align-items:center;justify-content:space-around;padding:12px 0}
    .sz-dot{width:28px;height:28px;border-radius:999px;background:rgba(0,0,0,.6);border:1px solid #fdba74;color:#ffedd5;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}
    .hint{font-size:11px;color:#fcd34d;text-align:center;display:none}
    .hint.show{display:block}
  </style>
</head>
<body>
  <div class="stage" id="stage">
    <video id="vid" src="${safeVideoUrl}" playsinline webkit-playsinline="true" x5-playsinline="true" x5-video-player-type="h5-page" preload="auto"></video>

    <div class="safe-zone" id="safeZone">
      <div class="sz-top">顶部状态栏禁区</div>
      <div class="sz-bot">抖音底部文案与进度条遮挡区</div>
      <div class="sz-right">
        <span class="sz-dot">赞</span><span class="sz-dot">评</span><span class="sz-dot">藏</span><span class="sz-dot">转</span>
      </div>
    </div>

    <div class="overlay" id="startOverlay">
      <button class="play-big" id="startBtn" aria-label="开始全屏播放">▶</button>
      <div class="ov-title">${safeTitle}</div>
      <div class="ov-sub">轻点播放抖音全屏原画（${resTag}含完整立体声 · ${sizeMb} MB）</div>
      <div class="ov-note">原生 H.264 1080P 硬件解码 · 支持逐帧检查与一键存相册</div>
    </div>

    <div class="top-bar hide" id="topBar">
      <div class="top-title">${safeTitle}</div>
      <div class="frame-pill" id="framePill">帧 0000</div>
    </div>

    <div class="hud hide" id="hud">
      <div class="hint" id="hint"></div>
      <div class="scrub-row">
        <span class="time-txt" id="curTime">0.00s</span>
        <input type="range" id="scrubber" min="0" max="1000" step="1" value="0" />
        <span class="time-txt r" id="durTime">0.0s</span>
      </div>
      <div class="btn-row">
        <div class="grp">
          <button class="btn primary" id="playBtn">暂停</button>
          <button class="btn" id="prevFrameBtn">-1帧</button>
          <button class="btn" id="nextFrameBtn">+1帧</button>
          <button class="btn" id="replayBtn">重播</button>
          <button class="btn" id="muteBtn">有声</button>
        </div>
        <div class="grp">
          <button class="btn" id="speedBtn">1×</button>
          <button class="btn" id="safeBtn">抖音遮挡</button>
          <button class="btn" id="fitBtn">铺满</button>
          <a class="btn gold" href="${safeDownloadUrl}" download>存MP4</a>
        </div>
      </div>
    </div>
  </div>
  <script>
    (function(){
      var FPS = ${fps};
      var vid = document.getElementById('vid');
      var stage = document.getElementById('stage');
      var overlay = document.getElementById('startOverlay');
      var startBtn = document.getElementById('startBtn');
      var topBar = document.getElementById('topBar');
      var hud = document.getElementById('hud');
      var framePill = document.getElementById('framePill');
      var curTime = document.getElementById('curTime');
      var durTime = document.getElementById('durTime');
      var scrubber = document.getElementById('scrubber');
      var playBtn = document.getElementById('playBtn');
      var prevFrameBtn = document.getElementById('prevFrameBtn');
      var nextFrameBtn = document.getElementById('nextFrameBtn');
      var replayBtn = document.getElementById('replayBtn');
      var muteBtn = document.getElementById('muteBtn');
      var speedBtn = document.getElementById('speedBtn');
      var safeBtn = document.getElementById('safeBtn');
      var safeZone = document.getElementById('safeZone');
      var fitBtn = document.getElementById('fitBtn');
      var hint = document.getElementById('hint');
      var started = false, hudVisible = false, hideTimer = null, speeds = [0.5, 1, 1.5], spIdx = 1;

      if (window.innerWidth > window.innerHeight) {
        vid.classList.add('contain');
        fitBtn.textContent = '完整帧';
      }

      function showHud(autoHide) {
        hudVisible = true;
        topBar.classList.remove('hide');
        hud.classList.remove('hide');
        if (hideTimer) clearTimeout(hideTimer);
        if (autoHide && !vid.paused) {
          hideTimer = setTimeout(function(){
            if (!vid.paused) {
              hudVisible = false;
              topBar.classList.add('hide');
              hud.classList.add('hide');
            }
          }, 2600);
        }
      }

      function syncUi() {
        var t = vid.currentTime || 0;
        var d = isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 0;
        curTime.textContent = t.toFixed(2) + 's';
        durTime.textContent = d.toFixed(1) + 's';
        var f = Math.round(t * FPS);
        var tf = Math.max(1, Math.round(d * FPS));
        framePill.textContent = '帧 ' + String(f).padStart(4,'0') + ' / ' + tf;
        if (d > 0) {
          scrubber.max = String(tf);
          scrubber.value = String(Math.min(tf, f));
        }
        playBtn.textContent = vid.paused ? (d > 0 && t >= d - 0.08 ? '重播' : '继续') : '暂停';
        muteBtn.textContent = vid.muted ? '已静音' : '有声';
      }

      function startPlay(fromZero) {
        started = true;
        overlay.classList.add('hide');
        if (fromZero) vid.currentTime = 0;
        var p = vid.play();
        if (p && p.then) {
          p.then(function(){
            hint.classList.remove('show');
            syncUi();
            showHud(true);
          }).catch(function(){
            vid.muted = true;
            hint.textContent = '系统拦截自动发声，已静音播放，点下方「已静音」恢复声音';
            hint.classList.add('show');
            vid.play().catch(function(){});
            syncUi();
            showHud(false);
          });
        } else {
          syncUi();
          showHud(true);
        }
      }

      startBtn.addEventListener('click', function(e){ e.stopPropagation(); startPlay(false); });
      overlay.addEventListener('click', function(){ startPlay(false); });
      hud.addEventListener('click', function(e){ e.stopPropagation(); });

      stage.addEventListener('click', function(){
        if (!started) { startPlay(false); return; }
        if (vid.paused) { startPlay(false); return; }
        if (hudVisible) {
          hudVisible = false;
          topBar.classList.add('hide');
          hud.classList.add('hide');
        } else {
          showHud(true);
        }
      });

      playBtn.addEventListener('click', function(){
        if (vid.paused) {
          var d = vid.duration || 0;
          startPlay(d > 0 && vid.currentTime >= d - 0.08);
        } else {
          vid.pause();
          syncUi();
          showHud(false);
        }
      });

      prevFrameBtn.addEventListener('click', function(){
        vid.pause();
        vid.currentTime = Math.max(0, (vid.currentTime || 0) - 1 / FPS);
        syncUi();
        showHud(false);
      });

      nextFrameBtn.addEventListener('click', function(){
        vid.pause();
        var d = vid.duration || 9999;
        vid.currentTime = Math.min(d, (vid.currentTime || 0) + 1 / FPS);
        syncUi();
        showHud(false);
      });

      replayBtn.addEventListener('click', function(){ startPlay(true); });
      muteBtn.addEventListener('click', function(){ vid.muted = !vid.muted; syncUi(); });
      speedBtn.addEventListener('click', function(){
        spIdx = (spIdx + 1) % speeds.length;
        vid.playbackRate = speeds[spIdx];
        speedBtn.textContent = speeds[spIdx] + '×';
      });
      safeBtn.addEventListener('click', function(){
        var on = safeZone.classList.toggle('show');
        safeBtn.classList.toggle('on', on);
      });
      fitBtn.addEventListener('click', function(){
        var isContain = vid.classList.toggle('contain');
        fitBtn.textContent = isContain ? '完整帧' : '铺满';
      });

      scrubber.addEventListener('input', function(){
        vid.pause();
        vid.currentTime = Number(scrubber.value) / FPS;
        syncUi();
        showHud(false);
      });

      vid.addEventListener('loadedmetadata', syncUi);
      vid.addEventListener('timeupdate', syncUi);
      vid.addEventListener('pause', function(){ syncUi(); showHud(false); });
      vid.addEventListener('ended', function(){ syncUi(); showHud(false); });
    })();
  </script>
</body>
</html>`;
}
