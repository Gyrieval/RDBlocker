// ==UserScript==
// @name         GX Smart Anti-Redirect
// @namespace    gx-smart-anti-redirect-ios
// @version      5.0.0
// @description  Chặn chuyển hướng, pop-under, bẫy tàng hình và tự đóng tab rác trên Orion iOS
// @match        *://*/*
// @noframes
// @run-at       document-start
// @inject-into  content
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        window.close
// ==/UserScript==

(() => {
  if (window.__gxContentInstalled) return;
  window.__gxContentInstalled = true;

  const TOKEN = "__gx_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const DEFAULT_WL = [
    "google.com",
    "youtube.com",
    "facebook.com",
    "github.com",
    "opera.com",
    "wikipedia.org",
    "apple.com",
    "microsoft.com",
    "zalo.me",
    "vnpay.vn",
    "momo.vn",
    "zalopay.vn"
  ];
  const TWO_TLDS = new Set([
    "com.vn", "net.vn", "org.vn", "edu.vn", "gov.vn",
    "co.uk", "org.uk", "com.au", "co.jp", "co.kr",
    "com.sg", "com.tw", "com.hk"
  ]);

  const getVal = (k, d) => {
    try {
      const v = GM_getValue(k, d);
      return v !== undefined ? v : d;
    } catch {
      return d;
    }
  };
  const setVal = (k, v) => {
    try {
      GM_setValue(k, v);
    } catch {}
  };

  let enabled = Boolean(getVal("gx_enabled", true));
  let whitelist = getVal("gx_whitelist", null);
  if (!Array.isArray(whitelist)) {
    whitelist = [...DEFAULT_WL];
    setVal("gx_whitelist", whitelist);
  }
  let blockedCount = Number(getVal("gx_blocked_count", 0)) || 0;

  function getRoot(h) {
    const c = (h || "").toLowerCase().replace(/^www\./, "");
    if (!c || /^\d+\.\d+\.\d+\.\d+$/.test(c)) return c;
    const p = c.split(".");
    if (p.length <= 2) return c;
    return TWO_TLDS.has(p.slice(-2).join(".")) && p.length >= 3
      ? p.slice(-3).join(".")
      : p.slice(-2).join(".");
  }

  const isWhitelistedHost = (host, root) =>
    whitelist.some((d) => host === d || host.endsWith("." + d) || root === d);

  const curHost = window.location.hostname.toLowerCase().replace(/^www\./, "");
  const curRoot = getRoot(curHost);

  const checkBypassed = () => !enabled || isWhitelistedHost(curHost, curRoot);

  const addBlock = () => {
    blockedCount += 1;
    setVal("gx_blocked_count", blockedCount);
  };

  // Lớp bảo vệ thay thế background.js: Tự động chặn đứng & đóng tab quảng cáo vừa bật ra
  if (window.top === window.self && enabled && !checkBypassed()) {
    try {
      let refHost = "";
      let refRoot = "";
      if (document.referrer) {
        const refUrl = new URL(document.referrer);
        refHost = refUrl.hostname.toLowerCase().replace(/^www\./, "");
        refRoot = getRoot(refHost);
      }

      const fromExternalSite =
        Boolean(refRoot) &&
        refRoot !== curRoot &&
        !isWhitelistedHost(refHost, refRoot);
      const spawnedByOpener = Boolean(window.opener);

      if (window.history.length <= 2 && (fromExternalSite || spawnedByOpener)) {
        const legitNav = getVal("gx_legit_nav", null);
        const isUserIntendedNewTab =
          legitNav &&
          Date.now() - legitNav.time < 15000 &&
          (legitNav.root === curRoot || legitNav.host === curHost);

        if (!isUserIntendedNewTab) {
          addBlock();
          try { window.stop(); } catch {}
          try { window.close(); } catch {}
        }
      }
    } catch {}
  }

  if (window.top === window.self && typeof GM_registerMenuCommand === "function") {
    try {
      GM_registerMenuCommand(
        enabled ? "🟢 Đang BẬT (Chạm để TẮT)" : "🔴 Đang TẮT (Chạm để BẬT)",
        () => {
          enabled = !enabled;
          setVal("gx_enabled", enabled);
          window.location.reload();
        }
      );
      if (curRoot) {
        const inWL = isWhitelistedHost(curHost, curRoot);
        GM_registerMenuCommand(
          inWL ? `➖ Xóa ${curRoot} khỏi Whitelist` : `➕ Thêm ${curRoot} vào Whitelist`,
          () => {
            let list = getVal("gx_whitelist", [...DEFAULT_WL]);
            if (!Array.isArray(list)) list = [...DEFAULT_WL];
            list = inWL
              ? list.filter((d) => d !== curRoot && d !== curHost)
              : [...new Set([...list, curRoot])];
            setVal("gx_whitelist", list);
            window.location.reload();
          }
        );
      }
      GM_registerMenuCommand(`🛡️ Đã chặn: ${blockedCount} lần`, () => {
        if (confirm(`Đã chặn ${blockedCount} lần. Đặt lại về 0?`)) {
          blockedCount = 0;
          setVal("gx_blocked_count", 0);
        }
      });
    } catch {}
  }

  window.addEventListener(
    "message",
    (e) => {
      if (e.source !== window || !e.data || e.data.__gxToken !== TOKEN) return;
      if (e.data.type === "GX_BLOCK") {
        addBlock();
      } else if (e.data.type === "GX_LEGIT_NAV") {
        setVal("gx_legit_nav", {
          host: e.data.host || "",
          root: e.data.root || "",
          time: Date.now()
        });
      }
    },
    true
  );

  function mainWorldBlocker(token, initialBypassed, rootDomain, hostName) {
    if (window.__gxMainReady) return;
    window.__gxMainReady = true;

    const bypassed = Boolean(initialBypassed);
    const nativePost = window.postMessage.bind(window);

    const reportBlock = () => {
      try {
        nativePost({ __gxToken: token, type: "GX_BLOCK" }, "*");
      } catch {}
    };

    const TWO_TLDS_INNER = new Set([
      "com.vn", "net.vn", "org.vn", "edu.vn", "gov.vn",
      "co.uk", "org.uk", "com.au", "co.jp", "co.kr",
      "com.sg", "com.tw", "com.hk"
    ]);
    const getInnerRoot = (h) => {
      const c = (h || "").toLowerCase().replace(/^www\./, "");
      if (!c || /^\d+\.\d+\.\d+\.\d+$/.test(c)) return c;
      const p = c.split(".");
      if (p.length <= 2) return c;
      return TWO_TLDS_INNER.has(p.slice(-2).join(".")) && p.length >= 3
        ? p.slice(-3).join(".")
        : p.slice(-2).join(".");
    };

    const reportLegitNewTab = (targetUrl) => {
      try {
        const u = new URL(targetUrl, window.location.href);
        const h = u.hostname.toLowerCase().replace(/^www\./, "");
        nativePost({ __gxToken: token, type: "GX_LEGIT_NAV", host: h, root: getInnerRoot(h) }, "*");
      } catch {}
    };

    const normUrl = (u) => {
      try {
        const x = new URL(u, window.location.href);
        x.hash = "";
        return x.href.replace(/\/+$/, "");
      } catch {
        return u || "";
      }
    };

    const isSameSite = (u) => {
      try {
        const p = new URL(u, window.location.href);
        if (p.protocol === "blob:" || p.protocol === "data:") return true;
        const h = p.hostname.toLowerCase().replace(/^www\./, "");
        return h === hostName || h.endsWith("." + hostName) || getInnerRoot(h) === rootDomain;
      } catch {
        return false;
      }
    };

    // Phân tách chặt chẽ quyền: "NONE" | "BUTTON" | "DOMAIN" | "EXT_LINK" | "NEW_TAB"
    let allowMode = "NONE";
    let allowedUrl = null;
    let allowedUntil = 0;
    let lockedA = null;
    let lockedHref = null;
    let lastInput = 0;
    let lastAttempt = 0;
    let touchStartX = 0;
    let touchStartY = 0;

    const resetAuth = () => {
      lockedA = null;
      lockedHref = null;
      allowMode = "NONE";
      allowedUrl = null;
      allowedUntil = 0;
    };

    const isPseudo = (a) => {
      const h = (a.getAttribute("href") || "").trim().toLowerCase();
      return !h || h.startsWith("#") || h.startsWith("javascript:");
    };

    const opensNew = (el) => {
      let t = ((el && el.getAttribute && el.getAttribute("target")) || "").trim();
      if (!t) {
        const b = document.querySelector("base[target]");
        if (b) t = (b.getAttribute("target") || "").trim();
      }
      return Boolean(t && t !== "_self" && t !== "_parent" && t !== "_top");
    };

    const isVisible = (el) => {
      if (!el || el.nodeType !== 1) return false;
      const s = window.getComputedStyle(el);
      return s.display !== "none" && s.visibility !== "hidden" && parseFloat(s.opacity) >= 0.4;
    };

    const isRealExtLink = (a) => {
      if (!a || !isVisible(a)) return false;
      const r = a.getBoundingClientRect();
      if (!r.width || !r.height || (r.width >= window.innerWidth * 0.65 && r.height >= window.innerHeight * 0.65)) {
        return false;
      }
      return a.innerText.trim().length > 0 || a.querySelector("img, svg, i, span, picture, canvas") !== null;
    };

    // Vô hiệu hóa lớp phủ tàng hình đè lên màn hình (Click-jacking)
    function neutralizeInvisibleTrap(target) {
      if (!target || target.nodeType !== 1) return false;
      if (target === document.body || target === document.documentElement || target.tagName === "VIDEO") {
        return false;
      }
      if (target.matches && target.matches("input, textarea, select, option")) return false;

      const s = window.getComputedStyle(target);
      const opacity = parseFloat(s.opacity);
      const r = target.getBoundingClientRect();
      const isHuge = r.width >= window.innerWidth * 0.5 && r.height >= window.innerHeight * 0.4;
      const isInvisibleOverlay =
        opacity < 0.15 &&
        (s.position === "fixed" || s.position === "absolute") &&
        (isHuge || parseInt(s.zIndex, 10) > 999);

      if (isInvisibleOverlay) {
        try {
          target.style.setProperty("pointer-events", "none", "important");
          target.style.setProperty("display", "none", "important");
        } catch {}
        reportBlock();
        return true;
      }
      return false;
    }

    window.addEventListener("input", (e) => { if (e.isTrusted) lastInput = Date.now(); }, true);
    window.addEventListener("change", (e) => { if (e.isTrusted) lastInput = Date.now(); }, true);
    window.addEventListener("submit", (e) => {
      if (e.isTrusted) {
        allowMode = "BUTTON";
        allowedUntil = Date.now() + 5000;
      }
    }, true);

    window.addEventListener("beforeunload", (e) => {
      if (!bypassed && Date.now() - lastInput < 30000 && (allowMode === "NONE" || Date.now() > allowedUntil)) {
        e.preventDefault();
        e.returnValue = "";
      }
    });

    function findControls(e) {
      const path = typeof e.composedPath === "function" ? e.composedPath() : [e.target];
      let anchor = null;
      let button = null;
      let nativeBtn = false;
      for (let i = 0; i < path.length; i++) {
        const n = path[i];
        if (!n || n.nodeType !== 1 || n === document.body || n === document.documentElement) break;
        if (n.matches && n.matches('video, [class*="player" i], [id*="player" i]')) {
          return { anchor: null, button: null, nativeBtn: false };
        }
        if (!anchor && n.tagName === "A" && n.hasAttribute("href")) anchor = n;
        if (!button) {
          if (n.matches && n.matches('button, input[type="submit"], input[type="button"], [role="button"], label, summary')) {
            button = n;
            nativeBtn = true;
          } else if (i < 6 && window.getComputedStyle(n).cursor === "pointer") {
            button = n;
          }
        }
      }
      return { anchor, button, nativeBtn };
    }

    function authorize(e, wantsNewTab = false, dur = 3000) {
      const { anchor, button, nativeBtn } = findControls(e);
      if (anchor && !isPseudo(anchor)) {
        const same = isSameSite(anchor.href);
        if (same || isRealExtLink(anchor)) {
          lockedA = anchor;
          lockedHref = anchor.href;
          allowedUrl = lockedHref;
          allowedUntil = Date.now() + dur;
          if (wantsNewTab) {
            allowMode = "NEW_TAB";
            reportLegitNewTab(lockedHref);
          } else if (same) {
            allowMode = "DOMAIN";
          } else {
            allowMode = "EXT_LINK";
            reportLegitNewTab(lockedHref);
          }
          return true;
        }
      }
      if (button && isVisible(button)) {
        const r = button.getBoundingClientRect();
        if (
          r.width > 0 &&
          r.height > 0 &&
          r.width < window.innerWidth * 0.5 &&
          (nativeBtn || button.innerText.trim().length > 0 || button.querySelector("img, svg, i, span"))
        ) {
          // Nút bấm thông thường chỉ cấp quyền trong tab hiện tại, KHÔNG cấp quyền mở tab quảng cáo mới
          allowMode = "BUTTON";
          allowedUrl = null;
          allowedUntil = Date.now() + (nativeBtn ? 3500 : 1800);
          return true;
        }
      }
      return false;
    }

    function matchesAllowedHost(url) {
      if (!allowedUrl) return false;
      try {
        const eh = new URL(allowedUrl, window.location.href).hostname;
        const ah = new URL(url, window.location.href).hostname;
        return eh === ah || ah.endsWith("." + eh) || getInnerRoot(eh) === getInnerRoot(ah);
      } catch {
        return false;
      }
    }

    function isAllowed(url, isNewTab = false) {
      if (bypassed) return true;
      if (!url) return false;
      if (url.startsWith("blob:") || url.startsWith("data:")) return true;

      const selfClone = normUrl(url) === normUrl(window.location.href);
      const expired = Date.now() > allowedUntil || allowMode === "NONE";

      if (isNewTab) {
        if (expired) return false;
        if (allowMode === "NEW_TAB") return true;
        if (allowMode === "EXT_LINK") return matchesAllowedHost(url);
        return false;
      }

      if (!isSameSite(url) && Date.now() - lastAttempt < 1500) return false;
      if (!selfClone && isSameSite(url)) return true;

      if (!expired) {
        if (allowMode === "BUTTON" || allowMode === "NEW_TAB") return true;
        if ((allowMode === "DOMAIN" || allowMode === "EXT_LINK") && matchesAllowedHost(url)) return true;
      }
      return false;
    }

    function fakeWin(url) {
      lastAttempt = Date.now();
      reportBlock();
      const loc = { href: url || "about:blank", assign() {}, replace() {} };
      return new Proxy(
        {
          closed: false,
          opener: window,
          location: loc,
          document: { write() {}, writeln() {}, close() {}, open() {} },
          focus() {},
          blur() {},
          close() { this.closed = true; },
          postMessage() {}
        },
        {
          get: (t, p) => (p in t ? t[p] : () => {}),
          set: (t, p, v) => { t[p] = v; return true; }
        }
      );
    }

    window.addEventListener(
      "touchstart",
      (e) => {
        if (!e.isTrusted || bypassed) return;
        if (neutralizeInvisibleTrap(e.target)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          resetAuth();
          return;
        }
        if (e.touches && e.touches[0]) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
        if (!authorize(e, false, 3000)) resetAuth();
      },
      true
    );

    // Hủy quyền ngay lập tức nếu người dùng đang vuốt cuộn trang (tránh bẫy touchend)
    window.addEventListener(
      "touchmove",
      (e) => {
        if (!e.isTrusted || bypassed) return;
        if (e.touches && e.touches[0]) {
          const dx = Math.abs(e.touches[0].clientX - touchStartX);
          const dy = Math.abs(e.touches[0].clientY - touchStartY);
          if (dx > 10 || dy > 10) resetAuth();
        }
      },
      true
    );

    ["pointerdown", "click"].forEach((ev) => {
      window.addEventListener(
        ev,
        (e) => {
          if (!e.isTrusted || bypassed) return;
          if (neutralizeInvisibleTrap(e.target)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            resetAuth();
            return;
          }
          const wantsNewTab = e.button === 1 || e.ctrlKey || e.metaKey || e.shiftKey;
          if (!authorize(e, wantsNewTab, 3000)) resetAuth();
        },
        true
      );
    });

    window.addEventListener("contextmenu", (e) => {
      if (e.isTrusted && !bypassed) authorize(e, true, 15000);
    }, true);

    document.addEventListener(
      "click",
      (e) => {
        if (bypassed) return;
        const { anchor } = findControls(e);
        if (!anchor || isPseudo(anchor)) return;

        const selfClone = normUrl(anchor.href) === normUrl(window.location.href);
        const newTab = opensNew(anchor);

        if (selfClone && newTab) {
          e.preventDefault();
          lastAttempt = Date.now();
          reportBlock();
          return;
        }

        if (isSameSite(anchor.href)) {
          if (lockedA === anchor && lockedHref && anchor.href !== lockedHref) anchor.href = lockedHref;
          if (newTab && allowMode !== "NEW_TAB") anchor.setAttribute("target", "_self");
          return;
        }

        if (!isRealExtLink(anchor)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          reportBlock();
          return;
        }

        if (lockedA === anchor && lockedHref && anchor.href !== lockedHref) anchor.href = lockedHref;
        reportLegitNewTab(anchor.href);
      },
      true
    );

    function lockOpen(w) {
      if (!w || w.__gxOpenLocked) return;
      try {
        const orig = w.open;
        const fn = function (url) {
          return isAllowed(url, true) ? orig.apply(this, arguments) : fakeWin(url);
        };
        try {
          Object.defineProperty(w, "open", { configurable: false, writable: false, value: fn });
        } catch {
          w.open = fn;
        }
        Object.defineProperty(w, "__gxOpenLocked", { value: true });
      } catch {}
    }

    lockOpen(window);

    // Khóa đồng bộ window.open bên trong các iframe tạo động trước khi mã quảng cáo kịp gọi
    function patchFrameTree(node) {
      if (!node || node.nodeType !== 1) return;
      if (node.tagName === "IFRAME" || node.tagName === "FRAME") {
        try { if (node.contentWindow) lockOpen(node.contentWindow); } catch {}
      }
      if (node.querySelectorAll) {
        node.querySelectorAll("iframe, frame").forEach((f) => {
          try { if (f.contentWindow) lockOpen(f.contentWindow); } catch {}
        });
      }
    }

    [
      [Node.prototype, "appendChild"],
      [Node.prototype, "insertBefore"],
      [Element.prototype, "append"],
      [Element.prototype, "prepend"],
      [Element.prototype, "insertAdjacentElement"]
    ].forEach(([proto, m]) => {
      const orig = proto[m];
      if (typeof orig === "function") {
        proto[m] = function (...args) {
          const res = orig.apply(this, args);
          for (const a of args) {
            if (a && a.nodeType === 1) patchFrameTree(a);
          }
          return res;
        };
      }
    });

    try {
      const cwDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
      if (cwDesc && cwDesc.get) {
        Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
          configurable: true,
          get: function () {
            const cw = cwDesc.get.call(this);
            try { if (cw) lockOpen(cw); } catch {}
            return cw;
          }
        });
      }
    } catch {}

    // Chặn các lệnh chuyển hướng location.assign() / location.replace() trái phép
    try {
      const origAssign = Location.prototype.assign;
      Location.prototype.assign = function (url) {
        if (!bypassed && !isAllowed(String(url), false)) {
          reportBlock();
          return;
        }
        return origAssign.apply(this, arguments);
      };
      const origReplace = Location.prototype.replace;
      Location.prototype.replace = function (url) {
        if (!bypassed && !isAllowed(String(url), false)) {
          reportBlock();
          return;
        }
        return origReplace.apply(this, arguments);
      };
    } catch {}

    const origAClick = HTMLAnchorElement.prototype.click;
    Object.defineProperty(HTMLAnchorElement.prototype, "click", {
      configurable: false,
      writable: false,
      value: function () {
        const dl = this.hasAttribute("download") && allowMode === "BUTTON" && Date.now() <= allowedUntil;
        if (!bypassed && !dl && !isAllowed(this.href, opensNew(this))) {
          lastAttempt = Date.now();
          reportBlock();
          return;
        }
        return origAClick.apply(this, arguments);
      }
    });

    const origFSubmit = HTMLFormElement.prototype.submit;
    Object.defineProperty(HTMLFormElement.prototype, "submit", {
      configurable: false,
      writable: false,
      value: function () {
        if (!bypassed && opensNew(this) && !isAllowed(this.action, true)) {
          lastAttempt = Date.now();
          reportBlock();
          return;
        }
        return origFSubmit.apply(this, arguments);
      }
    });

    const origWrite = Document.prototype.write;
    Document.prototype.write = function () {
      if (!bypassed && this.readyState === "complete") return;
      return origWrite.apply(this, arguments);
    };

    const obs = new MutationObserver(() => {
      if (bypassed) return;
      document.querySelectorAll('meta[http-equiv="refresh" i]').forEach((m) => m.remove());
      for (let i = 0; i < window.frames.length; i++) lockOpen(window.frames[i]);
    });
    if (document.documentElement) obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  try {
    const scriptEl = document.createElement("script");
    const nonceEl = document.querySelector("script[nonce]");
    if (nonceEl) {
      const n = nonceEl.nonce || nonceEl.getAttribute("nonce");
      if (n) scriptEl.setAttribute("nonce", n);
    }
    scriptEl.textContent = `(${mainWorldBlocker.toString()})(${JSON.stringify(TOKEN)}, ${JSON.stringify(checkBypassed())}, ${JSON.stringify(curRoot)}, ${JSON.stringify(curHost)});`;
    (document.head || document.documentElement).appendChild(scriptEl);
    scriptEl.remove();
  } catch {}
})();
