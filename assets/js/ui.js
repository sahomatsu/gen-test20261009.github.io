/* ============================================================================
 * ui.js  ―  ナビゲーション・現在地表示・ムービーの遅延読み込み
 * ----------------------------------------------------------------------------
 * ページの基本的な操作まわりをまとめたファイル。
 * 機能ごとに関数へ分けてあるので、不要な機能は呼び出し行を消すだけで外せる。
 * ========================================================================== */

(function () {
  'use strict';

  /* --------------------------------------------------------------------------
   * 0. no-js クラスの除去
   * <html class="no-js"> と書いておき、JSが動いた時点で外す。
   * これにより「JSが無効／読み込み失敗」のときだけ効くCSSを書ける
   * （reveal.css の .no-js .c-reveal がそれ）。
   * ------------------------------------------------------------------------ */
  document.documentElement.classList.remove('no-js');

  /* ==========================================================================
   * 1. モバイルナビゲーション（ドロワー）
   * ======================================================================== */
  (function initNav() {
    var toggle = document.getElementById('js-navToggle');
    var nav = document.getElementById('js-nav');
    if (!toggle || !nav) return;

    var scrollY = 0;

    function open() {
      // 背面のスクロールを止める。
      // position:fixed で固定する前に現在位置を保存し、閉じたときに戻す。
      // （iOS Safari は overflow:hidden だけではスクロールが貫通するため）
      scrollY = window.scrollY;
      document.body.style.top = '-' + scrollY + 'px';
      document.body.classList.add('u-noScroll');

      nav.classList.add('is-open');
      // aria-expanded は「このボタンが開閉する対象が今どうなっているか」を
      // 支援技術に伝える属性。見た目のクラスと必ず対で更新する。
      toggle.setAttribute('aria-expanded', 'true');

      // 開いた直後に最初のリンクへフォーカスを移す。
      // キーボード利用者が「開いたのにフォーカスがボタンのまま」になるのを防ぐ。
      var first = nav.querySelector('a');
      if (first) first.focus();
    }

    function close(returnFocus) {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');

      document.body.classList.remove('u-noScroll');
      document.body.style.top = '';
      window.scrollTo(0, scrollY);

      // 閉じたらボタンへフォーカスを返す（操作の起点に戻す）。
      // リンクを押して閉じた場合は移動先へ進みたいので戻さない。
      if (returnFocus) toggle.focus();
    }

    toggle.addEventListener('click', function () {
      var expanded = toggle.getAttribute('aria-expanded') === 'true';
      if (expanded) close(true);
      else open();
    });

    // ドロワー内のリンクを押したら閉じる（押しても開いたままだと移動先が見えない）
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a') && nav.classList.contains('is-open')) {
        close(false);
      }
    });

    // Escape で閉じる。モーダル的なUIの基本操作なので必ず実装する。
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        close(true);
      }
    });

    /* 画面幅がタブレット以上になったら、開いていても閉じる。
     * ドロワーが開いたままPC幅になると、
     * CSSで position:static に戻るため中身が画面上部に散らばってしまう。 */
    var mq = window.matchMedia('(min-width: 768px)');
    function onChange(e) {
      if (e.matches && nav.classList.contains('is-open')) close(false);
    }
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
    else if (typeof mq.addListener === 'function') mq.addListener(onChange);
  })();

  /* ==========================================================================
   * 2. 現在地の表示（スクロールスパイ）とブランド表示
   * ------------------------------------------------------------------------
   * scroll イベントで毎回位置を測るのではなく、
   * IntersectionObserver で「今どのセクションが画面の中心にあるか」を判定する。
   * rootMargin の上下を大きく削って、画面中央付近の細い帯だけを
   * 判定領域にしているのがポイント。
   * ======================================================================== */
  (function initScrollSpy() {
    var links = document.querySelectorAll('[data-navlink]');
    if (!links.length || !('IntersectionObserver' in window)) return;

    var map = {};
    var sections = [];

    links.forEach(function (link) {
      var id = link.getAttribute('href');
      if (!id || id.charAt(0) !== '#') return;
      var section = document.querySelector(id);
      if (!section) return;
      map[id.slice(1)] = link;
      sections.push(section);
    });

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = map[entry.target.id];
        if (!link) return;
        if (entry.isIntersecting) {
          // 他の現在地表示を消してから、今のリンクに付け替える
          links.forEach(function (l) {
            l.classList.remove('is-current');
            l.removeAttribute('aria-current');
          });
          link.classList.add('is-current');
          // aria-current="true" は「一覧の中の現在地」を伝える標準の属性。
          // 見た目（クラス）だけでなく、音声でも現在地が分かるようにする。
          link.setAttribute('aria-current', 'true');
        }
      });
    }, {
      // 画面の上40%・下55%を判定対象から外す＝中央の細い帯だけで判定する
      rootMargin: '-40% 0px -55% 0px',
      threshold: 0
    });

    sections.forEach(function (s) { spy.observe(s); });
  })();

  /* ==========================================================================
   * 2-2. ヘッダー直下にある面の明暗を判定して、文字色を切り替える
   * ------------------------------------------------------------------------
   * このサイトは紙白の面と黒い面が交互に来るため、
   * ヘッダーの文字色を固定するとどちらかで必ず読めなくなる。
   *
   * 【elementFromPoint を使う理由】
   * IntersectionObserver でも実装できるが、
   * 「ヘッダーの高さぶんだけ内側に入った1本の線」を監視領域にするには
   * rootMargin を画面高から逆算する必要があり、リサイズのたびに
   * Observer を作り直すことになる。
   * elementFromPoint は「その座標にある要素」を直接返すため、
   * 画面サイズが変わっても計算が要らない。
   *
   * 【rAF で間引く理由】
   * scroll イベントは1スクロールで何十回も発火する。
   * そのたびに判定すると無駄なので、
   * 「次の描画タイミングまでに1回だけ」実行するよう制御している（throttle）。
   * ======================================================================== */
  (function initHeaderTone() {
    var header = document.querySelector('.l-header');
    if (!header || !document.elementFromPoint) return;

    var ticking = false;

    function update() {
      ticking = false;

      /* 判定する座標：画面左から16px、上から36px（ヘッダーのほぼ中央の高さ）。
       * ヘッダー自身は pointer-events:none なので、
       * この座標で返るのは常に「ヘッダーの下にあるセクション」になる。 */
      var el = document.elementFromPoint(16, 36);
      if (!el || !el.closest) return;

      var toned = el.closest('[data-tone]');
      var tone = toned ? toned.getAttribute('data-tone') : 'light';
      header.classList.toggle('is-onLight', tone === 'light');
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();   // 読み込み直後にも1回判定しておく（途中から表示された場合に備える）
  })();

  /* ==========================================================================
   * 3. ヘッダーのブランド名を、Heroを抜けたら表示する
   * ======================================================================== */
  (function initBrand() {
    var brand = document.getElementById('js-brand');
    var hero = document.getElementById('hero');
    if (!brand || !hero || !('IntersectionObserver' in window)) {
      // 非対応環境では常時表示にしておく（隠れたままになるより良い）
      if (brand) brand.classList.add('is-visible');
      return;
    }

    var obs = new IntersectionObserver(function (entries) {
      // Heroが画面から出たらブランド名を出す、戻ったら消す
      brand.classList.toggle('is-visible', !entries[0].isIntersecting);
    }, { rootMargin: '-72px 0px 0px 0px', threshold: 0 });

    obs.observe(hero);
  })();

  /* ==========================================================================
   * 4. ムービーの遅延読み込み
   * ------------------------------------------------------------------------
   * YouTube等のiframeを最初から置くと、
   * 再生しないユーザーにも数百KB〜のスクリプトと通信が発生し、
   * LCPとINP（操作への反応速度）が悪化する。
   * ポスター画像だけ先に見せ、再生ボタンが押されたときに初めてiframeを作る。
   * ======================================================================== */
  (function initMovie() {
    var button = document.getElementById('js-moviePlay');
    if (!button) return;

    button.addEventListener('click', function () {
      var wrap = button.closest('.p-movie');
      var src = button.getAttribute('data-movie-src');
      if (!wrap || !src) return;

      var iframe = document.createElement('iframe');
      iframe.className = 'p-movie__frame';
      iframe.src = src;
      iframe.title = 'Gen 2027 S/S コレクションムービー';
      // allow 属性：自動再生と全画面表示を許可する。
      // ユーザーの操作をきっかけに生成しているので自動再生がブロックされない。
      iframe.setAttribute('allow',
        'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
      iframe.setAttribute('allowfullscreen', '');
      // referrerpolicy と loading は、外部埋め込み時の定番の安全策・最適化
      iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');

      wrap.appendChild(iframe);
      button.remove();      // 役目を終えたボタンは消す（iframeの操作を邪魔しないため）
    });
  })();

  /* ==========================================================================
   * 5. ページ内リンクのフォーカス移動
   * ------------------------------------------------------------------------
   * スムーススクロールはCSS（scroll-behavior）に任せているが、
   * CSSだけだと「画面は動くがフォーカスは動かない」状態になり、
   * 移動先からTabキーを押すとページ先頭に戻ってしまう。
   * 移動先にフォーカスを移して、視覚とキーボードの位置を一致させる。
   * ======================================================================== */
  (function initAnchorFocus() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href^="#"]');
      if (!link) return;

      var id = link.getAttribute('href');
      if (!id || id === '#') return;

      var target = document.querySelector(id);
      if (!target) return;

      /* tabindex="-1" を一時的に付ける理由：
       * section や div は本来フォーカスできない要素なので、
       * focus() を呼んでも何も起きない。
       * -1 は「JSからはフォーカスできるが、Tabキーの順路には入らない」指定。 */
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
      }

      // preventScroll:true にしているのは、
      // focus() 自体のジャンプでCSSのスムーススクロールを打ち消さないため。
      target.focus({ preventScroll: true });
    });
  })();
})();
