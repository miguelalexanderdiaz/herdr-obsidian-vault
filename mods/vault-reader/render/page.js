// The render page: one job at a time into #stage; returns the box to capture.
(function () {
  const stage = () => document.getElementById("stage");
  let theme = { fg: "#ffffff", bg: "#101010", muted: "#a0a0a0", accent: "#ffc799", border: "#282828", surface: "#1c1c1c", dark: true, size: 15 };
  let n = 0;
  // The reader's own font first (when it names one), then fonts every OS has.
  const GENERIC = 'system-ui, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';
  const stack = (f) => (typeof f === "string" && /^[\w .-]{1,60}$/.test(f) ? `"${f}", ` : "") + GENERIC;

  window.libsReady = false;
  const wait = setInterval(() => {
    if (window.mermaid && window.mathReady) { window.libsReady = true; clearInterval(wait); }
  }, 30);

  window.setTheme = (t) => {
    theme = { ...theme, ...t };
    document.body.style.color = theme.fg;
    document.body.style.fontFamily = stack(theme.font);
    window.mermaid.initialize({
      startOnLoad: false, securityLevel: "strict", theme: "base",
      themeVariables: {
        darkMode: theme.dark, background: theme.bg, fontFamily: stack(theme.font), fontSize: "14px",
        primaryColor: theme.surface, primaryTextColor: theme.fg, primaryBorderColor: theme.muted,
        secondaryColor: theme.raised ?? theme.surface, secondaryTextColor: theme.fg, secondaryBorderColor: theme.border,
        tertiaryColor: theme.bg, tertiaryTextColor: theme.fg, tertiaryBorderColor: theme.border,
        lineColor: theme.muted, textColor: theme.fg, mainBkg: theme.surface, nodeBorder: theme.muted,
        clusterBkg: theme.bg, clusterBorder: theme.border, titleColor: theme.fg, edgeLabelBackground: theme.bg,
        noteBkgColor: theme.raised ?? theme.surface, noteTextColor: theme.fg, noteBorderColor: theme.accent,
        actorBkg: theme.surface, actorBorder: theme.muted, actorTextColor: theme.fg, signalColor: theme.muted, signalTextColor: theme.fg,
        labelBoxBkgColor: theme.surface, labelBoxBorderColor: theme.muted, labelTextColor: theme.fg, loopTextColor: theme.fg,
        activationBkgColor: theme.raised ?? theme.surface, activationBorderColor: theme.muted,
        sectionBkgColor: theme.surface, altSectionBkgColor: theme.bg, taskBkgColor: theme.surface, taskBorderColor: theme.muted,
        taskTextColor: theme.fg, taskTextOutsideColor: theme.fg, activeTaskBkgColor: theme.accent, gridColor: theme.border, doneTaskBkgColor: theme.border,
        ...Object.fromEntries((theme.series ?? [theme.accent]).map((c, i) => [`pie${i + 1}`, c])),
        ...Object.fromEntries((theme.series ?? [theme.accent]).map((c, i) => [`cScale${i}`, c])),
        pieTitleTextColor: theme.fg, pieSectionTextColor: theme.bg, pieLegendTextColor: theme.fg, pieStrokeColor: theme.bg, pieOuterStrokeColor: theme.bg,
      },
      flowchart: { useMaxWidth: false, htmlLabels: true }, sequence: { useMaxWidth: false }, gantt: { useMaxWidth: false },
      journey: { useMaxWidth: false }, class: { useMaxWidth: false }, git: { useMaxWidth: false }, state: { useMaxWidth: false },
      er: { useMaxWidth: false }, pie: { useMaxWidth: false }, mindmap: { useMaxWidth: false }, timeline: { useMaxWidth: false },
    });
  };

  const box = (el, extra = {}) => {
    const r = el.getBoundingClientRect();
    const x = Math.floor(r.left), y = Math.floor(r.top);
    return { x, y, w: Math.ceil(r.right) - x, h: Math.ceil(r.bottom) - y, ...extra };
  };

  let sheet = null;
  async function math(src, display) {
    const s = stage();
    s.className = display ? "math-block" : "math-inline";
    s.style.fontSize = theme.size + "px";
    s.innerHTML = "";
    const node = MathJax.tex2chtml(src, { display });
    const err = node.querySelector("mjx-merror");
    if (err) throw new Error(err.getAttribute("data-mjx-error") || err.textContent);
    s.appendChild(node);
    const next = MathJax.chtmlStylesheet();
    if (sheet !== next) { sheet?.remove(); sheet = next; document.head.appendChild(next); }
    MathJax.startup.document.clear();
    MathJax.startup.document.updateDocument();
    s.getBoundingClientRect();
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return box(s);
  }

  async function mermaidJob(src) {
    const s = stage();
    s.className = "";
    s.style.fontSize = "14px";
    s.innerHTML = "";
    const { svg } = await window.mermaid.render(`m${n++}`, src);
    s.innerHTML = svg;
    const el = s.querySelector("svg");
    const vb = el.viewBox?.baseVal;
    if (vb && vb.width) { el.style.maxWidth = "none"; el.setAttribute("width", vb.width); el.setAttribute("height", vb.height); }
    await document.fonts.ready;
    return box(el);
  }

  async function excalidraw(scene) {
    const s = stage();
    s.className = "";
    s.innerHTML = window.excalidrawSvg(scene, theme.dark);
    await document.fonts.ready;
    return box(s.querySelector("svg"));
  }

  window.renderJob = async (job) => {
    try {
      if (job.kind === "mermaid") return await mermaidJob(job.src);
      if (job.kind === "math") return await math(job.src, Boolean(job.display));
      if (job.kind === "excalidraw") return await excalidraw(job.scene);
      return { error: "Unknown job " + job.kind };
    } catch (e) {
      document.querySelectorAll("body > [id^='dm'], body > svg[id^='m']").forEach((el) => el.remove());
      return { error: String(e?.message ?? e) };
    }
  };
})();
