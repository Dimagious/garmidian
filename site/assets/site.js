/* Shared by every page: theme, YAML colouring, copy buttons, folders, drawer,
   quick switcher, and on the home page the open note following the scroll.
   No dependencies, no requests. */
(function () {
  var root = document.documentElement;
  root.classList.remove("no-js");

  /* ---------- theme: system, light, dark (same storage key as the home page) ---------- */
  var order = ["system", "light", "dark"];
  var icons = { system: "#i-auto", light: "#i-sun", dark: "#i-moon" };
  function readTheme() { try { return localStorage.getItem("garmy-theme") || "system"; } catch (e) { return "system"; } }
  function applyTheme(mode) {
    if (mode === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", mode);
    var media = mode === "dark" ? "all" : mode === "light" ? "not all" : "(prefers-color-scheme: dark)";
    document.querySelectorAll("source[data-dark]").forEach(function (s) { s.media = media; });
    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      b.querySelector("use").setAttribute("href", icons[mode]);
      b.title = "Theme: " + mode + " (click to change)";
    });
  }
  var theme = readTheme();
  applyTheme(theme);
  document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
    b.addEventListener("click", function () {
      theme = order[(order.indexOf(theme) + 1) % order.length];
      try { localStorage.setItem("garmy-theme", theme); } catch (e) { /* storage blocked: the choice lasts for this visit */ }
      applyTheme(theme);
    });
  });

  /* ---------- YAML colouring: fenced blocks and frontmatter ---------- */
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function scalar(v) {
    var t = v.trim();
    if (!t) return esc(v);
    var lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0];
    var cls = /^-?\d[\d_.]*$/.test(t) || /^(true|false)$/.test(t) ? "t-num" : "t-str";
    return lead + '<span class="' + cls + '">' + esc(t) + "</span>" + trail;
  }
  function inline(body) {
    var out = "", buf = "", inQ = false;
    function flush(isKey) {
      if (!buf) return;
      out += isKey ? '<span class="t-key">' + esc(buf) + "</span>" : scalar(buf);
      buf = "";
    }
    for (var i = 0; i < body.length; i++) {
      var c = body[i];
      if (c === '"' || c === "'") { inQ = !inQ; buf += c; continue; }
      if (inQ) { buf += c; continue; }
      if (c === ":" && (body[i + 1] === " " || i === body.length - 1)) { flush(true); out += '<span class="t-p">:</span>'; continue; }
      if ("{},[]".indexOf(c) >= 0) { flush(false); out += '<span class="t-p">' + c + "</span>"; continue; }
      buf += c;
    }
    flush(false);
    return out;
  }
  function line(l) {
    var m;
    if ((m = l.match(/^```\s?([\w-]*)$/))) return '<span class="t-fence">```</span>' + (m[1] ? '<span class="t-lang">' + m[1] + "</span>" : "");
    if (l === "---") return '<span class="t-fence">---</span>';
    if ((m = l.match(/^(#{1,6}\s.*)$/))) return '<span class="t-p">' + esc(m[1]) + "</span>";
    if ((m = l.match(/^(\s*-\s)(.*)$/))) return '<span class="t-p">' + m[1] + "</span>" + inline(m[2]);
    if ((m = l.match(/^(\s*)([\w.-]+):(\s?)(.*)$/))) return m[1] + '<span class="t-key">' + m[2] + '</span><span class="t-p">:</span>' + m[3] + inline(m[4]);
    return esc(l);
  }
  document.querySelectorAll("code.yaml-fenced").forEach(function (el) {
    var raw = el.textContent;
    el.dataset.raw = raw;
    el.innerHTML = raw.split("\n").map(line).join("\n");
  });

  /* ---------- copy buttons ---------- */
  document.querySelectorAll("[data-code] .copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var code = btn.closest("[data-code]").querySelector("code");
      var text = code.dataset.raw || code.textContent;
      function done(msg) { btn.textContent = msg; setTimeout(function () { btn.textContent = "Copy"; }, 1600); }
      if (!navigator.clipboard) { done("Select and copy"); return; }
      navigator.clipboard.writeText(text).then(function () { done("Copied"); }, function () { done("Copy blocked"); });
    });
  });

  /* ---------- Tracker / dataviewjs tabs ---------- */
  document.querySelectorAll("[data-tabs]").forEach(function (box) {
    var tabs = box.querySelectorAll('[role="tab"]');
    function pick(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { pick(t); });
      t.addEventListener("keydown", function (ev) {
        var d = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
        if (d) { var n = tabs[(i + d + tabs.length) % tabs.length]; pick(n); n.focus(); ev.preventDefault(); }
      });
    });
    pick(tabs[0]);
  });

  /* ---------- folders ---------- */
  document.querySelectorAll("[data-folder]").forEach(function (f) {
    f.addEventListener("click", function () { f.parentElement.classList.toggle("closed"); });
  });

  /* ---------- mobile drawer ---------- */
  var menuBtn = document.getElementById("menuBtn");
  function drawer(open) {
    document.body.classList.toggle("drawer", open);
    if (menuBtn) menuBtn.setAttribute("aria-expanded", String(open));
  }
  if (menuBtn) menuBtn.addEventListener("click", function () { drawer(!document.body.classList.contains("drawer")); });
  document.querySelectorAll("#tree a, .vault-head a").forEach(function (a) { a.addEventListener("click", function () { drawer(false); }); });
  var scrim = document.getElementById("drawerScrim");
  if (scrim) scrim.addEventListener("click", function () { drawer(false); });

  /* ---------- the open note follows the scroll (home page) ---------- */
  var sections0 = Array.prototype.slice.call(document.querySelectorAll("section.file[id]"));
  if (sections0.length) {
    var tabTitle = document.getElementById("tabTitle"), viewPath = document.getElementById("viewPath");
    var treeLinks = {};
    document.querySelectorAll("#tree a[href]").forEach(function (a) {
      if (a.pathname === location.pathname && a.hash) treeLinks[a.hash.slice(1)] = a;
    });
    var current = null;
    var setActive = function (sec) {
      if (!sec || sec === current) return;
      current = sec;
      Object.keys(treeLinks).forEach(function (k) { treeLinks[k].classList.toggle("active", k === sec.id); });
      if (tabTitle) tabTitle.textContent = sec.dataset.title;
      if (viewPath) viewPath.textContent = sec.dataset.path;
    };
    var onScroll = function () {
      var pick = sections0[0];
      sections0.forEach(function (s) { if (s.getBoundingClientRect().top <= 120) pick = s; });
      setActive(pick);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- quick switcher: headings on this page, then every page in the tree ---------- */
  var pal = document.getElementById("palette"), palScrim = document.getElementById("paletteScrim");
  if (!pal) return;
  var input = document.getElementById("paletteInput"), list = document.getElementById("paletteList");
  var entries = [];
  var sections = Array.prototype.slice.call(document.querySelectorAll("section.file[id]"));
  if (sections.length) {
    sections.forEach(function (s) { entries.push({ href: "#" + s.id, title: s.dataset.title, where: "this page" }); });
  } else {
    document.querySelectorAll("main h2[id]").forEach(function (h) {
      entries.push({ href: "#" + h.id, title: h.dataset.short || h.textContent.replace(/^\d+\s*/, "").trim(), where: "on this page" });
    });
  }
  document.querySelectorAll("#tree a[href]").forEach(function (a) {
    if (a.classList.contains("active")) return;
    if (sections.length && a.pathname === location.pathname && a.hash) return;
    entries.push({ href: a.getAttribute("href"), title: a.textContent.replace(/\.md$/, "").trim(), where: a.dataset.where || "" });
  });
  var sel = 0, shown = [];
  function render() {
    var q = input.value.trim().toLowerCase();
    shown = entries.filter(function (e) { return !q || (e.title + " " + e.where).toLowerCase().indexOf(q) >= 0; });
    sel = Math.min(sel, Math.max(shown.length - 1, 0));
    list.innerHTML = shown.length ? shown.map(function (e, i) {
      return '<li><a href="' + esc(e.href) + '" class="' + (i === sel ? "sel" : "") + '">' + esc(e.title) + (e.where ? "<small>" + esc(e.where) + "</small>" : "") + "</a></li>";
    }).join("") : '<li style="padding:8px 10px;color:var(--faint);font-size:14px">No note by that name.</li>';
  }
  function openPal() { pal.classList.add("open"); palScrim.classList.add("open"); input.value = ""; sel = 0; render(); input.focus(); drawer(false); }
  function closePal() { pal.classList.remove("open"); palScrim.classList.remove("open"); }
  document.querySelectorAll("[data-open-palette]").forEach(function (b) { b.addEventListener("click", openPal); });
  palScrim.addEventListener("click", closePal);
  input.addEventListener("input", function () { sel = 0; render(); });
  list.addEventListener("click", function () { closePal(); });
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "ArrowDown") { sel = Math.min(sel + 1, shown.length - 1); render(); ev.preventDefault(); }
    else if (ev.key === "ArrowUp") { sel = Math.max(sel - 1, 0); render(); ev.preventDefault(); }
    else if (ev.key === "Enter" && shown[sel]) { closePal(); location.href = shown[sel].href; }
  });
  document.addEventListener("keydown", function (ev) {
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "k") { ev.preventDefault(); pal.classList.contains("open") ? closePal() : openPal(); }
    else if (ev.key === "Escape") { closePal(); drawer(false); }
  });
})();
