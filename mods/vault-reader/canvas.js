// JSON Canvas (.canvas) → what the reader draws natively: the bounds, the
// nodes in paint order (groups first) and one SVG with every edge, arrow and
// edge label, drawn in canvas coordinates. Pure: node can run it.

export const CANVAS_COLORS = { 1: "#fb464c", 2: "#e9973f", 3: "#e0de71", 4: "#44cf6e", 5: "#53dfdd", 6: "#a882ff" };
export const canvasColor = (c, fallback) => (!c ? fallback : CANVAS_COLORS[c] ?? (/^#[0-9a-f]{3,8}$/i.test(c) ? c : fallback));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function parseCanvas(text) {
  const data = JSON.parse(text || "{}");
  const nodes = (data.nodes ?? []).filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
  const edges = data.edges ?? [];
  if (!nodes.length) return { empty: true, nodes: [], edges: [] };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y - (n.type === "group" && n.label ? 28 : 0));
    maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height);
  }
  const pad = 24;
  const box = { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  // Groups under the rest; bigger groups under smaller ones.
  const ordered = [...nodes].sort((a, b) =>
    Number(b.type === "group") - Number(a.type === "group") || (b.type === "group" ? b.width * b.height - a.width * a.height : 0));
  return { box, nodes: ordered, edges };
}

function anchor(n, side) {
  switch (side) {
    case "top": return [n.x + n.width / 2, n.y, 0, -1];
    case "bottom": return [n.x + n.width / 2, n.y + n.height, 0, 1];
    case "left": return [n.x, n.y + n.height / 2, -1, 0];
    default: return [n.x + n.width, n.y + n.height / 2, 1, 0];
  }
}

// The sides facing each other, when an edge doesn't name them.
function sides(a, b) {
  const dx = b.x + b.width / 2 - (a.x + a.width / 2), dy = b.y + b.height / 2 - (a.y + a.height / 2);
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? ["right", "left"] : ["left", "right"]) : (dy > 0 ? ["bottom", "top"] : ["top", "bottom"]);
}

function arrow(x, y, nx, ny, color) {
  // Points back along the normal the line arrives on.
  const len = 12, wid = 6;
  const bx = x + nx * len, by = y + ny * len;
  return `<polygon points="${x},${y} ${bx - ny * wid},${by + nx * wid} ${bx + ny * wid},${by - nx * wid}" fill="${color}"/>`;
}

// theme: { line, text, bg, font }
export function edgesSvg(canvas, theme) {
  const { box, nodes, edges } = canvas;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parts = [];
  for (const e of edges) {
    const a = byId.get(e.fromNode), b = byId.get(e.toNode);
    if (!a || !b) continue;
    const [sa, sb] = sides(a, b);
    const [x1, y1, n1x, n1y] = anchor(a, e.fromSide ?? sa);
    const [x2, y2, n2x, n2y] = anchor(b, e.toSide ?? sb);
    const off = Math.max(40, Math.min(160, Math.hypot(x2 - x1, y2 - y1) * 0.4));
    const c1 = [x1 + n1x * off, y1 + n1y * off], c2 = [x2 + n2x * off, y2 + n2y * off];
    const color = canvasColor(e.color, theme.line);
    const toEnd = e.toEnd ?? "arrow", fromEnd = e.fromEnd ?? "none";
    // Shorten the line under an arrowhead so the tip stays sharp.
    const ex = toEnd === "arrow" ? x2 + n2x * 10 : x2, ey = toEnd === "arrow" ? y2 + n2y * 10 : y2;
    const sx = fromEnd === "arrow" ? x1 + n1x * 10 : x1, sy = fromEnd === "arrow" ? y1 + n1y * 10 : y1;
    parts.push(`<path d="M${sx} ${sy} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${ex} ${ey}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`);
    if (toEnd === "arrow") parts.push(arrow(x2, y2, n2x, n2y, color));
    if (fromEnd === "arrow") parts.push(arrow(x1, y1, n1x, n1y, color));
    if (e.label) {
      // The curve's middle (t = 0.5).
      const mx = (x1 + 3 * c1[0] + 3 * c2[0] + x2) / 8, my = (y1 + 3 * c1[1] + 3 * c2[1] + y2) / 8;
      const w = e.label.length * 7.4 + 16;
      parts.push(`<rect x="${mx - w / 2}" y="${my - 12}" width="${w}" height="24" rx="5" fill="${theme.bg}"/>` +
        `<text x="${mx}" y="${my + 5}" text-anchor="middle" font-family="${theme.font}" font-size="14" fill="${theme.text}">${esc(e.label)}</text>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${box.w}" height="${box.h}" viewBox="${box.x} ${box.y} ${box.w} ${box.h}">${parts.join("")}</svg>`;
}
