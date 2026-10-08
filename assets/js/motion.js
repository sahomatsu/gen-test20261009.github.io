/* ============================================================================
 * motion.js  ―  スクロールに連動する演出（3種）
 * ----------------------------------------------------------------------------
 *  1) 見出しの一文字ずつ表示
 *  2) ルック画像のパララックス
 *  3) スクロール速度に応じたフィルムグレインの反応
 *
 * 【3つを1ファイルにまとめた理由】
 * どれも「スクロール位置・速度」という同じ情報を使う。
 * ファイルを分けるとスクロール監視が3つ動くことになり、
 * 同じ計算を3回することになる。1つのループにまとめれば計算は1回で済む。
 *
 * 【共通の作法】
 * ・スクロールイベントでは「印を付ける」だけにして、
 *   実際の読み書きは requestAnimationFrame の中で行う
 *   → レイアウト計算（reflow）が1フレームに1回に収まり、カクつかない
 * ・prefers-reduced-motion と motion-config.js の設定で個別に停止できる
 * ========================================================================== */

(function () {
  'use strict';

  var conf = window.GEN_MOTION || {};
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --------------------------------------------------------------------------
   * 1. 見出しの一文字ずつ
   * ------------------------------------------------------------------------ */
  function splitHeadings() {
    var targets = document.querySelectorAll('[data-split]');

    for (var i = 0; i < targets.length; i++) {
      var el = targets[i];
      var text = el.textContent.trim();
      if (!text) continue;

      /* 読み上げ対策（重要）：
       * 1文字ずつ span に分けると、読み上げソフトによっては
       * 「エ・グ・ジ・ビ・シ・ョ・ン」と1文字ずつ読んでしまう。
       * 元の文言を aria-label で持たせ、分解後の中身は aria-hidden にして
       * 「見た目は分解、読み上げは元のまま」にする。 */
      el.setAttribute('aria-label', text);

      var frag = document.createDocumentFragment();
      var index = 0;

      for (var c = 0; c < text.length; c++) {
        var ch = text.charAt(c);
        var span = document.createElement('span');
        span.className = 'c-splitChar' + (ch === ' ' ? ' c-splitChar--space' : '');
        /* --i に通し番号を入れる。遅延の計算はCSS側（40ms × i）。
         * JSで setTimeout を並べないのは、
         * タブが裏に回ったときにタイマーがずれて順序が崩れるため。 */
        span.style.setProperty('--i', index);
        span.textContent = ch;
        frag.appendChild(span);
        index++;
      }

      el.textContent = '';
      var wrap = document.createElement('span');
      wrap.setAttribute('aria-hidden', 'true');
      wrap.appendChild(frag);
      el.appendChild(wrap);
    }
  }

  /* --------------------------------------------------------------------------
   * 2. ルック画像のパララックス
   * ------------------------------------------------------------------------
   * 枠（figure）は動かさず、中の画像だけを枠の中で上下にずらす。
   * 画像には CSS 側で scale が掛かっているので、ずらしても隙間が出ない。
   * ------------------------------------------------------------------------ */
  var parallaxItems = [];

  function collectParallax() {
    var nodes = document.querySelectorAll('[data-parallax]');
    for (var i = 0; i < nodes.length; i++) {
      parallaxItems.push({
        el: nodes[i],
        /* 強さは要素ごとに data 属性で指定できるようにしてある。
         * 既定 8（％）は、4点並べたときに「少しずつ違う速さで動く」のが
         * かろうじて分かる程度の値。10を超えると画像が泳いで見える。 */
        strength: parseFloat(nodes[i].getAttribute('data-parallax')) || 8,
        visible: false
      });
    }

    /* 画面外の要素まで毎フレーム計算すると無駄なので、
     * 見えているものだけを対象にする。 */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          for (var j = 0; j < parallaxItems.length; j++) {
            if (parallaxItems[j].el === entry.target) {
              parallaxItems[j].visible = entry.isIntersecting;
            }
          }
        });
      }, { rootMargin: '10% 0px' });

      for (var k = 0; k < parallaxItems.length; k++) {
        io.observe(parallaxItems[k].el);
      }
    } else {
      for (var m = 0; m < parallaxItems.length; m++) parallaxItems[m].visible = true;
    }
  }

  function updateParallax() {
    var vh = window.innerHeight;

    for (var i = 0; i < parallaxItems.length; i++) {
      var item = parallaxItems[i];
      if (!item.visible) continue;

      var rect = item.el.getBoundingClientRect();
      /* 要素の中心が画面のどこにあるかを -1〜1 で表す。
       * 画面中央で 0、上端で 1、下端で -1。
       * この値に強さを掛ければ、中央で「本来の位置」に戻る動きになる。 */
      var progress = ((vh / 2) - (rect.top + rect.height / 2)) / (vh / 2);
      progress = Math.max(-1, Math.min(1, progress));

      /* transform を直接書かず、材料（移動量）だけを変数で渡す。
       * 組み立てはCSS側（figure.css）が行うので、
       * ホバーの拡大指定とぶつからない。 */
      item.el.style.setProperty(
        '--parallax-y', (progress * item.strength).toFixed(2) + '%');
    }
  }

  /* --------------------------------------------------------------------------
   * 3. 粒子の反応（スクロール速度でグレインが立つ）
   * ------------------------------------------------------------------------ */
  var grainBase = 0.05;   // 静止時の濃度
  var grainMax = 0.13;    // 上限。これ以上は小さな文字の可読性に影響するため固定
  var lastY = window.scrollY;
  var velocity = 0;
  var currentGrain = grainBase;

  function updateGrain() {
    var y = window.scrollY;
    var delta = Math.abs(y - lastY);
    lastY = y;

    /* 速度は「急に上がって、ゆっくり下がる」ようにする。
     * 生の値をそのまま使うと、スクロールを止めた瞬間に粒子が消えて
     * 不自然に途切れて見えるため。 */
    velocity = Math.max(velocity * 0.88, Math.min(1, delta / 90));

    var target = grainBase + (grainMax - grainBase) * velocity;
    /* さらに補間して滑らかにする（1フレームで飛ばない） */
    currentGrain += (target - currentGrain) * 0.2;

    document.documentElement.style.setProperty('--grain-opacity', currentGrain.toFixed(3));
  }

  /* --------------------------------------------------------------------------
   * 共通のループ
   * ------------------------------------------------------------------------
   * スクロールが止まって十分経ったらループを抜ける（省電力）。
   * 次の scroll / resize で再開する。
   * ------------------------------------------------------------------------ */
  var rafId = null;
  var idleFrames = 0;
  var useParallax = false;
  var useGrain = false;

  function frame() {
    if (useParallax) updateParallax();
    if (useGrain) updateGrain();

    /* 動きが十分小さくなったフレームを数え、
     * 30フレーム（約0.5秒）続いたら止める。 */
    if (velocity < 0.004 && Math.abs(currentGrain - grainBase) < 0.002) {
      idleFrames++;
    } else {
      idleFrames = 0;
    }

    if (idleFrames > 30) {
      rafId = null;
      return;
    }
    rafId = requestAnimationFrame(frame);
  }

  function wake() {
    idleFrames = 0;
    if (rafId === null) rafId = requestAnimationFrame(frame);
  }

  /* --------------------------------------------------------------------------
   * 起動
   * ------------------------------------------------------------------------ */
  if (reduceMotion) return;   // 動きを減らす設定なら、この3つはすべて動かさない

  if (conf.splitHeading !== false) splitHeadings();

  if (conf.parallax !== false) {
    collectParallax();
    useParallax = parallaxItems.length > 0;
  }

  useGrain = (conf.grainReact !== false);

  if (useParallax || useGrain) {
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('resize', wake, { passive: true });
    wake();   // 初期位置を一度反映しておく
  }
})();
