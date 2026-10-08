/* ============================================================================
 * reveal.js  ―  スクロールに応じた表示演出
 * ----------------------------------------------------------------------------
 * 【なぜ scroll イベントではなく IntersectionObserver を使うのか】
 * scroll イベントは1回のスクロールで何十回も発火し、
 * そのたびに getBoundingClientRect() で位置を測ると
 * レイアウトの再計算（reflow）が走ってカクつく原因になる。
 * IntersectionObserver は「要素が画面に入った／出た」をブラウザ側が
 * 非同期で判定してくれるため、位置計算が不要でコストがほぼかからない。
 *
 * 【一度出したら監視を解除する理由】
 * 出入りのたびに再生すると、スクロールを戻したとき画面が騒がしくなる。
 * 「作品を引き立てる」方針に沿って、演出は1要素につき1回だけにしている。
 * 監視解除はメモリの節約にもなる。
 * ========================================================================== */

(function () {
  'use strict';

  var targets = document.querySelectorAll('.js-reveal');
  if (!targets.length) return;

  /* 動きを減らす設定の場合は、演出せず即座に表示状態にする。
   * CSS側でも打ち消しているが、JSでもクラスを付けておくことで
   * 「.is-inview が付いている前提」の他の処理があっても破綻しない。 */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (var i = 0; i < targets.length; i++) {
      targets[i].classList.add('is-inview');
    }
    return;
  }

  /* IntersectionObserver 非対応ブラウザ（古いSafariなど）への保険。
   * 演出を諦めて全部表示する。
   * 「動かないが読める」状態を必ず確保するのが、
   * プログレッシブエンハンスメントの考え方。 */
  if (!('IntersectionObserver' in window)) {
    for (var j = 0; j < targets.length; j++) {
      targets[j].classList.add('is-inview');
    }
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-inview');
      observer.unobserve(entry.target);   // 1回出したら監視をやめる
    });
  }, {
    /* rootMargin の下側を -12% にしている理由：
     * 要素が画面の下端に「ちらっと」見えた瞬間に動き始めると、
     * スクロールを止めたときには演出が終わっていて何も見えない。
     * 画面の12%ぶん内側に入ってから開始させることで、
     * ユーザーがその要素を見ているタイミングと演出が重なる。 */
    rootMargin: '0px 0px -12% 0px',
    threshold: 0.05
  });

  for (var k = 0; k < targets.length; k++) {
    observer.observe(targets[k]);
  }
})();
