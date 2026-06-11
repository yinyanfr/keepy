(() => {
  const dbName = "keepy-offline";
  const dbVersion = 1;

  let dbPromise;

  document.addEventListener("DOMContentLoaded", () => {
    registerServiceWorker();
    bindPjax();
    bindBillForms();
    bindLogoutForms();
    bindPendingDeletes();
    updateOfflineState();
    void cacheCurrentRoute();
    void renderPendingBills();
    void syncPendingBills();
  });

  window.addEventListener("online", () => {
    updateOfflineState();
    void syncPendingBills();
    void cacheCurrentRoute();
  });
  window.addEventListener("offline", updateOfflineState);
  window.addEventListener("popstate", () => {
    void navigateTo(location.href, { push: false });
  });
  navigator.serviceWorker?.addEventListener("message", (event) => {
    if (event.data?.type === "sync-pending-bills") {
      void syncPendingBills();
    }
    if (event.data?.type === "pending-bills-updated") {
      void renderPendingBills();
      void cacheCurrentRoute();
    }
  });

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, dbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("meta");
        db.createObjectStore("pages");
        db.createObjectStore("monthData", { keyPath: "key" });
        db.createObjectStore("pendingBills", { keyPath: "clientId" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function getStore(storeName, mode = "readonly") {
    const db = await openDb();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  async function put(storeName, keyOrValue, maybeValue) {
    const store = await getStore(storeName, "readwrite");
    await requestDone(
      maybeValue === undefined ? store.put(keyOrValue) : store.put(maybeValue, keyOrValue),
    );
  }

  async function get(storeName, key) {
    const store = await getStore(storeName);
    return requestDone(store.get(key));
  }

  async function del(storeName, key) {
    const store = await getStore(storeName, "readwrite");
    await requestDone(store.delete(key));
  }

  async function all(storeName) {
    const store = await getStore(storeName);
    return requestDone(store.getAll());
  }

  function requestDone(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  }

  function bindPjax() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey)
        return;
      const url = new URL(link.href);
      if (url.origin !== location.origin || link.target || url.pathname.startsWith("/auth/"))
        return;
      event.preventDefault();
      void navigateTo(url.href, { push: true });
    });
  }

  async function navigateTo(url, options = { push: true }) {
    const targetUrl = parseUrl(url);
    try {
      const response = await fetch(targetUrl.href, {
        credentials: "same-origin",
        headers: { "X-Keepy-PJAX": "1" },
      });
      if (!response.ok) throw new Error("Navigation failed");
      const html = await response.text();
      const finalUrl = sameOriginUrl(response.url) ?? targetUrl.href;
      await cachePageHtml(targetUrl.href, html);
      if (finalUrl !== targetUrl.href) {
        await cachePageHtml(finalUrl, html);
      }
      swapDocument(html);
      if (options.push) history.pushState({}, "", finalUrl);
      afterPageChange();
      return true;
    } catch {
      const path = targetUrl.pathname + targetUrl.search;
      const cached = await get("pages", path);
      if (cached) {
        swapDocument(cached);
        if (options.push) history.pushState({}, "", targetUrl.href);
        afterPageChange();
        return true;
      }
    }

    return false;
  }

  async function cachePageHtml(url, html) {
    const parsed = parseUrl(url);
    await put("pages", parsed.pathname + parsed.search, html);
  }

  function sameOriginUrl(url) {
    if (!url) return null;
    const parsed = parseUrl(url);
    return parsed.origin === location.origin ? parsed.href : null;
  }

  function parseUrl(url) {
    return new URL(url, location.href);
  }

  function swapDocument(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const nextMain = doc.querySelector("main.app");
    const currentMain = document.querySelector("main.app");
    if (nextMain && currentMain) currentMain.replaceWith(nextMain);
    document.title = doc.title || document.title;
  }

  function afterPageChange() {
    hydrateStaticInteractions();
    updateOfflineState();
    bindBillForms();
    bindLogoutForms();
    bindPendingDeletes();
    void cacheCurrentRoute();
    void renderPendingBills();
  }

  function hydrateStaticInteractions() {
    window.KeepyHydrateTheme?.();
    window.KeepyHydrateMini?.();
  }

  function bindBillForms() {
    document.querySelectorAll("[data-bill-form]").forEach((form) => {
      if (form.dataset.keepyBound === "true") return;
      form.dataset.keepyBound = "true";
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        void submitBillForm(form);
      });
    });
  }

  async function submitBillForm(form) {
    const data = new FormData(form);
    const bookId = Number(form.dataset.bookId);
    const amount = Number(data.get("amount"));
    const purpose = String(data.get("purpose") || "").trim();
    const idempotencyKey = String(data.get("idempotencyKey") || crypto.randomUUID());
    if (!Number.isFinite(amount) || !purpose || !Number.isInteger(bookId)) {
      resetFormState(form);
      reportInvalidBillForm(form, amount, purpose);
      return;
    }
    rotateIdempotencyKey(form);

    const bill = {
      amount,
      bookId,
      clientId: idempotencyKey,
      createdAt: new Date().toISOString(),
      currency: form.dataset.currency || "",
      idempotencyKey,
      occurredAt: new Date().toISOString(),
      purpose,
      status: "pending",
    };

    if (!navigator.onLine) {
      await put("pendingBills", bill);
      await registerBackgroundSync();
      form.reset();
      resetFormState(form);
      closeDialog(form);
      await renderPendingBills();
      updateOfflineState();
      return;
    }

    try {
      const response = await fetch(`/api/books/${bookId}/bills`, {
        body: JSON.stringify(bill),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        if (response.status === 401) {
          alert("登录已过期，请重新登录。");
          location.assign("/");
          return;
        }
        throw new Error("Submit failed");
      }
      form.reset();
      resetFormState(form);
      closeDialog(form);
      const navigated = await navigateTo(`/books/${bookId}`, { push: false });
      if (!navigated) {
        location.assign(`/books/${bookId}`);
      }
    } catch {
      if (!navigator.onLine) {
        await put("pendingBills", bill);
        await registerBackgroundSync();
        await renderPendingBills();
      }
      resetFormState(form);
      updateOfflineState();
    }
  }

  function closeDialog(element) {
    const dialog = element.closest("dialog");
    if (dialog && typeof dialog.close === "function") dialog.close();
  }

  function resetFormState(form) {
    form.dataset.submitted = "false";
    form.querySelectorAll("button[type='submit']").forEach((button) => {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    });
  }

  function reportInvalidBillForm(form, amount, purpose) {
    const amountInput = form.querySelector("input[name='amount']");
    if (amountInput instanceof HTMLInputElement && !Number.isFinite(amount)) {
      amountInput.setCustomValidity("请输入有效金额");
      amountInput.reportValidity();
      amountInput.addEventListener("input", () => amountInput.setCustomValidity(""), {
        once: true,
      });
      return;
    }

    const purposeInput = form.querySelector("input[name='purpose']");
    if (purposeInput instanceof HTMLInputElement && !purpose) {
      purposeInput.reportValidity();
      return;
    }

    form.reportValidity?.();
  }

  function rotateIdempotencyKey(form) {
    const input = form.querySelector("input[name='idempotencyKey']");
    if (input instanceof HTMLInputElement) {
      input.value = crypto.randomUUID();
    }
  }

  function bindLogoutForms() {
    document.querySelectorAll("form[action='/auth/logout']").forEach((form) => {
      if (form.dataset.keepyLogoutBound === "true") return;
      form.dataset.keepyLogoutBound = "true";
      form.addEventListener("submit", (event) => {
        if (!navigator.onLine) {
          event.preventDefault();
          return;
        }

        event.preventDefault();
        void clearOfflineData().finally(() => HTMLFormElement.prototype.submit.call(form));
      });
    });
  }

  async function clearOfflineData() {
    await Promise.all([clearCaches(), deleteOfflineDatabase()]);
    navigator.serviceWorker?.controller?.postMessage({ type: "clear-offline-data" });
  }

  async function clearCaches() {
    if (!("caches" in window)) return;
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith("keepy-")).map((key) => caches.delete(key)),
    );
  }

  async function deleteOfflineDatabase() {
    const db = await dbPromise?.catch(() => null);
    db?.close();
    dbPromise = undefined;
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  }

  function bindPendingDeletes() {
    document.querySelectorAll("[data-delete-pending-bill]").forEach((button) => {
      if (button.dataset.keepyBound === "true") return;
      button.dataset.keepyBound = "true";
      button.addEventListener("click", () => {
        void del("pendingBills", button.dataset.deletePendingBill).then(renderPendingBills);
      });
    });
  }

  async function renderPendingBills() {
    const bookId = currentBookId();
    if (!bookId) return;
    document.querySelectorAll("[data-pending-bills]").forEach((node) => node.remove());
    document.querySelectorAll("[data-pending-hidden]").forEach((node) => {
      if (node instanceof HTMLElement) {
        node.hidden = false;
        delete node.dataset.pendingHidden;
      }
    });

    resetDayTotals();

    const pending = (await all("pendingBills")).filter(
      (bill) => Number(bill.bookId) === bookId && isCurrentMonthBill(bill),
    );
    updatePendingSummary(pending);
    if (pending.length === 0) return;

    const groups = new Map();
    for (const bill of pending) {
      const label = formatMonthDay(bill.occurredAt);
      groups.set(label, [...(groups.get(label) || []), bill]);
    }

    const empty = document.querySelector(".empty");
    if (empty instanceof HTMLElement) {
      empty.hidden = true;
      empty.dataset.pendingHidden = "true";
    }

    for (const [label, bills] of groups.entries()) {
      const existingGroup = findDayGroup(label);
      if (existingGroup) {
        appendPendingBills(existingGroup, bills);
        updateDayTotal(existingGroup, bills);
        continue;
      }

      const container = document.querySelector(".day-groups") || empty;
      if (!container) continue;
      const wrapper = document.createElement("div");
      wrapper.className = "day-groups pending-groups";
      wrapper.dataset.pendingBills = "true";
      wrapper.innerHTML = pendingGroupHtml(label, bills);
      container.before(wrapper);
    }
    bindPendingDeletes();
  }

  function appendPendingBills(group, bills) {
    const list = group.querySelector(".bill-list");
    if (!list) return;
    list.insertAdjacentHTML("afterbegin", bills.map((bill) => pendingBillHtml(bill)).join(""));
  }

  function findDayGroup(label) {
    return [...document.querySelectorAll("[data-day-group]")].find(
      (group) => group.dataset.dayGroup === label,
    );
  }

  function resetDayTotals() {
    document.querySelectorAll("[data-day-group]").forEach((group) => {
      const total = group.querySelector(".day-total");
      if (!total) return;
      total.textContent = formatAmount(
        Number(group.dataset.baseDayExpense || 0),
        group.dataset.currency,
      );
    });
  }

  function updateDayTotal(group, bills) {
    const total = group.querySelector(".day-total");
    if (!total) return;
    const pendingExpense = bills.reduce(
      (sum, bill) => sum + (bill.amount > 0 ? bill.amount : 0),
      0,
    );
    total.textContent = formatAmount(
      Number(group.dataset.baseDayExpense || 0) + pendingExpense,
      group.dataset.currency,
    );
  }

  function pendingGroupHtml(label, bills) {
    const total = bills.reduce((sum, bill) => sum + (bill.amount > 0 ? bill.amount : 0), 0);
    return `
      <section class="day-group">
        <h3 class="day-group-header">
          <span>${escapeHtml(label)} · 待同步</span>
          <span class="day-total">${formatAmount(total, bills[0]?.currency)}</span>
        </h3>
        <div class="bill-list compact">
          ${bills.map((bill) => pendingBillHtml(bill)).join("")}
        </div>
      </section>
    `;
  }

  function pendingBillHtml(bill) {
    return `
      <div class="bill compact-bill pending-bill" data-pending-bills>
        <strong class="bill-purpose">${escapeHtml(bill.purpose)}</strong>
        <span class="bill-time">${formatTime(bill.occurredAt)}</span>
        <strong class="amount ${bill.amount > 0 ? "expense" : "income"}">${formatAmount(bill.amount, bill.currency)}</strong>
        <button class="icon-button bill-delete" type="button" data-delete-pending-bill="${escapeHtml(
          bill.clientId,
        )}" aria-label="删除离线记录">×</button>
      </div>
    `;
  }

  function updatePendingSummary(pending) {
    const strip = document.querySelector("[data-summary-strip]");
    if (!strip) return;

    const currency = strip.dataset.currency || "";
    const monthlyBudget = numberOrNull(strip.dataset.monthlyBudget);
    const expense = Number(strip.dataset.baseExpense || 0) + pendingExpenseTotal(pending);
    const income = Number(strip.dataset.baseIncome || 0) + pendingIncomeTotal(pending);
    const net = Number(strip.dataset.baseNet || 0) + pendingNetTotal(pending);

    setSummaryValue("expense", formatAmount(expense, currency));
    setSummaryValue("income", formatAmount(income, currency));
    setSummaryValue("net", formatAmount(net, currency));
    if (monthlyBudget !== null) {
      setSummaryValue("budget", formatAmount(monthlyBudget - expense, currency));
      updateBudgetProgress(strip, expense, monthlyBudget);
    }
  }

  function isCurrentMonthBill(bill) {
    const monthKey = currentPageMonthKey();
    return !monthKey || monthKeyFromDate(bill.occurredAt) === monthKey;
  }

  function currentPageMonthKey() {
    return (
      document.querySelector("[data-history-month-key]")?.dataset.historyMonthKey ||
      document.querySelector("[data-summary-strip]")?.dataset.monthKey
    );
  }

  function setSummaryValue(key, value) {
    document.querySelectorAll(`[data-summary-item="${key}"] strong`).forEach((item) => {
      item.textContent = value;
    });
  }

  function updateBudgetProgress(strip, expense, monthlyBudget) {
    const progress = strip.querySelector("[data-budget-progress]");
    if (!progress || monthlyBudget <= 0) return;
    const width = Math.min(Math.max((expense / monthlyBudget) * 100, 0), 100);
    progress.style.width = `${width.toFixed(2)}%`;
  }

  function pendingExpenseTotal(pending) {
    return pending.reduce((sum, bill) => sum + (bill.amount > 0 ? bill.amount : 0), 0);
  }

  function pendingIncomeTotal(pending) {
    return pending.reduce((sum, bill) => sum + (bill.amount < 0 ? Math.abs(bill.amount) : 0), 0);
  }

  function pendingNetTotal(pending) {
    return pendingIncomeTotal(pending) - pendingExpenseTotal(pending);
  }

  async function cacheCurrentRoute() {
    if (!navigator.onLine) return;
    try {
      const response = await fetch("/api/me", { credentials: "same-origin" });
      if (response.ok) {
        await put("meta", "me", await response.json());
      }

      const route = routeInfo();
      if (route.bookId) {
        const month = route.month || new Date().toISOString().slice(0, 7);
        const monthResponse = await fetch(
          `/api/books/${route.bookId}/month?month=${encodeURIComponent(month)}`,
          { credentials: "same-origin" },
        );
        if (monthResponse.ok) {
          const data = await monthResponse.json();
          await put("monthData", { ...data, key: monthKey(route.bookId, data.monthKey || month) });
        }
      }
    } catch {
      // Caching is opportunistic.
    }
  }

  async function syncPendingBills() {
    if (!navigator.onLine) return;
    const pending = await all("pendingBills");
    if (pending.length === 0) return;

    try {
      const response = await fetch("/api/sync/bills", {
        body: JSON.stringify({ bills: pending }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) return;
      const data = await response.json();
      for (const result of data.results || []) {
        if (result.ok && result.clientId) {
          await del("pendingBills", result.clientId);
        }
      }
      await cacheCurrentRoute();
      await renderPendingBills();
    } catch {
      await registerBackgroundSync();
    }
  }

  async function registerBackgroundSync() {
    const registration = await navigator.serviceWorker?.ready.catch(() => null);
    if (registration && "sync" in registration) {
      await registration.sync.register("keepy-sync-bills").catch(() => {});
    }
  }

  function updateOfflineState() {
    const offline = !navigator.onLine;
    document.documentElement.dataset.offline = offline ? "true" : "false";
    document.querySelectorAll("form").forEach((form) => {
      const allowed = form.matches("[data-bill-form]");
      form.querySelectorAll("button, input, select").forEach((control) => {
        if (allowed) return;
        control.disabled = offline;
      });
    });
    document.querySelectorAll("form[action='/auth/logout'] button").forEach((button) => {
      button.disabled = offline;
    });
    document.querySelectorAll("[data-online-only]").forEach((control) => {
      if (
        control instanceof HTMLButtonElement ||
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement
      ) {
        control.disabled = offline;
      }
    });
  }

  function routeInfo() {
    const path = location.pathname;
    const bookMatch = /^\/books\/(\d+)/.exec(path);
    if (bookMatch) return { bookId: Number(bookMatch[1]) };
    if (path === "/history") {
      const params = new URLSearchParams(location.search);
      const bookId = Number(params.get("bookId"));
      return {
        bookId: Number.isInteger(bookId) ? bookId : null,
        month: params.get("month"),
      };
    }
    return {};
  }

  function currentBookId() {
    return routeInfo().bookId;
  }

  function monthKey(bookId, month) {
    return `${bookId}:${month}`;
  }

  function formatTime(value) {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: document.querySelector(".app")?.dataset.timeZone,
    }).format(new Date(value));
  }

  function formatMonthDay(value) {
    const date = new Date(value);
    const parts = new Intl.DateTimeFormat("zh-CN", {
      day: "numeric",
      month: "numeric",
      timeZone: document.querySelector(".app")?.dataset.timeZone,
    }).formatToParts(date);
    const month = parts.find((part) => part.type === "month")?.value ?? `${date.getMonth() + 1}`;
    const day = parts.find((part) => part.type === "day")?.value ?? `${date.getDate()}`;
    return `${month}月${day}日`;
  }

  function monthKeyFromDate(value) {
    const date = new Date(value);
    const parts = new Intl.DateTimeFormat("en-US", {
      month: "2-digit",
      timeZone: document.querySelector(".app")?.dataset.timeZone,
      year: "numeric",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value ?? `${date.getFullYear()}`;
    const month =
      parts.find((part) => part.type === "month")?.value ??
      `${String(date.getMonth() + 1).padStart(2, "0")}`;
    return `${year}-${month}`;
  }

  function numberOrNull(value) {
    if (value === undefined || value === null || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatAmount(amount, currency) {
    const normalized = String(currency || "")
      .trim()
      .toUpperCase();
    if (!normalized) {
      return new Intl.NumberFormat("zh-CN", {
        maximumFractionDigits: 2,
        minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      }).format(amount);
    }

    if (!/^[A-Z]{3}$/.test(normalized)) {
      return `${currency}${new Intl.NumberFormat("zh-CN", {
        maximumFractionDigits: 2,
        minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      }).format(amount)}`;
    }

    return new Intl.NumberFormat("zh-CN", {
      maximumFractionDigits: 2,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      style: "currency",
      currency: normalized,
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
