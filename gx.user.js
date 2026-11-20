// ==UserScript==
// @name         GX Smart Anti-Redirect
// @namespace    gx-smart-anti-redirect-ios
// @version      10.0.0
// @description  Kiến trúc bảo vệ toàn diện: khóa đa tầng iframe, đồng bộ ngăn xếp chạm, chặn Navigation API và chống bẫy data/base trên Orion iOS
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
    "zalopay.vn",
    "onepay.vn",
    "paypal.com",
    "stripe.com",
    "discord.com",
    "x.com",
    "twitter.com"
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

  function showLoopGuardBanner(targetDomain, prevUrl, isIsolatedTab) {
    const render = () => {
      if (!document.body || document.getElementById("__gx_loop_bar")) return;
      const bar = document.createElement("div");
      bar.id = "__gx_loop_bar";
      bar.style.cssText =
        "position:fixed;left:12px;right:12px;bottom:16px;z-index:2147483647;" +
        "background:#18181b;color:#f4f4f5;border:1px solid #3f3f46;border-radius:12px;" +
        "padding:12px 14px;font:14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;" +
        "box-shadow:0 10px 25px rgba(0,0,0,0.45);display:flex;flex-direction:column;gap:10px;";

      const msg = document.createElement("div");
      msg.textContent = `GX Anti-Redirect đã chặn chuyển hướng tới ${targetDomain}`;

      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";

      const allowBtn = document.createElement("button");
      allowBtn.textContent = "Mở trang này";
      allowBtn.style.cssText =
        "background:#27272a;color:#e4e4e7;border:1px solid #52525b;border-radius:8px;padding:6px 12px;font-size:13px;";
      allowBtn.onclick = () => {
        setVal("gx_legit_nav", { host: curHost, root: curRoot, anyExternal: false, time: Date.now() });
        window.location.reload();
      };

      const backBtn = document.createElement("button");
      backBtn.textContent = isIsolatedTab ? "Đóng tab" : "Về trang trước";
      backBtn.style.cssText =
        "background:#2563eb;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;";
      backBtn.onclick = () => {
        if (isIsolatedTab) {
          try { window.close(); } catch {}
          if (window.history.length > 1) window.history.back();
        } else if (prevUrl) {
          window.location.replace(prevUrl);
        } else {
          window.history.go(-2);
        }
      };

      actions.appendChild(allowBtn);
      actions.appendChild(backBtn);
      bar.appendChild(msg);
      bar.appendChild(actions);
      document.body.appendChild(bar);
    };

    if (document.body) {
      render();
    } else {
      window.addEventListener("DOMContentLoaded", render, { once: true });
    }
  }

  // Lớp bảo vệ tầng điều hướng & chống vòng lặp chuyển hướng ép buộc
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

      const lastTouch = getVal("gx_last_touch", null);
      const spawnedRightAfterTouch =
        window.history.length <= 3 &&
        lastTouch &&
        Date.now() - lastTouch.time < 1200 &&
        Boolean(lastTouch.root) &&
        lastTouch.root !== curRoot &&
        !isWhitelistedHost(lastTouch.host, lastTouch.root);

      const legitNav = getVal("gx_legit_nav", null);
      const isUserIntendedNav =
        legitNav &&
        Date.now() - legitNav.time < 10000 &&
        (legitNav.anyExternal || legitNav.root === curRoot || legitNav.host === curHost);

      if ((fromExternalSite || spawnedByOpener || spawnedRightAfterTouch) && !isUserIntendedNav) {
        addBlock();
        try { window.stop(); } catch {}

        if (window.history.length <= 2 || spawnedByOpener) {
          try { window.close(); } catch {}
          showLoopGuardBanner(curRoot || curHost, document.referrer, true);
        } else {
          const sourceRoot = refRoot || (lastTouch && lastTouch.root) || "";
          const bounce = getVal("gx_bounce_guard", null);
          const isRepeatedLoop =
            bounce &&
            bounce.from === sourceRoot &&
            bounce.to === curRoot &&
            Date.now() - bounce.time < 6000;

          if (isRepeatedLoop) {
            showLoopGuardBanner(curRoot || curHost, document.referrer, false);
          } else {
            setVal("gx_bounce_guard", { from: sourceRoot, to: curRoot, time: Date.now() });
            try { window.history.back(); } catch {}
          }
        }
      }
    } catch {}
  }

  const recordTouchActivity = () => {
    if (!checkBypassed() && curRoot) {
      setVal("gx_last_touch", { host: curHost, root: curRoot, time: Date.now() });
    }
  };
  window.addEventListener("touchend", recordTouchActivity, true);
  window.addEventListener("pointerup", recordTouchActivity, true);

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

  let mainAcked = false;

  window.addEventListener(
    "message",
    (e) => {
      if (e.source !== window || !e.data || e.data.__gxToken !== TOKEN) return;
      if (e.data.type === "GX_MAIN_ACK") {
        mainAcked = true;
      } else if (e.data.type === "GX_BLOCK") {
        addBlock();
      } else if (e.data.type === "GX_LEGIT_NAV") {
        setVal("gx_legit_nav", {
          host: e.data.host || "",
          root: e.data.root || "",
          anyExternal: Boolean(e.data.anyExternal),
          time: Date.now()
        });
      }
    },
    true
  );

  // Lớp chặn dự phòng ở Content Script nếu trang dùng CSP khóa hoàn toàn inline <script>
  document.addEventListener(
    "click",
    (e) => {
      if (mainAcked || checkBypassed()) return;
      const path = typeof e.composedPath === "function" ? e.composedPath() : [e.target];
      for (let i = 0; i < path.length; i++) {
        const n = path[i];
        if (!n || n.nodeType !== 1) continue;
        if ((n.localName === "a" || n.localName === "area") && n.hasAttribute("href")) {
          const rawHref = (n.getAttribute("href") || "").trim();
          if (!rawHref || rawHref.startsWith("#") || rawHref.toLowerCase().startsWith("javascript:")) return;
          try {
            const u = new URL(rawHref, window.location.href);
            const h = u.hostname.toLowerCase().replace(/^www\./, "");
            const r = getRoot(h);
            const same = h === curHost || h.endsWith("." + curHost) || r === curRoot;
            if (!e.isTrusted && !same) {
              e.preventDefault();
              e.stopImmediatePropagation();
              addBlock();
              return;
            }
            const rect = n.getBoundingClientRect();
            const isOverlay = rect.width >= window.innerWidth * 0.65 && rect.height >= window.innerHeight * 0.65;
            if (!same && (isOverlay || rect.width === 0 || rect.height === 0)) {
              e.preventDefault();
              e.stopImmediatePropagation();
              addBlock();
              return;
            }
            if (!same) {
              setVal("gx_legit_nav", { host: h, root: r, anyExternal: false, time: Date.now() });
            }
          } catch {}
          return;
        }
      }
    },
    true
  );

  function mainWorldBlocker(token, initialBypassed, rootDomain, hostName, wlList) {
    if (window.__gxMainReady) return;
    window.__gxMainReady = true;

    const bypassed = Boolean(initialBypassed);
    const nativePost = window.postMessage.bind(window);
    try {
      nativePost({ __gxToken: token, type: "GX_MAIN_ACK" }, "*");
    } catch {}

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

    const isWhitelistedUrl = (u) => {
      try {
        const p = new URL(u, window.location.href);
        const h = p.hostname.toLowerCase().replace(/^www\./, "");
        const r = getInnerRoot(h);
        return wlList.some((d) => h === d || h.endsWith("." + d) || r === d);
      } catch {
        return false;
      }
    };

    const reportLegitExternalNav = (targetUrl, anyExternal = false) => {
      try {
        const u = new URL(targetUrl || window.location.href, window.location.href);
        const h = u.hostname.toLowerCase().replace(/^www\./, "");
        nativePost(
          {
            __gxToken: token,
            type: "GX_LEGIT_NAV",
            host: h,
            root: getInnerRoot(h),
            anyExternal
          },
          "*"
        );
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
        if (p.protocol === "blob:" || p.protocol === "data:") return false;
        const h = p.hostname.toLowerCase().replace(/^www\./, "");
        return h === hostName || h.endsWith("." + hostName) || getInnerRoot(h) === rootDomain;
      } catch {
        return false;
      }
    };

    const isRedirectGateway = (u) => {
      try {
        const p = new URL(u, window.location.href);
        if (!isSameSite(u)) return false;
        const pathMatch = /^\/(go|out|away|redir|redirect|exit|jump|aff)\b/i.test(p.pathname);
        const queryMatch = /(?:^|[?&])(url|to|dest|destination|target|redirect|redir|link)=https?%3A|https?:\/\//i.test(p.search);
        return pathMatch || queryMatch;
      } catch {
        return false;
      }
    };

    let allowMode = "NONE";
    let allowedUrl = null;
    let allowedUntil = 0;
    let lockedA = null;
    let lockedHref = null;
    let touchOriginTarget = null;
    let touchOriginAnchor = null;
    let touchOriginTime = 0;
    let touchMoved = false;
    let trustedGestureDepth = 0;
    let lastVerifiedTapTime = 0;
    let lastGestureTime = 0;
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

    const hasActiveUserGesture = () =>
      trustedGestureDepth > 0 || Date.now() - lastVerifiedTapTime < 300;

    const getAnchorHref = (a) => {
      if (!a) return "";
      if (typeof a.href === "string") return a.href;
      if (a.href && typeof a.href.baseVal === "string") {
        try {
          return new URL(a.href.baseVal, window.location.href).href;
        } catch {
          return a.href.baseVal;
        }
      }
      const attr = a.getAttribute("href") || a.getAttribute("xlink:href") || "";
      try {
        return attr ? new URL(attr, window.location.href).href : "";
      } catch {
        return attr;
      }
    };

    const isPseudo = (a) => {
      const h = (a.getAttribute("href") || a.getAttribute("xlink:href") || "").trim().toLowerCase();
      return !h || h.startsWith("#") || h.startsWith("javascript:");
    };

    const opensNew = (el) => {
      let t = ((el && el.getAttribute && el.getAttribute("target")) || "").trim();
      if (!t && el && el.getAttribute) {
        t = (el.getAttribute("formtarget") || "").trim();
      }
      if (!t) {
        const b = document.querySelector("base[target]");
        if (b) t = (b.getAttribute("target") || "").trim();
      }
      return Boolean(t && t !== "_self" && t !== "_parent" && t !== "_top");
    };

    const isVisible = (el) => {
      if (!el || el.nodeType !== 1) return false;
      const s = window.getComputedStyle(el);
      return s.display !== "none" && s.visibility !== "hidden" && parseFloat(s.opacity) >= 0.35;
    };

    const isRealExtLink = (a) => {
      if (!a || !isVisible(a)) return false;
      const r = a.getBoundingClientRect();
      if (!r.width || !r.height || (r.width >= window.innerWidth * 0.65 && r.height >= window.innerHeight * 0.65)) {
        return false;
      }
      const s = window.getComputedStyle(a);
      const hasBgImage = s.backgroundImage && s.backgroundImage !== "none" && r.width >= 16 && r.height >= 16;
      return (
        a.innerText.trim().length > 0 ||
        a.querySelector("img, svg, i, span, picture, canvas") !== null ||
        hasBgImage
      );
    };

    function hasFullPseudoOverlay(el) {
      for (const pseudo of ["::before", "::after"]) {
        try {
          const ps = window.getComputedStyle(el, pseudo);
          if (!ps || ps.content === "none" || ps.content === "") continue;
          if (ps.position !== "fixed" && ps.position !== "absolute") continue;
          const pw = parseFloat(ps.width) || 0;
          const ph = parseFloat(ps.height) || 0;
          const opacity = parseFloat(ps.opacity);
          const isTransparent =
            ps.backgroundColor === "rgba(0, 0, 0, 0)" ||
            ps.backgroundColor === "transparent";
          if (
            pw >= window.innerWidth * 0.65 &&
            ph >= window.innerHeight * 0.55 &&
            (opacity < 0.08 || isTransparent)
          ) {
            return true;
          }
        } catch {}
      }
      return false;
    }

    function neutralizeInvisibleTrap(target) {
      if (!target || target.nodeType !== 1) return false;
      if (
        target === document.body ||
        target === document.documentElement ||
        target.matches(
          "video, audio, iframe, frame, canvas, object, embed, input, textarea, select, option, button, [role='button']"
        )
      ) {
        return false;
      }
      if (target.closest && target.closest('[class*="player" i], [id*="player" i], [role="dialog"], [aria-modal="true"]')) {
        return false;
      }

      if (hasFullPseudoOverlay(target)) {
        try {
          target.style.setProperty("pointer-events", "none", "important");
        } catch {}
        reportBlock();
        return true;
      }

      const s = window.getComputedStyle(target);
      if (s.position !== "fixed" && s.position !== "absolute") return false;

      const r = target.getBoundingClientRect();
      const coversScreen = r.width >= window.innerWidth * 0.65 && r.height >= window.innerHeight * 0.55;
      if (!coversScreen) return false;

      const isEmptyTrap =
        target.innerText.trim().length === 0 &&
        !target.querySelector("img, video, canvas, iframe, input, svg");
      if (!isEmptyTrap) return false;

      const opacity = parseFloat(s.opacity);
      const isTransparentBg =
        (s.backgroundColor === "rgba(0, 0, 0, 0)" || s.backgroundColor === "transparent") &&
        s.backgroundImage === "none" &&
        parseFloat(s.borderTopWidth) === 0;

      if (opacity < 0.08 || isTransparentBg) {
        try {
          target.style.setProperty("pointer-events", "none", "important");
        } catch {}
        reportBlock();
        return true;
      }
      return false;
    }

    function findControls(e) {
      const path = typeof e.composedPath === "function" ? e.composedPath() : [e.target];
      let anchor = null;
      let button = null;
      let nativeBtn = false;

      for (let i = 0; i < path.length; i++) {
        const n = path[i];
        if (!n || n.nodeType !== 1 || n === document.body || n === document.documentElement) break;

        if (!anchor && (n.localName === "a" || n.localName === "area") && (n.hasAttribute("href") || n.hasAttribute("xlink:href"))) {
          anchor = n;
        }

        if (!button) {
          if (
            n.matches &&
            n.matches(
              'button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], label, summary, [onclick], [tabindex]'
            )
          ) {
            button = n;
            nativeBtn = true;
          } else if (i < 5) {
            const r = n.getBoundingClientRect();
            const compactControl =
              r.width > 0 &&
              r.height > 0 &&
              r.width < window.innerWidth * 0.5 &&
              r.height < window.innerHeight * 0.35;
            if (
              compactControl &&
              (window.getComputedStyle(n).cursor === "pointer" ||
                n.hasAttribute("data-href") ||
                n.hasAttribute("data-url") ||
                n.hasAttribute("aria-expanded"))
            ) {
              button = n;
            }
          }
        }
      }
      return { anchor, button, nativeBtn };
    }

    function authorize(e, wantsNewTab = false, dur = 3000) {
      const { anchor, button, nativeBtn } = findControls(e);
      if (anchor && !isPseudo(anchor)) {
        const href = getAnchorHref(anchor);
        const gateway = isRedirectGateway(href);
        const same = isSameSite(href) && !gateway;
        if (same || isRealExtLink(anchor)) {
          lockedA = anchor;
          lockedHref = href;
          allowedUrl = lockedHref;
          allowedUntil = Date.now() + dur;
          if (wantsNewTab) {
            allowMode = "NEW_TAB";
            if (!same) reportLegitExternalNav(lockedHref, gateway);
          } else if (same) {
            allowMode = "DOMAIN";
          } else {
            allowMode = "EXT_LINK";
            reportLegitExternalNav(lockedHref, gateway);
          }
          return true;
        }
      }
      if (button && isVisible(button)) {
        const r = button.getBoundingClientRect();
        if (
          r.width > 0 &&
          r.height > 0 &&
          r.width < window.innerWidth * 0.65 &&
          (nativeBtn || button.innerText.trim().length > 0 || button.querySelector("img, svg, i, span"))
        ) {
          allowMode = "BUTTON";
          allowedUrl = null;
          allowedUntil = Date.now() + (nativeBtn ? 2500 : 1400);
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
      const trimmed = String(url).trim();
      if (/^javascript:/i.test(trimmed)) return false;

      const expired = Date.now() > allowedUntil || allowMode === "NONE";

      // Chỉ cho phép blob: / data: khi có thao tác hợp lệ đi kèm, chặn pop-up data:text/html tự phát
      if (trimmed.startsWith("blob:") || trimmed.startsWith("data:")) {
        return !expired && (hasActiveUserGesture() || allowMode === "BUTTON" || allowMode === "DOMAIN");
      }

      const selfClone = normUrl(trimmed) === normUrl(window.location.href);
      const gateway = isRedirectGateway(trimmed);
      const sameClean = isSameSite(trimmed) && !gateway;

      if (isNewTab) {
        if (expired) return false;
        if (allowMode === "NEW_TAB") {
          return allowedUrl ? matchesAllowedHost(trimmed) || isWhitelistedUrl(trimmed) : isWhitelistedUrl(trimmed);
        }
        if (allowMode === "EXT_LINK") return matchesAllowedHost(trimmed) || isWhitelistedUrl(trimmed);
        if (allowMode === "BUTTON" || allowMode === "FORM_SUBMIT") {
          // Chỉ cho phép nút bấm mở tab mới nếu gọi đồng bộ ngay trong cú bấm thật của người dùng
          if (hasActiveUserGesture() && !gateway) {
            reportLegitExternalNav(trimmed, false);
            return true;
          }
          return isWhitelistedUrl(trimmed);
        }
        return false;
      }

      if (!sameClean && Date.now() - lastAttempt < 1500) return false;
      if (!selfClone && sameClean) return true;

      if (!expired) {
        if (allowMode === "NEW_TAB") return allowedUrl ? matchesAllowedHost(trimmed) || isWhitelistedUrl(trimmed) : false;
        if ((allowMode === "DOMAIN" || allowMode === "EXT_LINK") && matchesAllowedHost(trimmed)) return true;
        if ((allowMode === "BUTTON" || allowMode === "FORM_SUBMIT") && (sameClean || isWhitelistedUrl(trimmed))) {
          return true;
        }
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

    // touchstart chỉ ghi nhận điểm chạm gốc để chống tráo DOM, không mở khóa window.open()
    window.addEventListener(
      "touchstart",
      (e) => {
        if (!e.isTrusted || bypassed) return;
        touchMoved = false;
        if (e.touches && e.touches[0]) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
        if (neutralizeInvisibleTrap(e.target)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          resetAuth();
          return;
        }
        const { anchor } = findControls(e);
        touchOriginTarget = e.target;
        touchOriginAnchor = anchor;
        touchOriginTime = Date.now();
        if (anchor && !isPseudo(anchor)) {
          lockedA = anchor;
          lockedHref = getAnchorHref(anchor);
        } else {
          resetAuth();
        }
      },
      true
    );

    window.addEventListener(
      "touchmove",
      (e) => {
        if (!e.isTrusted || bypassed) return;
        if (e.touches && e.touches[0]) {
          const dx = Math.abs(e.touches[0].clientX - touchStartX);
          const dy = Math.abs(e.touches[0].clientY - touchStartY);
          if (dx > 10 || dy > 10) {
            touchMoved = true;
            resetAuth();
          }
        }
      },
      true
    );

    const runVerifiedPress = (e, wantsNewTab) => {
      if (!e.isTrusted || bypassed) return;
      lastGestureTime = Date.now();
      if (neutralizeInvisibleTrap(e.target)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        resetAuth();
        return;
      }
      if (authorize(e, wantsNewTab, 2800)) {
        lastVerifiedTapTime = Date.now();
      } else {
        resetAuth();
      }
    };

    window.addEventListener(
      "touchend",
      (e) => {
        if (!e.isTrusted || bypassed || touchMoved) return;
        trustedGestureDepth += 1;
        try {
          runVerifiedPress(e, false);
        } finally {
          setTimeout(() => { trustedGestureDepth = Math.max(0, trustedGestureDepth - 1); }, 0);
        }
      },
      true
    );

    window.addEventListener(
      "pointerdown",
      (e) => {
        if (!e.isTrusted || bypassed || e.pointerType === "touch") return;
        const wantsNewTab = e.button === 1 || e.ctrlKey || e.metaKey || e.shiftKey;
        const { anchor } = findControls(e);
        touchOriginTarget = e.target;
        touchOriginAnchor = anchor;
        touchOriginTime = Date.now();
        runVerifiedPress(e, wantsNewTab);
      },
      true
    );

    window.addEventListener(
      "keydown",
      (e) => {
        if (!e.isTrusted || bypassed) return;
        lastGestureTime = Date.now();
        if (e.key === "Enter" || e.key === " ") {
          const wantsNewTab = e.ctrlKey || e.metaKey || e.shiftKey;
          trustedGestureDepth += 1;
          try {
            runVerifiedPress(e, wantsNewTab);
          } finally {
            setTimeout(() => { trustedGestureDepth = Math.max(0, trustedGestureDepth - 1); }, 0);
          }
        }
      },
      true
    );

    window.addEventListener("contextmenu", (e) => {
      if (e.isTrusted && !bypassed) {
        lastGestureTime = Date.now();
        authorize(e, true, 12000);
      }
    }, true);

    function handleDocumentClick(e) {
      if (bypassed) return;
      if (e.isTrusted) {
        lastGestureTime = Date.now();
        if (neutralizeInvisibleTrap(e.target)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          resetAuth();
          return;
        }
      }

      const { anchor } = findControls(e);
      if (!anchor || isPseudo(anchor)) {
        if (e.isTrusted) {
          const wantsNewTab = e.button === 1 || e.ctrlKey || e.metaKey || e.shiftKey;
          if (authorize(e, wantsNewTab, 2500)) {
            lastVerifiedTapTime = Date.now();
          }
        }
        return;
      }

      let href = getAnchorHref(anchor);
      if (lockedA === anchor && lockedHref && href !== lockedHref) {
        try { anchor.setAttribute("href", lockedHref); } catch {}
        href = lockedHref;
      }

      const gateway = isRedirectGateway(href);
      const sameClean = isSameSite(href) && !gateway;
      const selfClone = normUrl(href) === normUrl(window.location.href);
      const newTab = opensNew(anchor);

      if (!e.isTrusted) {
        if (!isAllowed(href, newTab)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          reportBlock();
        }
        return;
      }

      const wasInjectedMidTap =
        !sameClean &&
        Date.now() - touchOriginTime < 1200 &&
        touchOriginAnchor !== anchor &&
        (!touchOriginTarget || !anchor.contains(touchOriginTarget));

      if (wasInjectedMidTap) {
        e.preventDefault();
        e.stopImmediatePropagation();
        resetAuth();
        reportBlock();
        return;
      }

      if (selfClone && newTab) {
        e.preventDefault();
        lastAttempt = Date.now();
        reportBlock();
        return;
      }

      if (sameClean) {
        if (newTab && allowMode !== "NEW_TAB") {
          try { anchor.setAttribute("target", "_self"); } catch {}
        }
        return;
      }

      if (!isRealExtLink(anchor)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        reportBlock();
        return;
      }

      reportLegitExternalNav(href, gateway);
    }

    function handleDocumentSubmit(e) {
      if (bypassed) return;
      const form = e.target;
      if (!form || form.tagName !== "FORM") return;

      const submitter = e.submitter || document.activeElement;
      const actionUrl =
        (submitter && submitter.getAttribute && submitter.getAttribute("formaction")) ||
        form.getAttribute("action") ||
        window.location.href;
      const formOpensNew =
        opensNew(form) ||
        Boolean(submitter && submitter.getAttribute && opensNew(submitter));

      const safeDest = (isSameSite(actionUrl) && !isRedirectGateway(actionUrl)) || isWhitelistedUrl(actionUrl);

      if (!e.isTrusted && !safeDest && !isAllowed(actionUrl, formOpensNew)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        reportBlock();
        return;
      }
      if (e.isTrusted) {
        allowMode = "FORM_SUBMIT";
        allowedUrl = actionUrl;
        allowedUntil = Date.now() + 5000;
        lastVerifiedTapTime = Date.now();
        if (!isSameSite(actionUrl)) {
          reportLegitExternalNav(actionUrl, false);
        }
      }
    }

    const guardFormCall = (form, origFn, args) => {
      const actionUrl = form.getAttribute("action") || window.location.href;
      const safeDest = (isSameSite(actionUrl) && !isRedirectGateway(actionUrl)) || isWhitelistedUrl(actionUrl);
      if (!bypassed && !safeDest && !isAllowed(actionUrl, opensNew(form))) {
        lastAttempt = Date.now();
        reportBlock();
        return;
      }
      return origFn.apply(form, args);
    };

    // Khóa đồng bộ cả trang chính lẫn mọi khung iframe cùng nguồn
    function patchWindowEnvironment(w) {
      if (!w || w.__gxEnvLocked) return;
      try {
        Object.defineProperty(w, "__gxEnvLocked", { value: true });
      } catch {
        return;
      }

      try {
        const origOpen = w.open;
        const lockedOpen = function (url, target) {
          const isNew = !target || (target !== "_self" && target !== "_parent" && target !== "_top");
          return isAllowed(url, isNew) ? origOpen.apply(this, arguments) : fakeWin(url);
        };
        try {
          Object.defineProperty(w, "open", { configurable: false, writable: false, value: lockedOpen });
        } catch {
          w.open = lockedOpen;
        }
        const winProto = w.Window && w.Window.prototype;
        if (winProto && winProto.open && !winProto.__gxProtoOpenLocked) {
          Object.defineProperty(winProto, "open", { configurable: false, writable: false, value: lockedOpen });
          Object.defineProperty(winProto, "__gxProtoOpenLocked", { value: true });
        }
      } catch {}

      try {
        const locProto = w.Location && w.Location.prototype;
        if (locProto) {
          const origAssign = locProto.assign;
          locProto.assign = function (url) {
            if (!bypassed && !isAllowed(String(url), false)) {
              reportBlock();
              return;
            }
            return origAssign.apply(this, arguments);
          };
          const origReplace = locProto.replace;
          locProto.replace = function (url) {
            if (!bypassed && !isAllowed(String(url), false)) {
              reportBlock();
              return;
            }
            return origReplace.apply(this, arguments);
          };
        }
      } catch {}

      try {
        const aProto = w.HTMLAnchorElement && w.HTMLAnchorElement.prototype;
        if (aProto && aProto.click) {
          const origAClick = aProto.click;
          Object.defineProperty(aProto, "click", {
            configurable: true,
            writable: true,
            value: function () {
              const hrefStr = typeof this.href === "string" ? this.href : "";
              const isBlobOrData = hrefStr.startsWith("blob:") || hrefStr.startsWith("data:");
              const dl =
                this.hasAttribute("download") &&
                (isBlobOrData || (allowMode !== "NONE" && Date.now() <= allowedUntil));
              if (!bypassed && !dl && !isAllowed(hrefStr, opensNew(this))) {
                lastAttempt = Date.now();
                reportBlock();
                return;
              }
              return origAClick.apply(this, arguments);
            }
          });
        }
      } catch {}

      try {
        const fProto = w.HTMLFormElement && w.HTMLFormElement.prototype;
        if (fProto) {
          const origFSubmit = fProto.submit;
          Object.defineProperty(fProto, "submit", {
            configurable: true,
            writable: true,
            value: function () {
              return guardFormCall(this, origFSubmit, arguments);
            }
          });
          if (typeof fProto.requestSubmit === "function") {
            const origFReqSubmit = fProto.requestSubmit;
            Object.defineProperty(fProto, "requestSubmit", {
              configurable: true,
              writable: true,
              value: function () {
                return guardFormCall(this, origFReqSubmit, arguments);
              }
            });
          }
        }
      } catch {}

      try {
        if (w.navigation && typeof w.navigation.addEventListener === "function") {
          w.navigation.addEventListener("navigate", (e) => {
            if (bypassed || e.navigationType === "reload" || e.hashChange || e.downloadRequest) return;
            const dest = e.destination && e.destination.url;
            if (!dest) return;
            if (!isAllowed(dest, false) && e.cancelable) {
              e.preventDefault();
              reportBlock();
            }
          });
        }
      } catch {}

      try {
        if (w.document) {
          w.document.addEventListener("click", (e) => {
            if (e.isTrusted) trustedGestureDepth += 1;
            try {
              handleDocumentClick(e);
            } finally {
              if (e.isTrusted) {
                setTimeout(() => { trustedGestureDepth = Math.max(0, trustedGestureDepth - 1); }, 0);
              }
            }
          }, true);
          w.document.addEventListener("submit", handleDocumentSubmit, true);
        }
      } catch {}
    }

    patchWindowEnvironment(window);

    function patchFrameTree(node) {
      if (!node || node.nodeType !== 1) return;
      if (node.tagName === "IFRAME" || node.tagName === "FRAME") {
        try { if (node.contentWindow) patchWindowEnvironment(node.contentWindow); } catch {}
      }
      if (node.querySelectorAll) {
        node.querySelectorAll("iframe, frame").forEach((f) => {
          try { if (f.contentWindow) patchWindowEnvironment(f.contentWindow); } catch {}
        });
      }
    }

    window.addEventListener(
      "load",
      (e) => {
        const t = e.target;
        if (t && (t.tagName === "IFRAME" || t.tagName === "FRAME")) {
          try { if (t.contentWindow) patchWindowEnvironment(t.contentWindow); } catch {}
        }
      },
      true
    );

    [
      [Node.prototype, "appendChild"],
      [Node.prototype, "insertBefore"],
      [Node.prototype, "replaceChild"],
      [Element.prototype, "append"],
      [Element.prototype, "prepend"],
      [Element.prototype, "replaceWith"],
      [Element.prototype, "replaceChildren"],
      [Element.prototype, "insertAdjacentElement"]
    ].forEach(([proto, m]) => {
      try {
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
      } catch {}
    });

    try {
      const cwDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
      if (cwDesc && cwDesc.get) {
        Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
          configurable: true,
          get: function () {
            const cw = cwDesc.get.call(this);
            try { if (cw) patchWindowEnvironment(cw); } catch {}
            return cw;
          }
        });
      }
    } catch {}

    try {
      const cdDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentDocument");
      if (cdDesc && cdDesc.get) {
        Object.defineProperty(HTMLIFrameElement.prototype, "contentDocument", {
          configurable: true,
          get: function () {
            const cd = cdDesc.get.call(this);
            try { if (cd && cd.defaultView) patchWindowEnvironment(cd.defaultView); } catch {}
            return cd;
          }
        });
      }
    } catch {}

    try {
      let historySpamCount = 0;
      let historySpamWindowStart = 0;
      const origPushState = History.prototype.pushState;
      History.prototype.pushState = function (state, title, url) {
        if (!bypassed) {
          const targetHref = url ? normUrl(String(url)) : normUrl(window.location.href);
          const isSamePageTrap = targetHref === normUrl(window.location.href);
          const noUserGesture = Date.now() - lastGestureTime > 1500;
          if (isSamePageTrap && noUserGesture) {
            const now = Date.now();
            if (now - historySpamWindowStart > 2000) {
              historySpamWindowStart = now;
              historySpamCount = 1;
            } else {
              historySpamCount += 1;
            }
            if (historySpamCount >= 2) {
              reportBlock();
              return;
            }
          }
        }
        return origPushState.apply(this, arguments);
      };
    } catch {}

    try {
      const origWrite = Document.prototype.write;
      Document.prototype.write = function () {
        if (!bypassed && this === document && this.readyState === "complete") return;
        return origWrite.apply(this, arguments);
      };
    } catch {}

    const sanitizeBaseTag = (b) => {
      const t = (b.getAttribute("target") || "").trim();
      if (t && t !== "_self" && t !== "_parent" && t !== "_top") {
        b.removeAttribute("target");
      }
      const rawBaseHref = (b.getAttribute("href") || "").trim();
      if (rawBaseHref) {
        try {
          const parsedBase = new URL(rawBaseHref, window.location.href);
          if (!isSameSite(parsedBase.href)) {
            b.remove();
          }
        } catch {}
      }
    };

    const sanitizeNode = (node) => {
      if (!node || node.nodeType !== 1) return;
      const tag = node.tagName;
      if (tag === "META" && /^refresh$/i.test(node.getAttribute("http-equiv") || "")) {
        node.remove();
        return;
      }
      if (tag === "BASE") {
        sanitizeBaseTag(node);
        return;
      }
      if (tag === "IFRAME" || tag === "FRAME") {
        try { if (node.contentWindow) patchWindowEnvironment(node.contentWindow); } catch {}
        return;
      }
      if (node.firstElementChild) {
        node.querySelectorAll('meta[http-equiv="refresh" i]').forEach((m) => m.remove());
        node.querySelectorAll("base").forEach(sanitizeBaseTag);
        node.querySelectorAll("iframe, frame").forEach((f) => {
          try { if (f.contentWindow) patchWindowEnvironment(f.contentWindow); } catch {}
        });
      }
    };

    const obs = new MutationObserver((mutations) => {
      if (bypassed) return;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type === "childList") {
          for (let j = 0; j < m.addedNodes.length; j++) {
            sanitizeNode(m.addedNodes[j]);
          }
        } else if (m.type === "attributes") {
          sanitizeNode(m.target);
        }
      }
    });
    obs.observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["http-equiv", "target", "href"]
    });
  }

  let injectAttempts = 0;
  function injectMainWorld() {
    if (mainAcked || injectAttempts >= 6) return;
    try {
      const targetParent = document.head || document.documentElement;
      if (!targetParent) return;
      injectAttempts += 1;
      const scriptEl = document.createElement("script");
      const nonceEl = document.querySelector("script[nonce]");
      if (nonceEl) {
        const n = nonceEl.nonce || nonceEl.getAttribute("nonce");
        if (n) scriptEl.setAttribute("nonce", n);
      }
      let code = `(${mainWorldBlocker.toString()})(${JSON.stringify(TOKEN)}, ${JSON.stringify(checkBypassed())}, ${JSON.stringify(curRoot)}, ${JSON.stringify(curHost)}, ${JSON.stringify(whitelist)});`;
      if (window.trustedTypes) {
        try {
          if (window.trustedTypes.createPolicy) {
            const policy = window.trustedTypes.createPolicy("gx-anti-redirect-policy", {
              createScript: (s) => s
            });
            code = policy.createScript(code);
          } else if (window.trustedTypes.defaultPolicy && window.trustedTypes.defaultPolicy.createScript) {
            code = window.trustedTypes.defaultPolicy.createScript(code);
          }
        } catch {}
      }
      scriptEl.textContent = code;
      targetParent.appendChild(scriptEl);
      scriptEl.remove();
    } catch {}
  }

  injectMainWorld();

  const cspObserver = new MutationObserver(() => {
    if (mainAcked || injectAttempts >= 6) {
      cspObserver.disconnect();
      return;
    }
    if (document.querySelector("script[nonce]")) {
      injectMainWorld();
      if (mainAcked || injectAttempts >= 6) cspObserver.disconnect();
    }
  });
  cspObserver.observe(document, { childList: true, subtree: true });

  window.addEventListener(
    "DOMContentLoaded",
    () => {
      if (!mainAcked) injectMainWorld();
      cspObserver.disconnect();
    },
    { once: true }
  );
})();
