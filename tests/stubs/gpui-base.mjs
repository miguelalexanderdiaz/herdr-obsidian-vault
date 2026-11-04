const el = () => new Proxy(() => el(), { get: () => el(), apply: () => el() });
export const v_flex = el, h_flex = el;
export const TextView = { markdown: el };
export const InputState = { new: el };
export const Input = { new: el };
