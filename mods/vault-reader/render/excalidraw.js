// An Excalidraw scene as an SVG string: shapes, arrows, text, images and frames,
// drawn clean (no hand-drawn wobble). Dark themes invert it the way Excalidraw does.
(function () {
  // A drawing comes from a vault, which may be somebody else's: every value that lands in the SVG
  // goes through one of these, so a scene can't close an attribute or add markup.
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const COLOR = /^(#[0-9a-f]{3,8}|transparent|[a-z]{3,20}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%deg/]+\))$/i;
  const col = (c, d) => (typeof c === "string" && COLOR.test(c.trim()) ? c.trim() : d);
  const STYLES = new Set(["solid", "dashed", "dotted"]);
  const FILLS = new Set(["solid", "hachure", "cross-hatch", "zigzag"]);
  const ARROWHEADS = new Set(["arrow", "triangle", "triangle_outline", "bar", "dot", "circle", "circle_outline", "diamond", "diamond_outline"]);
  const head_ = (k) => (k == null ? null : ARROWHEADS.has(k) ? k : "arrow");
  const DATA_URL = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
  const pts_ = (list) => (Array.isArray(list) ? list.filter((p) => Array.isArray(p)).map((p) => [num(p[0]), num(p[1])]) : []);
  // Fonts: the drawing's family numbers map to generic stacks that exist on every OS.
  const SANS = '"Helvetica Neue", "Segoe UI", system-ui, Helvetica, Arial, sans-serif';
  const HAND = '"Chalkboard SE", "Comic Sans MS", "Segoe Print", "Bradley Hand", cursive';
  const MONO = 'Menlo, "SF Mono", Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace';
  const FONTS = { 1: HAND, 5: HAND, 2: SANS, 6: SANS, 3: MONO, 7: SANS, 8: HAND };

  function radius(e) {
    if (!e.roundness) return 0;
    const x = Math.min(Math.abs(e.width), Math.abs(e.height));
    if (e.roundness.type === 3) { const fixed = num(e.roundness.value, 32) || 32; return x <= fixed / 0.25 ? x * 0.25 : fixed; }
    return x * 0.25;
  }

  // Catmull-Rom through the points, as cubic Béziers (Excalidraw's round lines).
  function smooth(pts) {
    if (pts.length < 3) return "M" + pts.map((p) => p.join(" ")).join(" L");
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p2[0]} ${p2[1]}`;
    }
    return d;
  }

  function head(kind, tip, from, sw, color) {
    if (!kind) return "";
    const dx = tip[0] - from[0], dy = tip[1] - from[1], len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len, size = Math.min(10 + sw * 4, len * 0.6);
    const back = [tip[0] - ux * size, tip[1] - uy * size];
    const side = (s, w) => [back[0] - uy * w * s, back[1] + ux * w * s];
    const stroke = `stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
    switch (kind) {
      case "triangle": case "triangle_outline": {
        const a = side(1, size * 0.5), b = side(-1, size * 0.5);
        return `<polygon points="${tip.join(",")} ${a.join(",")} ${b.join(",")}" ${stroke} fill="${kind === "triangle" ? color : "none"}"/>`;
      }
      case "bar": { const a = [tip[0] - uy * size * 0.6, tip[1] + ux * size * 0.6], b = [tip[0] + uy * size * 0.6, tip[1] - ux * size * 0.6];
        return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" ${stroke}/>`; }
      case "dot": case "circle": case "circle_outline":
        return `<circle cx="${tip[0] - ux * size * 0.3}" cy="${tip[1] - uy * size * 0.3}" r="${size * 0.3}" ${stroke} fill="${kind === "circle_outline" ? "none" : color}"/>`;
      case "diamond": case "diamond_outline": {
        const mid = [tip[0] - ux * size * 0.5, tip[1] - uy * size * 0.5], a = [mid[0] - uy * size * 0.3, mid[1] + ux * size * 0.3], b = [mid[0] + uy * size * 0.3, mid[1] - ux * size * 0.3];
        return `<polygon points="${tip.join(",")} ${a.join(",")} ${back.join(",")} ${b.join(",")}" ${stroke} fill="${kind === "diamond" ? color : "none"}"/>`;
      }
      default: { const a = side(1, size * 0.45), b = side(-1, size * 0.45);
        return `<polyline points="${a.join(",")} ${tip.join(",")} ${b.join(",")}" ${stroke} fill="none"/>`; }
    }
  }

  window.excalidrawSvg = function (scene, dark) {
    let raw = scene.json;
    if (scene.compressed) raw = window.lzDecompressFromBase64(scene.compressed);
    if (!raw) throw new Error("Couldn't read the drawing's data");
    const data = JSON.parse(raw);
    const files = { ...(data.files ?? {}), ...(scene.files ?? {}) };
    const els = (Array.isArray(data.elements) ? data.elements : []).filter((e) => e && typeof e === "object" && !e.isDeleted);
    if (!els.length) throw new Error("The drawing is empty");
    // Numbers first: nothing below sees a string where a number goes.
    for (const e of els) {
      for (const k of ["x", "y", "width", "height", "angle", "strokeWidth", "fontSize", "lineHeight"]) if (e[k] != null) e[k] = num(e[k], k === "strokeWidth" ? 2 : k === "fontSize" ? 20 : k === "lineHeight" ? 1.25 : 0);
      e.x = num(e.x); e.y = num(e.y); e.width = Math.abs(num(e.width)); e.height = Math.abs(num(e.height));
      if (e.opacity != null) e.opacity = Math.min(100, Math.max(0, num(e.opacity, 100)));
      if (e.points != null) e.points = pts_(e.points);
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
    for (const e of els) {
      if (e.points?.length) for (const [px, py] of e.points) grow(e.x + px, e.y + py);
      else { grow(e.x, e.y); grow(e.x + e.width, e.y + e.height); }
    }
    const pad = 20, W = maxX - minX + pad * 2, H = maxY - minY + pad * 2;
    const defs = [], body = [];
    let pid = 0;
    for (const e of els) {
      const color = col(e.strokeColor, "#1e1e1e"), sw = e.strokeWidth ?? 2;
      const back = col(e.backgroundColor, "transparent");
      const strokeStyle = STYLES.has(e.strokeStyle) ? e.strokeStyle : "solid";
      const dash = strokeStyle === "dashed" ? `stroke-dasharray="${8} ${8 + sw}"` : strokeStyle === "dotted" ? `stroke-dasharray="1.5 ${6 + sw}" stroke-linecap="round"` : "";
      let fill = "none";
      if (back !== "transparent") {
        if (e.fillStyle === "solid") fill = back;
        else {
          const id = `h${pid++}`, gap = 6 + sw * 2;
          const hatch = FILLS.has(e.fillStyle) ? e.fillStyle : "hachure";
          const lines = hatch === "cross-hatch"
            ? `<path d="M0 0 L0 ${gap} M0 0 L${gap} 0" stroke="${back}" stroke-width="${Math.max(1, sw / 2)}"/>`
            : `<path d="M0 0 L0 ${gap}" stroke="${back}" stroke-width="${Math.max(1, sw / 2)}"/>`;
          defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="${gap}" height="${gap}" patternTransform="rotate(-41)">${lines}</pattern>`);
          fill = `url(#${id})`;
        }
      }
      const stroke = color === "transparent" ? `stroke="none"` : `stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" ${dash}`;
      const ox = e.x - minX + pad, oy = e.y - minY + pad;
      const cx = ox + e.width / 2, cy = oy + e.height / 2;
      const rot = e.angle ? ` transform="rotate(${(e.angle * 180) / Math.PI} ${cx} ${cy})"` : "";
      const op = e.opacity != null && e.opacity !== 100 ? ` opacity="${e.opacity / 100}"` : "";
      let s = "";
      switch (e.type) {
        case "rectangle": { const r = radius(e); s = `<rect x="${ox}" y="${oy}" width="${e.width}" height="${e.height}" rx="${r}" ry="${r}" fill="${fill}" ${stroke}/>`; break; }
        case "diamond": s = `<polygon points="${cx},${oy} ${ox + e.width},${cy} ${cx},${oy + e.height} ${ox},${cy}" fill="${fill}" ${stroke}/>`; break;
        case "ellipse": s = `<ellipse cx="${cx}" cy="${cy}" rx="${e.width / 2}" ry="${e.height / 2}" fill="${fill}" ${stroke}/>`; break;
        case "line": case "arrow": {
          const pts = (e.points ?? []).map(([px, py]) => [ox + px, oy + py]);
          if (pts.length < 2) break;
          const closed = e.type === "line" && pts.length > 2 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 1;
          const d = e.roundness && !e.elbowed ? smooth(pts) : "M" + pts.map((p) => p.join(" ")).join(" L");
          s = `<path d="${d}${closed ? " Z" : ""}" fill="${closed ? fill : "none"}" ${stroke} stroke-linecap="round"/>`;
          if (e.type === "arrow") {
            s += head(e.endArrowhead === undefined ? "arrow" : head_(e.endArrowhead), pts.at(-1), pts.at(-2), sw, color);
            s += head(head_(e.startArrowhead), pts[0], pts[1], sw, color);
          }
          break;
        }
        case "freedraw": {
          const pts = (e.points ?? []).map(([px, py]) => [ox + px, oy + py]);
          if (!pts.length) break;
          s = `<path d="${smooth(pts.length > 2 ? pts : [...pts, pts.at(-1)])}" fill="none" stroke="${color}" stroke-width="${sw * 1.6}" stroke-linecap="round" stroke-linejoin="round"/>`;
          break;
        }
        case "text": {
          const fs = e.fontSize ?? 20, lh = (e.lineHeight ?? 1.25) * fs;
          const lines = String(e.text ?? "").split("\n");
          const anchor = e.textAlign === "center" ? "middle" : e.textAlign === "right" ? "end" : "start";
          const tx = anchor === "middle" ? cx : anchor === "end" ? ox + e.width : ox;
          s = `<text font-family='${FONTS[e.fontFamily] ?? FONTS[1]}' font-size="${fs}" fill="${color}" text-anchor="${anchor}">` +
            lines.map((l, i) => `<tspan x="${tx}" y="${oy + i * lh + lh / 2}" dominant-baseline="central">${esc(l) || " "}</tspan>`).join("") + "</text>";
          break;
        }
        case "image": {
          const f = files[e.fileId];
          const url = typeof f?.dataURL === "string" && DATA_URL.test(f.dataURL) ? f.dataURL : null;
          if (url) s = `<image href="${url}" x="${ox}" y="${oy}" width="${e.width}" height="${e.height}" preserveAspectRatio="none"${dark ? ' style="filter: invert(100%) hue-rotate(180deg)"' : ""}/>`;
          else s = `<rect x="${ox}" y="${oy}" width="${e.width}" height="${e.height}" fill="none" stroke="#999" stroke-dasharray="4 4"/>`;
          break;
        }
        case "frame": case "magicframe":
          s = `<rect x="${ox}" y="${oy}" width="${e.width}" height="${e.height}" rx="8" fill="none" stroke="#bbb" stroke-width="1"/>` +
            `<text x="${ox}" y="${oy - 6}" font-family='${SANS}' font-size="14" fill="#999">${esc(e.name ?? "Frame")}</text>`;
          break;
        case "embeddable": case "iframe":
          s = `<rect x="${ox}" y="${oy}" width="${e.width}" height="${e.height}" rx="8" fill="none" stroke="${color}"/>` +
            `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family='${SANS}' font-size="14" fill="${color}">${esc(e.link ?? "embed")}</text>`;
          break;
      }
      if (s) body.push(`<g${rot}${op}>${s}</g>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"${dark ? ' style="filter: invert(93%) hue-rotate(180deg)"' : ""}><defs>${defs.join("")}</defs>${body.join("")}</svg>`;
  };
})();
