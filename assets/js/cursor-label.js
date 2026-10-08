/* ============================================================================
 * cursor-label.js  ―  カーソルの十字線と試料ラベル
 * ----------------------------------------------------------------------------
 * カーソルの少し後ろに、観測装置のような座標表示をごく薄く出す。
 *
 * 【墨のストーカーと同居させるための設計】
 * 同じ場所に2つのものが追従すると情報が渋滞する。そこで、
 *  ・墨はカーソルに即応（その場に置かれる）
 *  ・ラベルは遅れて追う（補間で 0.12 ずつ近づく）
 * と役割を分け、「墨が先、ラベルが後」という前後関係を作っている。
 * ラベルの色も墨より暗く抑えてあり（cursorLabel.css）、主役は常に墨。
 *
 * 【座標の値について】
 * 画面座標をそのまま出すと、ウィンドウサイズによって桁数が変わって
 * 表示幅が揺れる。4桁に固定（0 埋め）して、常に同じ幅で出している。
 *
 * 【起動条件】
 * 墨のストーカーとまったく同じ条件（マウスがある／動きを減らす設定でない）。
 * 片方だけ出ると「数字だけが付いてくる」不可解な状態になるため。
 * ========================================================================== */

(function () {
  'use strict';

  var conf = window.GEN_MOTION || {};

  if (conf.cursorLabel === false) return;

  var el = document.getElementById('js-cursorLabel');
  if (!el) return;

  var reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (!finePointerQuery.matches || reduceMotionQuery.matches) return;

  var coordEl = el.querySelector('[data-coord]');
  var subEl = el.querySelector('[data-sub]');

  /* 目標位置（カーソル）と現在位置（ラベル）を分けて持つ。
   * 差を少しずつ詰めることで「遅れて付いてくる」動きになる。 */
  var target = { x: -200, y: -200 };
  var current = { x: -200, y: -200 };
  var rafId = null;
  var hideTimer = null;

  /* カーソルからの距離。真下に置くとカーソルに隠れるため、
   * 右下へずらしている。18/22 は、ラベルとカーソルが重ならず、
   * かつ離れすぎて無関係に見えない距離として選んだ。 */
  var OFFSET_X = 18;
  var OFFSET_Y = 22;

  function pad4(n) {
    var s = String(Math.max(0, Math.round(n)));
    while (s.length < 4) s = '0' + s;
    return s;
  }

  function loop() {
    /* 0.12 ずつ近づける。値が小さいほど遅れが大きくなる。
     * 0.2 を超えるとほぼカーソルに貼り付いて「遅れ」が感じられず、
     * 0.08 を下回ると置いていかれて別物に見える。 */
    current.x += (target.x - current.x) * 0.12;
    current.y += (target.y - current.y) * 0.12;

    el.style.transform =
      'translate3d(' + (current.x + OFFSET_X).toFixed(1) + 'px, ' +
      (current.y + OFFSET_Y).toFixed(1) + 'px, 0)';

    /* 十分近づいたらループを止める（カーソルが止まっている間は計算しない） */
    if (Math.abs(target.x - current.x) < 0.3 && Math.abs(target.y - current.y) < 0.3) {
      rafId = null;
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  function onMove(e) {
    target.x = e.clientX;
    target.y = e.clientY;

    if (coordEl) coordEl.textContent = 'X:' + pad4(e.clientX) + '  Y:' + pad4(e.clientY);
    el.classList.add('is-active');
    if (rafId === null) rafId = requestAnimationFrame(loop);

    /* カーソルが止まったら少し遅れて消す。
     * 出しっぱなしにすると、読んでいる最中に数字が視界に残り続けるため。 */
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hideAll, 1600);
  }

  function hideAll() {
    el.classList.remove('is-active');
  }

  /* 試料番号は「今どのセクションを見ているか」で変える。
   * 座標だけだとただの数字だが、セクションごとに番号が変わると
   * 「観測対象が切り替わっている」ように読める。 */
  function updateSpecimen() {
    if (!subEl) return;
    /* :not([hidden]) を付けているのは、一時的に非表示にしたセクションを
     * 番号に数えないため。これが無いと、見えていないセクションのぶん
     * 試料番号が飛んで（01 → 03 のように）不整合に見える。 */
    var sections = document.querySelectorAll('main section[id]:not([hidden])');
    var mid = window.innerHeight / 2;
    /* 変数名を inView にしているのは、上のラベル位置用 current と紛らわしいため。
     * （別スコープなので動作に影響はないが、読み違えの元になる） */
    var inView = null;

    for (var i = 0; i < sections.length; i++) {
      var r = sections[i].getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) { inView = sections[i]; break; }
    }
    var no = inView ? (Array.prototype.indexOf.call(sections, inView) + 1) : 0;
    subEl.textContent = 'SPECIMEN ' + (no > 0 ? '0' + no : '—');
  }

  window.addEventListener('mousemove', onMove, { passive: true });
  window.addEventListener('scroll', updateSpecimen, { passive: true });
  updateSpecimen();

  /* マウスが画面外に出たら消す（ウィンドウの端に取り残されないように） */
  document.addEventListener('mouseleave', hideAll);
})();
