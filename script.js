/**
 * プチプチASMR - script.js
 * Web Audio API で音を生成し、グリッドのバブルをつぶす
 */

(function () {
  'use strict';

  /* ======================================================
     1. Web Audio API セットアップ
  ====================================================== */
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // iOS Safari: suspended状態を resume する
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  /**
   * プチッ音を生成する
   * - 短いノイズバースト + ローパスフィルタ で「ポフッ」感を出す
   * - わずかにピッチをランダムにして単調にならないようにする
   */
  function playPopSound() {
    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;

      // --- ノイズバッファ（0.06秒）---
      const bufLen = Math.floor(ctx.sampleRate * 0.06);
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        data[i] = (Math.random() * 2 - 1);
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buf;

      // --- ローパスフィルタ（こもった低音感） ---
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      // ピッチに少しランダム幅を付ける（300〜550 Hz）
      lpf.frequency.value = 300 + Math.random() * 250;
      lpf.Q.value = 0.8;

      // --- ゲインエンベロープ（急激な立ち上がり→素早いリリース）---
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.55, now + 0.004);   // 4ms でピーク
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06); // 60ms で消える

      // --- 接続 ---
      noise.connect(lpf);
      lpf.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 0.07);

      // --- おまけ: 低めのトーン（「ぷっ」の輪郭感）---
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120 + Math.random() * 60, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.04);

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.18, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);

    } catch (e) {
      // 音が鳴らなくてもアプリは動く
    }
  }

  /* ======================================================
     2. グリッドサイズ計算
  ====================================================== */
  /**
   * 利用可能な領域から列数・行数・バブルサイズを計算する。
   * バブルサイズは最低 36px / 最大 72px で、なるべく画面を埋める。
   */
  function calcGrid() {
    const sheet = document.getElementById('puchiSheet');
    const wrapper = sheet.parentElement;

    // ヘッダー・フッターを除いた領域
    const availW = wrapper.clientWidth  - 24; // sheet padding 12*2
    const availH = wrapper.clientHeight - 24;

    const GAP = 6;
    const MIN_SIZE = 36;
    const MAX_SIZE = 72;
    const TARGET_COLS = 6;  // 基準列数

    // バブルサイズを availW / cols から逆算
    let cols = TARGET_COLS;
    let size = Math.floor((availW - GAP * (cols - 1)) / cols);
    size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, size));

    // size が決まったら列数を再計算（幅に収まる最大）
    cols = Math.floor((availW + GAP) / (size + GAP));
    cols = Math.max(3, cols);

    // 行数
    const rows = Math.floor((availH + GAP) / (size + GAP));
    const finalRows = Math.max(4, rows);

    return { cols, rows: finalRows, size };
  }

  /* ======================================================
     3. バブル生成
  ====================================================== */
  let totalBubbles = 0;
  let poppedCount  = 0;

  function buildSheet() {
    const sheet = document.getElementById('puchiSheet');
    sheet.innerHTML = '';
    poppedCount = 0;

    const { cols, rows, size } = calcGrid();
    totalBubbles = cols * rows;

    // グリッド列を CSS に反映
    sheet.style.gridTemplateColumns = `repeat(${cols}, ${size}px)`;

    for (let i = 0; i < totalBubbles; i++) {
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.style.width  = size + 'px';
      bubble.style.height = size + 'px';
      bubble.setAttribute('role', 'button');
      bubble.setAttribute('aria-label', 'プチプチ');
      bubble.setAttribute('tabindex', '0');

      // タップ / クリック
      bubble.addEventListener('pointerdown', onBubblePress, { passive: true });

      sheet.appendChild(bubble);
    }

    // カウンター更新
    document.getElementById('popCount').textContent   = 0;
    document.getElementById('totalCount').textContent = totalBubbles;

    // 完了オーバーレイを非表示
    const overlay = document.getElementById('completeOverlay');
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
  }

  /* ======================================================
     4. バブルをつぶす
  ====================================================== */
  function onBubblePress(e) {
    const bubble = e.currentTarget;
    if (bubble.classList.contains('popped') || bubble.classList.contains('popping')) return;

    // 音を鳴らす
    playPopSound();

    // リップルエフェクト
    spawnRipple(bubble);

    // パーティクルバースト
    spawnParticles(bubble);

    // アニメーション → popped へ
    bubble.classList.add('popping');
    bubble.addEventListener('animationend', () => {
      bubble.classList.remove('popping');
      bubble.classList.add('popped');
      bubble.setAttribute('aria-label', 'つぶれたプチプチ');
    }, { once: true });

    // カウンター更新
    poppedCount++;
    updateCounter();

    // 全部つぶしたか確認
    if (poppedCount >= totalBubbles) {
      setTimeout(showComplete, 400);
    }
  }

  function updateCounter() {
    const el = document.getElementById('popCount');
    el.textContent = poppedCount;

    // バウンスアニメ
    el.classList.remove('bump');
    void el.offsetWidth; // reflow
    el.classList.add('bump');
    el.addEventListener('transitionend', () => el.classList.remove('bump'), { once: true });
  }

  /* ======================================================
     5. エフェクト
  ====================================================== */
  function spawnRipple(bubble) {
    const size = bubble.offsetWidth;
    const ring = document.createElement('div');
    ring.className = 'ripple-ring';
    ring.style.cssText = `
      width:  ${size}px;
      height: ${size}px;
      top:    0;
      left:   0;
    `;
    bubble.appendChild(ring);
    ring.addEventListener('animationend', () => ring.remove(), { once: true });
  }

  function spawnParticles(bubble) {
    const rect = bubble.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    const count = 6;
    const colors = ['#6C63FF', '#FBA32A', '#00D4AA', '#FF7B9C', '#A8D8FF'];
    const container = document.getElementById('puchiSheet');
    const sheetRect = container.getBoundingClientRect();

    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const angle  = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const dist   = 18 + Math.random() * 20;
      const tx     = Math.cos(angle) * dist;
      const ty     = Math.sin(angle) * dist;
      p.style.cssText = `
        left: ${cx - sheetRect.left - 3}px;
        top:  ${cy - sheetRect.top  - 3}px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        --tx: ${tx}px;
        --ty: ${ty}px;
        animation-duration: ${0.3 + Math.random() * 0.15}s;
      `;
      container.appendChild(p);
      p.addEventListener('animationend', () => p.remove(), { once: true });
    }
  }

  /* ======================================================
     6. 完了演出
  ====================================================== */
  function showComplete() {
    const overlay = document.getElementById('completeOverlay');
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.querySelector('.complete-card').focus?.();
  }

  /* ======================================================
     7. リセット
  ====================================================== */
  document.getElementById('resetBtn').addEventListener('click', () => {
    buildSheet();
  });

  /* ======================================================
     8. キーボード操作（アクセシビリティ）
  ====================================================== */
  document.getElementById('puchiSheet').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (document.activeElement?.classList.contains('bubble')) {
        // PointerEvent の代わりに直接呼ぶ
        const fakeEvent = { currentTarget: document.activeElement };
        onBubblePress(fakeEvent);
      }
    }
  });

  /* ======================================================
     9. リサイズ対応
  ====================================================== */
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // 全部つぶれていたらリセット不要（完了画面のまま）
      if (poppedCount < totalBubbles) {
        buildSheet();
      }
    }, 200);
  });

  /* ======================================================
     10. 初期化
  ====================================================== */
  // iOS Safari でユーザー操作なし再生を試みるとエラーになるため
  // 最初のタップで AudioContext を unlock する
  document.addEventListener('pointerdown', () => {
    getAudioCtx();
  }, { once: true });

  buildSheet();

})();
