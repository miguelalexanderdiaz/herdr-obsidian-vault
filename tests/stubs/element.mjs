// A stand-in for gpui-kit elements: every method returns the element, `when` and `hover` run their
// callback (so drawing code inside them is exercised), the rest is ignored. Counts what was built.
export const built = { count: 0, text: [] };
export function el() {
  built.count++;
  const target = function () {};
  const proxy = new Proxy(target, {
    get(_t, key) {
      if (key === "when") return (cond, fn) => { if (cond) fn(proxy); return proxy; };
      if (key === "hover") return (fn) => { fn(proxy); return proxy; };
      if (key === "child") return (c) => { if (typeof c === "string") built.text.push(c); return proxy; };
      if (key === "children") return (list) => { for (const c of list ?? []) if (typeof c === "string") built.text.push(c); return proxy; };
      if (key === Symbol.toPrimitive) return () => "[element]";
      return () => proxy;
    },
    apply() { return proxy; },
  });
  return proxy;
}
