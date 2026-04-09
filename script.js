/**
 * プチプチASMR - script.js (Renewed)
 *
 * Canvas 2D + 動的光源 + GSAPアニメーション + Web Audio API
 * - 泡ごとにリアルなプラスチック/ガラス質感をCanvasで描画
 * - マウス/タッチ位置を光源として全泡のハイライトが動的変化
 * - スクイッシュ&ストレッチ物理アニメーション（GSAP）
 * - 周辺泡への衝撃波伝播
 * - 気泡飛散エフェクト
 * - 空気が抜けるリアルな音（Web Audio API）
 */

(function () {
  'use strict';

  /* ======================================================
     定数・設定
  ====================================================== */
  const GAP        = 7;
  const MIN_SIZE   = 38;
  const MAX_SIZE   = 70;
  const COLS_TARGET = 6;
  const SHEET_PAD  = 14;

  // 泡のカラーパレット（プラスチック半透明の青系）
  const BUBBLE_COLORS = [
    { h: 210, s: 80, l: 75 },  // 青
    { h: 195, s: 75, l: 72 },  // シアン寄り
    { h: 220, s: 70, l: 78 },  // 薄い青紫
    { h: 200, s: 85, l: 70 },  // 水色
    { h: 230, s: 65, l: 80 },  // ラベンダー
  ];

  /* ======================================================
     状態
  ====================================================== */
  let canvas, ctx;
  let bubbles = [];       // Bubble オブジェクトの配列
  let cols, rows, bubbleSize;
  let sheetX, sheetY, sheetW, sheetH;
  let totalBubbles = 0;
  let poppedCount  = 0;
  let animFrameId  = null;

  // 光源位置（マウス/タッチで動的に変わる）
  let lightX = 0.35;  // 0〜1 正規化座標
  let lightY = 0.25;

  /* ======================================================
     Bubble クラス
  ====================================================== */
  class Bubble {
    constructor(col, row, x, y, size, colorIndex) {
      this.col   = col;
      this.row   = row;
      this.x     = x;  // 中心座標
      this.y     = y;
      this.size  = size;
      this.r     = size / 2;
      this.colorIndex = colorIndex;

      // 状態
      this.popped  = false;
      this.popping = false;

      // アニメーション用スケール (GSAPで操作)
      this.scaleX  = 1;
      this.scaleY  = 1;
      this.alpha   = 1;

      // 揺れ用（衝撃波）
      this.wobble  = 0;  // -1〜1 の揺れ係数

      // ランダムオフセット（同じに見えないように）
      this.shimmer = Math.random();  // ハイライト微妙にずらす
      this.baseAlpha = 0.82 + Math.random() * 0.15;
    }

    draw(ctx, lx, ly) {
      if (this.popped && this.alpha <= 0.01) return;

      const x = this.x + this.wobble * 3;
      const y = this.y;
      const rx = this.r * this.scaleX;
      const ry = this.r * this.scaleY;

      ctx.save();
      ctx.translate(x, y);

      if (this.popped) {
        this.drawPopped(ctx, rx, ry);
      } else {
        this.drawIntact(ctx, rx, ry, lx, ly);
      }

      ctx.restore();
    }

    drawIntact(ctx, rx, ry, lx, ly) {
      // 光源方向ベクトル（canvas座標 → 正規化）
      const canvasW = canvas.width;
      const canvasH = canvas.height;
      // 光源の絶対座標
      const absLx = lx * canvasW;
      const absLy = ly * canvasH;
      // 泡から光源への方向（正規化）
      const dx = absLx - this.x;
      const dy = absLy - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ndx = dx / dist;
      const ndy = dy / dist;

      // --- 1. 外側のドロップシャドウ（深み） ---
      ctx.shadowColor = 'rgba(80, 110, 160, 0.35)';
      ctx.shadowBlur  = rx * 0.6;
      ctx.shadowOffsetX = ndx * -2;
      ctx.shadowOffsetY = ndy * -2 + 3;

      // --- 2. ベース（プラスチック半透明ボディ） ---
      const col = BUBBLE_COLORS[this.colorIndex];
      // 楕円でスクイッシュ表現
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);

      // ラジアルグラデーション：光源方向に明るく
      const gx = ndx * rx * 0.5;
      const gy = ndy * ry * 0.5;
      const bodyGrad = ctx.createRadialGradient(gx, gy, 0, 0, 0, rx * 1.1);
      bodyGrad.addColorStop(0,   `hsla(${col.h}, ${col.s}%, ${col.l + 12}%, ${this.baseAlpha})`);
      bodyGrad.addColorStop(0.4, `hsla(${col.h}, ${col.s}%, ${col.l}%, ${this.baseAlpha * 0.9})`);
      bodyGrad.addColorStop(1,   `hsla(${col.h + 10}, ${col.s - 10}%, ${col.l - 20}%, ${this.baseAlpha * 0.7})`);
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur  = 0;

      // --- 3. 縁のリング（プラスチックの厚み感） ---
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      const edgeGrad = ctx.createLinearGradient(-rx, -ry, rx, ry);
      edgeGrad.addColorStop(0,   `hsla(${col.h}, 60%, 95%, 0.9)`);
      edgeGrad.addColorStop(0.5, `hsla(${col.h}, 50%, 80%, 0.4)`);
      edgeGrad.addColorStop(1,   `hsla(${col.h + 15}, 40%, 55%, 0.8)`);
      ctx.strokeStyle = edgeGrad;
      ctx.lineWidth = rx * 0.07;
      ctx.stroke();

      // --- 4. 内側のフレネル（縁が明るい屈折光） ---
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 0.88, ry * 0.88, 0, 0, Math.PI * 2);
      const innerGrad = ctx.createRadialGradient(0, 0, rx * 0.55, 0, 0, rx * 0.88);
      innerGrad.addColorStop(0,   'rgba(255,255,255,0)');
      innerGrad.addColorStop(0.7, 'rgba(255,255,255,0)');
      innerGrad.addColorStop(1,   'rgba(255,255,255,0.18)');
      ctx.fillStyle = innerGrad;
      ctx.fill();

      // --- 5. メインハイライト（光源方向の光沢） ---
      // 光源方向にオフセットした楕円ハイライト
      const hlx = ndx * rx * 0.32 - rx * 0.08 + this.shimmer * 4 - 2;
      const hly = ndy * ry * 0.32 - ry * 0.18;
      const hlW = rx * 0.38;
      const hlH = ry * 0.22;

      ctx.save();
      ctx.clip(); // 泡の外に出ないようにclip（already in beginPath... need new clip path）
      ctx.restore();

      // clip用パスを再設定
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.clip();

      // メインハイライト楕円
      ctx.beginPath();
      ctx.ellipse(hlx, hly, hlW, hlH, Math.atan2(ndy, ndx) + Math.PI / 2, 0, Math.PI * 2);
      const hlGrad = ctx.createRadialGradient(hlx, hly, 0, hlx, hly, hlW);
      hlGrad.addColorStop(0,   'rgba(255,255,255,0.92)');
      hlGrad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
      hlGrad.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.fillStyle = hlGrad;
      ctx.fill();

      // --- 6. サブハイライト（副光源 / 下側の照り返し） ---
      const sl2x = -ndx * rx * 0.3;
      const sl2y = ry * 0.4;
      ctx.beginPath();
      ctx.ellipse(sl2x, sl2y, rx * 0.28, ry * 0.14, 0, 0, Math.PI * 2);
      const subGrad = ctx.createRadialGradient(sl2x, sl2y, 0, sl2x, sl2y, rx * 0.28);
      subGrad.addColorStop(0,   'rgba(255,255,255,0.45)');
      subGrad.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.fillStyle = subGrad;
      ctx.fill();

      // --- 7. 下部の薄い影（地面への投影感） ---
      const darkGrad = ctx.createRadialGradient(0, ry * 0.5, 0, 0, ry * 0.5, rx * 0.9);
      darkGrad.addColorStop(0,   `hsla(${col.h + 20}, 40%, 40%, 0.18)`);
      darkGrad.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = darkGrad;
      ctx.fill();

      ctx.restore();
    }

    drawPopped(ctx, rx, ry) {
      // つぶれた状態：凹んだ皿のような見た目
      const alpha = this.alpha;
      const col = BUBBLE_COLORS[this.colorIndex];

      ctx.save();
      ctx.globalAlpha = alpha;

      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      const poppedGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      poppedGrad.addColorStop(0,   `hsla(${col.h}, 20%, 75%, 0.15)`);
      poppedGrad.addColorStop(0.6, `hsla(${col.h}, 25%, 65%, 0.12)`);
      poppedGrad.addColorStop(1,   `hsla(${col.h}, 30%, 55%, 0.25)`);
      ctx.fillStyle = poppedGrad;
      ctx.fill();

      // 縁の細いリング
      ctx.strokeStyle = `hsla(${col.h}, 30%, 70%, ${alpha * 0.4})`;
      ctx.lineWidth = rx * 0.05;
      ctx.stroke();

      // 凹みの影（内側）
      const innerShadow = ctx.createRadialGradient(0, 0, rx * 0.3, 0, 0, rx);
      innerShadow.addColorStop(0,   'rgba(100,130,180, 0.0)');
      innerShadow.addColorStop(0.7, 'rgba(100,130,180, 0.05)');
      innerShadow.addColorStop(1,   'rgba(80,110,160, 0.2)');
      ctx.fillStyle = innerShadow;
      ctx.fill();

      ctx.restore();
    }
  }

  /* ======================================================
     グリッド計算
  ====================================================== */
  function calcGrid() {
    const main = document.getElementById('mainArea');
    const availW = main.clientWidth  - SHEET_PAD * 2;
    const availH = main.clientHeight - SHEET_PAD * 2;

    let bSize = Math.floor((availW - GAP * (COLS_TARGET - 1)) / COLS_TARGET);
    bSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, bSize));

    let c = Math.floor((availW + GAP) / (bSize + GAP));
    c = Math.max(3, c);

    let r = Math.floor((availH + GAP) / (bSize + GAP));
    r = Math.max(3, r);

    // シート全体サイズ
    const sw = c * (bSize + GAP) - GAP;
    const sh = r * (bSize + GAP) - GAP;

    // センタリング
    const sx = (main.clientWidth  - sw) / 2;
    const sy = (main.clientHeight - sh) / 2;

    return { cols: c, rows: r, size: bSize, sx, sy, sw, sh };
  }

  /* ======================================================
     シート構築
  ====================================================== */
  function buildSheet() {
    poppedCount = 0;

    const { cols: c, rows: r, size, sx, sy, sw, sh } = calcGrid();
    cols      = c;
    rows      = r;
    bubbleSize = size;
    sheetX    = sx;
    sheetY    = sy;
    sheetW    = sw;
    sheetH    = sh;
    totalBubbles = cols * rows;

    // キャンバスのサイズをmainAreaに合わせる
    const main = document.getElementById('mainArea');
    canvas.width  = main.clientWidth;
    canvas.height = main.clientHeight;

    bubbles = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cx = sheetX + col * (bubbleSize + GAP) + bubbleSize / 2;
        const cy = sheetY + row * (bubbleSize + GAP) + bubbleSize / 2;
        const ci = Math.floor(Math.random() * BUBBLE_COLORS.length);
        bubbles.push(new Bubble(col, row, cx, cy, bubbleSize, ci));
      }
    }

    document.getElementById('popCount').textContent   = 0;
    document.getElementById('totalCount').textContent = totalBubbles;

    const overlay = document.getElementById('completeOverlay');
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
  }

  /* ======================================================
     描画ループ
  ====================================================== */
  function drawBackground() {
    const main = document.getElementById('mainArea');
    const w = canvas.width;
    const h = canvas.height;

    // シートの下地（半透明プラスチック）
    ctx.save();
    const sheetGrad = ctx.createLinearGradient(sheetX, sheetY, sheetX + sheetW, sheetY + sheetH);
    sheetGrad.addColorStop(0,   'rgba(220, 238, 255, 0.28)');
    sheetGrad.addColorStop(0.5, 'rgba(215, 230, 255, 0.20)');
    sheetGrad.addColorStop(1,   'rgba(200, 220, 245, 0.32)');
    ctx.fillStyle = sheetGrad;
    ctx.shadowColor = 'rgba(120, 150, 200, 0.20)';
    ctx.shadowBlur  = 24;
    ctx.shadowOffsetY = 6;
    roundRect(ctx, sheetX - SHEET_PAD, sheetY - SHEET_PAD, sheetW + SHEET_PAD * 2, sheetH + SHEET_PAD * 2, 18);
    ctx.fill();

    // シートの境界（ガラス縁）
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth   = 1.5;
    roundRect(ctx, sheetX - SHEET_PAD, sheetY - SHEET_PAD, sheetW + SHEET_PAD * 2, sheetH + SHEET_PAD * 2, 18);
    ctx.stroke();

    // グレイン（ノイズテクスチャ）はパフォーマンスのため省略し、
    // シートの内側に光沢スキャンラインを追加
    ctx.globalAlpha = 0.04;
    for (let gy = sheetY - SHEET_PAD; gy < sheetY + sheetH + SHEET_PAD; gy += 4) {
      ctx.beginPath();
      ctx.moveTo(sheetX - SHEET_PAD, gy);
      ctx.lineTo(sheetX + sheetW + SHEET_PAD, gy);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth   = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground();

    for (const b of bubbles) {
      b.draw(ctx, lightX, lightY);
    }

    animFrameId = requestAnimationFrame(render);
  }

  /* ======================================================
     泡をつぶす（GSAP物理アニメーション）
  ====================================================== */
  function popBubble(bubble, pressSpeed) {
    if (bubble.popped || bubble.popping) return;
    bubble.popping = true;

    // 音
    playPopSound(pressSpeed);

    // カウンター
    poppedCount++;
    updateCounter();

    // 飛散気泡
    spawnMicroBubbles(bubble);

    // GSAPスクイッシュ&ストレッチ → つぶれた状態へ
    // 押す方向（縦に縮む = scaleY減、横に広がる = scaleX増）
    const tl = gsap.timeline({
      onComplete: () => {
        bubble.popping = false;
        bubble.popped  = true;
      }
    });

    tl.to(bubble, {
      scaleX: 1.25,
      scaleY: 0.45,
      duration: 0.08,
      ease: 'power2.in'
    })
    .to(bubble, {
      scaleX: 0.75,
      scaleY: 0.72,
      duration: 0.06,
      ease: 'power1.out'
    })
    .to(bubble, {
      scaleX: 0.68,
      scaleY: 0.62,
      duration: 0.12,
      ease: 'elastic.out(1.2, 0.4)'
    });

    // アルファは別でフェードアウト
    gsap.to(bubble, {
      alpha: 0.18,
      delay: 0.04,
      duration: 0.22,
      ease: 'power2.out'
    });

    // 周辺泡への衝撃波
    propagateWave(bubble);

    // 全部つぶした確認
    if (poppedCount >= totalBubbles) {
      setTimeout(showComplete, 450);
    }
  }

  /* ======================================================
     衝撃波伝播
  ====================================================== */
  function propagateWave(sourceBubble) {
    const neighbors = bubbles.filter(b => {
      if (b === sourceBubble || b.popped) return false;
      const dc = Math.abs(b.col - sourceBubble.col);
      const dr = Math.abs(b.row - sourceBubble.row);
      return dc <= 1 && dr <= 1 && (dc + dr) > 0;
    });

    neighbors.forEach(nb => {
      const dc = nb.col - sourceBubble.col;
      const delay = (Math.abs(dc) + Math.abs(nb.row - sourceBubble.row)) * 0.02;
      const strength = 0.6 + Math.random() * 0.3;

      gsap.to(nb, {
        wobble: dc >= 0 ? strength : -strength,
        duration: 0.06,
        delay,
        ease: 'power2.out',
        onComplete: () => {
          gsap.to(nb, {
            wobble: 0,
            duration: 0.25,
            ease: 'elastic.out(1, 0.35)'
          });
        }
      });

      // スケールも微妙に揺れる
      gsap.to(nb, {
        scaleX: 1 + 0.06 * strength,
        scaleY: 1 - 0.04 * strength,
        duration: 0.06,
        delay,
        ease: 'power2.out',
        onComplete: () => {
          gsap.to(nb, {
            scaleX: 1,
            scaleY: 1,
            duration: 0.3,
            ease: 'elastic.out(1.2, 0.4)'
          });
        }
      });
    });
  }

  /* ======================================================
     微細気泡の飛散エフェクト（Canvas上のオブジェクト）
  ====================================================== */
  const particles = [];

  function spawnMicroBubbles(bubble) {
    const count = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.8 - 0.4;
      const speed = (30 + Math.random() * 40);
      const size  = 2 + Math.random() * 5;
      const col   = BUBBLE_COLORS[bubble.colorIndex];
      const p = {
        x:    bubble.x,
        y:    bubble.y,
        vx:   Math.cos(angle) * speed,
        vy:   Math.sin(angle) * speed - 15,  // 少し上向き
        size,
        alpha: 0.85,
        color: `hsla(${col.h}, ${col.s}%, ${col.l + 10}%, 1)`,
        life:  1,
      };
      particles.push(p);

      // GSAPでライフサイクル管理
      gsap.to(p, {
        x:     p.x + Math.cos(angle) * speed * 0.4,
        y:     p.y + Math.sin(angle) * speed * 0.4 + 20,
        alpha: 0,
        size:  size * 0.3,
        life:  0,
        duration: 0.35 + Math.random() * 0.2,
        ease: 'power2.out',
        onComplete: () => {
          const idx = particles.indexOf(p);
          if (idx !== -1) particles.splice(idx, 1);
        }
      });
    }
  }

  // パーティクル描画（renderループ内で呼ばれる想定だが、renderに組み込む）
  function drawParticles() {
    for (const p of particles) {
      if (p.alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      // 小さな泡のグラデーション
      const pg = ctx.createRadialGradient(p.x - p.size * 0.3, p.y - p.size * 0.3, 0, p.x, p.y, p.size);
      pg.addColorStop(0, 'rgba(255,255,255,0.9)');
      pg.addColorStop(0.4, p.color);
      pg.addColorStop(1, 'rgba(160,190,220,0.3)');
      ctx.fillStyle = pg;
      ctx.fill();
      ctx.restore();
    }
  }

  // render関数にパーティクル描画を組み込む
  const _render = render;
  function renderFull() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    for (const b of bubbles) b.draw(ctx, lightX, lightY);
    drawParticles();
    animFrameId = requestAnimationFrame(renderFull);
  }

  /* ======================================================
     カウンター更新
  ====================================================== */
  function updateCounter() {
    const el = document.getElementById('popCount');
    el.textContent = poppedCount;
    gsap.fromTo(el, { scale: 1.5 }, { scale: 1, duration: 0.2, ease: 'back.out(2)' });
  }

  /* ======================================================
     完了演出
  ====================================================== */
  function showComplete() {
    const overlay = document.getElementById('completeOverlay');
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
  }

  /* ======================================================
     ヒットテスト（どの泡を押したか）
  ====================================================== */
  function hitTest(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;

    for (const b of bubbles) {
      if (b.popped || b.popping) continue;
      const dx = cx - b.x;
      const dy = cy - b.y;
      // 楕円ヒットテスト
      if ((dx * dx) / (b.r * b.r) + (dy * dy) / (b.r * b.r) <= 1.1) {
        return { bubble: b, speed: Math.sqrt(dx * dx + dy * dy) / b.r };
      }
    }
    return null;
  }

  /* ======================================================
     イベントハンドラ
  ====================================================== */
  // ポインタイベント（マウス/タッチ統一）
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const result = hitTest(e.clientX, e.clientY);
    if (result) {
      popBubble(result.bubble, result.speed);
    }
  }, { passive: false });

  // 光源追従（マウス）
  document.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const tx = (e.clientX - rect.left) / canvas.width;
    const ty = (e.clientY - rect.top)  / canvas.height;
    // スムーズに追従
    gsap.to({ lx: lightX, ly: lightY }, {
      lx: tx,
      ly: ty,
      duration: 0.4,
      ease: 'power2.out',
      onUpdate: function() {
        lightX = this.targets()[0].lx;
        lightY = this.targets()[0].ly;
      }
    });
  });

  // スマホ傾きで光源変化（DeviceOrientation）
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma === null || e.beta === null) return;
      // gamma: 左右傾き (-90〜90), beta: 前後傾き (-180〜180)
      const tx = Math.max(0, Math.min(1, (e.gamma + 45) / 90));
      const ty = Math.max(0, Math.min(1, (e.beta  + 30) / 90));
      lightX += (tx - lightX) * 0.08;
      lightY += (ty - lightY) * 0.08;
    });
  }

  // リセット
  document.getElementById('resetBtn').addEventListener('click', () => {
    // GSAPのアニメを全部クリア
    gsap.killTweensOf(bubbles);
    buildSheet();
  });

  // リサイズ対応
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      gsap.killTweensOf(bubbles);
      buildSheet();
    }, 200);
  });

  /* ======================================================
     Web Audio API - リアルなプチッ音
  ====================================================== */
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playPopSound(pressSpeed) {
    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;

      // 押す速さでピッチ・音量を変える
      const speedFactor = Math.max(0.4, Math.min(1.5, pressSpeed || 1));

      // --- メインノイズバースト（空気が抜ける音） ---
      const bufLen = Math.floor(ctx.sampleRate * 0.08);
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        // 少し色付きのノイズ（完全白色より「ぷちっ」感が出る）
        const prev = i > 0 ? data[i - 1] : 0;
        data[i] = prev * 0.3 + (Math.random() * 2 - 1) * 0.7;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buf;

      // 低域強調フィルタ（こもった空気感）
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = 200 + Math.random() * 180 + speedFactor * 80;
      lpf.Q.value = 1.2;

      // ピーキング（プラスチック感）
      const peak = ctx.createBiquadFilter();
      peak.type = 'peaking';
      peak.frequency.value = 800;
      peak.gain.value = 6;
      peak.Q.value = 2;

      // ゲインエンベロープ
      const gain = ctx.createGain();
      const vol = 0.4 + speedFactor * 0.2;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      noise.connect(lpf);
      lpf.connect(peak);
      peak.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.08);

      // --- 低周波トーン（プラスチックがへこむ感触音） ---
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const baseFreq = 90 + Math.random() * 40;
      osc.frequency.setValueAtTime(baseFreq * speedFactor, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, now + 0.05);

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.22 * speedFactor, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);

      // --- トランジェント（クリック感） ---
      const clickLen = Math.floor(ctx.sampleRate * 0.006);
      const clickBuf = ctx.createBuffer(1, clickLen, ctx.sampleRate);
      const clickData = clickBuf.getChannelData(0);
      for (let i = 0; i < clickLen; i++) {
        clickData[i] = (Math.random() * 2 - 1) * (1 - i / clickLen);
      }
      const click = ctx.createBufferSource();
      click.buffer = clickBuf;

      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.35, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.006);

      const clickHpf = ctx.createBiquadFilter();
      clickHpf.type = 'highpass';
      clickHpf.frequency.value = 1200;

      click.connect(clickHpf);
      clickHpf.connect(clickGain);
      clickGain.connect(ctx.destination);
      click.start(now);
      click.stop(now + 0.007);

    } catch (e) {
      // 音なしでも動作継続
    }
  }

  /* ======================================================
     AudioContext アンロック（iOS Safari対応）
  ====================================================== */
  document.addEventListener('pointerdown', () => {
    getAudioCtx();
  }, { once: true });

  /* ======================================================
     初期化
  ====================================================== */
  canvas = document.getElementById('puchiCanvas');
  ctx    = canvas.getContext('2d');

  buildSheet();
  renderFull();  // メインレンダリングループ開始

})();
