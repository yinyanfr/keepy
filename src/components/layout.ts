import { escapeAttribute, escapeHtml, page } from "../lib/html.js";
import type { User } from "../services/keepyService.js";

export function appShell(input: {
  active: "books" | "history" | "home" | "settings";
  body: string;
  title: string;
  user: User;
}): string {
  const displayName = input.user.username
    ? `@${input.user.username}`
    : [input.user.firstName, input.user.lastName].filter(Boolean).join(" ") || "Keepy";

  return page(
    input.title,
    `
    <main class="app">
      <header class="topbar">
        <a class="brand" href="/">Keepy</a>
        <div class="topbar-actions">
          <div class="profile">
            ${avatar(input.user)}
            <span>${escapeHtml(displayName)}</span>
          </div>
          <details class="menu">
            <summary aria-label="菜单">☰</summary>
            <nav>
              ${menuLink("/", "本月明细", input.active === "home")}
              ${menuLink("/settings", "账本设置", input.active === "settings")}
              ${menuLink("/books", "账本列表", input.active === "books")}
              ${menuLink("/history", "历史记录", input.active === "history")}
              <form method="post" action="/auth/logout">
                <button type="submit">退出登录</button>
              </form>
            </nav>
          </details>
        </div>
      </header>
      ${input.body}
    </main>
    ${style()}
    `,
  );
}

export function loginPage(botUsername: string): string {
  const widget = botUsername
    ? `<script async src="https://telegram.org/js/telegram-widget.js?22"
        data-telegram-login="${escapeAttribute(botUsername)}"
        data-size="large"
        data-auth-url="/auth/telegram-login"
        data-request-access="write"></script>`
    : `<p class="muted">缺少 BOT_USERNAME，浏览器登录暂不可用。</p>`;

  return page(
    "Keepy 登录",
    `
    <main class="login">
      <section>
        <h1>Keepy</h1>
        <p>轻量 Telegram 记账。</p>
        <div class="login-box">
          ${widget}
        </div>
      </section>
    </main>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <script>
      (() => {
        const webApp = window.Telegram && window.Telegram.WebApp;
        if (!webApp || !webApp.initData) return;
        webApp.ready();
        fetch("/auth/telegram-webapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: webApp.initData })
        }).then((response) => {
          if (response.ok) window.location.replace("/");
        });
      })();
    </script>
    ${style()}
    `,
  );
}

function avatar(user: User): string {
  if (user.photoUrl) {
    return `<img src="${escapeAttribute(user.photoUrl)}" alt="" />`;
  }

  const fallback = (user.firstName?.[0] ?? user.username?.[0] ?? "K").toUpperCase();
  return `<span class="avatar-fallback">${escapeHtml(fallback)}</span>`;
}

function menuLink(href: string, label: string, active: boolean): string {
  return `<a class="${active ? "active" : ""}" href="${href}">${escapeHtml(label)}</a>`;
}

export function style(): string {
  return `<style>
    :root {
      color-scheme: light;
      --bg: #f6f7f3;
      --panel: #ffffff;
      --ink: #1f2523;
      --muted: #69736e;
      --line: #dde4dc;
      --green: #23715b;
      --green-strong: #185541;
      --red: #b54545;
      --amber: #a26718;
      --shadow: 0 12px 32px rgba(31, 37, 35, 0.08);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }

    a { color: inherit; text-decoration: none; }
    button, input, select {
      font: inherit;
    }

    .app {
      width: min(100%, 760px);
      min-height: 100vh;
      margin: 0 auto;
      padding: 16px;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 18px;
    }

    .brand {
      font-size: 24px;
      font-weight: 800;
      color: var(--green-strong);
    }

    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .profile {
      display: flex;
      align-items: center;
      min-width: 0;
      gap: 8px;
      color: var(--muted);
      font-size: 14px;
    }

    .profile span:last-child {
      max-width: 132px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .profile img, .avatar-fallback {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: #d9eadf;
      color: var(--green-strong);
      font-weight: 700;
      flex: 0 0 auto;
    }

    .menu {
      position: relative;
    }

    .menu summary {
      width: 36px;
      height: 36px;
      display: grid;
      place-items: center;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      cursor: pointer;
      list-style: none;
    }

    .menu summary::-webkit-details-marker { display: none; }

    .menu nav {
      position: absolute;
      top: 44px;
      right: 0;
      z-index: 2;
      width: 172px;
      padding: 8px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: var(--shadow);
    }

    .menu a, .menu button {
      width: 100%;
      display: block;
      padding: 10px 12px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--ink);
      text-align: left;
      cursor: pointer;
    }

    .menu .active, .menu a:hover, .menu button:hover {
      background: #eaf3ee;
      color: var(--green-strong);
    }

    .section-title {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin: 20px 0 10px;
    }

    .section-title h1, .section-title h2 {
      margin: 0;
      font-size: 22px;
    }

    .muted { color: var(--muted); }

    .stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .stat, .card, .form-panel, .bill-list, .empty {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: var(--shadow);
    }

    .stat {
      padding: 14px;
      min-height: 86px;
    }

    .stat strong {
      display: block;
      margin-top: 6px;
      font-size: 20px;
      color: var(--green-strong);
    }

    .bill-list {
      overflow: hidden;
    }

    .bill {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      padding: 14px;
      border-top: 1px solid var(--line);
    }

    .bill:first-child { border-top: 0; }
    .bill-purpose { font-weight: 700; }
    .bill-meta { color: var(--muted); font-size: 13px; }
    .amount.expense { color: var(--red); }
    .amount.income { color: var(--green); }

    .form-panel {
      display: grid;
      gap: 14px;
      padding: 14px;
    }

    label {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-size: 13px;
    }

    input, select {
      width: 100%;
      min-height: 42px;
      padding: 9px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      color: var(--ink);
    }

    .button-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .button {
      min-height: 42px;
      padding: 9px 14px;
      border: 0;
      border-radius: 8px;
      background: var(--green);
      color: white;
      font-weight: 700;
      cursor: pointer;
    }

    .button.secondary {
      border: 1px solid var(--line);
      background: white;
      color: var(--ink);
    }

    .book-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
      padding: 14px;
      border-top: 1px solid var(--line);
    }

    .book-row:first-child { border-top: 0; }
    .badge {
      padding: 4px 8px;
      border-radius: 999px;
      background: #eaf3ee;
      color: var(--green-strong);
      font-size: 12px;
      font-weight: 700;
    }

    .empty {
      padding: 18px;
      color: var(--muted);
      text-align: center;
    }

    .login {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: var(--bg);
    }

    .login section {
      width: min(100%, 360px);
      padding: 28px 20px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: var(--shadow);
      text-align: center;
    }

    .login h1 {
      margin: 0;
      color: var(--green-strong);
      font-size: 36px;
    }

    .login-box {
      min-height: 54px;
      margin-top: 20px;
      display: grid;
      place-items: center;
    }

    @media (max-width: 480px) {
      .app { padding: 14px 12px; }
      .stats { grid-template-columns: 1fr; }
      .profile span:last-child { max-width: 92px; }
      .section-title h1, .section-title h2 { font-size: 20px; }
    }
  </style>`;
}
