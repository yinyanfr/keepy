import { escapeAttribute, escapeHtml, page } from "../lib/html.js";
import type { User } from "../services/keepyService.js";

export function appShell(input: {
  active: "books" | "history" | "home" | "settings";
  body: string;
  title: string;
  user: User;
}): string {
  const fullName = [input.user.firstName, input.user.lastName].filter(Boolean).join(" ");
  const displayName = fullName || (input.user.username ? `@${input.user.username}` : "Keepy");
  const username = input.user.username && fullName ? `@${input.user.username}` : "";

  return page(
    input.title,
    `
    ${themeBootScript()}
    <main class="app">
      <header class="topbar">
        <a class="brand" href="/">Keepy</a>
        <div class="topbar-actions">
          <div class="profile">
            ${avatar(input.user)}
            <span class="profile-text">
              <span class="profile-name">${escapeHtml(displayName)}</span>
              ${username ? `<span class="profile-handle">${escapeHtml(username)}</span>` : ""}
            </span>
          </div>
          <details class="menu">
            <summary aria-label="菜单">☰</summary>
            <nav>
              ${menuLink("/", "本月明细", input.active === "home")}
              ${menuLink("/settings", "账本设置", input.active === "settings")}
              ${menuLink("/books", "账本列表", input.active === "books")}
              ${menuLink("/history", "历史记录", input.active === "history")}
              <label class="theme-toggle">
                <span>夜间模式</span>
                <span class="switch">
                  <input type="checkbox" data-theme-switch aria-label="夜间模式" />
                  <span></span>
                </span>
              </label>
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
    ${themeToggleScript()}
    ${miniAppInteractionScript()}
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
    ${themeBootScript()}
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

function themeBootScript(): string {
  return `<script>
    (() => {
      const stored = localStorage.getItem("keepy-theme");
      const systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      const theme = stored || (systemDark ? "dark" : "light");
      document.documentElement.dataset.theme = theme;
    })();
  </script>`;
}

function themeToggleScript(): string {
  return `<script>
    (() => {
      const input = document.querySelector("[data-theme-switch]");
      if (!input) return;
      const apply = (theme) => {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem("keepy-theme", theme);
        input.checked = theme === "dark";
      };
      input.checked = document.documentElement.dataset.theme === "dark";
      input.addEventListener("change", () => apply(input.checked ? "dark" : "light"));
    })();
  </script>`;
}

function miniAppInteractionScript(): string {
  return `<script>
    (() => {
      document.addEventListener("click", (event) => {
        const openTarget = event.target.closest("[data-dialog-open]");
        if (openTarget) {
          const dialog = document.getElementById(openTarget.dataset.dialogOpen);
          if (dialog && typeof dialog.showModal === "function") dialog.showModal();
        }

        const closeTarget = event.target.closest("[data-dialog-close]");
        if (closeTarget) {
          const dialog = document.getElementById(closeTarget.dataset.dialogClose);
          if (dialog && typeof dialog.close === "function") dialog.close();
        }

        const deleteToggle = event.target.closest("[data-delete-toggle]");
        if (deleteToggle) {
          const app = document.querySelector(".app");
          const enabled = app && app.dataset.deleteMode !== "true";
          if (app) app.dataset.deleteMode = enabled ? "true" : "false";
          deleteToggle.setAttribute("aria-pressed", enabled ? "true" : "false");
        }
      });

      for (const dialog of document.querySelectorAll("dialog")) {
        dialog.addEventListener("click", (event) => {
          if (event.target === dialog) dialog.close();
        });
      }

      document.addEventListener("submit", (event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        const message = form.dataset.confirm;
        if (message && !window.confirm(message)) {
          event.preventDefault();
          return;
        }

        if (!form.matches("[data-once-form]")) return;
        if (form.dataset.submitted === "true") {
          event.preventDefault();
          return;
        }

        form.dataset.submitted = "true";
        form.querySelectorAll("button[type='submit']").forEach((button) => {
          button.disabled = true;
          button.setAttribute("aria-busy", "true");
        });
      });

      const focus = document.querySelector("[data-pie-focus]");
      const showSlice = (element) => {
        if (!element || !focus) return;
        document.querySelectorAll("[data-pie-slice], [data-pie-legend]").forEach((item) => {
          item.classList.remove("active");
        });
        element.classList.add("active");
        const label = element.dataset.label;
        const value = element.dataset.value;
        const percent = element.dataset.percent;
        focus.textContent = label + " · " + value + " · " + percent;
      };

      document.querySelectorAll("[data-pie-slice], [data-pie-legend]").forEach((element) => {
        element.addEventListener("click", () => showSlice(element));
        element.addEventListener("focus", () => showSlice(element));
      });
    })();
  </script>`;
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
      --hover: #eaf3ee;
      --subtle: #f7fbf8;
      --progress-track: #dfe9e2;
    }

    :root[data-theme="dark"] {
      color-scheme: dark;
      --bg: #111615;
      --panel: #19211f;
      --ink: #edf4ef;
      --muted: #9aa8a1;
      --line: #2f3b37;
      --green: #68c59c;
      --green-strong: #91e1bb;
      --red: #ff8f8f;
      --amber: #e5b567;
      --shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
      --hover: #22342f;
      --subtle: #1e2a26;
      --progress-track: #2a3b35;
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

    button:disabled {
      cursor: wait;
      opacity: 0.62;
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
      color: var(--ink);
    }

    .profile-text {
      display: grid;
      min-width: 0;
      max-width: 148px;
      line-height: 1.15;
    }

    .profile-name, .profile-handle {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .profile-name {
      font-size: 14px;
      font-weight: 700;
    }

    .profile-handle {
      color: var(--muted);
      font-size: 12px;
      margin-top: 2px;
    }

    .profile img, .avatar-fallback {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--hover);
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
      background: var(--hover);
      color: var(--green-strong);
    }

    .theme-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 6px;
      color: var(--ink);
      cursor: pointer;
    }

    .theme-toggle:hover {
      background: var(--hover);
    }

    .theme-toggle > span:first-child {
      font-size: 14px;
    }

    .switch {
      position: relative;
      width: 38px;
      height: 22px;
      flex: 0 0 auto;
    }

    .switch input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }

    .switch span {
      position: absolute;
      inset: 0;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--bg);
      transition: background 160ms ease, border-color 160ms ease;
    }

    .switch span::after {
      content: "";
      position: absolute;
      top: 3px;
      left: 3px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--muted);
      transition: transform 160ms ease, background 160ms ease;
    }

    .switch input:checked + span {
      border-color: var(--green);
      background: color-mix(in srgb, var(--green) 28%, transparent);
    }

    .switch input:checked + span::after {
      transform: translateX(16px);
      background: var(--green-strong);
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

    .title-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }

    .title-row h1 {
      display: flex;
      align-items: baseline;
      min-width: 0;
      gap: 8px;
    }

    .title-row h1 span {
      color: var(--muted);
      font-size: 16px;
      font-weight: 700;
    }

    .muted { color: var(--muted); }

    .icon-button {
      width: 38px;
      height: 38px;
      display: inline-grid;
      place-items: center;
      flex: 0 0 auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      color: var(--ink);
      cursor: pointer;
    }

    .icon-button:hover {
      background: var(--hover);
      color: var(--green-strong);
    }

    .icon-button svg {
      width: 19px;
      height: 19px;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 2;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .summary-strip {
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: var(--shadow);
    }

    .summary-strip > summary {
      list-style: none;
    }

    .summary-strip > summary::-webkit-details-marker {
      display: none;
    }

    .summary-mobile-trigger {
      display: none;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0;
    }

    .summary-strip:not([open]) > .summary-grid {
      display: grid;
    }

    .summary-item {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      min-width: 0;
      gap: 10px;
      padding: 12px 14px;
      border-top: 1px solid var(--line);
    }

    .summary-item:nth-child(-n+2) { border-top: 0; }
    .summary-item:nth-child(odd) { border-right: 1px solid var(--line); }

    .summary-item span {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
    }

    .summary-mobile-metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .summary-mobile-item {
      display: grid;
      min-width: 0;
      gap: 2px;
    }

    .summary-mobile-item span {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }

    .summary-mobile-item strong {
      overflow: hidden;
      color: var(--green-strong);
      font-size: 18px;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .budget-progress {
      display: block;
      height: 7px;
      overflow: hidden;
      border-radius: 999px;
      background: var(--progress-track);
    }

    .budget-progress span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--green);
    }

    .summary-item strong {
      min-width: 0;
      overflow: hidden;
      color: var(--green-strong);
      font-size: 18px;
      text-align: right;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .summary-item a, .summary-mobile-item a {
      color: var(--green-strong);
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .stat, .card, .form-panel, .bill-list, .empty, .chart-panel, .danger-zone {
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
    .day-groups {
      display: grid;
      gap: 12px;
    }

    .day-group h3 {
      margin: 0 0 6px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 800;
    }

    .compact-bill {
      grid-template-columns: minmax(0, 1fr) auto 7.5ch;
      align-items: center;
      padding: 10px 12px;
    }

    .app[data-delete-mode="true"] .compact-bill {
      grid-template-columns: minmax(0, 1fr) auto 7.5ch auto;
    }

    .compact-bill .bill-purpose {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bill-time {
      color: var(--muted);
      font-size: 13px;
      white-space: nowrap;
    }

    .amount {
      justify-self: end;
      width: 7.5ch;
      font-variant-numeric: tabular-nums;
      text-align: right;
      white-space: nowrap;
    }

    .amount.expense { color: var(--ink); }
    .amount.income { color: var(--green); }

    .bill-delete-form {
      display: none;
      margin: 0;
    }

    .app[data-delete-mode="true"] .bill-delete-form {
      display: block;
    }

    [data-delete-toggle][aria-pressed="true"] {
      border-color: var(--green);
      background: var(--hover);
      color: var(--green-strong);
    }

    .bill-delete {
      width: 30px;
      height: 30px;
      border-color: transparent;
      color: var(--muted);
      background: transparent;
    }

    .bill-delete:hover {
      color: var(--ink);
      background: var(--hover);
    }

    .bill-delete svg {
      width: 16px;
      height: 16px;
    }

    .form-panel {
      display: grid;
      gap: 14px;
      padding: 14px;
    }

    .month-picker {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: end;
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: var(--shadow);
    }

    .month-picker > span {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-size: 13px;
    }

    .month-picker-button {
      width: 100%;
      min-height: 46px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 9px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      color: var(--ink);
      cursor: pointer;
      text-align: left;
    }

    .month-picker-button:hover {
      background: var(--hover);
    }

    .month-picker-button strong {
      font-size: 16px;
    }

    .month-picker-button span {
      color: var(--muted);
      font-size: 13px;
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
      background: var(--panel);
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
      background: var(--panel);
      color: var(--ink);
    }

    .button.danger {
      background: var(--red);
      color: white;
    }

    .button.disabled {
      opacity: 0.45;
      pointer-events: none;
    }

    .pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-top: 12px;
      color: var(--muted);
      font-size: 13px;
    }

    .pagination form label {
      grid-auto-flow: column;
      align-items: center;
    }

    .pagination select {
      min-height: 36px;
      padding: 6px 8px;
    }

    .pager-buttons {
      display: flex;
      gap: 6px;
    }

    .pager-buttons .button {
      min-height: 36px;
      padding: 7px 10px;
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
    .book-row:hover { background: var(--subtle); }
    .badge {
      padding: 4px 8px;
      border-radius: 999px;
      background: #eaf3ee;
      color: var(--green-strong);
      font-size: 12px;
      font-weight: 700;
    }

    .danger-zone {
      display: grid;
      gap: 10px;
      margin-top: 16px;
      padding: 14px;
    }

    .danger-zone h2 {
      margin: 0;
      font-size: 18px;
    }

    .empty {
      padding: 18px;
      color: var(--muted);
      text-align: center;
    }

    dialog {
      border: 0;
      padding: 0;
      background: transparent;
      color: var(--ink);
    }

    dialog::backdrop {
      background: rgba(0, 0, 0, 0.42);
    }

    .month-dialog {
      width: min(calc(100vw - 32px), 380px);
      max-width: calc(100vw - 32px);
    }

    .dialog-card {
      width: min(calc(100vw - 32px), 360px);
      display: grid;
      gap: 12px;
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: var(--shadow);
    }

    .dialog-card h2, .dialog-card p {
      margin: 0;
    }

    .month-dialog-card {
      width: 100%;
      max-width: 100%;
      overflow: hidden;
    }

    .month-dialog-head {
      display: grid;
      grid-template-columns: 38px 1fr 38px;
      align-items: center;
      gap: 10px;
      text-align: center;
    }

    .month-dialog-head strong {
      font-size: 18px;
    }

    .month-dialog-head .icon-button {
      font-size: 28px;
      line-height: 1;
    }

    .month-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      min-width: 0;
    }

    .month-grid a {
      min-width: 0;
      min-height: 48px;
      display: grid;
      place-items: center;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--bg);
      color: var(--ink);
      font-weight: 800;
    }

    .month-grid a:hover, .month-grid a.active {
      border-color: var(--green);
      background: var(--hover);
      color: var(--green-strong);
    }

    .drawer {
      width: min(100%, 760px);
      max-width: none;
      margin: auto auto 0;
    }

    .drawer-panel {
      display: grid;
      gap: 14px;
      padding: 10px 16px 18px;
      border: 1px solid var(--line);
      border-bottom: 0;
      border-radius: 18px 18px 0 0;
      background: var(--panel);
      box-shadow: var(--shadow);
    }

    .drawer-handle {
      width: 40px;
      height: 4px;
      margin: 2px auto 0;
      border-radius: 999px;
      background: var(--line);
    }

    .fab {
      position: fixed;
      right: max(18px, calc((100vw - 760px) / 2 + 18px));
      bottom: 18px;
      z-index: 3;
      width: 56px;
      height: 56px;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: 50%;
      background: var(--green);
      color: white;
      box-shadow: var(--shadow);
      cursor: pointer;
    }

    .fab svg {
      width: 26px;
      height: 26px;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-width: 2.4;
    }

    .chart-panel {
      padding: 14px;
      margin-bottom: 14px;
    }

    .pie-layout {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 16px;
      align-items: center;
    }

    .pie-chart {
      width: 150px;
      height: 150px;
      overflow: visible;
    }

    .pie-slice {
      cursor: pointer;
      outline: none;
      transition: opacity 160ms ease, transform 160ms ease;
      transform-origin: 70px 70px;
    }

    .pie-slice:hover, .pie-slice:focus, .pie-slice.active {
      opacity: 0.86;
      transform: scale(1.03);
    }

    .pie-focus {
      margin: 0 0 10px;
      color: var(--green-strong);
      font-weight: 800;
    }

    .pie-legend {
      display: grid;
      gap: 6px;
    }

    .pie-legend button {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      padding: 8px;
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      color: var(--ink);
      cursor: pointer;
      text-align: left;
    }

    .pie-legend button:hover, .pie-legend button.active {
      border-color: var(--line);
      background: var(--hover);
    }

    .pie-legend span {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .pie-legend strong {
      color: var(--green-strong);
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
      .title-row h1 {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .summary-mobile-trigger {
        display: grid;
        gap: 10px;
        padding: 12px 14px;
        cursor: pointer;
      }
      .summary-grid {
        border-top: 1px solid var(--line);
      }
      .summary-strip:not([open]) > .summary-grid { display: none; }
      .summary-strip[open] .summary-mobile-trigger { background: var(--subtle); }
      .summary-item { display: grid; gap: 4px; }
      .summary-item strong { text-align: left; }
      .month-picker { grid-template-columns: 1fr; }
      .month-dialog {
        width: calc(100vw - 28px);
        max-width: calc(100vw - 28px);
      }
      .month-dialog-card {
        gap: 10px;
        padding: 14px;
      }
      .month-grid {
        gap: 6px;
      }
      .month-grid a {
        min-height: 44px;
      }
      .profile-text { max-width: 104px; }
      .section-title h1, .section-title h2 { font-size: 20px; }
      .compact-bill {
        grid-template-columns: minmax(0, 1fr) auto 7.5ch;
        gap: 8px;
        padding: 9px 10px;
      }
      .app[data-delete-mode="true"] .compact-bill {
        grid-template-columns: minmax(0, 1fr) auto 7.5ch auto;
      }
      .amount {
        font-size: 15px;
        white-space: nowrap;
      }
      .pagination {
        align-items: stretch;
        flex-wrap: wrap;
      }
      .pager-buttons {
        width: 100%;
      }
      .pager-buttons .button {
        flex: 1;
        text-align: center;
      }
      .pie-layout {
        grid-template-columns: 1fr;
      }
      .pie-chart {
        justify-self: center;
      }
      .fab {
        right: 16px;
        bottom: 16px;
      }
    }
  </style>`;
}
