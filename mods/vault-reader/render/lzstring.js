// lz-string's decompressFromBase64 (MIT, pieroxy), as the Excalidraw plugin stores drawings.
window.lzDecompressFromBase64 = function (input) {
  const keys = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  if (input == null) return "";
  if (input === "") return null;
  const length = input.length, reset = 32;
  const next = (i) => keys.indexOf(input.charAt(i));
  const dictionary = [];
  let enlargeIn = 4, dictSize = 4, numBits = 3, entry = "", w, c;
  const result = [];
  const data = { val: next(0), position: reset, index: 1 };
  const read = (n) => {
    let bits = 0, power = 1;
    const max = Math.pow(2, n);
    while (power !== max) {
      const resb = data.val & data.position;
      data.position >>= 1;
      if (data.position === 0) { data.position = reset; data.val = next(data.index++); }
      bits |= (resb > 0 ? 1 : 0) * power;
      power <<= 1;
    }
    return bits;
  };
  for (let i = 0; i < 3; i++) dictionary[i] = i;
  switch (read(2)) {
    case 0: c = String.fromCharCode(read(8)); break;
    case 1: c = String.fromCharCode(read(16)); break;
    case 2: return "";
  }
  dictionary[3] = c; w = c; result.push(c);
  for (;;) {
    if (data.index > length) return "";
    c = read(numBits);
    switch (c) {
      case 0: dictionary[dictSize++] = String.fromCharCode(read(8)); c = dictSize - 1; enlargeIn--; break;
      case 1: dictionary[dictSize++] = String.fromCharCode(read(16)); c = dictSize - 1; enlargeIn--; break;
      case 2: return result.join("");
    }
    if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
    if (dictionary[c]) entry = dictionary[c];
    else if (c === dictSize) entry = w + w.charAt(0);
    else return null;
    result.push(entry);
    dictionary[dictSize++] = w + entry.charAt(0);
    enlargeIn--;
    w = entry;
    if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
  }
};
