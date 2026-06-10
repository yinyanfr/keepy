(() => {
  const dbName = "keepy-offline";
  const dbVersion = 1;

  let dbPromise;

  document.addEventListener("DOMContentLoaded", () => {
    registerServiceWorker();
    bindPjax();
    bindBillForms();
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
    try {
      const response = await fetch(url, {
        credentials: "same-origin",
        headers: { "X-Keepy-PJAX": "1" },
      });
      if (!response.ok) throw new Error("Navigation failed");
      const html = await response.text();
      await put("pages", new URL(url).pathname + new URL(url).search, html);
      swapDocument(html);
      if (options.push) history.pushState({}, "", url);
      afterPageChange();
      return;
    } catch {
      const path = new URL(url).pathname + new URL(url).search;
      const cached = await get("pages", path);
      if (cached) {
        swapDocument(cached);
        if (options.push) history.pushState({}, "", url);
        afterPageChange();
      }
    }
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
    if (!Number.isFinite(amount) || !purpose || !Number.isInteger(bookId)) return;
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
      if (!response.ok) throw new Error("Submit failed");
      form.reset();
      resetFormState(form);
      closeDialog(form);
      await navigateTo(`/books/${bookId}`, { push: false });
    } catch {
      await put("pendingBills", bill);
      await registerBackgroundSync();
      resetFormState(form);
      await renderPendingBills();
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

  function rotateIdempotencyKey(form) {
    const input = form.querySelector("input[name='idempotencyKey']");
    if (input instanceof HTMLInputElement) {
      input.value = crypto.randomUUID();
    }
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

    const pending = (await all("pendingBills")).filter((bill) => Number(bill.bookId) === bookId);
    if (pending.length === 0) return;

    const groups = new Map();
    for (const bill of pending) {
      const label = new Intl.DateTimeFormat("zh-CN", { day: "numeric", month: "long" }).format(
        new Date(bill.occurredAt),
      );
      groups.set(label, [...(groups.get(label) || []), bill]);
    }

    const empty = document.querySelector(".empty");
    if (empty instanceof HTMLElement) {
      empty.hidden = true;
      empty.dataset.pendingHidden = "true";
    }

    const container = document.querySelector(".day-groups") || empty;
    if (!container) return;

    const wrapper = document.createElement("div");
    wrapper.className = "day-groups pending-groups";
    wrapper.dataset.pendingBills = "true";
    wrapper.innerHTML = [...groups.entries()]
      .map(([label, bills]) => pendingGroupHtml(label, bills))
      .join("");
    container.before(wrapper);
    bindPendingDeletes();
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
          ${bills
            .map(
              (bill) => `
                <div class="bill compact-bill pending-bill">
                  <strong class="bill-purpose">${escapeHtml(bill.purpose)}</strong>
                  <span class="bill-time">${formatTime(bill.occurredAt)}</span>
                  <strong class="amount ${bill.amount > 0 ? "expense" : "income"}">${formatAmount(bill.amount, bill.currency)}</strong>
                  <button class="icon-button bill-delete" type="button" data-delete-pending-bill="${escapeHtml(
                    bill.clientId,
                  )}" aria-label="删除离线记录">×</button>
                </div>
              `,
            )
            .join("")}
        </div>
      </section>
    `;
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
    }).format(new Date(value));
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
