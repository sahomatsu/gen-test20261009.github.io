/* ============================================================================
 * section-label.js  ―  セクション題名（縦置きラベル）の出し入れ
 * ----------------------------------------------------------------------------
 * 「SEC.02 — Exhibition」などのラベルを、そのセクションが画面に入っている
 * あいだだけ表示する。入るときはフェードイン、出るときはぼけながら消える
 * （見た目の指定は object/component/heading.css 側）。
 *
 * 【reveal.js と分けている理由】
 * reveal.js は「1回出したら監視をやめる」演出で、出入りを繰り返さない。
 * こちらは逆に、入る／出るの両方を何度でも扱う必要があるため、
 * 同じ IntersectionObserver でもルールが正反対になる。
 * 1つのファイルに同居させると「unobserve する／しない」の分岐が増えて
 * 読みにくくなるので、役割ごとにファイルを分けた。
 *
 * 【監視するのがラベル自身ではなくセクションである理由】
 * ラベルはセクションの左端に絶対配置されており、縦に数百pxしかない。
 * ラベルを監視すると「ラベルが画面から出た＝セクションはまだ画面内」でも
 * 消えてしまう。題名は面に属する情報なので、面（section）を見る。
 * ========================================================================== */

(function () {
  'use strict';

  var labels = document.querySelectorAll('.js-sectionLabel');
  if (!labels.length) return;

  /* 動きを減らす設定／IntersectionObserver 非対応のときは、
   * 演出をあきらめて最初から全部表示する。
   * 題名が読めないまま残るほうが問題だという判断。 */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    for (var i = 0; i < labels.length; i++) {
      labels[i].classList.add('is-inview');
    }
    return;
  }

  /* セクション → そのセクションのラベル、の対応を先に作っておく。
   * コールバックの中で毎回 querySelector すると、
   * スクロールのたびにDOM検索が走って無駄になるため。 */
  var map = [];
  for (var j = 0; j < labels.length; j++) {
    var section = labels[j].closest('.l-section');
    if (section) map.push({ section: section, label: labels[j] });
  }
  if (!map.length) return;

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      for (var k = 0; k < map.length; k++) {
        if (map[k].section !== entry.target) continue;
        map[k].label.classList.toggle('is-inview', entry.isIntersecting);
      }
    });
  }, {
    /* rootMargin の上下を -25% にしている理由：
     * 画面の端にセクションが1行だけ覗いている状態で題名が出ると、
     * スクロール中に出たり消えたりを繰り返して落ち着かない。
     * 上下25%ぶん内側（＝画面の中央50%）にセクションが掛かって
     * はじめて「そのセクションを見ている」と判定する。
     *
     * threshold は 0：帯が少しでも中央50%に掛かれば出す。
     * 面積比で判定すると、画面より背の高いセクションと
     * 小さなセクションとで出るタイミングが揃わなくなる。 */
    rootMargin: '-25% 0px -25% 0px',
    threshold: 0
  });

  for (var m = 0; m < map.length; m++) {
    observer.observe(map[m].section);
  }
})();
