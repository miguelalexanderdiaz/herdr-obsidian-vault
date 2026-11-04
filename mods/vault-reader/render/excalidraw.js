// An Excalidraw scene as an SVG string: shapes, arrows, text, images and frames,
// drawn clean (no hand-drawn wobble). Dark themes invert it the way Excalidraw does.
(function () {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const FONTS = {
    1: '"Chalkboard SE", "Comic Sans MS", cursive', 5: '"Chalkboard SE", "Comic Sans MS", cursive',
    2: '"Helvetica Neue", Helvetica, sans-serif', 6: '"Helvetica Neue", Helvetica, sans-serif',
    3: 'Menlo, "SF Mono", monospace', 7: '"Helvetica Neue", Helvetica, sans-serif', 8: '"Comic Sans MS", cursive',
  };

  function radius(e) {
    if (!e.roundness) return 0;
    const x = Math.min(Math.abs(e.width), Math.abs(e.height));
    if (e.roundness.type === 3) { const fixed = e.roundness.value ?? 32; return x <= fixed / 0.25 ? x * 0.25 : fixed; }
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
    const els = (data.elements ?? []).filter((e) => !e.isDeleted);
    if (!els.length) throw new Error("The drawing is empty");
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
      const color = e.strokeColor ?? "#1e1e1e", sw = e.strokeWidth ?? 2;
      const dash = e.strokeStyle === "dashed" ? `stroke-dasharray="${8} ${8 + sw}"` : e.strokeStyle === "dotted" ? `stroke-dasharray="1.5 ${6 + sw}" stroke-linecap="round"` : "";
      let fill = "none";
      if (e.backgroundColor && e.backgroundColor !== "transparent") {
        if (e.fillStyle === "solid") fill = e.backgroundColor;
        else {
          const id = `h${pid++}`, gap = 6 + sw * 2;
          const lines = e.fillStyle === "cross-hatch"
            ? `<path d="M0 0 L0 ${gap} M0 0 L${gap} 0" stroke="${e.backgroundColor}" stroke-width="${Math.max(1, sw / 2)}"/>`
            : `<path d="M0 0 L0 ${gap}" stroke="${e.backgroundColor}" stroke-width="${Math.max(1, sw / 2)}"/>`;
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
            s += head(e.endArrowhead === undefined ? "arrow" : e.endArrowhead, pts.at(-1), pts.at(-2), sw, color);
            s += head(e.startArrowhead, pts[0], pts[1], sw, color);
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
          if (f?.dataURL) s = `<image href="${f.dataURL}" x="${ox}" y="${oy}" width="${e.width}" height="${e.height}" preserveAspectRatio="none"${dark ? ' style="filter: invert(100%) hue-rotate(180deg)"' : ""}/>`;
          else s = `<rect x="${ox}" y="${oy}" width="${e.width}" height="${e.height}" fill="none" stroke="#999" stroke-dasharray="4 4"/>`;
          break;
        }
        case "frame": case "magicframe":
          s = `<rect x="${ox}" y="${oy}" width="${e.width}" height="${e.height}" rx="8" fill="none" stroke="#bbb" stroke-width="1"/>` +
            `<text x="${ox}" y="${oy - 6}" font-family='"Helvetica Neue", sans-serif' font-size="14" fill="#999">${esc(e.name ?? "Frame")}</text>`;
          break;
        case "embeddable": case "iframe":
          s = `<rect x="${ox}" y="${oy}" width="${e.width}" height="${e.height}" rx="8" fill="none" stroke="${color}"/>` +
            `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family='"Helvetica Neue", sans-serif' font-size="14" fill="${color}">${esc(e.link ?? "embed")}</text>`;
          break;
      }
      if (s) body.push(`<g${rot}${op}>${s}</g>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"${dark ? ' style="filter: invert(93%) hue-rotate(180deg)"' : ""}><defs>${defs.join("")}</defs>${body.join("")}</svg>`;
  };
})();
