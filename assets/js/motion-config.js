/* ============================================================================
 * motion-config.js  ―  演出のオン／オフを1か所にまとめた設定
 * ----------------------------------------------------------------------------
 * 【このファイルの目的】
 * 演出は「入れる」より「止める」ほうが難しい。
 * 各ファイルに散らばった animation や JS を探して回ることになるからです。
 * そこで、止めたくなったときに触る場所をこの1ファイルだけにしてあります。
 *
 * 使い方：下の値を false にするだけ。HTMLもCSSも触る必要はありません。
 *
 * 仕組み：false にしたものは html 要素に .m-off-◯◯ というクラスが付き、
 * CSS側（motion.css）の打ち消し指定が効きます。
 * JSで動かす演出は、各ファイルがこの設定を見て、そもそも起動しません。
 *
 * 【注意】このファイルは他のJSより先に読み込む必要があります
 * （index.html の script の並び順を変えないでください）。
 * ========================================================================== */

window.GEN_MOTION = {
  loader:       true,  // 導入演出：墨が一滴落ちて Gen が浮かぶ（初回訪問のみ）
  breathe:      true,  // 墨の呼吸：Hero とフッターの墨がごくゆっくり膨らむ
  drift:        true,  // 霞の漂い：セクションの発光が左右にゆっくり流れる
  glowPulse:    true,  // 光のゆらぎ：背景の緑がぼんやり明るくなっては沈む
  grainReact:   true,  // 粒子の反応：スクロールが速いほどフィルムグレインが立つ
  blurReveal:   true,  // にじみ出し：要素が「ぼけ→定着」で現れる（false で移動のみ）
  splitHeading: true,  // 見出しの一文字ずつ
  parallax:     true,  // ルック画像のパララックス
  counterTick:  true,  // カウントダウンの変わった桁が落ちてくる
  cursorLabel:  true,  // 試料ラベル：カーソルの後ろに座標が薄く付いてくる
  typewriter:   true   // About のコンセプト本文を1文字ずつ打ち出す
};

/* 設定を即座に反映する。
 * DOMContentLoaded を待たないのは、html 要素は解析開始時点で既に存在しており、
 * 待つと「一瞬アニメーションしてから止まる」ちらつきが出るため。 */
(function () {
  'use strict';
  var root = document.documentElement;
  var conf = window.GEN_MOTION;

  for (var key in conf) {
    if (Object.prototype.hasOwnProperty.call(conf, key) && conf[key] === false) {
      root.classList.add('m-off-' + key);
    }
  }

  /* にじみ出しの blur 量だけは CSS変数で持っている。
   * クラスの打ち消しではなく変数を 0 にするほうが、
   * 「移動だけは残す」という中間の状態を作れるため。 */
  if (conf.blurReveal === false) {
    root.style.setProperty('--reveal-blur', '0px');
  }
})();
