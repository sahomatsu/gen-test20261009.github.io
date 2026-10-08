/* ============================================================================
 * ink-stalker.js  ―  墨のマウスストーカー
 * ----------------------------------------------------------------------------
 * ご提供いただいた ink_mouse_stalker.html の描画ロジックを土台に、
 * 「白い面と黒い面が交互に現れるサイト」へ載せるための改修を加えたもの。
 *
 * 【元コードから変えた点と、その理由】
 *  1) 面の明暗に追従させた
 *     元は黒背景専用（screen合成＋明るい墨）。白背景の上では
 *     screen合成の白い墨は完全に見えなくなってしまう。
 *     → カーソルの下にある要素の data-tone を読み、
 *       明るい面では「濃い墨＋multiply合成」、暗い面では「淡い墨＋screen合成」に切り替える。
 *       色を反転させるだけで、描画アルゴリズムは元のまま使えるのがこの設計の利点。
 *
 *  2) 常時 requestAnimationFrame を回さないようにした
 *     元コードは墨が1つも無くてもループし続ける。
 *     LPは滞在時間が長く、マウスを止めている時間も長いため、
 *     描画対象が空になったらループを止め、次の mousemove で再開する方式にした。
 *     （ノートPCのバッテリー消費とファン回転を抑えるための変更）
 *
 *  3) 生成数に上限を設けた
 *     マウスを高速で振り続けると配列が際限なく伸び、フレーム落ちの原因になる。
 *     上限を超えたら古いものから捨てる。
 *
 *  4) 対応環境を判定してから起動するようにした
 *     ・タッチ端末（カーソルが存在しない）では起動しない
 *     ・prefers-reduced-motion: reduce の利用者には起動しない
 *     ・後からOS設定が変わった場合にも追従する（change イベントを監視）
 *
 *  5) devicePixelRatio に上限を設けた
 *     Retina以上の高精細ディスプレイでは dpr が3になることがあり、
 *     canvas の実ピクセル数が9倍になって描画が重くなる。2で頭打ちにしている。
 *
 * 【用語補足】
 *  - canvas：JSで図を描ける描画領域。ここでは墨のにじみを毎フレーム描き直している。
 *  - requestAnimationFrame（rAF）：ブラウザの描画タイミングに合わせて関数を呼ぶ仕組み。
 *    setInterval より滑らかで、タブが非表示のときは自動で止まる。
 *  - globalCompositeOperation：canvas内部での「重ね方」の指定。
 * ========================================================================== */

(function () {
  'use strict';

  var canvas = document.getElementById('js-stalker');
  // 要素が無いページでもエラーにならないよう、必ず存在確認してから進める
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');

  /* --------------------------------------------------------------------------
   * 起動条件の判定
   * matchMedia を使うと、CSSのメディアクエリと同じ条件をJSから参照できる。
   * CSS（stalker.css）にも同じ条件で非表示指定を書いてあるが、
   * JS側でも判定して「そもそも描画処理を走らせない」ようにしている。
   * CSSだけだと見えないまま計算が走り続けてしまうため。
   * ------------------------------------------------------------------------ */
  var reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

  function canRun() {
    return finePointerQuery.matches && !reduceMotionQuery.matches;
  }

  /* --------------------------------------------------------------------------
   * キャンバスのサイズ合わせ
   * CSS上の大きさ（px）と、実際に描画するピクセル数は別物。
   * 高精細ディスプレイでは後者を大きくしないと線がぼやけるため、
   * devicePixelRatio を掛けてから、setTransform で座標系を元のpxに戻している。
   * こうすると「描くときはCSSピクセルで考えればよい」状態になる。
   * ------------------------------------------------------------------------ */
  var dpr = 1;

  function resize() {
    // 上限2：3以上の端末で描画コストが跳ね上がるのを防ぐ
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* --------------------------------------------------------------------------
   * 墨の色（パレット）
   * 面の明暗で2種類を切り替える。
   *
   * dark：暗い面用。中心が明るく外周が暗い → screen合成で「光る墨」になる。
   * light：明るい面用。中心が濃く外周が淡い → multiply合成で「黒い墨」になる。
   *
   * CSSの filter: contrast() が中間調を切り捨てるため、
   * 「外周の色」は合成時に消える側の色（screenなら黒、multiplyなら白）に寄せておく。
   * これが、にじみの輪郭だけが残って中心が濃く見える仕組み。
   * 色はカラースキーム（#2e381b / #848d89 / #ad9f88 / #cbc7b3）から取っている。
   * ------------------------------------------------------------------------ */
  var PALETTES = {
    dark: {
      composite: 'screen',
      // 2種類を確率で使い分け、墨に緑寄り／砂寄りの揺らぎを出す（元コードの lean を踏襲）
      a: [[248, 252, 248], [215, 235, 220], [120, 150, 110]],
      b: [[250, 248, 244], [225, 212, 190], [150, 125, 85]]
    },
    light: {
      composite: 'multiply',
      // 中心＝濃い墨（#2e381b 系）、外周＝紙色（合成で消える）
      a: [[18, 22, 16], [46, 56, 27], [235, 236, 228]],
      b: [[26, 24, 20], [90, 82, 66], [240, 238, 230]]
    }
  };

  var currentTone = 'dark';   // 初期値はHero（暗い面）
  var palette = PALETTES.dark;

  function setTone(tone) {
    if (tone === currentTone) return;   // 毎フレーム class を触らないよう、変化時だけ処理する
    currentTone = tone;
    palette = PALETTES[tone] || PALETTES.dark;
    // CSS側の合成モード（mix-blend-mode）を切り替える。
    // canvas内部の合成（globalCompositeOperation）と、
    // canvasとページの合成（mix-blend-mode）は別物なので、両方を合わせる必要がある。
    canvas.classList.toggle('is-light', tone === 'light');
  }

  /* --------------------------------------------------------------------------
   * 墨の粒（blot）
   * ------------------------------------------------------------------------ */
  var blots = [];
  var MAX_BLOTS = 240;        // これを超えたら古いものから捨てる（フレーム落ち対策）
  var mouse = { px: null, py: null };
  var rafId = null;

  function spawn(x, y, amount) {
    var pts = 9;              // 9点の多角形を曲線で結んで不定形を作る（元コード踏襲）
    var jags = [];
    for (var i = 0; i < pts; i++) {
      // 0.8〜1.2倍の半径ムラ。これが墨のいびつな輪郭になる
      jags.push(0.8 + Math.random() * 0.4);
    }
    blots.push({
      x: x,
      y: y,
      r: 3,
      // 最大半径はマウス速度（amount）に連動。速く動かすほど細く、ゆっくりだと太く滲む
      maxR: (12 + Math.random() * 14) * (0.25 + 0.75 * amount),
      life: 1,
      amount: amount,
      growSpeed: 0.3 + Math.random() * 0.2,
      decay: 0.007 + Math.random() * 0.005,
      driftX: (Math.random() - 0.5) * 0.06,
      driftY: 0.02 + Math.random() * 0.03,  // わずかに下へ流す＝墨が垂れる感じ
      jags: jags,
      rot: Math.random() * Math.PI * 2,
      lean: Math.random(),                  // 色の振り分け用
      tone: currentTone                     // 生成時の面の明暗を粒ごとに覚えておく。
                                            // ※境界をまたいだ瞬間に既存の粒まで色が変わると
                                            //   画面全体が点滅して見えるため、粒ごとに固定する
    });
    if (blots.length > MAX_BLOTS) {
      blots.splice(0, blots.length - MAX_BLOTS);
    }
  }

  /* --------------------------------------------------------------------------
   * マウス移動
   * 前フレームの位置との間を補間して点を撒く（元コードのロジックを踏襲）。
   * 速く動かすほど間隔を空け、墨を薄くする＝筆をさっと引いたときのかすれの再現。
   * ------------------------------------------------------------------------ */
  function onMouseMove(e) {
    if (!running) return;

    var x = e.clientX;
    var y = e.clientY;

    /* カーソルの下にある要素から、最も近い data-tone を探す。
     * canvas は pointer-events:none なので、e.target は必ず「下の要素」になる。
     * elementFromPoint() を毎回呼ぶより軽く、余計な再計算も起きない。 */
    var el = e.target;
    if (el && el.closest) {
      var toned = el.closest('[data-tone]');
      /* 見つからないときの既定を 'dark' にしているのは、
       * サイト全体が黒基調で、ヘッダーなど data-tone を持たない要素の上でも
       * 背景は黒だから。ここを 'light' にすると、ヘッダーに重なった瞬間だけ
       * 墨が黒くなって見えなくなる。 */
      setTone(toned ? toned.getAttribute('data-tone') : 'dark');
    }

    if (mouse.px !== null) {
      var d = Math.hypot(x - mouse.px, y - mouse.py);
      var speedFactor = Math.min(1, d / 55);
      var inkFactor = 1 - speedFactor * 0.88;   // 速い＝墨が薄い
      var spacing = 4 + speedFactor * 10;       // 速い＝点の間隔が広い
      var steps = Math.max(1, Math.floor(d / spacing));

      // 1回の移動で撒く点が多くなりすぎると重いので上限をかける
      if (steps > 40) steps = 40;

      for (var i = 1; i <= steps; i++) {
        // 途中の点はランダムに間引いて、均一な線に見えないようにする
        if (Math.random() > inkFactor && i !== steps) continue;
        var t = i / steps;
        var amt = inkFactor * (0.6 + Math.random() * 0.4);
        spawn(mouse.px + (x - mouse.px) * t, mouse.py + (y - mouse.py) * t, amt);
      }
    } else {
      spawn(x, y, 1);
    }

    mouse.px = x;
    mouse.py = y;

    // 止まっていたループを再開する
    if (rafId === null) {
      rafId = requestAnimationFrame(draw);
    }
  }

  /* --------------------------------------------------------------------------
   * 1粒の描画
   * 9点の頂点を二次ベジェ曲線で結び、放射状グラデーションで塗る。
   * 直線で結ぶと多角形に見えてしまうため、曲線でつないで有機的な形にしている。
   * ------------------------------------------------------------------------ */
  function drawBlob(b) {
    var n = b.jags.length;
    var pts = [];
    var i;

    for (i = 0; i < n; i++) {
      var ang = (i / n) * Math.PI * 2 + b.rot;
      var rr = b.r * b.jags[i];
      pts.push([b.x + Math.cos(ang) * rr, b.y + Math.sin(ang) * rr]);
    }

    ctx.beginPath();
    for (i = 0; i < n; i++) {
      var p0 = pts[i];
      var p1 = pts[(i + 1) % n];
      var mx = (p0[0] + p1[0]) / 2;
      var my = (p0[1] + p1[1]) / 2;
      if (i === 0) ctx.moveTo(mx, my);
      // 頂点を制御点にした曲線でつなぐ＝角が取れて滲みの形になる
      ctx.quadraticCurveTo(p0[0], p0[1], mx, my);
    }
    ctx.closePath();

    /* 濃度。0.5 → 0.42 に下げているのは、
     * 試料ラベル（cursor-label.js）が同時に追従するようになり、
     * 墨が濃いままだと画面の情報量が渋滞するため。
     * それでも主役は墨のほうなので、ラベル側はさらに薄くしてある。 */
    var a = Math.min(1, b.life * 0.42 * b.amount);
    var pal = PALETTES[b.tone] || PALETTES.dark;
    var set = b.lean < 0.55 ? pal.a : pal.b;

    var grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    grad.addColorStop(0, rgba(set[0], a));
    grad.addColorStop(0.6, rgba(set[1], a * 0.75));
    grad.addColorStop(1, rgba(set[2], a * 0.2));

    ctx.fillStyle = grad;
    ctx.fill();
  }

  // [r,g,b] 配列とアルファ値から rgba() 文字列を作る小さなヘルパー
  function rgba(c, a) {
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  /* --------------------------------------------------------------------------
   * 描画ループ
   * ------------------------------------------------------------------------ */
  function draw() {
    // clearRect は変換前の実ピクセル基準で消す必要があるため、
    // setTransform を一旦単位行列に戻してから全消去する。
    // （元コードは変換が掛かったまま canvas.width で消していて、
    //   dpr が2以上の環境では消し残しが出る可能性があった箇所）
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // 粒ごとに合成モードが違う可能性があるため、描画直前に設定する
    for (var i = blots.length - 1; i >= 0; i--) {
      var b = blots[i];

      if (b.r < b.maxR) b.r += b.growSpeed;  // にじみが広がる
      b.x += b.driftX;
      b.y += b.driftY;
      b.life -= b.decay;                     // 徐々に消える

      if (b.life <= 0) {
        blots.splice(i, 1);
        continue;
      }

      ctx.globalCompositeOperation = (PALETTES[b.tone] || PALETTES.dark).composite;
      drawBlob(b);
    }

    ctx.globalCompositeOperation = 'source-over';

    if (blots.length > 0) {
      rafId = requestAnimationFrame(draw);
    } else {
      // 描くものが無くなったらループを止める（省電力のための停止）
      rafId = null;
    }
  }

  /* --------------------------------------------------------------------------
   * 起動・停止
   * ------------------------------------------------------------------------ */
  var running = false;

  function start() {
    if (running) return;
    running = true;
    resize();
    canvas.classList.add('is-active');
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    // passive:true を付ける理由：
    // このリスナーは preventDefault() を呼ばないと宣言することになり、
    // ブラウザがスクロール処理を待たずに進められる＝スクロールが滑らかになる。
  }

  function stop() {
    if (!running) return;
    running = false;
    canvas.classList.remove('is-active');
    window.removeEventListener('mousemove', onMouseMove);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    blots.length = 0;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function sync() {
    if (canRun()) start();
    else stop();
  }

  /* リサイズ。
   * resize は連続で発火するためデバウンス（最後の1回だけ実行）する。
   * canvas のサイズ変更は内容の消去を伴う重い処理なので、
   * ドラッグ中に何十回も走らせないようにしている。 */
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (!running) return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  /* タブが非表示になったら粒を消す。
   * rAF は非表示タブでは自動停止するが、復帰した瞬間に
   * 「止まっていた間の墨」が一斉に残って見えるのを防ぐため明示的に消す。 */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      blots.length = 0;
    }
  });

  /* OS設定（動きを減らす／ポインタの種類）が変わったら追従する。
   * addEventListener('change') は新しいAPI、addListener は古いSafari向け。
   * どちらかが存在する方を使う（機能検出） */
  function watch(mq, handler) {
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', handler);
    else if (typeof mq.addListener === 'function') mq.addListener(handler);
  }
  watch(reduceMotionQuery, sync);
  watch(finePointerQuery, sync);

  sync();
})();
