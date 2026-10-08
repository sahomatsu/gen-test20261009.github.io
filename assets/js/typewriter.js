/* ============================================================================
 * typewriter.js  ―  文章を1文字ずつ打ち出す
 * ----------------------------------------------------------------------------
 * 対象：[data-typewriter] が付いた塊の中の .c-type__line（段落）
 *
 * 【設計の要点】
 *
 * 1) 読み上げ・検索・コピーのために、全文は最初からHTMLに置いておく
 *    JSは、各行を
 *      <span class="c-type__ghost">全文</span>（透明。場所取りと読み上げ担当）
 *      <span class="c-type__out" aria-hidden="true"></span>（ここに打ち出す）
 *    の2枚に組み替えるだけ。文章そのものはHTMLから消さない。
 *    そのため、JSが動かない環境でも文章は普通に読める。
 *
 * 2) 1行ずつ順番に打つ（同時に複数行が動かないようにする）
 *    画面に複数の段落が見えているとき、全部が同時に打ち出されると
 *    「文字が湧いている画面」になって読めない。
 *    キューに積んで、前の行が終わってから次を始める。
 *
 * 3) 読み手を待たせない（追いつき処理）
 *    順番待ちの行が、読み手のスクロールで既に画面上方へ流れてしまっていたら、
 *    その行は打たずに即座に全文を表示する。
 *    これが無いと「スクロールした先の文章がまだ出ていない」状態が起きる。
 *
 * 4) クリックで最後まで飛ばせる
 *    長文なので、読む速度は人それぞれ。待たされていると感じた人のために、
 *    塊のどこかをクリック（またはキーボードのEnter/Space）で全文を即表示する。
 *
 * 5) 速度はフレーム時間から計算する
 *    「1フレームに1文字」にすると、画面のリフレッシュレート（60Hz / 120Hz）で
 *    打つ速さが倍変わってしまう。実時刻（ミリ秒）で次の1文字を出す時刻を決めている。
 *
 * 6) 機械ではなく「人が打っている」リズムにする
 *    等間隔で文字が出ると、どうしても自動再生の字幕に見える。
 *    研究員が一文字ずつ考えながら記録しているように見せるため、
 *    打鍵の間隔に次の4つを入れている（詳しくは delayAfter 関数のコメント）。
 *      ・1文字ごとの細かなゆらぎ
 *      ・句点のあとの大きな間（言い切ったあとの沈黙）
 *      ・読点のあとの小さな間
 *      ・改行のあとの間（行を変えるときの手の動き）
 *      ・ときどき入る「考え込む」間
 *
 * 7) 原稿の改行をそのまま使う
 *    HTMLに書いた改行位置を保持して打ち出す（CSS側は white-space: pre-wrap）。
 *    詩のような行分けに意味がある原稿なので、JSで詰めてはいけない。
 * ========================================================================== */

(function () {
  'use strict';

  var conf = window.GEN_MOTION || {};
  if (conf.typewriter === false) return;

  var blocks = document.querySelectorAll('[data-typewriter]');
  if (!blocks.length) return;

  /* 動きを減らす設定なら、組み替えすらせずに終わる。
   * .is-ready を付けないので、CSS側の重ね合わせも発動せず、
   * HTMLに書いてある文章がそのまま普通の段落として表示される。 */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  for (var b = 0; b < blocks.length; b++) {
    setup(blocks[b]);
  }

  function setup(block) {
    var lines = block.querySelectorAll('.c-type__line');
    if (!lines.length) return;

    /* 1文字あたりのミリ秒。HTML側の data-type-speed で上書きできる。
     * 既定 18ms は、日本語を読む速度（1文字あたり約200ms）の10倍速。
     * 「読むより速く出る」状態を保つのが、待たされないための条件。 */
    var speed = parseFloat(block.getAttribute('data-type-speed')) || 18;

    /* 打ち終わってもカーソルを残すか（data-type-caret="keep"）。
     * 「まだ書き込んでいる途中」に見せたい研究記録で使う。 */
    var keepCaret = block.getAttribute('data-type-caret') === 'keep';

    /* --------------------------------------------------------------------
     * 1文字打ったあと、次の文字までどれだけ待つかを決める
     * --------------------------------------------------------------------
     * 引数は「いま打ち終わった文字」。その文字の性格で間の長さが変わる。
     * 倍率はすべて speed に対する比なので、data-type-speed を変えれば
     * 全体のテンポが保たれたまま速さだけが変わる。
     * ------------------------------------------------------------------ */
    function delayAfter(ch) {
      /* 基本の打鍵間隔に ±35% のゆらぎ。
       * これが無いと、どれだけ間を足しても機械的な印象が残る。 */
      var d = speed * (0.65 + Math.random() * 0.7);

      /* 句読点・改行での「間」。
       * 倍率は、全体のテンポを上げるために一度見直している（改行11→6、句点13→7など）。
       * 間そのものを無くすと機械的になるが、長すぎると読み手が待たされる。
       * 「息継ぎが分かる最短」を狙った値。 */
      if (ch === '\n') {
        d += speed * 6;         // 改行：行を変えるあいだの手の動き
      } else if ('。！？'.indexOf(ch) >= 0) {
        d += speed * 7;         // 句点：一文を言い切ったあとの沈黙。最も長い
      } else if ('、，'.indexOf(ch) >= 0) {
        d += speed * 3.5;       // 読点：短く息を継ぐ程度
      } else if ('」』）'.indexOf(ch) >= 0) {
        d += speed * 2;         // 閉じ括弧：わずかに止まる
      }

      /* 60回に1回くらい、考え込んで手が止まる。
       * 確率と長さを上げすぎると「回線が重いページ」に見えるので、ここが上限。 */
      if (Math.random() < 0.015) {
        d += 110 + Math.random() * 220;
      }
      return d;
    }

    var items = [];
    var i;

    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      /* 改行は保持し、各行の前後の字下げ（HTMLのインデント）だけを取り除く。
       * replace(/\s+/g, ' ') のように全部まとめて潰すと、
       * 原稿の改行位置まで消えてしまう。 */
      var text = line.textContent
        .split('\n')
        .map(function (row) { return row.replace(/[ \t\u3000]+/g, ' ').trim(); })
        .join('\n')
        .replace(/^\n+|\n+$/g, '');
      if (!text) continue;

      line.textContent = '';

      // 場所取り＋読み上げ用（全文・透明）
      var ghost = document.createElement('span');
      ghost.className = 'c-type__ghost';
      ghost.textContent = text;

      // 打ち出し用（読み上げからは外す。同じ文章が二重に読まれるのを防ぐ）
      var out = document.createElement('span');
      out.className = 'c-type__out';
      out.setAttribute('aria-hidden', 'true');

      line.appendChild(ghost);
      line.appendChild(out);

      items.push({ line: line, out: out, text: text, started: false, done: false });
    }

    if (!items.length) return;

    // ここで初めてCSSの重ね合わせが有効になる（JSが動いた証）
    block.classList.add('is-ready');

    var queue = [];      // 打つ順番に積む
    var running = false;

    /* 画面に入った行をキューに積む。
     *
     * 【rootMargin の下側を -40% にしている理由】
     * -10% 程度だと、画面の下端にその行がちらっと顔を出した瞬間に打ち始めてしまう。
     * ユーザーがそこまでスクロールして「辿り着いた」ときには打ち終わっていて、
     * 打ち出しそのものを見られない、という状態になる。
     *
     * 下側を -40% にすると、判定に使う範囲が画面の上から 60% までに狭まる。
     * つまり「その行が画面の真ん中あたりまで上がってきたら開始」になり、
     * 読もうとして目を留めた位置で打ち始まる。
     * （画面下端に見えているだけの段階では、まだ何も起きない） */
    var io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var item = find(entry.target);
          if (!item || item.started) return;
          item.started = true;
          queue.push(item);
          io.unobserve(entry.target);
          pump();
        });
      }, { rootMargin: '0px 0px -40% 0px', threshold: 0 });

      for (i = 0; i < items.length; i++) io.observe(items[i].line);

      /* 保険：ページ最下部まで来ても始まっていない行があれば、そこで始める。
       * 下側 -40% の判定は「画面の上から60%までに入ったら」なので、
       * ページの一番下にある塊（エンドコメント）は、
       * これ以上スクロールできず判定範囲に入りきらない可能性がある。
       * 文章が永久に出ないのが最悪の結果なので、必ず出る経路を用意しておく。 */
      window.addEventListener('scroll', function atBottom() {
        var reached = window.innerHeight + window.scrollY >=
                      document.documentElement.scrollHeight - 2;
        if (!reached) return;

        for (var k = 0; k < items.length; k++) {
          if (items[k].started || items[k].done) continue;
          items[k].started = true;
          queue.push(items[k]);
          io.unobserve(items[k].line);
        }
        pump();
        window.removeEventListener('scroll', atBottom);
      }, { passive: true });
    } else {
      // IntersectionObserver 非対応：演出を諦めて全文表示（読めることを最優先）
      for (i = 0; i < items.length; i++) finish(items[i]);
      return;
    }

    function find(el) {
      for (var k = 0; k < items.length; k++) {
        if (items[k].line === el) return items[k];
      }
      return null;
    }

    /* キューを1件ずつ処理する。
     * running フラグで「同時に2行打たない」を保証している。 */
    /* すべての行が終わったら、塊に .is-complete を付ける。
     * data-type-caret="keep" のときだけ、CSS がここでカーソルを出し続ける。 */
    function checkComplete() {
      for (var k = 0; k < items.length; k++) {
        if (!items[k].done) return;
      }
      if (keepCaret) block.classList.add('is-complete');
    }

    function pump() {
      if (running) return;
      var item = queue.shift();
      if (!item) {
        checkComplete();
        return;
      }
      if (item.done) { pump(); return; }

      /* 追いつき処理：
       * 順番が回ってきた時点で、その行が既に画面の上へ流れていたら打たない。
       * 読み手が先へ進んでいるのに、後ろで文字が出続けるのは意味がないため。 */
      var rect = item.line.getBoundingClientRect();
      if (rect.bottom < 0) {
        finish(item);
        pump();
        return;
      }

      running = true;
      type(item, function () {
        running = false;
        pump();
      });
    }

    function type(item, onEnd) {
      var caret = document.createElement('span');
      caret.className = 'c-type__caret';

      var textNode = document.createTextNode('');
      item.out.appendChild(textNode);
      item.out.appendChild(caret);

      var shown = 0;       // いま表示している文字数
      var nextAt = 0;      // 次の1文字を出す時刻
      var started = false;

      function frame(now) {
        if (item.done) return;          // クリックで飛ばされた

        if (!started) {
          started = true;
          /* 書き始めるまでの一拍。
           * 画面に入った瞬間に打ち始めると、機械が反応したように見える。 */
          nextAt = now + 320;
        }

        /* 大きく遅れているときは基準時刻を現在に引き戻す。
         * タブを裏に回していた間は rAF が止まるので、戻った瞬間に
         * 「止まっていた時間ぶん」の文字が一気に出てしまうのを防ぐ。 */
        if (now - nextAt > 500) nextAt = now;

        /* 1フレームで出す文字数に上限（3文字）を設ける。
         *
         * 【nextAt を「現在時刻 + 間隔」ではなく「前回の予定時刻 + 間隔」で進める理由】
         * 画面の更新は約16.7msごとにしか起きない。
         * 現在時刻を基準にすると、20msの予定でも次の更新まで待って33msかかり、
         * 指定した速度より常に遅くなる（遅れが毎文字たまっていく）。
         * 予定時刻を足していく形にすれば、遅れたぶんは次の更新でまとめて取り戻せる。 */
        var emitted = 0;
        while (now >= nextAt && shown < item.text.length && emitted < 3) {
          shown++;
          textNode.nodeValue = item.text.slice(0, shown);
          nextAt += delayAfter(item.text.charAt(shown - 1));
          emitted++;
        }

        if (shown >= item.text.length) {
          finish(item);
          onEnd();
          return;
        }
        requestAnimationFrame(frame);
      }

      requestAnimationFrame(frame);
    }

    /* 1行を完成状態にする。
     * .is-done が付くと、CSS側で重ね合わせが解除され、
     * 透明だった ghost がそのまま普通の文章として表示される。 */
    function finish(item) {
      if (item.done) return;
      item.done = true;
      item.started = true;
      item.out.textContent = '';
      item.line.classList.add('is-done');
      checkComplete();
    }

    /* クリック／Enter・Space で最後まで飛ばす。
     * 長文なので「読む速度が演出より速い人」を待たせない逃げ道として置いている。 */
    function skipAll() {
      queue.length = 0;
      for (var k = 0; k < items.length; k++) finish(items[k]);
      if (io) io.disconnect();
    }

    block.addEventListener('click', skipAll);
    block.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') skipAll();
    });
  }
})();
