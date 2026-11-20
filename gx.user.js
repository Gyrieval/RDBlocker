// ==UserScript==
// @name         GX Smart Anti-Redirect
// @namespace    gx-smart-anti-redirect-ios
// @version      25.0.0
// @description  Vá lỗi không tải được ảnh CDN/Base64, tối ưu lazy-load ảnh, chặn redirect/pop-under và bẫy tàng hình trên Orion iOS
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

  const docType = (document.contentType || "").toLowerCase();
  if (
    docType &&
    docType !== "text/html" &&
    docType !== "application/xhtml+xml"
  ) {
    return;
  }

  const TOKEN = "__gx_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const DEFAULT_WL = [
    "google.com",
    "bing.com",
    "duckduckgo.com",
    "coccoc.com",
    "yahoo.com",
    "search.brave.com",
    "yandex.com",
    "yandex.ru",
    "ecosia.org",
    "startpage.com",
    "qwant.com",
    "naver.com",
    "baidu.com",
    "youtube.com",
    "facebook.com",
    "github.com",
    "opera.com",
    "wikipedia.org",
    "icloud.com",
    "idmsa.apple.com",
    "support.apple.com",
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
  } else {
    let changed = false;
    if (whitelist.includes("apple.com")) {
      whitelist = whitelist.filter((d) => d !== "apple.com");
      changed = true;
    }
    for (const d of DEFAULT_WL) {
      if (!whitelist.includes(d)) {
        whitelist.push(d);
        changed = true;
      }
    }
    if (changed) setVal("gx_whitelist", whitelist);
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

  const isSearchEngineHost = (h) =>
    /^([a-z0-9-]+\.)*(google\.[a-z.]{2,6}|bing\.com|duckduckgo\.com|coccoc\.com|yahoo\.com|search\.brave\.com|yandex\.(?:com|ru)|ecosia\.org|startpage\.com|qwant\.com|naver\.com|baidu\.com|sogou\.com|ask\.com)$/i.test(
      h || ""
    );

  const isWhitelistedHost = (host, root) =>
    isSearchEngineHost(host) ||
    whitelist.some((d) => host === d || host.endsWith("." + d) || root === d);

  const isKnownOpenRedirectUrl = (u) => {
    try {
      const p = new URL(u, window.location.href);
      const h = p.hostname.toLowerCase().replace(/^www\./, "");
      if (/^([a-z0-9-]+\.)*google\.[a-z.]{2,6}$/i.test(h) && /^\/(url|amp\/s)\b/i.test(p.pathname)) {
        return true;
      }
      if ((h === "facebook.com" || h.endsWith(".facebook.com")) && /^\/(l\.php|flx\/warn)\b/i.test(p.pathname)) {
        return true;
      }
      if ((h === "youtube.com" || h.endsWith(".youtube.com")) && /^\/redirect\b/i.test(p.pathname)) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const curHost = window.location.hostname.toLowerCase().replace(/^www\./, "");
  const curRoot = getRoot(curHost);

  const checkBypassed = () =>
    !enabled || (isWhitelistedHost(curHost, curRoot) && !isKnownOpenRedirectUrl(window.location.href));

  const addBlock = () => {
    const latest = Number(getVal("gx_blocked_count", blockedCount)) || 0;
    blockedCount = latest + 1;
    setVal("gx_blocked_count", blockedCount);
  };

  function silencePageMedia() {
    try {
      document.querySelectorAll("video, audio").forEach((m) => {
        try { m.pause(); m.muted = true; } catch {}
      });
    } catch {}
  }

  function showLoopGuardBanner(targetDomain, prevUrl, isIsolatedTab) {
    const render = () => {
      silencePageMedia();
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

      const hasValidPrev = Boolean(prevUrl && /^https?:\/\//i.test(prevUrl));
      const backBtn = document.createElement("button");
      backBtn.textContent = isIsolatedTab && !hasValidPrev ? "Đóng tab" : "Về trang trước";
      backBtn.style.cssText =
        "background:#2563eb;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;";
      backBtn.onclick = () => {
        if (hasValidPrev) {
          try {
            const pu = new URL(prevUrl);
            const ph = pu.hostname.toLowerCase().replace(/^www\./, "");
            setVal("gx_legit_nav", { host: ph, root: getRoot(ph), anyExternal: false, time: Date.now() });
          } catch {}
          window.location.replace(prevUrl);
        } else if (isIsolatedTab) {
          try { window.close(); } catch {}
          if (window.history.length > 1) window.history.back();
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

  const isMatchedLegitNav = () => {
    const legitNav = getVal("gx_legit_nav", null);
    return Boolean(
      legitNav &&
        Date.now() - legitNav.time < 8000 &&
        (legitNav.anyExternal || legitNav.root === curRoot || legitNav.host === curHost)
    );
  };

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

      const lastTouch = getVal("gx_last_touch", null);
      const refIsWhitelisted = isWhitelistedHost(refHost, refRoot);
      const refIsOpenRedirect = isKnownOpenRedirectUrl(document.referrer);

      const fromExternalSite =
        Boolean(refRoot) &&
        refRoot !== curRoot &&
        (!refIsWhitelisted ||
          (refIsOpenRedirect &&
            Boolean(lastTouch) &&
            Date.now() - lastTouch.time < 3000 &&
            Boolean(lastTouch.root) &&
            !isWhitelistedHost(lastTouch.host, lastTouch.root)));
      const spawnedByOpener = Boolean(window.opener);

      const spawnedRightAfterTouch =
        Boolean(lastTouch) &&
        Date.now() - lastTouch.time < 2500 &&
        Boolean(lastTouch.root) &&
        lastTouch.root !== curRoot &&
        !isWhitelistedHost(lastTouch.host, lastTouch.root);

      if ((fromExternalSite || spawnedByOpener || spawnedRightAfterTouch) && !isMatchedLegitNav()) {
        try { window.stop(); } catch {}
        silencePageMedia();

        const finalizeBlockNavigation = () => {
          if (isMatchedLegitNav()) {
            window.location.reload();
            return;
          }
          addBlock();
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
        };

        setTimeout(finalizeBlockNavigation, 60);
      }
    } catch {}
  }

  let lastTouchRecordMs = 0;
  const recordTouchActivity = (e) => {
    if (e && e.isTrusted === false) return;
    if (!enabled || !curRoot) return;
    const now = Date.now();
    if (now - lastTouchRecordMs < 150) return;
    lastTouchRecordMs = now;
    setVal("gx_last_touch", { host: curHost, root: curRoot, time: now });
  };
  window.addEventListener("touchstart", recordTouchActivity, true);
  window.addEventListener("pointerdown", recordTouchActivity, true);
  window.addEventListener("touchend", recordTouchActivity, true);
  window.addEventListener("pointerup", recordTouchActivity, true);

  // Ghi nhận ý định điều hướng khi người dùng bấm kết quả trên trang tìm kiếm / trang Whitelist
  window.addEventListener(
    "click",
    (e) => {
      if (!enabled || !e.isTrusted || !checkBypassed()) return;
      const path = typeof e.composedPath === "function" ? e.composedPath() : [e.target];
      for (let i = 0; i < path.length; i++) {
        const n = path[i];
        if (!n || n.nodeType !== 1 || n === document.body || n === document.documentElement) break;
        if (
          (n.localName === "a" || n.localName === "area") &&
          n.hasAttribute("href")
        ) {
          setVal("gx_legit_nav", { host: curHost, root: curRoot, anyExternal: true, time: Date.now() });
          return;
        }
      }
    },
    true
  );

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
      GM_registerMenuCommand(`🛡️ Xem & Đặt lại bộ đếm chặn`, () => {
        const currentTotal = Number(getVal("gx_blocked_count", blockedCount)) || 0;
        if (confirm(`Tổng số lần đã chặn: ${currentTotal}.\nBạn có muốn đặt lại bộ đếm về 0 không?`)) {
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

  // Lớp phòng thủ dự phòng ở Content Script dành riêng cho trang dùng CSP khóa hoàn toàn inline <script>
  let csTouchAnchor = null;
  let csTouchTime = 0;

  const findAnchorInPath = (e) => {
    const path = typeof e.composedPath === "function" ? e.composedPath() : [e.target];
    for (let i = 0; i < path.length; i++) {
      const n = path[i];
      if (!n || n.nodeType !== 1 || n === document.body || n === document.documentElement) break;
      if ((n.localName === "a" || n.localName === "area") && n.hasAttribute("href")) return n;
    }
    return null;
  };

  const neutralizeContentScriptOverlay = (e) => {
    const path = typeof e.composedPath === "function" ? e.composedPath() : [e.target];
    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      if (!node || node.nodeType !== 1 || node === document.body || node === document.documentElement) break;
      if (node.matches("video, audio, iframe, object, input, textarea, select, button, [role='button'], svg")) continue;
      if (node.closest && node.closest('[role="dialog"], [aria-modal="true"]')) continue;
      const r = node.getBoundingClientRect();
      if (r.width < 200 || r.height < 120) continue;
      const s = window.getComputedStyle(node);
      if (s.position !== "fixed" && s.position !== "absolute") continue;
      const opacity = parseFloat(s.opacity);
      if ((node.tagName === "IMG" || node.tagName === "LABEL") && opacity >= 0.15) continue;
      const isTransparent =
        opacity < 0.15 ||
        ((s.backgroundColor === "rgba(0, 0, 0, 0)" || s.backgroundColor === "transparent") &&
          s.backgroundImage === "none" &&
          node.innerText.trim().length === 0 &&
          !node.querySelector("video, audio, canvas, iframe, input, button, svg, img"));
      if (isTransparent) {
        try { node.style.setProperty("pointer-events", "none", "important"); } catch {}
        addBlock();
        return true;
      }
    }
    return false;
  };

  window.addEventListener(
    "touchstart",
    (e) => {
      if (mainAcked || checkBypassed() || !e.isTrusted) return;
      if (neutralizeContentScriptOverlay(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        csTouchAnchor = null;
        return;
      }
      csTouchAnchor = findAnchorInPath(e);
      csTouchTime = Date.now();
    },
    true
  );

  window.addEventListener(
    "click",
    (e) => {
      if (mainAcked || checkBypassed()) return;
      if (e.isTrusted && neutralizeContentScriptOverlay(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      const n = findAnchorInPath(e);
      if (!n) return;

      const rawHref = (n.getAttribute("href") || "").replace(/[\x00-\x1f\x7f]/g, "").trim();
      if (!rawHref || rawHref.startsWith("#") || rawHref.toLowerCase().startsWith("javascript:")) return;
      try {
        const u = new URL(rawHref, window.location.href);
        const h = u.hostname.toLowerCase().replace(/^www\./, "");
        const r = getRoot(h);
        const isGateway =
          (h === curHost || h.endsWith("." + curHost) || r === curRoot) &&
          /^\/(go|out|away|redir|redirect|exit|jump|aff)(\/|\.|$)/i.test(u.pathname);
        const same = (h === curHost || h.endsWith("." + curHost) || r === curRoot) && !isGateway;
        const targetAttr = (n.getAttribute("target") || "").trim();
        const opensNewTab = targetAttr && targetAttr !== "_self" && targetAttr !== "_parent" && targetAttr !== "_top";

        if (!e.isTrusted && (!same || opensNewTab)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          addBlock();
          return;
        }
        if (!same && Date.now() - csTouchTime < 2000 && csTouchAnchor !== n) {
          e.preventDefault();
          e.stopImmediatePropagation();
          addBlock();
          return;
        }
        if (same && opensNewTab && u.href.split("#")[0] === window.location.href.split("#")[0]) {
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
    },
    true
  );

  window.addEventListener(
    "submit",
    (e) => {
      if (mainAcked || checkBypassed()) return;
      const form = e.target;
      if (!form || form.tagName !== "FORM") return;
      try {
        const actionUrl = form.getAttribute("action") || window.location.href;
        const u = new URL(actionUrl, window.location.href);
        const h = u.hostname.toLowerCase().replace(/^www\./, "");
        const r = getRoot(h);
        const same = h === curHost || h.endsWith("." + curHost) || r === curRoot;
        if (!e.isTrusted && !same && !isWhitelistedHost(h, r)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          addBlock();
        }
      } catch {}
    },
    true
  );

  const cleanFallbackNode = (node) => {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === "META" && /^refresh$/i.test((node.getAttribute("http-equiv") || "").trim())) {
      node.remove();
      return;
    }
    if (node.tagName === "BASE") {
      const t = (node.getAttribute("target") || "").trim();
      if (t && t !== "_self" && t !== "_parent" && t !== "_top") node.removeAttribute("target");
      return;
    }
    if (node.firstElementChild) {
      node.querySelectorAll("meta[http-equiv]").forEach((m) => {
        if (/^refresh$/i.test((m.getAttribute("http-equiv") || "").trim())) m.remove();
      });
      node.querySelectorAll("base[target]").forEach((b) => {
        const t = (b.getAttribute("target") || "").trim();
        if (t && t !== "_self" && t !== "_parent" && t !== "_top") b.removeAttribute("target");
      });
    }
  };

  const fallbackDomObserver = new MutationObserver((mutations) => {
    if (mainAcked) {
      fallbackDomObserver.disconnect();
      return;
    }
    if (checkBypassed()) return;
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      if (m.type !== "childList") continue;
      for (let j = 0; j < m.addedNodes.length; j++) {
        cleanFallbackNode(m.addedNodes[j]);
      }
    }
  });
  fallbackDomObserver.observe(document, { childList: true, subtree: true });

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

    const sanitizeRawUrl = (raw) =>
      String(raw || "").replace(/[\x00-\x1f\x7f]/g, "").trim();

    const isOpenRedirectOnWhitelisted = (p) => {
      const h = p.hostname.toLowerCase().replace(/^www\./, "");
      if (/^([a-z0-9-]+\.)*google\.[a-z.]{2,6}$/i.test(h) && /^\/(url|amp\/s)\b/i.test(p.pathname)) {
        return true;
      }
      if ((h === "facebook.com" || h.endsWith(".facebook.com")) && /^\/(l\.php|flx\/warn)\b/i.test(p.pathname)) {
        return true;
      }
      if ((h === "youtube.com" || h.endsWith(".youtube.com")) && /^\/redirect\b/i.test(p.pathname)) {
        return true;
      }
      return false;
    };

    const isWhitelistedUrl = (u) => {
      try {
        const p = new URL(sanitizeRawUrl(u), window.location.href);
        if (p.protocol !== "http:" && p.protocol !== "https:") return false;
        if (isOpenRedirectOnWhitelisted(p)) return false;
        const h = p.hostname.toLowerCase().replace(/^www\./, "");
        const r = getInnerRoot(h);
        return wlList.some((d) => h === d || h.endsWith("." + d) || r === d);
      } catch {
        return false;
      }
    };

    const reportLegitExternalNav = (targetUrl, anyExternal = false) => {
      try {
        const u = new URL(sanitizeRawUrl(targetUrl || window.location.href), window.location.href);
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
        const x = new URL(sanitizeRawUrl(u), window.location.href);
        x.hash = "";
        return x.href.replace(/\/+$/, "");
      } catch {
        return u || "";
      }
    };

    const isSameSite = (u) => {
      try {
        const p = new URL(sanitizeRawUrl(u), window.location.href);
        if (p.protocol !== "http:" && p.protocol !== "https:") return false;
        const h = p.hostname.toLowerCase().replace(/^www\./, "");
        return h === hostName || h.endsWith("." + hostName) || getInnerRoot(h) === rootDomain;
      } catch {
        return false;
      }
    };

    const isExternalAppScheme = (u) => {
      try {
        const p = new URL(sanitizeRawUrl(u), window.location.href);
        return (
          p.protocol !== "http:" &&
          p.protocol !== "https:" &&
          p.protocol !== "blob:" &&
          p.protocol !== "data:" &&
          p.protocol !== "about:"
        );
      } catch {
        return false;
      }
    };

    const decodeParamCandidate = (val) => {
      let cur = sanitizeRawUrl(val);
      for (let i = 0; i < 2; i++) {
        if (/%[0-9a-f]{2}/i.test(cur)) {
          try {
            const dec = decodeURIComponent(cur);
            if (dec === cur) break;
            cur = dec.trim();
          } catch {
            break;
          }
        }
      }
      if (/^aHR0c(Dov|HM6)/i.test(cur)) {
        try {
          const decodedB64 = atob(cur.replace(/-/g, "+").replace(/_/g, "/")).trim();
          if (/^https?:\/\//i.test(decodedB64)) return decodedB64;
        } catch {}
      }
      if (cur.startsWith("//") && cur.length > 4) {
        return window.location.protocol + cur;
      }
      return cur;
    };

    const isRedirectGateway = (u) => {
      try {
        const p = new URL(sanitizeRawUrl(u), window.location.href);
        if (!isSameSite(u)) return false;
        if (/^\/(go|out|away|redir|redirect|exit|jump|aff)(\/|\.|$)/i.test(p.pathname)) {
          return true;
        }
        for (const [k, rawVal] of p.searchParams.entries()) {
          if (
            /^(url|to|dest|destination|target|redirect|redir|redirect_uri|return_to|next|continue|forward|link|u|r|goto|away|out)$/i.test(
              k
            )
          ) {
            const candidate = decodeParamCandidate(rawVal);
            if (/^https?:\/\//i.test(candidate)) {
              const destUrl = new URL(candidate);
              if (!isSameSite(destUrl.href) && !isWhitelistedUrl(destUrl.href)) {
                return true;
              }
            }
          }
        }
        return false;
      } catch {
        return false;
      }
    };

    let allowMode = "NONE";
    let allowedUrl = null;
    let allowedUntil = 0;
    let lockedA = null;
    let lockedHref = null;
    let touchOriginAnchor = null;
    let touchOriginWasPseudo = false;
    let touchOriginTime = 0;
    let touchMoved = false;
    let trustedGestureDepth = 0;
    let lastVerifiedTapTime = 0;
    let lastFormTypingTime = 0;
    let lastGestureTime = 0;
    let lastAttempt = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    const blockedBlobUrls = new Set();

    const resetAuth = () => {
      lockedA = null;
      lockedHref = null;
      allowMode = "NONE";
      allowedUrl = null;
      allowedUntil = 0;
    };

    const hasActiveUserGesture = () =>
      trustedGestureDepth > 0 || Date.now() - lastVerifiedTapTime < 250;

    const isInjectedExternalAnchor = (anchor, sameClean) => {
      if (sameClean || !anchor) return false;
      if (Date.now() - touchOriginTime >= 2500) return false;
      if (touchOriginAnchor === anchor) {
        return touchOriginWasPseudo;
      }
      return true;
    };

    const getAnchorHref = (a) => {
      if (!a) return "";
      if (typeof a.href === "string") return sanitizeRawUrl(a.href);
      if (a.href && typeof a.href.baseVal === "string") {
        try {
          return new URL(sanitizeRawUrl(a.href.baseVal), window.location.href).href;
        } catch {
          return sanitizeRawUrl(a.href.baseVal);
        }
      }
      const attr = sanitizeRawUrl(a.getAttribute("href") || a.getAttribute("xlink:href") || "");
      try {
        return attr ? new URL(attr, window.location.href).href : "";
      } catch {
        return attr;
      }
    };

    const isPseudo = (a) => {
      const h = sanitizeRawUrl(a.getAttribute("href") || a.getAttribute("xlink:href") || "").toLowerCase();
      return !h || h.startsWith("#") || h.startsWith("javascript:");
    };

    const isTargetExistingFrame = (targetName) => {
      if (!targetName) return false;
      try {
        if (window.frames && window.frames[targetName]) return true;
      } catch {}
      const frames = document.querySelectorAll("iframe[name], frame[name], object[name]");
      for (let i = 0; i < frames.length; i++) {
        if (frames[i].getAttribute("name") === targetName) return true;
      }
      return false;
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
      if (!t || t === "_self" || t === "_parent" || t === "_top") return false;
      return !isTargetExistingFrame(t);
    };

    const supportsCheckVisibility = typeof Element.prototype.checkVisibility === "function";
    const isEffectiveVisible = (el) => {
      if (!el || el.nodeType !== 1) return false;
      if (supportsCheckVisibility) {
        try {
          return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
        } catch {}
      }
      let cur = el;
      while (cur && cur.nodeType === 1) {
        const s = window.getComputedStyle(cur);
        if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) < 0.2) {
          return false;
        }
        if (cur === document.body) break;
        cur = cur.parentElement;
      }
      return true;
    };

    const isTransparentColor = (colorStr) => {
      if (!colorStr || colorStr === "transparent") return true;
      const m = colorStr.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*([0-9.]+)\s*)?\)/i);
      if (!m) return false;
      return m[1] !== undefined && parseFloat(m[1]) < 0.05;
    };

    const isTransparentBackground = (s) => {
      const bgColorTransparent = isTransparentColor(s.backgroundColor);
      if (!bgColorTransparent) return false;
      const bgImg = s.backgroundImage || "none";
      if (bgImg === "none") return true;
      if (/gradient\(/i.test(bgImg) && !/url\(/i.test(bgImg)) {
        const stops = bgImg.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}|\btransparent\b/gi) || [];
        return stops.length > 0 && stops.every((c) => isTransparentColor(c));
      }
      return false;
    };

    const hasOwnPseudoGraphic = (el) => {
      for (const pseudo of ["::before", "::after"]) {
        try {
          const ps = window.getComputedStyle(el, pseudo);
          if (ps && ps.content && ps.content !== "none" && ps.content !== '""') {
            return true;
          }
          if (ps && ps.backgroundImage && ps.backgroundImage !== "none") {
            return true;
          }
        } catch {}
      }
      return false;
    };

    const hasVisibleGraphicChild = (el) => {
      const media = el.querySelectorAll("img, svg, picture, canvas");
      for (let i = 0; i < media.length; i++) {
        const m = media[i];
        const mr = m.getBoundingClientRect();
        const ms = window.getComputedStyle(m);
        if (mr.width >= 8 && mr.height >= 8 && ms.display !== "none" && parseFloat(ms.opacity) >= 0.2) {
          return true;
        }
      }
      const icons = el.querySelectorAll("i, span");
      for (let i = 0; i < icons.length; i++) {
        const ic = icons[i];
        const ir = ic.getBoundingClientRect();
        const is = window.getComputedStyle(ic);
        if (ir.width >= 6 && ir.height >= 6 && is.backgroundImage && is.backgroundImage !== "none") {
          return true;
        }
        if (hasOwnPseudoGraphic(ic)) return true;
      }
      return false;
    };

    const isRealExtLink = (a) => {
      if (!a || !isEffectiveVisible(a)) return false;
      const r = a.getBoundingClientRect();
      if (!r.width || !r.height || (r.width >= window.innerWidth * 0.65 && r.height >= window.innerHeight * 0.65)) {
        return false;
      }
      const s = window.getComputedStyle(a);
      const hasVisibleText =
        a.innerText.trim().length > 0 &&
        parseFloat(s.fontSize) >= 8 &&
        !isTransparentColor(s.color);
      const hasBgImage = s.backgroundImage && s.backgroundImage !== "none" && r.width >= 16 && r.height >= 16;
      return hasVisibleText || hasVisibleGraphicChild(a) || hasBgImage || hasOwnPseudoGraphic(a);
    };

    function hasFullPseudoOverlay(el) {
      if ((el.offsetWidth || 0) < 180 || (el.offsetHeight || 0) < 100) return false;
      for (const pseudo of ["::before", "::after"]) {
        try {
          const ps = window.getComputedStyle(el, pseudo);
          if (!ps || ps.content === "none" || ps.content === "") continue;
          if (ps.position !== "fixed" && ps.position !== "absolute") continue;
          const pw = parseFloat(ps.width) || 0;
          const ph = parseFloat(ps.height) || 0;
          const opacity = parseFloat(ps.opacity);
          if (
            pw >= Math.min(window.innerWidth * 0.6, 220) &&
            ph >= Math.min(window.innerHeight * 0.25, 140) &&
            (opacity < 0.15 || isTransparentColor(ps.backgroundColor))
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
          "video, audio, iframe, frame, object, canvas, embed, input, textarea, select, option, button, [role='button'], svg, path"
        )
      ) {
        return false;
      }
      if (target.closest && target.closest('[role="dialog"], [aria-modal="true"]')) {
        return false;
      }

      if (hasFullPseudoOverlay(target)) {
        try {
          target.style.setProperty("pointer-events", "none", "important");
        } catch {}
        reportBlock();
        return true;
      }

      const r = target.getBoundingClientRect();
      if (r.width < 200 || r.height < 120) return false;

      const s = window.getComputedStyle(target);
      if (s.position !== "fixed" && s.position !== "absolute") return false;

      const insidePlayer = Boolean(target.closest('[class*="player" i], [id*="player" i]'));
      const isLargeOverlay =
        (r.width >= window.innerWidth * 0.65 && r.height >= window.innerHeight * 0.5) ||
        insidePlayer;
      if (!isLargeOverlay) return false;

      if (insidePlayer) {
        const z = parseInt(s.zIndex, 10) || 0;
        const hasAdLink = target.tagName === "A" || Boolean(target.querySelector("a[href]"));
        if (!hasAdLink && z < 9999 && parseFloat(s.opacity) >= 0.15) {
          return false;
        }
      }

      const opacity = parseFloat(s.opacity);
      if (opacity < 0.15) {
        try {
          target.style.setProperty("pointer-events", "none", "important");
        } catch {}
        reportBlock();
        return true;
      }

      if (target.tagName === "IMG" || target.tagName === "LABEL") return false;

      const isEmptyTrap =
        target.innerText.trim().length === 0 &&
        !target.querySelector("video, audio, canvas, iframe, object, input, button, [role='button'], svg, img");
      if (!isEmptyTrap) return false;

      if (isTransparentBackground(s) && parseFloat(s.borderTopWidth) === 0) {
        try {
          target.style.setProperty("pointer-events", "none", "important");
        } catch {}
        reportBlock();
        return true;
      }
      return false;
    }

    function neutralizeTrapInEvent(e) {
      const path = typeof e.composedPath === "function" ? e.composedPath() : [e.target];
      for (let i = 0; i < path.length; i++) {
        const node = path[i];
        if (!node || node === document.body || node === document.documentElement) break;
        if (neutralizeInvisibleTrap(node)) return true;
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
        let href = getAnchorHref(anchor);
        if (lockedA === anchor && lockedHref && href !== lockedHref) {
          try { anchor.setAttribute("href", lockedHref); } catch {}
          href = lockedHref;
        }

        const gateway = isRedirectGateway(href);
        const same = isSameSite(href) && !gateway;
        if (isInjectedExternalAnchor(anchor, same)) {
          return false;
        }
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
      if (button && isEffectiveVisible(button)) {
        const r = button.getBoundingClientRect();
        if (
          r.width > 0 &&
          r.height > 0 &&
          r.width < window.innerWidth * 0.65 &&
          (nativeBtn || button.innerText.trim().length > 0 || hasVisibleGraphicChild(button))
        ) {
          allowMode = "BUTTON";
          allowedUrl = null;
          allowedUntil = Date.now() + (nativeBtn ? 2500 : 1400);
          reportLegitExternalNav(window.location.href, true);
          return true;
        }
      }
      return false;
    }

    function matchesAllowedHost(url) {
      if (!allowedUrl) return false;
      try {
        const eh = new URL(sanitizeRawUrl(allowedUrl), window.location.href).hostname;
        const ah = new URL(sanitizeRawUrl(url), window.location.href).hostname;
        return eh === ah || ah.endsWith("." + eh) || getInnerRoot(eh) === getInnerRoot(ah);
      } catch {
        return false;
      }
    }

    function isAllowed(url, isNewTab = false, callerWin = window) {
      if (bypassed) return true;
      if (!url) return false;
      const trimmed = sanitizeRawUrl(url);
      const lower = trimmed.toLowerCase();

      if (lower.startsWith("javascript:") || lower.startsWith("data:")) return false;

      const expired = Date.now() > allowedUntil || allowMode === "NONE";

      if (lower.startsWith("blob:")) {
        if (blockedBlobUrls.has(trimmed)) return false;
        return !isNewTab && !expired && (hasActiveUserGesture() || allowMode === "BUTTON" || allowMode === "DOMAIN");
      }

      if (isExternalAppScheme(trimmed)) {
        return !expired && (allowMode === "EXT_LINK" || allowMode === "NEW_TAB") && allowedUrl === trimmed;
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
          if (sameClean && !selfClone && hasActiveUserGesture()) return true;
          return isWhitelistedUrl(trimmed);
        }
        return false;
      }

      if (callerWin && callerWin !== window && !hasActiveUserGesture() && expired) {
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

    function fakeWin(url, promotionOpts) {
      let promoted = false;
      const tryPromoteBlank = (nextUrl) => {
        if (promoted || !promotionOpts || !nextUrl) return false;
        const cleanNext = sanitizeRawUrl(nextUrl);
        const lowerNext = cleanNext.toLowerCase();
        if (!cleanNext || cleanNext === "about:blank" || lowerNext.startsWith("javascript:") || lowerNext.startsWith("data:")) {
          return false;
        }
        const isSafeTarget =
          (isSameSite(cleanNext) && !isRedirectGateway(cleanNext)) ||
          isWhitelistedUrl(cleanNext);
        if (isSafeTarget) {
          promoted = true;
          try {
            promotionOpts.origOpen.call(
              promotionOpts.ownerWin,
              cleanNext,
              promotionOpts.target || "_blank",
              promotionOpts.features
            );
          } catch {}
          return true;
        }
        return false;
      };

      const inspectWrittenOAuth = (htmlChunk) => {
        if (!promotionOpts || promoted || typeof htmlChunk !== "string") return;
        const match = htmlChunk.match(/(?:<form[^>]+action|location(?:\.href)?)\s*=\s*["']?(https?:\/\/[^"'\s>]+)/i);
        if (match && match[1]) {
          tryPromoteBlank(match[1]);
        }
      };

      if (!promotionOpts) {
        lastAttempt = Date.now();
        reportBlock();
      }

      const locState = { href: url || "about:blank" };
      const handleLocationNav = (v) => {
        const nextVal = sanitizeRawUrl(v);
        locState.href = nextVal;
        if (!tryPromoteBlank(nextVal) && promotionOpts) {
          lastAttempt = Date.now();
          reportBlock();
        }
      };

      const fakeLoc = new Proxy(
        {
          get href() { return locState.href; },
          set href(v) { handleLocationNav(v); },
          assign(v) { handleLocationNav(v); },
          replace(v) { handleLocationNav(v); },
          reload() {},
          toString() { return locState.href; }
        },
        {
          set(t, p, v) {
            if (p === "href") handleLocationNav(v);
            return true;
          }
        }
      );
      const dummyEl = () => ({
        style: {},
        setAttribute() {},
        getAttribute() { return null; },
        appendChild(c) { return c; },
        insertBefore(c) { return c; },
        removeChild(c) { return c; },
        click() {},
        focus() {}
      });
      const fakeDoc = {
        body: dummyEl(),
        documentElement: dummyEl(),
        head: dummyEl(),
        location: fakeLoc,
        defaultView: null,
        readyState: "complete",
        write(s) { inspectWrittenOAuth(s); },
        writeln(s) { inspectWrittenOAuth(s); },
        close() {},
        open() { return fakeDoc; },
        createElement: dummyEl,
        createDocumentFragment: dummyEl,
        getElementById() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {},
        removeEventListener() {}
      };
      const baseStub = {
        [Symbol.toStringTag]: "Window",
        closed: false,
        opener: window,
        top: window.top,
        parent: window,
        length: 0,
        location: fakeLoc,
        document: fakeDoc,
        history: { back() {}, forward() {}, go() {}, pushState() {}, replaceState() {} },
        navigator: window.navigator,
        screen: window.screen,
        focus() {},
        blur() {},
        close() { this.closed = true; },
        postMessage() {},
        addEventListener() {},
        removeEventListener() {},
        toString() { return "[object Window]"; },
        valueOf() { return winProxy; },
        [Symbol.toPrimitive](hint) {
          return hint === "number" ? NaN : "[object Window]";
        }
      };
      const winProxy = new Proxy(baseStub, {
        get(target, prop) {
          if (prop === "window" || prop === "self" || prop === "frames" || prop === "globalThis") {
            return winProxy;
          }
          if (prop in target) return target[prop];
          return () => {};
        },
        set(target, prop, value) {
          if (prop === "location") {
            handleLocationNav(value);
            return true;
          }
          target[prop] = value;
          return true;
        }
      });
      fakeDoc.defaultView = winProxy;
      return winProxy;
    }

    const markFormTyping = (e) => {
      if (e.isTrusted) lastFormTypingTime = Date.now();
    };
    window.addEventListener("input", markFormTyping, true);
    window.addEventListener("change", markFormTyping, true);

    window.addEventListener("beforeunload", (e) => {
      if (bypassed) return;
      const now = Date.now();
      const hasUnsavedTyping = now - lastFormTypingTime < 30000;
      const isUnauthorized = allowMode === "NONE" || now > allowedUntil;
      const recentBlockedAttempt = now - lastAttempt < 2500 && isUnauthorized;
      if ((hasUnsavedTyping && isUnauthorized) || recentBlockedAttempt) {
        e.preventDefault();
        e.returnValue = "";
      }
    });

    const captureTouchOrigin = (e) => {
      const { anchor } = findControls(e);
      touchOriginAnchor = anchor;
      touchOriginWasPseudo = anchor ? isPseudo(anchor) : false;
      touchOriginTime = Date.now();
      if (anchor && !touchOriginWasPseudo) {
        lockedA = anchor;
        lockedHref = getAnchorHref(anchor);
      } else {
        resetAuth();
      }
    };

    window.addEventListener(
      "touchstart",
      (e) => {
        if (!e.isTrusted || bypassed) return;
        touchMoved = false;
        if (e.touches && e.touches[0]) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
        if (neutralizeTrapInEvent(e)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          resetAuth();
          return;
        }
        captureTouchOrigin(e);
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
      if (neutralizeTrapInEvent(e)) {
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
        captureTouchOrigin(e);
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
          captureTouchOrigin(e);
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

    function handleGlobalClick(e) {
      if (bypassed) return;
      if (e.isTrusted) {
        lastGestureTime = Date.now();
        if (neutralizeTrapInEvent(e)) {
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
        if (!sameClean || newTab) {
          e.preventDefault();
          e.stopImmediatePropagation();
          reportBlock();
        }
        return;
      }

      if (isInjectedExternalAnchor(anchor, sameClean)) {
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

    function verifyPostBubbleClick(e) {
      if (bypassed || e.defaultPrevented) return;
      const { anchor } = findControls(e);
      if (!anchor || isPseudo(anchor)) return;

      let href = getAnchorHref(anchor);
      if (lockedA === anchor && lockedHref && href !== lockedHref) {
        try { anchor.setAttribute("href", lockedHref); } catch {}
        href = lockedHref;
      }

      const gateway = isRedirectGateway(href);
      const sameClean = isSameSite(href) && !gateway;
      const newTab = opensNew(anchor);

      if (!e.isTrusted && (!sameClean || newTab)) {
        e.preventDefault();
        reportBlock();
        return;
      }

      if (sameClean) {
        if (newTab && allowMode !== "NEW_TAB") {
          try { anchor.setAttribute("target", "_self"); } catch {}
        }
        return;
      }

      if (!isAllowed(href, newTab)) {
        e.preventDefault();
        reportBlock();
      }
    }

    function handleGlobalSubmit(e) {
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
        reportLegitExternalNav(actionUrl, true);
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

    const nativeFnLabels = new WeakMap();
    const maskAsNative = (fn, name) => {
      try {
        nativeFnLabels.set(fn, `function ${name}() { [native code] }`);
      } catch {}
      return fn;
    };

    try {
      const origFnToString = Function.prototype.toString;
      const maskedToString = function () {
        if (nativeFnLabels.has(this)) {
          return nativeFnLabels.get(this);
        }
        return origFnToString.apply(this, arguments);
      };
      maskAsNative(maskedToString, "toString");
      Object.defineProperty(Function.prototype, "toString", {
        configurable: true,
        writable: true,
        value: maskedToString
      });
    } catch {}

    try {
      const origDispatch = EventTarget.prototype.dispatchEvent;
      EventTarget.prototype.dispatchEvent = maskAsNative(function (ev) {
        if (!bypassed && ev && typeof ev.type === "string") {
          const evType = ev.type.toLowerCase();
          if ((evType === "click" || evType === "auxclick") && this && this.nodeType === 1) {
            if (this.localName === "a" || this.localName === "area") {
              const hrefStr = getAnchorHref(this);
              if (hrefStr && !isPseudo(this) && !isAllowed(hrefStr, opensNew(this))) {
                lastAttempt = Date.now();
                reportBlock();
                return false;
              }
            }
          } else if (evType === "submit" && this && this.tagName === "FORM") {
            const actionUrl = this.getAttribute("action") || window.location.href;
            const safeDest = (isSameSite(actionUrl) && !isRedirectGateway(actionUrl)) || isWhitelistedUrl(actionUrl);
            if (!safeDest && !isAllowed(actionUrl, opensNew(this))) {
              lastAttempt = Date.now();
              reportBlock();
              return false;
            }
          }
        }
        return origDispatch.apply(this, arguments);
      }, "dispatchEvent");
    } catch {}

    function patchWindowEnvironment(w) {
      if (!w || w.__gxEnvLocked) return;
      try {
        Object.defineProperty(w, "__gxEnvLocked", { value: true });
      } catch {
        return;
      }

      try {
        if (w.URL && typeof w.URL.createObjectURL === "function") {
          const origCreateObjUrl = w.URL.createObjectURL;
          w.URL.createObjectURL = maskAsNative(function (obj) {
            const res = origCreateObjUrl.apply(this, arguments);
            try {
              const t = (obj && obj.type ? String(obj.type) : "").toLowerCase();
              if (t.includes("html") || t.includes("xml")) {
                blockedBlobUrls.add(res);
              }
            } catch {}
            return res;
          }, "createObjectURL");
        }
      } catch {}

      try {
        const origOpen = w.open;
        const lockedOpen = maskAsNative(function (url, target, features) {
          const cleanTarget = String(target || "").trim();
          const isNew =
            (!cleanTarget || (cleanTarget !== "_self" && cleanTarget !== "_parent" && cleanTarget !== "_top")) &&
            !isTargetExistingFrame(cleanTarget);
          if (isAllowed(url, isNew, w)) {
            return origOpen.apply(this, arguments);
          }
          const trimmed = sanitizeRawUrl(url);
          const isBlankBoot = !trimmed || trimmed === "about:blank";
          const canPromote =
            isBlankBoot &&
            hasActiveUserGesture() &&
            (allowMode === "BUTTON" || allowMode === "FORM_SUBMIT");
          return fakeWin(
            url,
            canPromote ? { origOpen, ownerWin: this || w, target, features } : null
          );
        }, "open");
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
        const patchLocTarget = (targetObj) => {
          if (!targetObj) return;
          if (typeof targetObj.assign === "function" && !targetObj.__gxAssignLocked) {
            const origAssign = targetObj.assign;
            const lockedAssign = maskAsNative(function (url) {
              if (!bypassed && !isAllowed(String(url), false, w)) {
                lastAttempt = Date.now();
                reportBlock();
                return;
              }
              return origAssign.apply(this, arguments);
            }, "assign");
            try {
              Object.defineProperty(targetObj, "assign", { configurable: false, writable: false, value: lockedAssign });
            } catch {
              try { targetObj.assign = lockedAssign; } catch {}
            }
            try { Object.defineProperty(targetObj, "__gxAssignLocked", { value: true }); } catch {}
          }
          if (typeof targetObj.replace === "function" && !targetObj.__gxReplaceLocked) {
            const origReplace = targetObj.replace;
            const lockedReplace = maskAsNative(function (url) {
              if (!bypassed && !isAllowed(String(url), false, w)) {
                lastAttempt = Date.now();
                reportBlock();
                return;
              }
              return origReplace.apply(this, arguments);
            }, "replace");
            try {
              Object.defineProperty(targetObj, "replace", { configurable: false, writable: false, value: lockedReplace });
            } catch {
              try { targetObj.replace = lockedReplace; } catch {}
            }
            try { Object.defineProperty(targetObj, "__gxReplaceLocked", { value: true }); } catch {}
          }
        };
        patchLocTarget(w.Location && w.Location.prototype);
        patchLocTarget(w.location);
      } catch {}

      try {
        const docProto = w.Document && w.Document.prototype;
        if (docProto && docProto.open && !docProto.__gxDocOpenLocked) {
          const origDocOpen = docProto.open;
          docProto.open = maskAsNative(function () {
            const res = origDocOpen.apply(this, arguments);
            try {
              if (this && this.defaultView) {
                patchWindowEnvironment(this.defaultView);
              }
            } catch {}
            return res;
          }, "open");
          Object.defineProperty(docProto, "__gxDocOpenLocked", { value: true });
        }
      } catch {}

      try {
        const guardElementClick = (el, origClickFn, args) => {
          if (!bypassed && el && el.nodeType === 1) {
            if (el.localName === "a" || el.localName === "area") {
              const hrefStr = getAnchorHref(el);
              const isBlobOrData = hrefStr.toLowerCase().startsWith("blob:") || hrefStr.toLowerCase().startsWith("data:");
              const dl =
                el.hasAttribute("download") &&
                (isBlobOrData || (allowMode !== "NONE" && Date.now() <= allowedUntil));
              if (!dl && !isAllowed(hrefStr, opensNew(el), w)) {
                lastAttempt = Date.now();
                reportBlock();
                return;
              }
            } else if (el.localName === "button" || el.localName === "input") {
              const form = el.form || (el.closest && el.closest("form"));
              const btnType = (el.getAttribute("type") || (el.localName === "button" ? "submit" : "")).toLowerCase();
              if (form && (btnType === "submit" || btnType === "image")) {
                const actionUrl = el.getAttribute("formaction") || form.getAttribute("action") || window.location.href;
                const safeDest = (isSameSite(actionUrl) && !isRedirectGateway(actionUrl)) || isWhitelistedUrl(actionUrl);
                if (!safeDest && !isAllowed(actionUrl, opensNew(el) || opensNew(form), w)) {
                  lastAttempt = Date.now();
                  reportBlock();
                  return;
                }
              }
            }
          }
          return origClickFn.apply(el, args);
        };

        const htmlElProto = w.HTMLElement && w.HTMLElement.prototype;
        if (htmlElProto && htmlElProto.click) {
          const origHtmlClick = htmlElProto.click;
          Object.defineProperty(htmlElProto, "click", {
            configurable: true,
            writable: true,
            value: maskAsNative(function () {
              return guardElementClick(this, origHtmlClick, arguments);
            }, "click")
          });
        }

        const aProto = w.HTMLAnchorElement && w.HTMLAnchorElement.prototype;
        if (aProto && aProto.click && (!htmlElProto || aProto.click !== htmlElProto.click)) {
          const origAClick = aProto.click;
          Object.defineProperty(aProto, "click", {
            configurable: true,
            writable: true,
            value: maskAsNative(function () {
              return guardElementClick(this, origAClick, arguments);
            }, "click")
          });
        }

        const areaProto = w.HTMLAreaElement && w.HTMLAreaElement.prototype;
        if (areaProto && areaProto.click && (!htmlElProto || areaProto.click !== htmlElProto.click)) {
          const origAreaClick = areaProto.click;
          Object.defineProperty(areaProto, "click", {
            configurable: true,
            writable: true,
            value: maskAsNative(function () {
              return guardElementClick(this, origAreaClick, arguments);
            }, "click")
          });
        }

        const svgAProto = w.SVGAElement && w.SVGAElement.prototype;
        if (svgAProto && svgAProto.click && (!htmlElProto || svgAProto.click !== htmlElProto.click)) {
          const origSvgAClick = svgAProto.click;
          Object.defineProperty(svgAProto, "click", {
            configurable: true,
            writable: true,
            value: maskAsNative(function () {
              return guardElementClick(this, origSvgAClick, arguments);
            }, "click")
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
            value: maskAsNative(function () {
              return guardFormCall(this, origFSubmit, arguments);
            }, "submit")
          });
          if (typeof fProto.requestSubmit === "function") {
            const origFReqSubmit = fProto.requestSubmit;
            Object.defineProperty(fProto, "requestSubmit", {
              configurable: true,
              writable: true,
              value: maskAsNative(function () {
                return guardFormCall(this, origFReqSubmit, arguments);
              }, "requestSubmit")
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
            if (!isAllowed(dest, false, w) && e.cancelable) {
              e.preventDefault();
              reportBlock();
            }
          });
        }
      } catch {}

      try {
        w.addEventListener("click", (e) => {
          if (e.isTrusted) trustedGestureDepth += 1;
          try {
            handleGlobalClick(e);
          } finally {
            if (e.isTrusted) {
              setTimeout(() => { trustedGestureDepth = Math.max(0, trustedGestureDepth - 1); }, 0);
            }
          }
        }, true);
        w.addEventListener("click", verifyPostBubbleClick, false);
        w.addEventListener("auxclick", handleGlobalClick, true);
        w.addEventListener("submit", handleGlobalSubmit, true);
      } catch {}
    }

    try {
      Object.defineProperty(window, "__gxPatchWin", {
        value: patchWindowEnvironment,
        configurable: false,
        writable: false
      });
    } catch {}

    patchWindowEnvironment(window);

    function sweepWindowFrames() {
      try {
        for (let i = 0; i < window.frames.length; i++) {
          try { patchWindowEnvironment(window.frames[i]); } catch {}
        }
      } catch {}
    }

    function sanitizeSandboxAttr(el) {
      if (!el || !el.hasAttribute || !el.hasAttribute("sandbox")) return;
      const rawSrc = sanitizeRawUrl(el.getAttribute("src") || "");
      if (rawSrc && (isSameSite(rawSrc) || isWhitelistedUrl(rawSrc))) return;
      const sb = el.getAttribute("sandbox") || "";
      if (/\ballow-(?:top-navigation(?:-by-user-activation)?|popups-to-escape-sandbox)\b/i.test(sb)) {
        const cleaned = sb
          .replace(/\ballow-(?:top-navigation(?:-by-user-activation)?|popups-to-escape-sandbox)\b/gi, "")
          .replace(/\s+/g, " ")
          .trim();
        try { el.setAttribute("sandbox", cleaned); } catch {}
      }
    }

    function patchFrameTree(node) {
      if (!node) return;
      if (node.nodeType === 11 && node.childNodes) {
        for (let i = 0; i < node.childNodes.length; i++) {
          patchFrameTree(node.childNodes[i]);
        }
        return;
      }
      if (node.nodeType !== 1) return;
      if (node.tagName === "IFRAME" || node.tagName === "FRAME" || node.tagName === "OBJECT") {
        if (node.tagName === "IFRAME") sanitizeSandboxAttr(node);
        try { if (node.contentWindow) patchWindowEnvironment(node.contentWindow); } catch {}
      }
      if (node.querySelectorAll) {
        node.querySelectorAll("iframe, frame, object").forEach((f) => {
          if (f.tagName === "IFRAME") sanitizeSandboxAttr(f);
          try { if (f.contentWindow) patchWindowEnvironment(f.contentWindow); } catch {}
        });
      }
    }

    const isDangerousIframeSrc = (rawUrl) => {
      if (bypassed || hasActiveUserGesture()) return false;
      const cleanOrig = sanitizeRawUrl(rawUrl);
      const lower = cleanOrig.toLowerCase();
      if (lower.startsWith("javascript:")) return true;
      if (isExternalAppScheme(cleanOrig)) return true;
      if (lower.startsWith("blob:") && blockedBlobUrls.has(cleanOrig)) return true;
      if (lower.startsWith("data:text/html") || lower.startsWith("data:application/xhtml")) {
        const b64Idx = lower.indexOf(";base64,");
        if (b64Idx !== -1) {
          try {
            const decodedHtml = atob(cleanOrig.slice(b64Idx + 8, b64Idx + 8200));
            return /<script|location\s*[.=]|window\.open|http-equiv\s*=\s*["']?refresh/i.test(decodedHtml);
          } catch {
            return true;
          }
        }
        return /<script|location|window\.open|http-equiv/i.test(lower);
      }
      return false;
    };

    const injectBootIntoSrcdoc = (html) => {
      if (!bypassed && typeof html === "string" && /<script\b/i.test(html)) {
        const boot = "<script>try{parent.__gxPatchWin&&parent.__gxPatchWin(window)}catch(e){}</script>";
        return /<head\b[^>]*>/i.test(html)
          ? html.replace(/<head\b[^>]*>/i, (m) => m + boot)
          : boot + html;
      }
      return html;
    };

    try {
      const srcDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src");
      if (srcDesc && srcDesc.set) {
        Object.defineProperty(HTMLIFrameElement.prototype, "src", {
          configurable: true,
          get: srcDesc.get,
          set: function (val) {
            if (isDangerousIframeSrc(val)) {
              reportBlock();
              return;
            }
            srcDesc.set.call(this, val);
            sanitizeSandboxAttr(this);
            try { if (this.contentWindow) patchWindowEnvironment(this.contentWindow); } catch {}
          }
        });
      }
    } catch {}

    try {
      const sdDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "srcdoc");
      if (sdDesc && sdDesc.set) {
        Object.defineProperty(HTMLIFrameElement.prototype, "srcdoc", {
          configurable: true,
          get: sdDesc.get,
          set: function (html) {
            sdDesc.set.call(this, injectBootIntoSrcdoc(html));
            sanitizeSandboxAttr(this);
            try { if (this.contentWindow) patchWindowEnvironment(this.contentWindow); } catch {}
          }
        });
      }
    } catch {}

    try {
      const origSetAttr = Element.prototype.setAttribute;
      Element.prototype.setAttribute = maskAsNative(function (name, value) {
        const attrName = String(name).trim().toLowerCase();
        if (!bypassed && this && this.tagName === "IFRAME") {
          if (attrName === "srcdoc") {
            const res = origSetAttr.call(this, name, injectBootIntoSrcdoc(String(value)));
            sanitizeSandboxAttr(this);
            try { if (this.contentWindow) patchWindowEnvironment(this.contentWindow); } catch {}
            return res;
          }
          if (attrName === "src" && isDangerousIframeSrc(value)) {
            reportBlock();
            return;
          }
          if (attrName === "sandbox") {
            const res = origSetAttr.apply(this, arguments);
            sanitizeSandboxAttr(this);
            return res;
          }
        }
        const res = origSetAttr.apply(this, arguments);
        if (!bypassed && this && this.tagName === "OBJECT" && attrName === "data") {
          try { if (this.contentWindow) patchWindowEnvironment(this.contentWindow); } catch {}
        }
        return res;
      }, "setAttribute");
    } catch {}

    window.addEventListener(
      "load",
      (e) => {
        const t = e.target;
        if (t && (t.tagName === "IFRAME" || t.tagName === "FRAME" || t.tagName === "OBJECT")) {
          if (t.tagName === "IFRAME") sanitizeSandboxAttr(t);
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
      [Element.prototype, "after"],
      [Element.prototype, "before"],
      [Element.prototype, "replaceWith"],
      [Element.prototype, "replaceChildren"],
      [Element.prototype, "insertAdjacentElement"]
    ].forEach(([proto, m]) => {
      try {
        const orig = proto[m];
        if (typeof orig === "function") {
          proto[m] = function (...args) {
            for (const a of args) {
              if (a && a.nodeType === 11) patchFrameTree(a);
            }
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
      const ihDesc = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
      if (ihDesc && ihDesc.set) {
        Object.defineProperty(Element.prototype, "innerHTML", {
          configurable: true,
          get: ihDesc.get,
          set: function (html) {
            ihDesc.set.call(this, html);
            if (typeof html === "string" && html.indexOf("<") !== -1 && /<(?:i?frame|object)\b/i.test(html)) {
              patchFrameTree(this);
            }
          }
        });
      }
    } catch {}

    try {
      const ohDesc = Object.getOwnPropertyDescriptor(Element.prototype, "outerHTML");
      if (ohDesc && ohDesc.set) {
        Object.defineProperty(Element.prototype, "outerHTML", {
          configurable: true,
          get: ohDesc.get,
          set: function (html) {
            const parent = this.parentElement;
            ohDesc.set.call(this, html);
            if (parent && typeof html === "string" && /<(?:i?frame|object)\b/i.test(html)) {
              patchFrameTree(parent);
            }
          }
        });
      }
    } catch {}

    try {
      const origInsertAdjHTML = Element.prototype.insertAdjacentHTML;
      if (typeof origInsertAdjHTML === "function") {
        Element.prototype.insertAdjacentHTML = function (pos, html) {
          const res = origInsertAdjHTML.apply(this, arguments);
          if (typeof html === "string" && /<(?:i?frame|object)\b/i.test(html)) {
            patchFrameTree(this.parentElement || this);
          }
          return res;
        };
      }
    } catch {}

    try {
      const origInsertNode = Range.prototype.insertNode;
      if (typeof origInsertNode === "function") {
        Range.prototype.insertNode = function (node) {
          if (node && node.nodeType === 11) patchFrameTree(node);
          const res = origInsertNode.apply(this, arguments);
          if (node && node.nodeType === 1) patchFrameTree(node);
          return res;
        };
      }
    } catch {}

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
      const objCwDesc = Object.getOwnPropertyDescriptor(HTMLObjectElement.prototype, "contentWindow");
      if (objCwDesc && objCwDesc.get) {
        Object.defineProperty(HTMLObjectElement.prototype, "contentWindow", {
          configurable: true,
          get: function () {
            const cw = objCwDesc.get.call(this);
            try { if (cw) patchWindowEnvironment(cw); } catch {}
            return cw;
          }
        });
      }
    } catch {}

    try {
      let historySpamCount = 0;
      let historySpamWindowStart = 0;
      const guardHistoryMutate = (origFn, name) =>
        maskAsNative(function (state, title, url) {
          if (!bypassed) {
            const noUserGesture = Date.now() - lastGestureTime > 1500;
            if (noUserGesture) {
              let sameOrigin = true;
              if (url) {
                try {
                  const parsed = new URL(String(url), window.location.href);
                  sameOrigin = parsed.origin === window.location.origin;
                } catch {}
              }
              if (sameOrigin) {
                const now = Date.now();
                if (now - historySpamWindowStart > 1500) {
                  historySpamWindowStart = now;
                  historySpamCount = 1;
                } else {
                  historySpamCount += 1;
                }
                if (historySpamCount >= 3) {
                  reportBlock();
                  return;
                }
              }
            }
          }
          return origFn.apply(this, arguments);
        }, name);

      History.prototype.pushState = guardHistoryMutate(History.prototype.pushState, "pushState");
      if (typeof History.prototype.replaceState === "function") {
        History.prototype.replaceState = guardHistoryMutate(History.prototype.replaceState, "replaceState");
      }
    } catch {}

    const sanitizeWrittenHtml = (args) => {
      if (bypassed) return { out: args, hasFrames: false };
      let hasFrames = false;
      const out = Array.from(args);
      for (let i = 0; i < out.length; i++) {
        if (typeof out[i] === "string") {
          if (/<(?:i?frame|object)\b/i.test(out[i])) hasFrames = true;
          out[i] = out[i]
            .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?\s*refresh\s*["']?[^>]*>/gi, "")
            .replace(/<base\b([^>]*?)\btarget\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)([^>]*)>/gi, "<base$1$2>");
        }
      }
      return { out, hasFrames };
    };

    try {
      const origWrite = Document.prototype.write;
      Document.prototype.write = maskAsNative(function () {
        if (!bypassed && this === document && this.readyState === "complete") return;
        const { out, hasFrames } = sanitizeWrittenHtml(arguments);
        const res = origWrite.apply(this, out);
        if (hasFrames) sweepWindowFrames();
        return res;
      }, "write");
    } catch {}

    try {
      const origWriteln = Document.prototype.writeln;
      if (typeof origWriteln === "function") {
        Document.prototype.writeln = maskAsNative(function () {
          if (!bypassed && this === document && this.readyState === "complete") return;
          const { out, hasFrames } = sanitizeWrittenHtml(arguments);
          const res = origWriteln.apply(this, out);
          if (hasFrames) sweepWindowFrames();
          return res;
        }, "writeln");
      }
    } catch {}

    // Chỉ xóa target="_blank" trên thẻ <base>, giữ nguyên <base href="..."> để không làm hỏng đường dẫn ảnh CDN
    const sanitizeBaseTag = (b) => {
      const t = (b.getAttribute("target") || "").trim();
      if (t && t !== "_self" && t !== "_parent" && t !== "_top") {
        b.removeAttribute("target");
      }
    };

    const sanitizeSingleElement = (node) => {
      if (!node || node.nodeType !== 1) return;
      const tag = node.tagName;
      if (tag === "META" && /^refresh$/i.test((node.getAttribute("http-equiv") || "").trim())) {
        node.remove();
      } else if (tag === "BASE") {
        sanitizeBaseTag(node);
      } else if (tag === "IFRAME" || tag === "FRAME" || tag === "OBJECT") {
        if (tag === "IFRAME") sanitizeSandboxAttr(node);
        try { if (node.contentWindow) patchWindowEnvironment(node.contentWindow); } catch {}
      }
    };

    const sanitizeTree = (node) => {
      if (!node || node.nodeType !== 1) return;
      sanitizeSingleElement(node);
      if (node.firstElementChild) {
        node.querySelectorAll("meta[http-equiv]").forEach((m) => {
          if (/^refresh$/i.test((m.getAttribute("http-equiv") || "").trim())) m.remove();
        });
        node.querySelectorAll("base[target]").forEach(sanitizeBaseTag);
        node.querySelectorAll("iframe, frame, object").forEach((f) => {
          if (f.tagName === "IFRAME") sanitizeSandboxAttr(f);
          try { if (f.contentWindow) patchWindowEnvironment(f.contentWindow); } catch {}
        });
      }
    };

    const sweepExistingNodes = () => {
      if (!bypassed && document.documentElement) {
        sanitizeTree(document.documentElement);
        sweepWindowFrames();
      }
    };
    sweepExistingNodes();
    window.addEventListener("DOMContentLoaded", sweepExistingNodes, { once: true });

    const observerConfig = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["http-equiv", "target", "srcdoc", "sandbox"]
    };

    const obs = new MutationObserver((mutations) => {
      if (bypassed) return;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type === "childList") {
          for (let j = 0; j < m.addedNodes.length; j++) {
            sanitizeTree(m.addedNodes[j]);
          }
        } else if (m.type === "attributes") {
          sanitizeSingleElement(m.target);
        }
      }
    });
    obs.observe(document, observerConfig);

    try {
      const origAttachShadow = Element.prototype.attachShadow;
      if (typeof origAttachShadow === "function") {
        Element.prototype.attachShadow = function () {
          const sr = origAttachShadow.apply(this, arguments);
          try {
            if (!bypassed && sr) obs.observe(sr, observerConfig);
          } catch {}
          return sr;
        };
      }
    } catch {}
  }

  let injectAttempts = 0;
  let lastAttemptedNonce = undefined;
  function injectMainWorld() {
    if (mainAcked || injectAttempts >= 6) return;
    try {
      const targetParent = document.head || document.documentElement;
      if (!targetParent) return;
      const nonceEl = document.querySelector("script[nonce]");
      const currentNonce = nonceEl ? (nonceEl.nonce || nonceEl.getAttribute("nonce") || "") : "";
      if (lastAttemptedNonce === currentNonce) return;
      lastAttemptedNonce = currentNonce;
      injectAttempts += 1;

      const scriptEl = document.createElement("script");
      if (currentNonce) scriptEl.setAttribute("nonce", currentNonce);
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
