// ==UserScript==
// @name         GX Smart Anti-Redirect
// @namespace    gx-smart-anti-redirect-ios
// @version      4.7.0
// @description  Chặn chuyển hướng, pop-under và nhân bản tab trên Orion iOS
// @match        *://*/*
// @run-at       document-start
// @inject-into  page
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(() => {
  const win = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  if (win.__gxInstalled) return;
  win.__gxInstalled = true;

  const DEFAULT_WL = ["google.com", "youtube.com", "facebook.com", "github.com", "opera.com", "wikipedia.org", "vnpay.vn", "momo.vn", "zalopay.vn"];
  const TWO_TLDS = new Set(["com.vn", "net.vn", "org.vn", "edu.vn", "gov.vn", "co.uk", "org.uk", "com.au", "co.jp", "co.kr", "com.sg", "com.tw", "com.hk"]);

  const getVal = (k, d) => { try { const v = GM_getValue(k, d); return v !== undefined ? v : d; } catch { return d; } };
  const setVal = (k, v) => { try { GM_setValue(k, v); } catch {} };

  let enabled = Boolean(getVal("gx_enabled", true));
  let whitelist = getVal("gx_whitelist", null);
  if (!Array.isArray(whitelist)) { whitelist = [...DEFAULT_WL]; setVal("gx_whitelist", whitelist); }
  let blockedCount = Number(getVal("gx_blocked_count", 0)) || 0;

  const addBlock = () => { blockedCount += 1; setVal("gx_blocked_count", blockedCount); };

  function getRoot(h) {
    const c = h.toLowerCase().replace(/^www\./, "");
    if (!c || /^\d+\.\d+\.\d+\.\d+$/.test(c)) return c;
    const p = c.split(".");
    if (p.length <= 2) return c;
    return TWO_TLDS.has(p.slice(-2).join(".")) && p.length >= 3 ? p.slice(-3).join(".") : p.slice(-2).join(".");
  }

  const curHost = win.location.hostname.toLowerCase().replace(/^www\./, "");
  const curRoot = getRoot(curHost);

  if (win.top === win.self && typeof GM_registerMenuCommand === "function") {
    try {
      GM_registerMenuCommand(enabled ? "🟢 Đang BẬT (Chạm để TẮT)" : "🔴 Đang TẮT (Chạm để BẬT)", () => {
        enabled = !enabled;
        setVal("gx_enabled", enabled);
        win.location.reload();
      });
      if (curRoot) {
        const inWL = whitelist.some((d) => curHost === d || curHost.endsWith("." + d) || curRoot === d);
        GM_registerMenuCommand(inWL ? `➖ Xóa ${curRoot} khỏi Whitelist` : `➕ Thêm ${curRoot} vào Whitelist`, () => {
          let list = getVal("gx_whitelist", [...DEFAULT_WL]);
          if (!Array.isArray(list)) list = [...DEFAULT_WL];
          list = inWL ? list.filter((d) => d !== curRoot && d !== curHost) : [...new Set([...list, curRoot])];
          setVal("gx_whitelist", list);
          win.location.reload();
        });
      }
      GM_registerMenuCommand(`🛡️ Đã chặn: ${blockedCount} lần`, () => {
        if (confirm(`Đã chặn ${blockedCount} lần. Đặt lại về 0?`)) { blockedCount = 0; setVal("gx_blocked_count", 0); }
      });
    } catch {}
  }

  const isBypassed = () => !enabled || whitelist.some((d) => curHost === d || curHost.endsWith("." + d) || curRoot === d);
  const normUrl = (u) => { try { const x = new URL(u, win.location.href); x.hash = ""; return x.href.replace(/\/+$/, ""); } catch { return u || ""; } };
  const isSameSite = (u) => {
    try {
      const p = new URL(u, win.location.href);
      if (p.protocol === "blob:" || p.protocol === "data:") return true;
      const h = p.hostname.toLowerCase().replace(/^www\./, "");
      return h === curHost || h.endsWith("." + curHost) || getRoot(h) === curRoot;
    } catch { return false; }
  };

  let allowMode = "NONE", allowedUrl = null, allowedUntil = 0, lockedA = null, lockedHref = null, lastInput = 0, lastAttempt = 0;

  const isPseudo = (a) => { const h = (a.getAttribute("href") || "").trim().toLowerCase(); return !h || h.startsWith("#") || h.startsWith("javascript:"); };
  const opensNew = (el) => {
    let t = ((el && el.getAttribute && el.getAttribute("target")) || "").trim();
    if (!t) { const b = document.querySelector("base[target]"); if (b) t = (b.getAttribute("target") || "").trim(); }
    return Boolean(t && t !== "_self" && t !== "_parent" && t !== "_top");
  };
  const isVisible = (el) => {
    if (!el || el.nodeType !== 1) return false;
    const s = win.getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && parseFloat(s.opacity) >= 0.4;
  };
  const isRealExtLink = (a) => {
    if (!a || !isVisible(a)) return false;
    const r = a.getBoundingClientRect();
    if (!r.width || !r.height || (r.width >= win.innerWidth * 0.65 && r.height >= win.innerHeight * 0.65)) return false;
    return a.innerText.trim().length > 0 || a.querySelector("img, svg, i, span, picture, canvas") !== null;
  };

  win.addEventListener("input", (e) => { if (e.isTrusted) lastInput = Date.now(); }, true);
  win.addEventListener("change", (e) => { if (e.isTrusted) lastInput = Date.now(); }, true);
  win.addEventListener("submit", (e) => { if (e.isTrusted) { allowMode = "ANY"; allowedUntil = Date.now() + 6000; } }, true);
  win.addEventListener("beforeunload", (e) => {
    if (!isBypassed() && Date.now() - lastInput < 30000 && (allowMode === "NONE" || Date.now() > allowedUntil)) {
      e.preventDefault(); e.returnValue = "";
    }
  });

  function findControls(e) {
    const path = typeof e.composedPath === "function" ? e.composedPath() : [e.target];
    let anchor = null, button = null, nativeBtn = false;
    for (let i = 0; i < path.length; i++) {
      const n = path[i];
      if (!n || n.nodeType !== 1 || n === document.body || n === document.documentElement) break;
      if (n.matches && n.matches('video, [class*="player" i], [id*="player" i]')) return { anchor: null, button: null, nativeBtn: false };
      if (!anchor && n.tagName === "A" && n.hasAttribute("href")) anchor = n;
      if (!button) {
        if (n.matches && n.matches('button, input[type="submit"], input[type="button"], [role="button"], label, summary')) { button = n; nativeBtn = true; }
        else if (i < 6 && win.getComputedStyle(n).cursor === "pointer") button = n;
      }
    }
    return { anchor, button, nativeBtn };
  }

  function authorize(e, newTab = false, dur = 3500) {
    const { anchor, button, nativeBtn } = findControls(e);
    if (anchor && !isPseudo(anchor) && (isSameSite(anchor.href) || isRealExtLink(anchor))) {
      lockedA = anchor; lockedHref = anchor.href;
      allowMode = newTab ? "NEW_TAB" : "DOMAIN"; allowedUrl = lockedHref; allowedUntil = Date.now() + dur;
      return true;
    }
    if (button && isVisible(button)) {
      const r = button.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.width < win.innerWidth * 0.5 && (nativeBtn || button.innerText.trim().length > 0 || button.querySelector("img, svg, i, span"))) {
        allowMode = "ANY"; allowedUrl = null; allowedUntil = Date.now() + (nativeBtn ? 5000 : 2500);
        return true;
      }
    }
    return false;
  }

  function isAllowed(url, newTab = false) {
    if (isBypassed()) return true;
    if (!url) return false;
    if (url.startsWith("blob:") || url.startsWith("data:")) return true;
    const selfClone = normUrl(url) === normUrl(win.location.href);
    if (newTab) {
      if (selfClone || isSameSite(url)) return allowMode === "NEW_TAB" && Date.now() <= allowedUntil;
      if (Date.now() > allowedUntil || allowMode === "NONE") return false;
    }
    if (!newTab && !isSameSite(url) && Date.now() - lastAttempt < 1500) return false;
    if (!newTab && !selfClone && isSameSite(url)) return true;
    if (Date.now() <= allowedUntil) {
      if (allowMode === "ANY" || allowMode === "NEW_TAB") return true;
      if (allowMode === "DOMAIN" && allowedUrl) {
        try {
          const eh = new URL(allowedUrl, win.location.href).hostname;
          const ah = new URL(url, win.location.href).hostname;
          return eh === ah || ah.endsWith("." + eh) || getRoot(eh) === getRoot(ah);
        } catch { return false; }
      }
    }
    return false;
  }

  function fakeWin(url) {
    lastAttempt = Date.now(); addBlock();
    const loc = { href: url || "about:blank", assign() {}, replace() {} };
    return new Proxy({ closed: false, opener: win, location: loc, document: { write() {}, writeln() {}, close() {}, open() {} }, focus() {}, blur() {}, close() { this.closed = true; }, postMessage() {} }, {
      get: (t, p) => (p in t ? t[p] : () => {}),
      set: (t, p, v) => { t[p] = v; return true; }
    });
  }

  ["pointerdown", "touchstart", "click"].forEach((ev) => {
    win.addEventListener(ev, (e) => {
      if (!e.isTrusted || isBypassed()) return;
      if (!authorize(e, false, 3500)) { lockedA = null; lockedHref = null; allowMode = "NONE"; allowedUrl = null; allowedUntil = 0; }
    }, true);
  });

  win.addEventListener("contextmenu", (e) => { if (e.isTrusted && !isBypassed()) authorize(e, true, 8000); }, true);

  document.addEventListener("click", (e) => {
    if (isBypassed()) return;
    const { anchor } = findControls(e);
    if (!anchor || isPseudo(anchor)) return;
    const selfClone = normUrl(anchor.href) === normUrl(win.location.href);
    const newTab = opensNew(anchor);
    if (selfClone && newTab) { e.preventDefault(); lastAttempt = Date.now(); addBlock(); return; }
    if (isSameSite(anchor.href)) {
      if (lockedA === anchor && lockedHref && anchor.href !== lockedHref) anchor.href = lockedHref;
      if (newTab) anchor.setAttribute("target", "_self");
      return;
    }
    if (!isRealExtLink(anchor)) { e.preventDefault(); addBlock(); return; }
    if (lockedA === anchor && lockedHref && anchor.href !== lockedHref) anchor.href = lockedHref;
  }, true);

  function lockOpen(w) {
    if (!w || w.__gxOpenLocked) return;
    try {
      const orig = w.open;
      const fn = function (url) { return isAllowed(url, true) ? orig.apply(this, arguments) : fakeWin(url); };
      try { Object.defineProperty(w, "open", { configurable: false, writable: false, value: fn }); } catch { w.open = fn; }
      Object.defineProperty(w, "__gxOpenLocked", { value: true });
    } catch {}
  }

  lockOpen(win);

  const origAClick = HTMLAnchorElement.prototype.click;
  Object.defineProperty(HTMLAnchorElement.prototype, "click", {
    configurable: false, writable: false,
    value: function () {
      const dl = this.hasAttribute("download") && allowMode === "ANY" && Date.now() <= allowedUntil;
      if (!isBypassed() && !dl && !isAllowed(this.href, opensNew(this))) { lastAttempt = Date.now(); addBlock(); return; }
      return origAClick.apply(this, arguments);
    }
  });

  const origFSubmit = HTMLFormElement.prototype.submit;
  Object.defineProperty(HTMLFormElement.prototype, "submit", {
    configurable: false, writable: false,
    value: function () {
      if (!isBypassed() && opensNew(this) && !isAllowed(this.action, true)) { lastAttempt = Date.now(); addBlock(); return; }
      return origFSubmit.apply(this, arguments);
    }
  });

  const origWrite = Document.prototype.write;
  Document.prototype.write = function () { if (!isBypassed() && this.readyState === "complete") return; return origWrite.apply(this, arguments); };

  const obs = new MutationObserver(() => {
    if (isBypassed()) return;
    document.querySelectorAll('meta[http-equiv="refresh" i]').forEach((m) => m.remove());
    for (let i = 0; i < win.frames.length; i++) lockOpen(win.frames[i]);
  });
  if (document.documentElement) obs.observe(document.documentElement, { childList: true, subtree: true });
})();
