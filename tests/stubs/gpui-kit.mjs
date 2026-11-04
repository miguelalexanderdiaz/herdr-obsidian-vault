export class View { init() {} render() { return null; } }
const el = () => new Proxy(() => el(), { get: () => el(), apply: () => el() });
export const div = el, svg = el, image = el;
