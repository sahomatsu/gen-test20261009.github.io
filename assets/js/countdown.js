/* ============================================================================
 * countdown.js  ―  開催日までのカウントダウン
 * ----------------------------------------------------------------------------
 * ワイヤーフレームの「00:00:00」にあたる表示。
 *
 * 【設計上の判断】
 *  1) 開催日時はJSに直書きせず、HTML側の data-deadline 属性から読む。
 *     理由：日程変更のたびにJSを触るのは事故のもと。
 *     日付は「コンテンツ」なのでHTMLに置くのが正しい。
 *     さらに <time datetime="..."> と同じ値を使うので、
 *     構造化データ・表示・カウントダウンの3つが1つの値から作られる。
 *
 *  2) setInterval(…, 1000) ではなく、毎秒ちょうどに合わせて再スケジュールする。
 *     理由：setInterval は誤差が蓄積して表示が飛ぶことがある。
 *     次の「秒の変わり目」までの残りミリ秒を計算して setTimeout する方式なら
 *     ずれが蓄積しない。
 *
 *  3) 秒まで動く表示は、支援技術にとってはノイズになる。
 *     aria-live は付けず（＝毎秒読み上げさせない）、
 *     代わりに aria-label で「残り◯日」という静的な要約を持たせる。
 *
 *  4) 開催済み・日付未設定でも壊れないようにする。
 *
 *  5) 【ティック演出】数字は1文字ずつ span に入れ、
 *     「前回と変わった桁だけ」を落として見せる。
 *     理由：毎秒すべての数字が動くと視界の端で常に何かが動いている状態になり、
 *     本文を読む邪魔になる。変わった桁だけなら、分が変わる瞬間にしか動かない。
 *     （演出は motion-config.js の counterTick で切れる）
 * ========================================================================== */

(function () {
  'use strict';

  // 複数箇所（Hero とフッター）に同じカウンターを置くため querySelectorAll で取る
  var nodes = document.querySelectorAll('[data-countdown]');
  if (!nodes.length) return;

  /* 数値を2桁（必要なら3桁）にそろえる。
   * padStart を使うと "7" → "07" になる。
   * 桁が揃っていないと、秒が変わるたびに横幅が動いて落ち着かないため。 */
  function pad(n, len) {
    return String(n).padStart(len || 2, '0');
  }

  /* --------------------------------------------------------------------------
   * 文字列を1文字ずつ span に流し込む
   * ------------------------------------------------------------------------
   * textContent を丸ごと書き換えないのは、
   * 「どの桁が変わったか」を知るため。丸ごと置き換えると全桁が新しい要素になり、
   * 変わっていない桁まで animation が走ってしまう。
   * ------------------------------------------------------------------------ */
  function paint(el, text) {
    var spans = el.__tickSpans;

    /* 初回、または桁数が変わったとき（999日→1000日など）は作り直す */
    if (!spans || spans.length !== text.length) {
      el.textContent = '';
      spans = [];
      for (var i = 0; i < text.length; i++) {
        var span = document.createElement('span');
        span.className = 'c-tick';
        span.textContent = text.charAt(i);
        el.appendChild(span);
        spans.push(span);
      }
      el.__tickSpans = spans;
      return;
    }

    for (var j = 0; j < text.length; j++) {
      var ch = text.charAt(j);
      if (spans[j].textContent === ch) continue;   // 変わっていない桁は触らない

      spans[j].textContent = ch;

      /* アニメーションを付け直す。
       * クラスを消してすぐ付けるだけでは、ブラウザが「変化なし」とみなして
       * 再生されない。offsetWidth を読んでスタイル計算を強制的に確定させると、
       * 確実に再生される（reflow を1要素ぶんだけ意図的に起こす定番の手法）。 */
      spans[j].classList.remove('is-ticking');
      void spans[j].offsetWidth;
      spans[j].classList.add('is-ticking');
    }
  }

  function render() {
    var now = Date.now();

    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var raw = el.getAttribute('data-deadline');
      var target = raw ? Date.parse(raw) : NaN;

      // 日付が読めないとき（属性の書き間違いなど）は "00:00:00" のまま止める。
      // 画面に NaN が出るより、初期値のまま静止しているほうが被害が小さい。
      if (isNaN(target)) {
        paint(el, '000:00:00');
        continue;
      }

      var diff = target - now;

      // 開催日を過ぎたら 0 固定＋状態クラス。
      // CSSで「開催済み」の見せ方を変えられるようにしている。
      if (diff <= 0) {
        paint(el, '000:00:00');
        el.setAttribute('aria-label', '開催日を迎えました');
        el.classList.add('is-ended');
        continue;
      }

      var totalSec = Math.floor(diff / 1000);
      var days = Math.floor(totalSec / 86400);
      var hours = Math.floor((totalSec % 86400) / 3600);
      var mins = Math.floor((totalSec % 3600) / 60);
      var secs = totalSec % 60;

      // 表示は「日:時:分」ではなく、ワイヤーの3桁区切りに合わせて
      // 「残り日数 : 時 : 分」で見せる。秒まで出すと4ブロックになり、
      // ワイヤーの 00:00:00 という3ブロックの表記から外れるため。
      // 秒は単位ラベル側ではなく aria-label の要約に含める。
      paint(el, pad(days, 3) + ':' + pad(hours) + ':' + pad(mins));

      // 読み上げ用の要約。秒は含めない（毎秒変わる情報は音声では不要）
      el.setAttribute('aria-label',
        '開催まであと' + days + '日' + hours + '時間' + mins + '分');

      // 秒は視覚的な「動いている感じ」を担保するために data 属性で持たせる。
      // CSSの ::after などで使いたくなった場合に備えた拡張ポイント。
      el.setAttribute('data-seconds', pad(secs));
    }
  }

  /* 次の「秒の変わり目」に合わせて再実行する。
   * 1000 - (現在のミリ秒) が次の変わり目までの時間。
   * +30ms の余裕を足しているのは、わずかに手前で発火して
   * 同じ秒を2回描画してしまうのを防ぐため。 */
  function tick() {
    render();
    var delay = 1000 - (Date.now() % 1000) + 30;
    setTimeout(tick, delay);
  }

  tick();
})();
