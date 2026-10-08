/* ============================================================================
 * loader.js  ―  導入演出の後始末
 * ----------------------------------------------------------------------------
 * 演出そのものは CSS（loader.css）だけで完結していて、
 * JSが1行も動かなくても 1.9 秒後に必ず消えます。
 * このファイルが担当するのは次の2つだけです。
 *
 *  1) 「見た」という記録を残す（同じセッション中の2回目以降は出さない）
 *     ※ 実際に出さない判定は index.html の <head> にある数行が行っています。
 *        描画が始まる前にクラスを付ける必要があるため、そこだけ head に置いています。
 *  2) 演出が終わったらオーバーレイをDOMから取り除く
 *     残したままでも見た目には影響しませんが、
 *     画面全面を覆う要素が残っていると、後から追加した機能が
 *     「クリックできない」原因を探しにくくなるため、消しておきます。
 *
 * 【sessionStorage を使う理由】
 * localStorage だと「次にサイトを開いたときも出ない」ことになり、
 * 日を改めて訪れた人が演出を見られません。
 * sessionStorage はタブを閉じると消えるので、
 * 「同じ滞在中は繰り返さないが、訪問しなおせば見られる」状態になります。
 * ========================================================================== */

(function () {
  'use strict';

  var conf = window.GEN_MOTION || {};
  var loader = document.querySelector('.c-loader');
  if (!loader) return;

  /* 設定で切られている場合、または動きを減らす設定の場合は即座に取り除く。
   * CSS側でも display:none にしているが、DOMからも外して確実にする。 */
  if (conf.loader === false ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (loader.parentNode) loader.parentNode.removeChild(loader);
    return;
  }

  /* 「見た」記録。
   * try/catch で囲むのは、プライベートブラウジングなど
   * sessionStorage への書き込みが例外になる環境があるため。
   * 記録できなくても演出が2回出るだけなので、失敗しても何もしない。 */
  try {
    window.sessionStorage.setItem('gen-loader-seen', '1');
  } catch (e) {
    /* 何もしない（記録できないだけで、演出の動作には影響しない） */
  }

  /* 演出の終わりを animationend で受ける。
   * 固定秒数の setTimeout にしないのは、
   * CSS側の秒数を変えたときにJSも直す必要が出てしまうため。 */
  function remove() {
    if (loader.parentNode) loader.parentNode.removeChild(loader);
  }

  loader.addEventListener('animationend', function (e) {
    /* オーバーレイ自身のフェードアウト（c-loaderOut）が終わったときだけ反応する。
     * 中の墨や文字のアニメーション終了でも animationend は飛んでくるため、
     * 名前で絞らないと演出の途中で消えてしまう。 */
    if (e.animationName === 'c-loaderOut') remove();
  });

  /* 保険：animationend が来ない環境（アニメーションが無効化されている等）でも
   * 3秒後には必ず取り除く。 */
  window.setTimeout(remove, 3000);
})();
