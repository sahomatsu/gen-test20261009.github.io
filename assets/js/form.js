/* ============================================================================
 * form.js  ―  お問い合わせフォームの入力チェック
 * ----------------------------------------------------------------------------
 * 【方針】
 *  1) HTML標準のバリデーション（required / type="email" / maxlength）を土台にする。
 *     JSが動かない環境でもブラウザが最低限のチェックをしてくれるため。
 *     そのうえで <form novalidate> を付け、
 *     「ブラウザ既定の吹き出し」ではなく自前のメッセージを出す。
 *     理由：既定の吹き出しはデザインを一切変更できず、
 *     日本語訳もブラウザごとに違って文言が統一できない。
 *
 *  2) 入力中はエラーを出さない。
 *     入力し終える前に赤くなると急かされている感じになるため、
 *     ・送信時
 *     ・一度エラーになった項目を修正したとき
 *     の2つのタイミングだけで判定する。
 *
 *  3) エラーは色だけで示さない。
 *     色覚特性のある方に伝わらないため、
 *     テキストメッセージ＋aria-invalid＋aria-describedby の3点セットで伝える。
 *
 *  4) 送信は「実際の送信先が決まっていない」ため、
 *     ここでは画面上の完了表示までを実装している。
 *     実際のフォームメール／Googleフォーム連携に差し替える箇所は
 *     sendForm() 関数に集約してある（コメント参照）。
 * ========================================================================== */

(function () {
  'use strict';

  var form = document.getElementById('js-contactForm');
  if (!form) return;

  var statusBox = document.getElementById('js-formStatus');

  /* 検証ルール。
   * HTMLのrequired等と重複しているように見えるが、
   * 「メッセージの文言」をここで一元管理するために持っている。
   * 項目を増やすときは、この配列に1行足すだけで済む設計にした。 */
  var RULES = [
    {
      name: 'name',
      required: true,
      messages: { required: 'お名前を入力してください。' }
    },
    {
      name: 'email',
      required: true,
      // メールアドレスの正規表現。
      // RFCに厳密に従った判定は現実的でないため、
      // 「@があり、前後に文字があり、ドメインにドットがある」程度の実用的な判定にしている。
      // 厳しすぎる判定は、正しいアドレスを弾いてしまうほうが損失が大きい。
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
      messages: {
        required: 'メールアドレスを入力してください。',
        pattern: 'メールアドレスの形式が正しくないようです。'
      }
    },
    {
      name: 'subject',
      required: false
    },
    {
      name: 'message',
      required: true,
      minLength: 10,
      messages: {
        required: 'お問い合わせ内容を入力してください。',
        minLength: 'お問い合わせ内容は10文字以上で入力してください。'
      }
    }
  ];

  /* 1項目を検証してメッセージ文字列（問題なければ空文字）を返す */
  function validateField(rule) {
    var field = form.elements[rule.name];
    if (!field) return '';

    var value = String(field.value || '').trim();
    var msgs = rule.messages || {};

    if (rule.required && value === '') {
      return msgs.required || '入力してください。';
    }
    // 任意項目が空のときは、以降のチェックをかけない（空欄は正常な状態）
    if (value === '') return '';

    if (rule.minLength && value.length < rule.minLength) {
      return msgs.minLength || (rule.minLength + '文字以上で入力してください。');
    }
    if (rule.pattern && !rule.pattern.test(value)) {
      return msgs.pattern || '入力内容を確認してください。';
    }
    return '';
  }

  /* 検証結果を画面へ反映する。
   * 見た目（CSS）は aria-invalid 属性をセレクタにしているので、
   * ここで属性を正しく更新すれば見た目も同時に変わる。 */
  function applyResult(rule, message) {
    var field = form.elements[rule.name];
    if (!field) return;

    var errorBox = document.getElementById('error-' + rule.name);

    if (message) {
      field.setAttribute('aria-invalid', 'true');
      if (errorBox) {
        errorBox.textContent = message;
        // aria-describedby で「この入力欄の説明はこの要素です」と結びつける。
        // これがないと、読み上げ時にエラー文が入力欄と無関係に読まれてしまう。
        field.setAttribute('aria-describedby', errorBox.id);
      }
    } else {
      field.removeAttribute('aria-invalid');
      if (errorBox) {
        errorBox.textContent = '';
        field.removeAttribute('aria-describedby');
      }
    }
  }

  /* 一度エラーになった項目は、入力のたびに再判定して
   * 直った瞬間にエラー表示を消す。
   * （直したのに赤いまま、という状態をなくすため） */
  RULES.forEach(function (rule) {
    var field = form.elements[rule.name];
    if (!field) return;

    field.addEventListener('input', function () {
      if (field.getAttribute('aria-invalid') !== 'true') return;
      applyResult(rule, validateField(rule));
    });

    // フォーカスを外したタイミングでも判定する。
    // ただし一度も触れていない項目は対象外（触っていないのに怒られないように）
    field.addEventListener('blur', function () {
      if (String(field.value || '').trim() === '' && field.getAttribute('aria-invalid') !== 'true') return;
      applyResult(rule, validateField(rule));
    });
  });

  /* --------------------------------------------------------------------------
   * 送信処理の差し替えポイント ★ここを直せばメールが届くようになります
   * --------------------------------------------------------------------------
   * 現状は送信先が未定のため、600ms 待って「成功した」ことにしているだけです。
   *
   * 【前提】HTMLとJSだけではメールは送れません。
   * 「フォームの内容を受け取ってメールに転送してくれる窓口」が別途必要です。
   * 受信するメールアドレスは、その窓口側に登録します（HTMLには書きません）。
   * ソースに平文で書いたアドレスは迷惑メール業者に収集されるためです。
   *
   * ■ 方法A：フォームサービス（Formspree / formrun / SSGform 等。サーバー不要）
   *   1. サービスに受信用アドレスを登録すると、送信先URLが発行される
   *   2. index.html の <form> に action="発行されたURL" method="post" を足す
   *   3. この関数の中身を次に置き換える
   *
   *      return fetch(form.action, {
   *        method: 'POST',
   *        body: new FormData(form),
   *        headers: { 'Accept': 'application/json' }
   *      }).then(function (res) {
   *        if (!res.ok) throw new Error('送信に失敗しました');
   *      });
   *
   *   fetch を使うと、ページ遷移せずに今の完了メッセージのまま終われます。
   *
   * ■ 方法B：レンタルサーバーのPHP
   *   contact.php を置き、その中に $to = 'アドレス'; と書く。
   *   HTML側は action="contact.php" method="post" にする。
   *   送信元ドメインの設定（SPF等）を誤ると、送信成功でも迷惑メール扱いで届きません。
   *
   * ■ Googleフォームに送る場合
   *   Exhibition と同じく iframe 埋め込みにするのが確実。
   *   このフォームからGoogleフォームへPOSTする方法もあるが、
   *   項目IDの取り違えで送信内容が欠ける事故が起きやすいため推奨しない。
   *
   * ※ どの方法でも、入力チェックはサーバー（窓口）側でも必ず行ってください。
   *   下のチェックはブラウザ上のものなので、開発者ツールから迂回できます。
   * ------------------------------------------------------------------------ */
  function sendForm() {
    // Promise を返す形にしてあるので、fetch に差し替えてもこの先のコードは変えなくてよい
    return new Promise(function (resolve) {
      setTimeout(resolve, 600);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();   // 既定の送信（ページ遷移）を止め、JSで制御する

    var firstInvalid = null;

    RULES.forEach(function (rule) {
      var message = validateField(rule);
      applyResult(rule, message);
      if (message && !firstInvalid) {
        firstInvalid = form.elements[rule.name];
      }
    });

    if (firstInvalid) {
      if (statusBox) {
        statusBox.textContent = '入力内容に誤りがあります。赤く表示された項目をご確認ください。';
      }
      // 最初のエラー項目へフォーカスを移す。
      // エラーが画面外にあると気づけないため、必ず移動させる。
      firstInvalid.focus();
      return;
    }

    // 二重送信の防止。
    // 通信が終わる前にもう一度押されると同じ内容が複数届いてしまう。
    var submitButton = form.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    if (statusBox) statusBox.textContent = '送信しています…';

    sendForm().then(function () {
      if (statusBox) {
        statusBox.textContent =
          'お問い合わせを受け付けました。3営業日以内にご返信いたします。';
      }
      form.reset();
    }).catch(function () {
      if (statusBox) {
        statusBox.textContent =
          '送信に失敗しました。時間をおいて再度お試しいただくか、記載のメールアドレスへご連絡ください。';
      }
    }).finally(function () {
      if (submitButton) submitButton.disabled = false;
    });
  });
})();
