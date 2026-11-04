import { el } from "./element.mjs";
export const v_flex = el, h_flex = el;
export const TextView = { markdown: () => el() };
export const InputState = { new: () => ({ on() {}, value: () => "", set_value() {} }) };
export const Input = { new: el };
