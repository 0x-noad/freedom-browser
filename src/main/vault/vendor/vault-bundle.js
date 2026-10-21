/* GENERATED — do not edit by hand.
 * @vault/{vault-core,crypto-core,protocol} bundled for Freedom Browser.
 * Source:   https://github.com/absolutions19/vault3r-code-public
 * Revision: ce312cface5d
 * License:  MPL-2.0 (same as Freedom Browser)
 * Inlines:  @noble/ciphers, @noble/curves, @noble/hashes, @scure/base,
 *           @scure/bip39 — all MIT. See the vendor README beside this
 *           file, and NOTICES in the Freedom repo.
 * Rebuild:  node tools/bundle-for-freedom.mjs <path-to-freedom-browser>
 */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod2, isNodeMode, target) => (target = mod2 != null ? __create(__getProtoOf(mod2)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod2 || !mod2.__esModule ? __defProp(target, "default", { value: mod2, enumerable: true }) : target,
  mod2
));
var __toCommonJS = (mod2) => __copyProps(__defProp({}, "__esModule", { value: true }), mod2);

// packages/vault-core/src/adapters.ts
var systemClock;
var init_adapters = __esm({
  "packages/vault-core/src/adapters.ts"() {
    "use strict";
    systemClock = { now: () => Date.now() };
  }
});

// node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/cryptoNode.js
var nc, crypto;
var init_cryptoNode = __esm({
  "node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/cryptoNode.js"() {
    nc = __toESM(require("node:crypto"), 1);
    crypto = nc && typeof nc === "object" && "webcrypto" in nc ? nc.webcrypto : nc && typeof nc === "object" && "randomBytes" in nc ? nc : void 0;
  }
});

// node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("positive integer expected, got " + n);
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function")
    throw new Error("Hash should be wrapped by utils.createHasher");
  anumber(h.outputLen);
  anumber(h.blockLen);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function u8(arr) {
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}
function u32(arr) {
  return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
function byteSwap(word) {
  return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
}
function byteSwap32(arr) {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = byteSwap(arr[i]);
  }
  return arr;
}
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function asciiToBase16(ch) {
  if (ch >= asciis._0 && ch <= asciis._9)
    return ch - asciis._0;
  if (ch >= asciis.A && ch <= asciis.F)
    return ch - (asciis.A - 10);
  if (ch >= asciis.a && ch <= asciis.f)
    return ch - (asciis.a - 10);
  return;
}
function hexToBytes(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  if (hasHexBuiltin)
    return Uint8Array.fromHex(hex);
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new Error("hex string expected, got unpadded hex of length " + hl);
  const array = new Uint8Array(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = asciiToBase16(hex.charCodeAt(hi));
    const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0) {
      const char = hex[hi] + hex[hi + 1];
      throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array[ai] = n1 * 16 + n2;
  }
  return array;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
function kdfInputToBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
function concatBytes(...arrays) {
  let sum = 0;
  for (let i = 0; i < arrays.length; i++) {
    const a = arrays[i];
    abytes(a);
    sum += a.length;
  }
  const res = new Uint8Array(sum);
  for (let i = 0, pad = 0; i < arrays.length; i++) {
    const a = arrays[i];
    res.set(a, pad);
    pad += a.length;
  }
  return res;
}
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
function createOptHasher(hashCons) {
  const hashC = (msg, opts) => hashCons(opts).update(toBytes(msg)).digest();
  const tmp = hashCons({});
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = (opts) => hashCons(opts);
  return hashC;
}
function randomBytes(bytesLength = 32) {
  if (crypto && typeof crypto.getRandomValues === "function") {
    return crypto.getRandomValues(new Uint8Array(bytesLength));
  }
  if (crypto && typeof crypto.randomBytes === "function") {
    return Uint8Array.from(crypto.randomBytes(bytesLength));
  }
  throw new Error("crypto.getRandomValues must be defined");
}
var isLE, swap8IfBE, swap32IfBE, hasHexBuiltin, hexes, asciis, Hash;
var init_utils = __esm({
  "node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/utils.js"() {
    init_cryptoNode();
    isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
    swap8IfBE = isLE ? (n) => n : (n) => byteSwap(n);
    swap32IfBE = isLE ? (u) => u : byteSwap32;
    hasHexBuiltin = /* @__PURE__ */ (() => (
      // @ts-ignore
      typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
    ))();
    hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
    asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
    Hash = class {
    };
  }
});

// packages/crypto-core/src/encoding.ts
function utf8ToBytes2(s) {
  return enc.encode(s);
}
function bytesToUtf8(b) {
  return dec.decode(b);
}
function toBase64Url(b) {
  let out = "";
  const n = b.length;
  for (let i = 0; i < n; i += 3) {
    const b0 = b[i];
    const b1 = i + 1 < n ? b[i + 1] : 0;
    const b2 = i + 2 < n ? b[i + 2] : 0;
    out += B64U[b0 >> 2];
    out += B64U[(b0 & 3) << 4 | b1 >> 4];
    if (i + 1 < n) out += B64U[(b1 & 15) << 2 | b2 >> 6];
    if (i + 2 < n) out += B64U[b2 & 63];
  }
  return out;
}
function fromBase64Url(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("invalid base64url");
  if (s.length % 4 === 1) throw new Error("invalid base64url length");
  const out = new Uint8Array(Math.floor(s.length * 3 / 4));
  let oi = 0;
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = B64U_REV[s.charCodeAt(i)];
    buf = buf << 6 | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[oi++] = buf >> bits & 255;
    }
  }
  if ((buf & (1 << bits) - 1) !== 0) throw new Error("non-canonical base64url");
  return out;
}
function toHex(b) {
  return bytesToHex(b);
}
function fromHex(s) {
  if (s.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(s)) {
    throw new Error("invalid hex");
  }
  return hexToBytes(s);
}
function concatBytes2(...arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
var enc, dec, B64U, B64U_REV;
var init_encoding = __esm({
  "packages/crypto-core/src/encoding.ts"() {
    "use strict";
    init_utils();
    enc = new TextEncoder();
    dec = new TextDecoder("utf-8", { fatal: true });
    B64U = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    B64U_REV = (() => {
      const t = new Int16Array(128).fill(-1);
      for (let i = 0; i < B64U.length; i++) t[B64U.charCodeAt(i)] = i;
      return t;
    })();
  }
});

// node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/_md.js
function setBigUint64(view, byteOffset, value, isLE3) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE3);
  const _32n2 = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n2 & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE3 ? 4 : 0;
  const l = isLE3 ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE3);
  view.setUint32(byteOffset + l, wl, isLE3);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD, SHA256_IV, SHA512_IV;
var init_md = __esm({
  "node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/_md.js"() {
    init_utils();
    HashMD = class extends Hash {
      constructor(blockLen, outputLen, padOffset, isLE3) {
        super();
        this.finished = false;
        this.length = 0;
        this.pos = 0;
        this.destroyed = false;
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.padOffset = padOffset;
        this.isLE = isLE3;
        this.buffer = new Uint8Array(blockLen);
        this.view = createView(this.buffer);
      }
      update(data) {
        aexists(this);
        data = toBytes(data);
        abytes(data);
        const { view, buffer, blockLen } = this;
        const len = data.length;
        for (let pos = 0; pos < len; ) {
          const take = Math.min(blockLen - this.pos, len - pos);
          if (take === blockLen) {
            const dataView = createView(data);
            for (; blockLen <= len - pos; pos += blockLen)
              this.process(dataView, pos);
            continue;
          }
          buffer.set(data.subarray(pos, pos + take), this.pos);
          this.pos += take;
          pos += take;
          if (this.pos === blockLen) {
            this.process(view, 0);
            this.pos = 0;
          }
        }
        this.length += data.length;
        this.roundClean();
        return this;
      }
      digestInto(out) {
        aexists(this);
        aoutput(out, this);
        this.finished = true;
        const { buffer, view, blockLen, isLE: isLE3 } = this;
        let { pos } = this;
        buffer[pos++] = 128;
        clean(this.buffer.subarray(pos));
        if (this.padOffset > blockLen - pos) {
          this.process(view, 0);
          pos = 0;
        }
        for (let i = pos; i < blockLen; i++)
          buffer[i] = 0;
        setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE3);
        this.process(view, 0);
        const oview = createView(out);
        const len = this.outputLen;
        if (len % 4)
          throw new Error("_sha2: outputLen should be aligned to 32bit");
        const outLen = len / 4;
        const state = this.get();
        if (outLen > state.length)
          throw new Error("_sha2: outputLen bigger than state");
        for (let i = 0; i < outLen; i++)
          oview.setUint32(4 * i, state[i], isLE3);
      }
      digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
      }
      _cloneInto(to) {
        to || (to = new this.constructor());
        to.set(...this.get());
        const { blockLen, buffer, length, finished, destroyed, pos } = this;
        to.destroyed = destroyed;
        to.finished = finished;
        to.length = length;
        to.pos = pos;
        if (length % blockLen)
          to.buffer.set(buffer);
        return to;
      }
      clone() {
        return this._cloneInto();
      }
    };
    SHA256_IV = /* @__PURE__ */ Uint32Array.from([
      1779033703,
      3144134277,
      1013904242,
      2773480762,
      1359893119,
      2600822924,
      528734635,
      1541459225
    ]);
    SHA512_IV = /* @__PURE__ */ Uint32Array.from([
      1779033703,
      4089235720,
      3144134277,
      2227873595,
      1013904242,
      4271175723,
      2773480762,
      1595750129,
      1359893119,
      2917565137,
      2600822924,
      725511199,
      528734635,
      4215389547,
      1541459225,
      327033209
    ]);
  }
});

// node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/_u64.js
function fromBig(n, le = false) {
  if (le)
    return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
  return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
function add(Ah, Al, Bh, Bl) {
  const l = (Al >>> 0) + (Bl >>> 0);
  return { h: Ah + Bh + (l / 2 ** 32 | 0) | 0, l: l | 0 };
}
var U32_MASK64, _32n, shrSH, shrSL, rotrSH, rotrSL, rotrBH, rotrBL, rotr32H, rotr32L, add3L, add3H, add4L, add4H, add5L, add5H;
var init_u64 = __esm({
  "node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/_u64.js"() {
    U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
    _32n = /* @__PURE__ */ BigInt(32);
    shrSH = (h, _l, s) => h >>> s;
    shrSL = (h, l, s) => h << 32 - s | l >>> s;
    rotrSH = (h, l, s) => h >>> s | l << 32 - s;
    rotrSL = (h, l, s) => h << 32 - s | l >>> s;
    rotrBH = (h, l, s) => h << 64 - s | l >>> s - 32;
    rotrBL = (h, l, s) => h >>> s - 32 | l << 64 - s;
    rotr32H = (_h, l) => l;
    rotr32L = (h, _l) => h;
    add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
    add3H = (low, Ah, Bh, Ch) => Ah + Bh + Ch + (low / 2 ** 32 | 0) | 0;
    add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
    add4H = (low, Ah, Bh, Ch, Dh) => Ah + Bh + Ch + Dh + (low / 2 ** 32 | 0) | 0;
    add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
    add5H = (low, Ah, Bh, Ch, Dh, Eh) => Ah + Bh + Ch + Dh + Eh + (low / 2 ** 32 | 0) | 0;
  }
});

// node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/sha2.js
var SHA256_K, SHA256_W, SHA256, K512, SHA512_Kh, SHA512_Kl, SHA512_W_H, SHA512_W_L, SHA512, sha256, sha512;
var init_sha2 = __esm({
  "node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/sha2.js"() {
    init_md();
    init_u64();
    init_utils();
    SHA256_K = /* @__PURE__ */ Uint32Array.from([
      1116352408,
      1899447441,
      3049323471,
      3921009573,
      961987163,
      1508970993,
      2453635748,
      2870763221,
      3624381080,
      310598401,
      607225278,
      1426881987,
      1925078388,
      2162078206,
      2614888103,
      3248222580,
      3835390401,
      4022224774,
      264347078,
      604807628,
      770255983,
      1249150122,
      1555081692,
      1996064986,
      2554220882,
      2821834349,
      2952996808,
      3210313671,
      3336571891,
      3584528711,
      113926993,
      338241895,
      666307205,
      773529912,
      1294757372,
      1396182291,
      1695183700,
      1986661051,
      2177026350,
      2456956037,
      2730485921,
      2820302411,
      3259730800,
      3345764771,
      3516065817,
      3600352804,
      4094571909,
      275423344,
      430227734,
      506948616,
      659060556,
      883997877,
      958139571,
      1322822218,
      1537002063,
      1747873779,
      1955562222,
      2024104815,
      2227730452,
      2361852424,
      2428436474,
      2756734187,
      3204031479,
      3329325298
    ]);
    SHA256_W = /* @__PURE__ */ new Uint32Array(64);
    SHA256 = class extends HashMD {
      constructor(outputLen = 32) {
        super(64, outputLen, 8, false);
        this.A = SHA256_IV[0] | 0;
        this.B = SHA256_IV[1] | 0;
        this.C = SHA256_IV[2] | 0;
        this.D = SHA256_IV[3] | 0;
        this.E = SHA256_IV[4] | 0;
        this.F = SHA256_IV[5] | 0;
        this.G = SHA256_IV[6] | 0;
        this.H = SHA256_IV[7] | 0;
      }
      get() {
        const { A, B, C, D, E, F, G: G2, H } = this;
        return [A, B, C, D, E, F, G2, H];
      }
      // prettier-ignore
      set(A, B, C, D, E, F, G2, H) {
        this.A = A | 0;
        this.B = B | 0;
        this.C = C | 0;
        this.D = D | 0;
        this.E = E | 0;
        this.F = F | 0;
        this.G = G2 | 0;
        this.H = H | 0;
      }
      process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4)
          SHA256_W[i] = view.getUint32(offset, false);
        for (let i = 16; i < 64; i++) {
          const W15 = SHA256_W[i - 15];
          const W2 = SHA256_W[i - 2];
          const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
          const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
          SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
        }
        let { A, B, C, D, E, F, G: G2, H } = this;
        for (let i = 0; i < 64; i++) {
          const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
          const T1 = H + sigma1 + Chi(E, F, G2) + SHA256_K[i] + SHA256_W[i] | 0;
          const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
          const T2 = sigma0 + Maj(A, B, C) | 0;
          H = G2;
          G2 = F;
          F = E;
          E = D + T1 | 0;
          D = C;
          C = B;
          B = A;
          A = T1 + T2 | 0;
        }
        A = A + this.A | 0;
        B = B + this.B | 0;
        C = C + this.C | 0;
        D = D + this.D | 0;
        E = E + this.E | 0;
        F = F + this.F | 0;
        G2 = G2 + this.G | 0;
        H = H + this.H | 0;
        this.set(A, B, C, D, E, F, G2, H);
      }
      roundClean() {
        clean(SHA256_W);
      }
      destroy() {
        this.set(0, 0, 0, 0, 0, 0, 0, 0);
        clean(this.buffer);
      }
    };
    K512 = /* @__PURE__ */ (() => split([
      "0x428a2f98d728ae22",
      "0x7137449123ef65cd",
      "0xb5c0fbcfec4d3b2f",
      "0xe9b5dba58189dbbc",
      "0x3956c25bf348b538",
      "0x59f111f1b605d019",
      "0x923f82a4af194f9b",
      "0xab1c5ed5da6d8118",
      "0xd807aa98a3030242",
      "0x12835b0145706fbe",
      "0x243185be4ee4b28c",
      "0x550c7dc3d5ffb4e2",
      "0x72be5d74f27b896f",
      "0x80deb1fe3b1696b1",
      "0x9bdc06a725c71235",
      "0xc19bf174cf692694",
      "0xe49b69c19ef14ad2",
      "0xefbe4786384f25e3",
      "0x0fc19dc68b8cd5b5",
      "0x240ca1cc77ac9c65",
      "0x2de92c6f592b0275",
      "0x4a7484aa6ea6e483",
      "0x5cb0a9dcbd41fbd4",
      "0x76f988da831153b5",
      "0x983e5152ee66dfab",
      "0xa831c66d2db43210",
      "0xb00327c898fb213f",
      "0xbf597fc7beef0ee4",
      "0xc6e00bf33da88fc2",
      "0xd5a79147930aa725",
      "0x06ca6351e003826f",
      "0x142929670a0e6e70",
      "0x27b70a8546d22ffc",
      "0x2e1b21385c26c926",
      "0x4d2c6dfc5ac42aed",
      "0x53380d139d95b3df",
      "0x650a73548baf63de",
      "0x766a0abb3c77b2a8",
      "0x81c2c92e47edaee6",
      "0x92722c851482353b",
      "0xa2bfe8a14cf10364",
      "0xa81a664bbc423001",
      "0xc24b8b70d0f89791",
      "0xc76c51a30654be30",
      "0xd192e819d6ef5218",
      "0xd69906245565a910",
      "0xf40e35855771202a",
      "0x106aa07032bbd1b8",
      "0x19a4c116b8d2d0c8",
      "0x1e376c085141ab53",
      "0x2748774cdf8eeb99",
      "0x34b0bcb5e19b48a8",
      "0x391c0cb3c5c95a63",
      "0x4ed8aa4ae3418acb",
      "0x5b9cca4f7763e373",
      "0x682e6ff3d6b2b8a3",
      "0x748f82ee5defb2fc",
      "0x78a5636f43172f60",
      "0x84c87814a1f0ab72",
      "0x8cc702081a6439ec",
      "0x90befffa23631e28",
      "0xa4506cebde82bde9",
      "0xbef9a3f7b2c67915",
      "0xc67178f2e372532b",
      "0xca273eceea26619c",
      "0xd186b8c721c0c207",
      "0xeada7dd6cde0eb1e",
      "0xf57d4f7fee6ed178",
      "0x06f067aa72176fba",
      "0x0a637dc5a2c898a6",
      "0x113f9804bef90dae",
      "0x1b710b35131c471b",
      "0x28db77f523047d84",
      "0x32caab7b40c72493",
      "0x3c9ebe0a15c9bebc",
      "0x431d67c49c100d4c",
      "0x4cc5d4becb3e42b6",
      "0x597f299cfc657e2a",
      "0x5fcb6fab3ad6faec",
      "0x6c44198c4a475817"
    ].map((n) => BigInt(n))))();
    SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
    SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
    SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
    SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);
    SHA512 = class extends HashMD {
      constructor(outputLen = 64) {
        super(128, outputLen, 16, false);
        this.Ah = SHA512_IV[0] | 0;
        this.Al = SHA512_IV[1] | 0;
        this.Bh = SHA512_IV[2] | 0;
        this.Bl = SHA512_IV[3] | 0;
        this.Ch = SHA512_IV[4] | 0;
        this.Cl = SHA512_IV[5] | 0;
        this.Dh = SHA512_IV[6] | 0;
        this.Dl = SHA512_IV[7] | 0;
        this.Eh = SHA512_IV[8] | 0;
        this.El = SHA512_IV[9] | 0;
        this.Fh = SHA512_IV[10] | 0;
        this.Fl = SHA512_IV[11] | 0;
        this.Gh = SHA512_IV[12] | 0;
        this.Gl = SHA512_IV[13] | 0;
        this.Hh = SHA512_IV[14] | 0;
        this.Hl = SHA512_IV[15] | 0;
      }
      // prettier-ignore
      get() {
        const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
        return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
      }
      // prettier-ignore
      set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
        this.Ah = Ah | 0;
        this.Al = Al | 0;
        this.Bh = Bh | 0;
        this.Bl = Bl | 0;
        this.Ch = Ch | 0;
        this.Cl = Cl | 0;
        this.Dh = Dh | 0;
        this.Dl = Dl | 0;
        this.Eh = Eh | 0;
        this.El = El | 0;
        this.Fh = Fh | 0;
        this.Fl = Fl | 0;
        this.Gh = Gh | 0;
        this.Gl = Gl | 0;
        this.Hh = Hh | 0;
        this.Hl = Hl | 0;
      }
      process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4) {
          SHA512_W_H[i] = view.getUint32(offset);
          SHA512_W_L[i] = view.getUint32(offset += 4);
        }
        for (let i = 16; i < 80; i++) {
          const W15h = SHA512_W_H[i - 15] | 0;
          const W15l = SHA512_W_L[i - 15] | 0;
          const s0h = rotrSH(W15h, W15l, 1) ^ rotrSH(W15h, W15l, 8) ^ shrSH(W15h, W15l, 7);
          const s0l = rotrSL(W15h, W15l, 1) ^ rotrSL(W15h, W15l, 8) ^ shrSL(W15h, W15l, 7);
          const W2h = SHA512_W_H[i - 2] | 0;
          const W2l = SHA512_W_L[i - 2] | 0;
          const s1h = rotrSH(W2h, W2l, 19) ^ rotrBH(W2h, W2l, 61) ^ shrSH(W2h, W2l, 6);
          const s1l = rotrSL(W2h, W2l, 19) ^ rotrBL(W2h, W2l, 61) ^ shrSL(W2h, W2l, 6);
          const SUMl = add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
          const SUMh = add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
          SHA512_W_H[i] = SUMh | 0;
          SHA512_W_L[i] = SUMl | 0;
        }
        let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
        for (let i = 0; i < 80; i++) {
          const sigma1h = rotrSH(Eh, El, 14) ^ rotrSH(Eh, El, 18) ^ rotrBH(Eh, El, 41);
          const sigma1l = rotrSL(Eh, El, 14) ^ rotrSL(Eh, El, 18) ^ rotrBL(Eh, El, 41);
          const CHIh = Eh & Fh ^ ~Eh & Gh;
          const CHIl = El & Fl ^ ~El & Gl;
          const T1ll = add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
          const T1h = add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
          const T1l = T1ll | 0;
          const sigma0h = rotrSH(Ah, Al, 28) ^ rotrBH(Ah, Al, 34) ^ rotrBH(Ah, Al, 39);
          const sigma0l = rotrSL(Ah, Al, 28) ^ rotrBL(Ah, Al, 34) ^ rotrBL(Ah, Al, 39);
          const MAJh = Ah & Bh ^ Ah & Ch ^ Bh & Ch;
          const MAJl = Al & Bl ^ Al & Cl ^ Bl & Cl;
          Hh = Gh | 0;
          Hl = Gl | 0;
          Gh = Fh | 0;
          Gl = Fl | 0;
          Fh = Eh | 0;
          Fl = El | 0;
          ({ h: Eh, l: El } = add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
          Dh = Ch | 0;
          Dl = Cl | 0;
          Ch = Bh | 0;
          Cl = Bl | 0;
          Bh = Ah | 0;
          Bl = Al | 0;
          const All = add3L(T1l, sigma0l, MAJl);
          Ah = add3H(All, T1h, sigma0h, MAJh);
          Al = All | 0;
        }
        ({ h: Ah, l: Al } = add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
        ({ h: Bh, l: Bl } = add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
        ({ h: Ch, l: Cl } = add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
        ({ h: Dh, l: Dl } = add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
        ({ h: Eh, l: El } = add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
        ({ h: Fh, l: Fl } = add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
        ({ h: Gh, l: Gl } = add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
        ({ h: Hh, l: Hl } = add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
        this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
      }
      roundClean() {
        clean(SHA512_W_H, SHA512_W_L);
      }
      destroy() {
        clean(this.buffer);
        this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      }
    };
    sha256 = /* @__PURE__ */ createHasher(() => new SHA256());
    sha512 = /* @__PURE__ */ createHasher(() => new SHA512());
  }
});

// node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/utils.js
function _abool2(value, title = "") {
  if (typeof value !== "boolean") {
    const prefix = title && `"${title}"`;
    throw new Error(prefix + "expected boolean, got type=" + typeof value);
  }
  return value;
}
function _abytes2(value, length, title = "") {
  const bytes = isBytes(value);
  const len = value?.length;
  const needsLen = length !== void 0;
  if (!bytes || needsLen && len !== length) {
    const prefix = title && `"${title}" `;
    const ofLen = needsLen ? ` of length ${length}` : "";
    const got = bytes ? `length=${len}` : `type=${typeof value}`;
    throw new Error(prefix + "expected Uint8Array" + ofLen + ", got " + got);
  }
  return value;
}
function hexToNumber(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  return hex === "" ? _0n : BigInt("0x" + hex);
}
function bytesToNumberBE(bytes) {
  return hexToNumber(bytesToHex(bytes));
}
function bytesToNumberLE(bytes) {
  abytes(bytes);
  return hexToNumber(bytesToHex(Uint8Array.from(bytes).reverse()));
}
function numberToBytesBE(n, len) {
  return hexToBytes(n.toString(16).padStart(len * 2, "0"));
}
function numberToBytesLE(n, len) {
  return numberToBytesBE(n, len).reverse();
}
function ensureBytes(title, hex, expectedLength) {
  let res;
  if (typeof hex === "string") {
    try {
      res = hexToBytes(hex);
    } catch (e) {
      throw new Error(title + " must be hex string or Uint8Array, cause: " + e);
    }
  } else if (isBytes(hex)) {
    res = Uint8Array.from(hex);
  } else {
    throw new Error(title + " must be hex string or Uint8Array");
  }
  const len = res.length;
  if (typeof expectedLength === "number" && len !== expectedLength)
    throw new Error(title + " of length " + expectedLength + " expected, got " + len);
  return res;
}
function equalBytes(a, b) {
  if (a.length !== b.length)
    return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++)
    diff |= a[i] ^ b[i];
  return diff === 0;
}
function copyBytes(bytes) {
  return Uint8Array.from(bytes);
}
function inRange(n, min, max) {
  return isPosBig(n) && isPosBig(min) && isPosBig(max) && min <= n && n < max;
}
function aInRange(title, n, min, max) {
  if (!inRange(n, min, max))
    throw new Error("expected valid " + title + ": " + min + " <= n < " + max + ", got " + n);
}
function bitLen(n) {
  let len;
  for (len = 0; n > _0n; n >>= _1n, len += 1)
    ;
  return len;
}
function _validateObject(object, fields, optFields = {}) {
  if (!object || typeof object !== "object")
    throw new Error("expected valid options object");
  function checkField(fieldName, expectedType, isOpt) {
    const val = object[fieldName];
    if (isOpt && val === void 0)
      return;
    const current = typeof val;
    if (current !== expectedType || val === null)
      throw new Error(`param "${fieldName}" is invalid: expected ${expectedType}, got ${current}`);
  }
  Object.entries(fields).forEach(([k, v]) => checkField(k, v, false));
  Object.entries(optFields).forEach(([k, v]) => checkField(k, v, true));
}
function memoized(fn) {
  const map = /* @__PURE__ */ new WeakMap();
  return (arg, ...args) => {
    const val = map.get(arg);
    if (val !== void 0)
      return val;
    const computed = fn(arg, ...args);
    map.set(arg, computed);
    return computed;
  };
}
var _0n, _1n, isPosBig, bitMask, notImplemented;
var init_utils2 = __esm({
  "node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/utils.js"() {
    init_utils();
    init_utils();
    _0n = /* @__PURE__ */ BigInt(0);
    _1n = /* @__PURE__ */ BigInt(1);
    isPosBig = (n) => typeof n === "bigint" && _0n <= n;
    bitMask = (n) => (_1n << BigInt(n)) - _1n;
    notImplemented = () => {
      throw new Error("not implemented");
    };
  }
});

// node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/abstract/modular.js
function mod(a, b) {
  const result = a % b;
  return result >= _0n2 ? result : b + result;
}
function pow2(x, power, modulo) {
  let res = x;
  while (power-- > _0n2) {
    res *= res;
    res %= modulo;
  }
  return res;
}
function invert(number, modulo) {
  if (number === _0n2)
    throw new Error("invert: expected non-zero number");
  if (modulo <= _0n2)
    throw new Error("invert: expected positive modulus, got " + modulo);
  let a = mod(number, modulo);
  let b = modulo;
  let x = _0n2, y = _1n2, u = _1n2, v = _0n2;
  while (a !== _0n2) {
    const q = b / a;
    const r = b % a;
    const m = x - u * q;
    const n = y - v * q;
    b = a, a = r, x = u, y = v, u = m, v = n;
  }
  const gcd2 = b;
  if (gcd2 !== _1n2)
    throw new Error("invert: does not exist");
  return mod(x, modulo);
}
function assertIsSquare(Fp2, root, n) {
  if (!Fp2.eql(Fp2.sqr(root), n))
    throw new Error("Cannot find square root");
}
function sqrt3mod4(Fp2, n) {
  const p1div4 = (Fp2.ORDER + _1n2) / _4n;
  const root = Fp2.pow(n, p1div4);
  assertIsSquare(Fp2, root, n);
  return root;
}
function sqrt5mod8(Fp2, n) {
  const p5div8 = (Fp2.ORDER - _5n) / _8n;
  const n2 = Fp2.mul(n, _2n);
  const v = Fp2.pow(n2, p5div8);
  const nv = Fp2.mul(n, v);
  const i = Fp2.mul(Fp2.mul(nv, _2n), v);
  const root = Fp2.mul(nv, Fp2.sub(i, Fp2.ONE));
  assertIsSquare(Fp2, root, n);
  return root;
}
function sqrt9mod16(P2) {
  const Fp_ = Field(P2);
  const tn = tonelliShanks(P2);
  const c1 = tn(Fp_, Fp_.neg(Fp_.ONE));
  const c2 = tn(Fp_, c1);
  const c3 = tn(Fp_, Fp_.neg(c1));
  const c4 = (P2 + _7n) / _16n;
  return (Fp2, n) => {
    let tv1 = Fp2.pow(n, c4);
    let tv2 = Fp2.mul(tv1, c1);
    const tv3 = Fp2.mul(tv1, c2);
    const tv4 = Fp2.mul(tv1, c3);
    const e1 = Fp2.eql(Fp2.sqr(tv2), n);
    const e2 = Fp2.eql(Fp2.sqr(tv3), n);
    tv1 = Fp2.cmov(tv1, tv2, e1);
    tv2 = Fp2.cmov(tv4, tv3, e2);
    const e3 = Fp2.eql(Fp2.sqr(tv2), n);
    const root = Fp2.cmov(tv1, tv2, e3);
    assertIsSquare(Fp2, root, n);
    return root;
  };
}
function tonelliShanks(P2) {
  if (P2 < _3n)
    throw new Error("sqrt is not defined for small field");
  let Q = P2 - _1n2;
  let S = 0;
  while (Q % _2n === _0n2) {
    Q /= _2n;
    S++;
  }
  let Z = _2n;
  const _Fp = Field(P2);
  while (FpLegendre(_Fp, Z) === 1) {
    if (Z++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  }
  if (S === 1)
    return sqrt3mod4;
  let cc = _Fp.pow(Z, Q);
  const Q1div2 = (Q + _1n2) / _2n;
  return function tonelliSlow(Fp2, n) {
    if (Fp2.is0(n))
      return n;
    if (FpLegendre(Fp2, n) !== 1)
      throw new Error("Cannot find square root");
    let M = S;
    let c = Fp2.mul(Fp2.ONE, cc);
    let t = Fp2.pow(n, Q);
    let R = Fp2.pow(n, Q1div2);
    while (!Fp2.eql(t, Fp2.ONE)) {
      if (Fp2.is0(t))
        return Fp2.ZERO;
      let i = 1;
      let t_tmp = Fp2.sqr(t);
      while (!Fp2.eql(t_tmp, Fp2.ONE)) {
        i++;
        t_tmp = Fp2.sqr(t_tmp);
        if (i === M)
          throw new Error("Cannot find square root");
      }
      const exponent = _1n2 << BigInt(M - i - 1);
      const b = Fp2.pow(c, exponent);
      M = i;
      c = Fp2.sqr(b);
      t = Fp2.mul(t, c);
      R = Fp2.mul(R, b);
    }
    return R;
  };
}
function FpSqrt(P2) {
  if (P2 % _4n === _3n)
    return sqrt3mod4;
  if (P2 % _8n === _5n)
    return sqrt5mod8;
  if (P2 % _16n === _9n)
    return sqrt9mod16(P2);
  return tonelliShanks(P2);
}
function validateField(field) {
  const initial = {
    ORDER: "bigint",
    MASK: "bigint",
    BYTES: "number",
    BITS: "number"
  };
  const opts = FIELD_FIELDS.reduce((map, val) => {
    map[val] = "function";
    return map;
  }, initial);
  _validateObject(field, opts);
  return field;
}
function FpPow(Fp2, num, power) {
  if (power < _0n2)
    throw new Error("invalid exponent, negatives unsupported");
  if (power === _0n2)
    return Fp2.ONE;
  if (power === _1n2)
    return num;
  let p = Fp2.ONE;
  let d = num;
  while (power > _0n2) {
    if (power & _1n2)
      p = Fp2.mul(p, d);
    d = Fp2.sqr(d);
    power >>= _1n2;
  }
  return p;
}
function FpInvertBatch(Fp2, nums, passZero = false) {
  const inverted = new Array(nums.length).fill(passZero ? Fp2.ZERO : void 0);
  const multipliedAcc = nums.reduce((acc, num, i) => {
    if (Fp2.is0(num))
      return acc;
    inverted[i] = acc;
    return Fp2.mul(acc, num);
  }, Fp2.ONE);
  const invertedAcc = Fp2.inv(multipliedAcc);
  nums.reduceRight((acc, num, i) => {
    if (Fp2.is0(num))
      return acc;
    inverted[i] = Fp2.mul(acc, inverted[i]);
    return Fp2.mul(acc, num);
  }, invertedAcc);
  return inverted;
}
function FpLegendre(Fp2, n) {
  const p1mod2 = (Fp2.ORDER - _1n2) / _2n;
  const powered = Fp2.pow(n, p1mod2);
  const yes = Fp2.eql(powered, Fp2.ONE);
  const zero = Fp2.eql(powered, Fp2.ZERO);
  const no = Fp2.eql(powered, Fp2.neg(Fp2.ONE));
  if (!yes && !zero && !no)
    throw new Error("invalid Legendre symbol result");
  return yes ? 1 : zero ? 0 : -1;
}
function nLength(n, nBitLength) {
  if (nBitLength !== void 0)
    anumber(nBitLength);
  const _nBitLength = nBitLength !== void 0 ? nBitLength : n.toString(2).length;
  const nByteLength = Math.ceil(_nBitLength / 8);
  return { nBitLength: _nBitLength, nByteLength };
}
function Field(ORDER, bitLenOrOpts, isLE3 = false, opts = {}) {
  if (ORDER <= _0n2)
    throw new Error("invalid field: expected ORDER > 0, got " + ORDER);
  let _nbitLength = void 0;
  let _sqrt = void 0;
  let modFromBytes = false;
  let allowedLengths = void 0;
  if (typeof bitLenOrOpts === "object" && bitLenOrOpts != null) {
    if (opts.sqrt || isLE3)
      throw new Error("cannot specify opts in two arguments");
    const _opts = bitLenOrOpts;
    if (_opts.BITS)
      _nbitLength = _opts.BITS;
    if (_opts.sqrt)
      _sqrt = _opts.sqrt;
    if (typeof _opts.isLE === "boolean")
      isLE3 = _opts.isLE;
    if (typeof _opts.modFromBytes === "boolean")
      modFromBytes = _opts.modFromBytes;
    allowedLengths = _opts.allowedLengths;
  } else {
    if (typeof bitLenOrOpts === "number")
      _nbitLength = bitLenOrOpts;
    if (opts.sqrt)
      _sqrt = opts.sqrt;
  }
  const { nBitLength: BITS, nByteLength: BYTES } = nLength(ORDER, _nbitLength);
  if (BYTES > 2048)
    throw new Error("invalid field: expected ORDER of <= 2048 bytes");
  let sqrtP;
  const f = Object.freeze({
    ORDER,
    isLE: isLE3,
    BITS,
    BYTES,
    MASK: bitMask(BITS),
    ZERO: _0n2,
    ONE: _1n2,
    allowedLengths,
    create: (num) => mod(num, ORDER),
    isValid: (num) => {
      if (typeof num !== "bigint")
        throw new Error("invalid field element: expected bigint, got " + typeof num);
      return _0n2 <= num && num < ORDER;
    },
    is0: (num) => num === _0n2,
    // is valid and invertible
    isValidNot0: (num) => !f.is0(num) && f.isValid(num),
    isOdd: (num) => (num & _1n2) === _1n2,
    neg: (num) => mod(-num, ORDER),
    eql: (lhs, rhs) => lhs === rhs,
    sqr: (num) => mod(num * num, ORDER),
    add: (lhs, rhs) => mod(lhs + rhs, ORDER),
    sub: (lhs, rhs) => mod(lhs - rhs, ORDER),
    mul: (lhs, rhs) => mod(lhs * rhs, ORDER),
    pow: (num, power) => FpPow(f, num, power),
    div: (lhs, rhs) => mod(lhs * invert(rhs, ORDER), ORDER),
    // Same as above, but doesn't normalize
    sqrN: (num) => num * num,
    addN: (lhs, rhs) => lhs + rhs,
    subN: (lhs, rhs) => lhs - rhs,
    mulN: (lhs, rhs) => lhs * rhs,
    inv: (num) => invert(num, ORDER),
    sqrt: _sqrt || ((n) => {
      if (!sqrtP)
        sqrtP = FpSqrt(ORDER);
      return sqrtP(f, n);
    }),
    toBytes: (num) => isLE3 ? numberToBytesLE(num, BYTES) : numberToBytesBE(num, BYTES),
    fromBytes: (bytes, skipValidation = true) => {
      if (allowedLengths) {
        if (!allowedLengths.includes(bytes.length) || bytes.length > BYTES) {
          throw new Error("Field.fromBytes: expected " + allowedLengths + " bytes, got " + bytes.length);
        }
        const padded = new Uint8Array(BYTES);
        padded.set(bytes, isLE3 ? 0 : padded.length - bytes.length);
        bytes = padded;
      }
      if (bytes.length !== BYTES)
        throw new Error("Field.fromBytes: expected " + BYTES + " bytes, got " + bytes.length);
      let scalar = isLE3 ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
      if (modFromBytes)
        scalar = mod(scalar, ORDER);
      if (!skipValidation) {
        if (!f.isValid(scalar))
          throw new Error("invalid field element: outside of range 0..ORDER");
      }
      return scalar;
    },
    // TODO: we don't need it here, move out to separate fn
    invertBatch: (lst) => FpInvertBatch(f, lst),
    // We can't move this out because Fp6, Fp12 implement it
    // and it's unclear what to return in there.
    cmov: (a, b, c) => c ? b : a
  });
  return Object.freeze(f);
}
var _0n2, _1n2, _2n, _3n, _4n, _5n, _7n, _8n, _9n, _16n, isNegativeLE, FIELD_FIELDS;
var init_modular = __esm({
  "node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/abstract/modular.js"() {
    init_utils2();
    _0n2 = BigInt(0);
    _1n2 = BigInt(1);
    _2n = /* @__PURE__ */ BigInt(2);
    _3n = /* @__PURE__ */ BigInt(3);
    _4n = /* @__PURE__ */ BigInt(4);
    _5n = /* @__PURE__ */ BigInt(5);
    _7n = /* @__PURE__ */ BigInt(7);
    _8n = /* @__PURE__ */ BigInt(8);
    _9n = /* @__PURE__ */ BigInt(9);
    _16n = /* @__PURE__ */ BigInt(16);
    isNegativeLE = (num, modulo) => (mod(num, modulo) & _1n2) === _1n2;
    FIELD_FIELDS = [
      "create",
      "isValid",
      "is0",
      "neg",
      "inv",
      "sqrt",
      "sqr",
      "eql",
      "add",
      "sub",
      "mul",
      "pow",
      "div",
      "addN",
      "subN",
      "mulN",
      "sqrN"
    ];
  }
});

// node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/abstract/curve.js
function negateCt(condition, item) {
  const neg = item.negate();
  return condition ? neg : item;
}
function normalizeZ(c, points) {
  const invertedZs = FpInvertBatch(c.Fp, points.map((p) => p.Z));
  return points.map((p, i) => c.fromAffine(p.toAffine(invertedZs[i])));
}
function validateW(W, bits) {
  if (!Number.isSafeInteger(W) || W <= 0 || W > bits)
    throw new Error("invalid window size, expected [1.." + bits + "], got W=" + W);
}
function calcWOpts(W, scalarBits) {
  validateW(W, scalarBits);
  const windows = Math.ceil(scalarBits / W) + 1;
  const windowSize = 2 ** (W - 1);
  const maxNumber = 2 ** W;
  const mask = bitMask(W);
  const shiftBy = BigInt(W);
  return { windows, windowSize, mask, maxNumber, shiftBy };
}
function calcOffsets(n, window, wOpts) {
  const { windowSize, mask, maxNumber, shiftBy } = wOpts;
  let wbits = Number(n & mask);
  let nextN = n >> shiftBy;
  if (wbits > windowSize) {
    wbits -= maxNumber;
    nextN += _1n3;
  }
  const offsetStart = window * windowSize;
  const offset = offsetStart + Math.abs(wbits) - 1;
  const isZero = wbits === 0;
  const isNeg = wbits < 0;
  const isNegF = window % 2 !== 0;
  const offsetF = offsetStart;
  return { nextN, offset, isZero, isNeg, isNegF, offsetF };
}
function validateMSMPoints(points, c) {
  if (!Array.isArray(points))
    throw new Error("array expected");
  points.forEach((p, i) => {
    if (!(p instanceof c))
      throw new Error("invalid point at index " + i);
  });
}
function validateMSMScalars(scalars, field) {
  if (!Array.isArray(scalars))
    throw new Error("array of scalars expected");
  scalars.forEach((s, i) => {
    if (!field.isValid(s))
      throw new Error("invalid scalar at index " + i);
  });
}
function getW(P2) {
  return pointWindowSizes.get(P2) || 1;
}
function assert0(n) {
  if (n !== _0n3)
    throw new Error("invalid wNAF");
}
function pippenger(c, fieldN, points, scalars) {
  validateMSMPoints(points, c);
  validateMSMScalars(scalars, fieldN);
  const plength = points.length;
  const slength = scalars.length;
  if (plength !== slength)
    throw new Error("arrays of points and scalars must have equal length");
  const zero = c.ZERO;
  const wbits = bitLen(BigInt(plength));
  let windowSize = 1;
  if (wbits > 12)
    windowSize = wbits - 3;
  else if (wbits > 4)
    windowSize = wbits - 2;
  else if (wbits > 0)
    windowSize = 2;
  const MASK = bitMask(windowSize);
  const buckets = new Array(Number(MASK) + 1).fill(zero);
  const lastBits = Math.floor((fieldN.BITS - 1) / windowSize) * windowSize;
  let sum = zero;
  for (let i = lastBits; i >= 0; i -= windowSize) {
    buckets.fill(zero);
    for (let j = 0; j < slength; j++) {
      const scalar = scalars[j];
      const wbits2 = Number(scalar >> BigInt(i) & MASK);
      buckets[wbits2] = buckets[wbits2].add(points[j]);
    }
    let resI = zero;
    for (let j = buckets.length - 1, sumI = zero; j > 0; j--) {
      sumI = sumI.add(buckets[j]);
      resI = resI.add(sumI);
    }
    sum = sum.add(resI);
    if (i !== 0)
      for (let j = 0; j < windowSize; j++)
        sum = sum.double();
  }
  return sum;
}
function createField(order, field, isLE3) {
  if (field) {
    if (field.ORDER !== order)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    validateField(field);
    return field;
  } else {
    return Field(order, { isLE: isLE3 });
  }
}
function _createCurveFields(type, CURVE, curveOpts = {}, FpFnLE) {
  if (FpFnLE === void 0)
    FpFnLE = type === "edwards";
  if (!CURVE || typeof CURVE !== "object")
    throw new Error(`expected valid ${type} CURVE object`);
  for (const p of ["p", "n", "h"]) {
    const val = CURVE[p];
    if (!(typeof val === "bigint" && val > _0n3))
      throw new Error(`CURVE.${p} must be positive bigint`);
  }
  const Fp2 = createField(CURVE.p, curveOpts.Fp, FpFnLE);
  const Fn2 = createField(CURVE.n, curveOpts.Fn, FpFnLE);
  const _b = type === "weierstrass" ? "b" : "d";
  const params = ["Gx", "Gy", "a", _b];
  for (const p of params) {
    if (!Fp2.isValid(CURVE[p]))
      throw new Error(`CURVE.${p} must be valid field element of CURVE.Fp`);
  }
  CURVE = Object.freeze(Object.assign({}, CURVE));
  return { CURVE, Fp: Fp2, Fn: Fn2 };
}
var _0n3, _1n3, pointPrecomputes, pointWindowSizes, wNAF;
var init_curve = __esm({
  "node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/abstract/curve.js"() {
    init_utils2();
    init_modular();
    _0n3 = BigInt(0);
    _1n3 = BigInt(1);
    pointPrecomputes = /* @__PURE__ */ new WeakMap();
    pointWindowSizes = /* @__PURE__ */ new WeakMap();
    wNAF = class {
      // Parametrized with a given Point class (not individual point)
      constructor(Point, bits) {
        this.BASE = Point.BASE;
        this.ZERO = Point.ZERO;
        this.Fn = Point.Fn;
        this.bits = bits;
      }
      // non-const time multiplication ladder
      _unsafeLadder(elm, n, p = this.ZERO) {
        let d = elm;
        while (n > _0n3) {
          if (n & _1n3)
            p = p.add(d);
          d = d.double();
          n >>= _1n3;
        }
        return p;
      }
      /**
       * Creates a wNAF precomputation window. Used for caching.
       * Default window size is set by `utils.precompute()` and is equal to 8.
       * Number of precomputed points depends on the curve size:
       * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
       * - 𝑊 is the window size
       * - 𝑛 is the bitlength of the curve order.
       * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
       * @param point Point instance
       * @param W window size
       * @returns precomputed point tables flattened to a single array
       */
      precomputeWindow(point, W) {
        const { windows, windowSize } = calcWOpts(W, this.bits);
        const points = [];
        let p = point;
        let base = p;
        for (let window = 0; window < windows; window++) {
          base = p;
          points.push(base);
          for (let i = 1; i < windowSize; i++) {
            base = base.add(p);
            points.push(base);
          }
          p = base.double();
        }
        return points;
      }
      /**
       * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
       * More compact implementation:
       * https://github.com/paulmillr/noble-secp256k1/blob/47cb1669b6e506ad66b35fe7d76132ae97465da2/index.ts#L502-L541
       * @returns real and fake (for const-time) points
       */
      wNAF(W, precomputes, n) {
        if (!this.Fn.isValid(n))
          throw new Error("invalid scalar");
        let p = this.ZERO;
        let f = this.BASE;
        const wo = calcWOpts(W, this.bits);
        for (let window = 0; window < wo.windows; window++) {
          const { nextN, offset, isZero, isNeg, isNegF, offsetF } = calcOffsets(n, window, wo);
          n = nextN;
          if (isZero) {
            f = f.add(negateCt(isNegF, precomputes[offsetF]));
          } else {
            p = p.add(negateCt(isNeg, precomputes[offset]));
          }
        }
        assert0(n);
        return { p, f };
      }
      /**
       * Implements ec unsafe (non const-time) multiplication using precomputed tables and w-ary non-adjacent form.
       * @param acc accumulator point to add result of multiplication
       * @returns point
       */
      wNAFUnsafe(W, precomputes, n, acc = this.ZERO) {
        const wo = calcWOpts(W, this.bits);
        for (let window = 0; window < wo.windows; window++) {
          if (n === _0n3)
            break;
          const { nextN, offset, isZero, isNeg } = calcOffsets(n, window, wo);
          n = nextN;
          if (isZero) {
            continue;
          } else {
            const item = precomputes[offset];
            acc = acc.add(isNeg ? item.negate() : item);
          }
        }
        assert0(n);
        return acc;
      }
      getPrecomputes(W, point, transform) {
        let comp = pointPrecomputes.get(point);
        if (!comp) {
          comp = this.precomputeWindow(point, W);
          if (W !== 1) {
            if (typeof transform === "function")
              comp = transform(comp);
            pointPrecomputes.set(point, comp);
          }
        }
        return comp;
      }
      cached(point, scalar, transform) {
        const W = getW(point);
        return this.wNAF(W, this.getPrecomputes(W, point, transform), scalar);
      }
      unsafe(point, scalar, transform, prev) {
        const W = getW(point);
        if (W === 1)
          return this._unsafeLadder(point, scalar, prev);
        return this.wNAFUnsafe(W, this.getPrecomputes(W, point, transform), scalar, prev);
      }
      // We calculate precomputes for elliptic curve point multiplication
      // using windowed method. This specifies window size and
      // stores precomputed values. Usually only base point would be precomputed.
      createCache(P2, W) {
        validateW(W, this.bits);
        pointWindowSizes.set(P2, W);
        pointPrecomputes.delete(P2);
      }
      hasCache(elm) {
        return getW(elm) !== 1;
      }
    };
  }
});

// node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/abstract/edwards.js
function isEdValidXY(Fp2, CURVE, x, y) {
  const x2 = Fp2.sqr(x);
  const y2 = Fp2.sqr(y);
  const left = Fp2.add(Fp2.mul(CURVE.a, x2), y2);
  const right = Fp2.add(Fp2.ONE, Fp2.mul(CURVE.d, Fp2.mul(x2, y2)));
  return Fp2.eql(left, right);
}
function edwards(params, extraOpts = {}) {
  const validated = _createCurveFields("edwards", params, extraOpts, extraOpts.FpFnLE);
  const { Fp: Fp2, Fn: Fn2 } = validated;
  let CURVE = validated.CURVE;
  const { h: cofactor } = CURVE;
  _validateObject(extraOpts, {}, { uvRatio: "function" });
  const MASK = _2n2 << BigInt(Fn2.BYTES * 8) - _1n4;
  const modP = (n) => Fp2.create(n);
  const uvRatio2 = extraOpts.uvRatio || ((u, v) => {
    try {
      return { isValid: true, value: Fp2.sqrt(Fp2.div(u, v)) };
    } catch (e) {
      return { isValid: false, value: _0n4 };
    }
  });
  if (!isEdValidXY(Fp2, CURVE, CURVE.Gx, CURVE.Gy))
    throw new Error("bad curve params: generator point");
  function acoord(title, n, banZero = false) {
    const min = banZero ? _1n4 : _0n4;
    aInRange("coordinate " + title, n, min, MASK);
    return n;
  }
  function aextpoint(other) {
    if (!(other instanceof Point))
      throw new Error("ExtendedPoint expected");
  }
  const toAffineMemo = memoized((p, iz) => {
    const { X, Y, Z } = p;
    const is0 = p.is0();
    if (iz == null)
      iz = is0 ? _8n2 : Fp2.inv(Z);
    const x = modP(X * iz);
    const y = modP(Y * iz);
    const zz = Fp2.mul(Z, iz);
    if (is0)
      return { x: _0n4, y: _1n4 };
    if (zz !== _1n4)
      throw new Error("invZ was invalid");
    return { x, y };
  });
  const assertValidMemo = memoized((p) => {
    const { a, d } = CURVE;
    if (p.is0())
      throw new Error("bad point: ZERO");
    const { X, Y, Z, T } = p;
    const X2 = modP(X * X);
    const Y2 = modP(Y * Y);
    const Z2 = modP(Z * Z);
    const Z4 = modP(Z2 * Z2);
    const aX2 = modP(X2 * a);
    const left = modP(Z2 * modP(aX2 + Y2));
    const right = modP(Z4 + modP(d * modP(X2 * Y2)));
    if (left !== right)
      throw new Error("bad point: equation left != right (1)");
    const XY = modP(X * Y);
    const ZT = modP(Z * T);
    if (XY !== ZT)
      throw new Error("bad point: equation left != right (2)");
    return true;
  });
  class Point {
    constructor(X, Y, Z, T) {
      this.X = acoord("x", X);
      this.Y = acoord("y", Y);
      this.Z = acoord("z", Z, true);
      this.T = acoord("t", T);
      Object.freeze(this);
    }
    static CURVE() {
      return CURVE;
    }
    static fromAffine(p) {
      if (p instanceof Point)
        throw new Error("extended point not allowed");
      const { x, y } = p || {};
      acoord("x", x);
      acoord("y", y);
      return new Point(x, y, _1n4, modP(x * y));
    }
    // Uses algo from RFC8032 5.1.3.
    static fromBytes(bytes, zip215 = false) {
      const len = Fp2.BYTES;
      const { a, d } = CURVE;
      bytes = copyBytes(_abytes2(bytes, len, "point"));
      _abool2(zip215, "zip215");
      const normed = copyBytes(bytes);
      const lastByte = bytes[len - 1];
      normed[len - 1] = lastByte & ~128;
      const y = bytesToNumberLE(normed);
      const max = zip215 ? MASK : Fp2.ORDER;
      aInRange("point.y", y, _0n4, max);
      const y2 = modP(y * y);
      const u = modP(y2 - _1n4);
      const v = modP(d * y2 - a);
      let { isValid, value: x } = uvRatio2(u, v);
      if (!isValid)
        throw new Error("bad point: invalid y coordinate");
      const isXOdd = (x & _1n4) === _1n4;
      const isLastByteOdd = (lastByte & 128) !== 0;
      if (!zip215 && x === _0n4 && isLastByteOdd)
        throw new Error("bad point: x=0 and x_0=1");
      if (isLastByteOdd !== isXOdd)
        x = modP(-x);
      return Point.fromAffine({ x, y });
    }
    static fromHex(bytes, zip215 = false) {
      return Point.fromBytes(ensureBytes("point", bytes), zip215);
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    precompute(windowSize = 8, isLazy = true) {
      wnaf.createCache(this, windowSize);
      if (!isLazy)
        this.multiply(_2n2);
      return this;
    }
    // Useful in fromAffine() - not for fromBytes(), which always created valid points.
    assertValidity() {
      assertValidMemo(this);
    }
    // Compare one point to another.
    equals(other) {
      aextpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      const X1Z2 = modP(X1 * Z2);
      const X2Z1 = modP(X2 * Z1);
      const Y1Z2 = modP(Y1 * Z2);
      const Y2Z1 = modP(Y2 * Z1);
      return X1Z2 === X2Z1 && Y1Z2 === Y2Z1;
    }
    is0() {
      return this.equals(Point.ZERO);
    }
    negate() {
      return new Point(modP(-this.X), this.Y, this.Z, modP(-this.T));
    }
    // Fast algo for doubling Extended Point.
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#doubling-dbl-2008-hwcd
    // Cost: 4M + 4S + 1*a + 6add + 1*2.
    double() {
      const { a } = CURVE;
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const A = modP(X1 * X1);
      const B = modP(Y1 * Y1);
      const C = modP(_2n2 * modP(Z1 * Z1));
      const D = modP(a * A);
      const x1y1 = X1 + Y1;
      const E = modP(modP(x1y1 * x1y1) - A - B);
      const G2 = D + B;
      const F = G2 - C;
      const H = D - B;
      const X3 = modP(E * F);
      const Y3 = modP(G2 * H);
      const T3 = modP(E * H);
      const Z3 = modP(F * G2);
      return new Point(X3, Y3, Z3, T3);
    }
    // Fast algo for adding 2 Extended Points.
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#addition-add-2008-hwcd
    // Cost: 9M + 1*a + 1*d + 7add.
    add(other) {
      aextpoint(other);
      const { a, d } = CURVE;
      const { X: X1, Y: Y1, Z: Z1, T: T1 } = this;
      const { X: X2, Y: Y2, Z: Z2, T: T2 } = other;
      const A = modP(X1 * X2);
      const B = modP(Y1 * Y2);
      const C = modP(T1 * d * T2);
      const D = modP(Z1 * Z2);
      const E = modP((X1 + Y1) * (X2 + Y2) - A - B);
      const F = D - C;
      const G2 = D + C;
      const H = modP(B - a * A);
      const X3 = modP(E * F);
      const Y3 = modP(G2 * H);
      const T3 = modP(E * H);
      const Z3 = modP(F * G2);
      return new Point(X3, Y3, Z3, T3);
    }
    subtract(other) {
      return this.add(other.negate());
    }
    // Constant-time multiplication.
    multiply(scalar) {
      if (!Fn2.isValidNot0(scalar))
        throw new Error("invalid scalar: expected 1 <= sc < curve.n");
      const { p, f } = wnaf.cached(this, scalar, (p2) => normalizeZ(Point, p2));
      return normalizeZ(Point, [p, f])[0];
    }
    // Non-constant-time multiplication. Uses double-and-add algorithm.
    // It's faster, but should only be used when you don't care about
    // an exposed private key e.g. sig verification.
    // Does NOT allow scalars higher than CURVE.n.
    // Accepts optional accumulator to merge with multiply (important for sparse scalars)
    multiplyUnsafe(scalar, acc = Point.ZERO) {
      if (!Fn2.isValid(scalar))
        throw new Error("invalid scalar: expected 0 <= sc < curve.n");
      if (scalar === _0n4)
        return Point.ZERO;
      if (this.is0() || scalar === _1n4)
        return this;
      return wnaf.unsafe(this, scalar, (p) => normalizeZ(Point, p), acc);
    }
    // Checks if point is of small order.
    // If you add something to small order point, you will have "dirty"
    // point with torsion component.
    // Multiplies point by cofactor and checks if the result is 0.
    isSmallOrder() {
      return this.multiplyUnsafe(cofactor).is0();
    }
    // Multiplies point by curve order and checks if the result is 0.
    // Returns `false` is the point is dirty.
    isTorsionFree() {
      return wnaf.unsafe(this, CURVE.n).is0();
    }
    // Converts Extended point to default (x, y) coordinates.
    // Can accept precomputed Z^-1 - for example, from invertBatch.
    toAffine(invertedZ) {
      return toAffineMemo(this, invertedZ);
    }
    clearCofactor() {
      if (cofactor === _1n4)
        return this;
      return this.multiplyUnsafe(cofactor);
    }
    toBytes() {
      const { x, y } = this.toAffine();
      const bytes = Fp2.toBytes(y);
      bytes[bytes.length - 1] |= x & _1n4 ? 128 : 0;
      return bytes;
    }
    toHex() {
      return bytesToHex(this.toBytes());
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
    // TODO: remove
    get ex() {
      return this.X;
    }
    get ey() {
      return this.Y;
    }
    get ez() {
      return this.Z;
    }
    get et() {
      return this.T;
    }
    static normalizeZ(points) {
      return normalizeZ(Point, points);
    }
    static msm(points, scalars) {
      return pippenger(Point, Fn2, points, scalars);
    }
    _setWindowSize(windowSize) {
      this.precompute(windowSize);
    }
    toRawBytes() {
      return this.toBytes();
    }
  }
  Point.BASE = new Point(CURVE.Gx, CURVE.Gy, _1n4, modP(CURVE.Gx * CURVE.Gy));
  Point.ZERO = new Point(_0n4, _1n4, _1n4, _0n4);
  Point.Fp = Fp2;
  Point.Fn = Fn2;
  const wnaf = new wNAF(Point, Fn2.BITS);
  Point.BASE.precompute(8);
  return Point;
}
function eddsa(Point, cHash, eddsaOpts = {}) {
  if (typeof cHash !== "function")
    throw new Error('"hash" function param is required');
  _validateObject(eddsaOpts, {}, {
    adjustScalarBytes: "function",
    randomBytes: "function",
    domain: "function",
    prehash: "function",
    mapToCurve: "function"
  });
  const { prehash } = eddsaOpts;
  const { BASE, Fp: Fp2, Fn: Fn2 } = Point;
  const randomBytes3 = eddsaOpts.randomBytes || randomBytes;
  const adjustScalarBytes2 = eddsaOpts.adjustScalarBytes || ((bytes) => bytes);
  const domain = eddsaOpts.domain || ((data, ctx, phflag) => {
    _abool2(phflag, "phflag");
    if (ctx.length || phflag)
      throw new Error("Contexts/pre-hash are not supported");
    return data;
  });
  function modN_LE(hash) {
    return Fn2.create(bytesToNumberLE(hash));
  }
  function getPrivateScalar(key) {
    const len = lengths.secretKey;
    key = ensureBytes("private key", key, len);
    const hashed = ensureBytes("hashed private key", cHash(key), 2 * len);
    const head = adjustScalarBytes2(hashed.slice(0, len));
    const prefix = hashed.slice(len, 2 * len);
    const scalar = modN_LE(head);
    return { head, prefix, scalar };
  }
  function getExtendedPublicKey(secretKey) {
    const { head, prefix, scalar } = getPrivateScalar(secretKey);
    const point = BASE.multiply(scalar);
    const pointBytes = point.toBytes();
    return { head, prefix, scalar, point, pointBytes };
  }
  function getPublicKey(secretKey) {
    return getExtendedPublicKey(secretKey).pointBytes;
  }
  function hashDomainToScalar(context = Uint8Array.of(), ...msgs) {
    const msg = concatBytes(...msgs);
    return modN_LE(cHash(domain(msg, ensureBytes("context", context), !!prehash)));
  }
  function sign(msg, secretKey, options = {}) {
    msg = ensureBytes("message", msg);
    if (prehash)
      msg = prehash(msg);
    const { prefix, scalar, pointBytes } = getExtendedPublicKey(secretKey);
    const r = hashDomainToScalar(options.context, prefix, msg);
    const R = BASE.multiply(r).toBytes();
    const k = hashDomainToScalar(options.context, R, pointBytes, msg);
    const s = Fn2.create(r + k * scalar);
    if (!Fn2.isValid(s))
      throw new Error("sign failed: invalid s");
    const rs = concatBytes(R, Fn2.toBytes(s));
    return _abytes2(rs, lengths.signature, "result");
  }
  const verifyOpts = { zip215: true };
  function verify(sig, msg, publicKey, options = verifyOpts) {
    const { context, zip215 } = options;
    const len = lengths.signature;
    sig = ensureBytes("signature", sig, len);
    msg = ensureBytes("message", msg);
    publicKey = ensureBytes("publicKey", publicKey, lengths.publicKey);
    if (zip215 !== void 0)
      _abool2(zip215, "zip215");
    if (prehash)
      msg = prehash(msg);
    const mid = len / 2;
    const r = sig.subarray(0, mid);
    const s = bytesToNumberLE(sig.subarray(mid, len));
    let A, R, SB;
    try {
      A = Point.fromBytes(publicKey, zip215);
      R = Point.fromBytes(r, zip215);
      SB = BASE.multiplyUnsafe(s);
    } catch (error) {
      return false;
    }
    if (!zip215 && A.isSmallOrder())
      return false;
    const k = hashDomainToScalar(context, R.toBytes(), A.toBytes(), msg);
    const RkA = R.add(A.multiplyUnsafe(k));
    return RkA.subtract(SB).clearCofactor().is0();
  }
  const _size = Fp2.BYTES;
  const lengths = {
    secretKey: _size,
    publicKey: _size,
    signature: 2 * _size,
    seed: _size
  };
  function randomSecretKey(seed = randomBytes3(lengths.seed)) {
    return _abytes2(seed, lengths.seed, "seed");
  }
  function keygen(seed) {
    const secretKey = utils2.randomSecretKey(seed);
    return { secretKey, publicKey: getPublicKey(secretKey) };
  }
  function isValidSecretKey(key) {
    return isBytes(key) && key.length === Fn2.BYTES;
  }
  function isValidPublicKey(key, zip215) {
    try {
      return !!Point.fromBytes(key, zip215);
    } catch (error) {
      return false;
    }
  }
  const utils2 = {
    getExtendedPublicKey,
    randomSecretKey,
    isValidSecretKey,
    isValidPublicKey,
    /**
     * Converts ed public key to x public key. Uses formula:
     * - ed25519:
     *   - `(u, v) = ((1+y)/(1-y), sqrt(-486664)*u/x)`
     *   - `(x, y) = (sqrt(-486664)*u/v, (u-1)/(u+1))`
     * - ed448:
     *   - `(u, v) = ((y-1)/(y+1), sqrt(156324)*u/x)`
     *   - `(x, y) = (sqrt(156324)*u/v, (1+u)/(1-u))`
     */
    toMontgomery(publicKey) {
      const { y } = Point.fromBytes(publicKey);
      const size = lengths.publicKey;
      const is25519 = size === 32;
      if (!is25519 && size !== 57)
        throw new Error("only defined for 25519 and 448");
      const u = is25519 ? Fp2.div(_1n4 + y, _1n4 - y) : Fp2.div(y - _1n4, y + _1n4);
      return Fp2.toBytes(u);
    },
    toMontgomerySecret(secretKey) {
      const size = lengths.secretKey;
      _abytes2(secretKey, size);
      const hashed = cHash(secretKey.subarray(0, size));
      return adjustScalarBytes2(hashed).subarray(0, size);
    },
    /** @deprecated */
    randomPrivateKey: randomSecretKey,
    /** @deprecated */
    precompute(windowSize = 8, point = Point.BASE) {
      return point.precompute(windowSize, false);
    }
  };
  return Object.freeze({
    keygen,
    getPublicKey,
    sign,
    verify,
    utils: utils2,
    Point,
    lengths
  });
}
function _eddsa_legacy_opts_to_new(c) {
  const CURVE = {
    a: c.a,
    d: c.d,
    p: c.Fp.ORDER,
    n: c.n,
    h: c.h,
    Gx: c.Gx,
    Gy: c.Gy
  };
  const Fp2 = c.Fp;
  const Fn2 = Field(CURVE.n, c.nBitLength, true);
  const curveOpts = { Fp: Fp2, Fn: Fn2, uvRatio: c.uvRatio };
  const eddsaOpts = {
    randomBytes: c.randomBytes,
    adjustScalarBytes: c.adjustScalarBytes,
    domain: c.domain,
    prehash: c.prehash,
    mapToCurve: c.mapToCurve
  };
  return { CURVE, curveOpts, hash: c.hash, eddsaOpts };
}
function _eddsa_new_output_to_legacy(c, eddsa2) {
  const Point = eddsa2.Point;
  const legacy = Object.assign({}, eddsa2, {
    ExtendedPoint: Point,
    CURVE: c,
    nBitLength: Point.Fn.BITS,
    nByteLength: Point.Fn.BYTES
  });
  return legacy;
}
function twistedEdwards(c) {
  const { CURVE, curveOpts, hash, eddsaOpts } = _eddsa_legacy_opts_to_new(c);
  const Point = edwards(CURVE, curveOpts);
  const EDDSA = eddsa(Point, hash, eddsaOpts);
  return _eddsa_new_output_to_legacy(c, EDDSA);
}
var _0n4, _1n4, _2n2, _8n2, PrimeEdwardsPoint;
var init_edwards = __esm({
  "node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/abstract/edwards.js"() {
    init_utils2();
    init_curve();
    init_modular();
    _0n4 = BigInt(0);
    _1n4 = BigInt(1);
    _2n2 = BigInt(2);
    _8n2 = BigInt(8);
    PrimeEdwardsPoint = class {
      constructor(ep) {
        this.ep = ep;
      }
      // Static methods that must be implemented by subclasses
      static fromBytes(_bytes) {
        notImplemented();
      }
      static fromHex(_hex) {
        notImplemented();
      }
      get x() {
        return this.toAffine().x;
      }
      get y() {
        return this.toAffine().y;
      }
      // Common implementations
      clearCofactor() {
        return this;
      }
      assertValidity() {
        this.ep.assertValidity();
      }
      toAffine(invertedZ) {
        return this.ep.toAffine(invertedZ);
      }
      toHex() {
        return bytesToHex(this.toBytes());
      }
      toString() {
        return this.toHex();
      }
      isTorsionFree() {
        return true;
      }
      isSmallOrder() {
        return false;
      }
      add(other) {
        this.assertSame(other);
        return this.init(this.ep.add(other.ep));
      }
      subtract(other) {
        this.assertSame(other);
        return this.init(this.ep.subtract(other.ep));
      }
      multiply(scalar) {
        return this.init(this.ep.multiply(scalar));
      }
      multiplyUnsafe(scalar) {
        return this.init(this.ep.multiplyUnsafe(scalar));
      }
      double() {
        return this.init(this.ep.double());
      }
      negate() {
        return this.init(this.ep.negate());
      }
      precompute(windowSize, isLazy) {
        return this.init(this.ep.precompute(windowSize, isLazy));
      }
      /** @deprecated use `toBytes` */
      toRawBytes() {
        return this.toBytes();
      }
    };
  }
});

// node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/abstract/montgomery.js
function validateOpts(curve) {
  _validateObject(curve, {
    adjustScalarBytes: "function",
    powPminus2: "function"
  });
  return Object.freeze({ ...curve });
}
function montgomery(curveDef) {
  const CURVE = validateOpts(curveDef);
  const { P: P2, type, adjustScalarBytes: adjustScalarBytes2, powPminus2, randomBytes: rand } = CURVE;
  const is25519 = type === "x25519";
  if (!is25519 && type !== "x448")
    throw new Error("invalid type");
  const randomBytes_ = rand || randomBytes;
  const montgomeryBits = is25519 ? 255 : 448;
  const fieldLen = is25519 ? 32 : 56;
  const Gu = is25519 ? BigInt(9) : BigInt(5);
  const a24 = is25519 ? BigInt(121665) : BigInt(39081);
  const minScalar = is25519 ? _2n3 ** BigInt(254) : _2n3 ** BigInt(447);
  const maxAdded = is25519 ? BigInt(8) * _2n3 ** BigInt(251) - _1n5 : BigInt(4) * _2n3 ** BigInt(445) - _1n5;
  const maxScalar = minScalar + maxAdded + _1n5;
  const modP = (n) => mod(n, P2);
  const GuBytes = encodeU(Gu);
  function encodeU(u) {
    return numberToBytesLE(modP(u), fieldLen);
  }
  function decodeU(u) {
    const _u = ensureBytes("u coordinate", u, fieldLen);
    if (is25519)
      _u[31] &= 127;
    return modP(bytesToNumberLE(_u));
  }
  function decodeScalar(scalar) {
    return bytesToNumberLE(adjustScalarBytes2(ensureBytes("scalar", scalar, fieldLen)));
  }
  function scalarMult(scalar, u) {
    const pu = montgomeryLadder(decodeU(u), decodeScalar(scalar));
    if (pu === _0n5)
      throw new Error("invalid private or public key received");
    return encodeU(pu);
  }
  function scalarMultBase(scalar) {
    return scalarMult(scalar, GuBytes);
  }
  function cswap(swap, x_2, x_3) {
    const dummy = modP(swap * (x_2 - x_3));
    x_2 = modP(x_2 - dummy);
    x_3 = modP(x_3 + dummy);
    return { x_2, x_3 };
  }
  function montgomeryLadder(u, scalar) {
    aInRange("u", u, _0n5, P2);
    aInRange("scalar", scalar, minScalar, maxScalar);
    const k = scalar;
    const x_1 = u;
    let x_2 = _1n5;
    let z_2 = _0n5;
    let x_3 = u;
    let z_3 = _1n5;
    let swap = _0n5;
    for (let t = BigInt(montgomeryBits - 1); t >= _0n5; t--) {
      const k_t = k >> t & _1n5;
      swap ^= k_t;
      ({ x_2, x_3 } = cswap(swap, x_2, x_3));
      ({ x_2: z_2, x_3: z_3 } = cswap(swap, z_2, z_3));
      swap = k_t;
      const A = x_2 + z_2;
      const AA = modP(A * A);
      const B = x_2 - z_2;
      const BB = modP(B * B);
      const E = AA - BB;
      const C = x_3 + z_3;
      const D = x_3 - z_3;
      const DA = modP(D * A);
      const CB = modP(C * B);
      const dacb = DA + CB;
      const da_cb = DA - CB;
      x_3 = modP(dacb * dacb);
      z_3 = modP(x_1 * modP(da_cb * da_cb));
      x_2 = modP(AA * BB);
      z_2 = modP(E * (AA + modP(a24 * E)));
    }
    ({ x_2, x_3 } = cswap(swap, x_2, x_3));
    ({ x_2: z_2, x_3: z_3 } = cswap(swap, z_2, z_3));
    const z2 = powPminus2(z_2);
    return modP(x_2 * z2);
  }
  const lengths = {
    secretKey: fieldLen,
    publicKey: fieldLen,
    seed: fieldLen
  };
  const randomSecretKey = (seed = randomBytes_(fieldLen)) => {
    abytes(seed, lengths.seed);
    return seed;
  };
  function keygen(seed) {
    const secretKey = randomSecretKey(seed);
    return { secretKey, publicKey: scalarMultBase(secretKey) };
  }
  const utils2 = {
    randomSecretKey,
    randomPrivateKey: randomSecretKey
  };
  return {
    keygen,
    getSharedSecret: (secretKey, publicKey) => scalarMult(secretKey, publicKey),
    getPublicKey: (secretKey) => scalarMultBase(secretKey),
    scalarMult,
    scalarMultBase,
    utils: utils2,
    GuBytes: GuBytes.slice(),
    lengths
  };
}
var _0n5, _1n5, _2n3;
var init_montgomery = __esm({
  "node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/abstract/montgomery.js"() {
    init_utils2();
    init_modular();
    _0n5 = BigInt(0);
    _1n5 = BigInt(1);
    _2n3 = BigInt(2);
  }
});

// node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/ed25519.js
function ed25519_pow_2_252_3(x) {
  const _10n = BigInt(10), _20n = BigInt(20), _40n = BigInt(40), _80n = BigInt(80);
  const P2 = ed25519_CURVE_p;
  const x2 = x * x % P2;
  const b2 = x2 * x % P2;
  const b4 = pow2(b2, _2n4, P2) * b2 % P2;
  const b5 = pow2(b4, _1n6, P2) * x % P2;
  const b10 = pow2(b5, _5n2, P2) * b5 % P2;
  const b20 = pow2(b10, _10n, P2) * b10 % P2;
  const b40 = pow2(b20, _20n, P2) * b20 % P2;
  const b80 = pow2(b40, _40n, P2) * b40 % P2;
  const b160 = pow2(b80, _80n, P2) * b80 % P2;
  const b240 = pow2(b160, _80n, P2) * b80 % P2;
  const b250 = pow2(b240, _10n, P2) * b10 % P2;
  const pow_p_5_8 = pow2(b250, _2n4, P2) * x % P2;
  return { pow_p_5_8, b2 };
}
function adjustScalarBytes(bytes) {
  bytes[0] &= 248;
  bytes[31] &= 127;
  bytes[31] |= 64;
  return bytes;
}
function uvRatio(u, v) {
  const P2 = ed25519_CURVE_p;
  const v3 = mod(v * v * v, P2);
  const v7 = mod(v3 * v3 * v, P2);
  const pow = ed25519_pow_2_252_3(u * v7).pow_p_5_8;
  let x = mod(u * v3 * pow, P2);
  const vx2 = mod(v * x * x, P2);
  const root1 = x;
  const root2 = mod(x * ED25519_SQRT_M1, P2);
  const useRoot1 = vx2 === u;
  const useRoot2 = vx2 === mod(-u, P2);
  const noRoot = vx2 === mod(-u * ED25519_SQRT_M1, P2);
  if (useRoot1)
    x = root1;
  if (useRoot2 || noRoot)
    x = root2;
  if (isNegativeLE(x, P2))
    x = mod(-x, P2);
  return { isValid: useRoot1 || useRoot2, value: x };
}
function calcElligatorRistrettoMap(r0) {
  const { d } = ed25519_CURVE;
  const P2 = ed25519_CURVE_p;
  const mod2 = (n) => Fp.create(n);
  const r = mod2(SQRT_M1 * r0 * r0);
  const Ns = mod2((r + _1n6) * ONE_MINUS_D_SQ);
  let c = BigInt(-1);
  const D = mod2((c - d * r) * mod2(r + d));
  let { isValid: Ns_D_is_sq, value: s } = uvRatio(Ns, D);
  let s_ = mod2(s * r0);
  if (!isNegativeLE(s_, P2))
    s_ = mod2(-s_);
  if (!Ns_D_is_sq)
    s = s_;
  if (!Ns_D_is_sq)
    c = r;
  const Nt = mod2(c * (r - _1n6) * D_MINUS_ONE_SQ - D);
  const s2 = s * s;
  const W0 = mod2((s + s) * D);
  const W1 = mod2(Nt * SQRT_AD_MINUS_ONE);
  const W2 = mod2(_1n6 - s2);
  const W3 = mod2(_1n6 + s2);
  return new ed25519.Point(mod2(W0 * W3), mod2(W2 * W1), mod2(W1 * W3), mod2(W0 * W2));
}
function ristretto255_map(bytes) {
  abytes(bytes, 64);
  const r1 = bytes255ToNumberLE(bytes.subarray(0, 32));
  const R1 = calcElligatorRistrettoMap(r1);
  const r2 = bytes255ToNumberLE(bytes.subarray(32, 64));
  const R2 = calcElligatorRistrettoMap(r2);
  return new _RistrettoPoint(R1.add(R2));
}
var _0n6, _1n6, _2n4, _3n2, _5n2, _8n3, ed25519_CURVE_p, ed25519_CURVE, ED25519_SQRT_M1, Fp, Fn, ed25519Defaults, ed25519, x25519, SQRT_M1, SQRT_AD_MINUS_ONE, INVSQRT_A_MINUS_D, ONE_MINUS_D_SQ, D_MINUS_ONE_SQ, invertSqrt, MAX_255B, bytes255ToNumberLE, _RistrettoPoint;
var init_ed25519 = __esm({
  "node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/ed25519.js"() {
    init_sha2();
    init_utils();
    init_curve();
    init_edwards();
    init_modular();
    init_montgomery();
    init_utils2();
    _0n6 = /* @__PURE__ */ BigInt(0);
    _1n6 = BigInt(1);
    _2n4 = BigInt(2);
    _3n2 = BigInt(3);
    _5n2 = BigInt(5);
    _8n3 = BigInt(8);
    ed25519_CURVE_p = BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed");
    ed25519_CURVE = /* @__PURE__ */ (() => ({
      p: ed25519_CURVE_p,
      n: BigInt("0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed"),
      h: _8n3,
      a: BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffec"),
      d: BigInt("0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3"),
      Gx: BigInt("0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a"),
      Gy: BigInt("0x6666666666666666666666666666666666666666666666666666666666666658")
    }))();
    ED25519_SQRT_M1 = /* @__PURE__ */ BigInt("19681161376707505956807079304988542015446066515923890162744021073123829784752");
    Fp = /* @__PURE__ */ (() => Field(ed25519_CURVE.p, { isLE: true }))();
    Fn = /* @__PURE__ */ (() => Field(ed25519_CURVE.n, { isLE: true }))();
    ed25519Defaults = /* @__PURE__ */ (() => ({
      ...ed25519_CURVE,
      Fp,
      hash: sha512,
      adjustScalarBytes,
      // dom2
      // Ratio of u to v. Allows us to combine inversion and square root. Uses algo from RFC8032 5.1.3.
      // Constant-time, u/√v
      uvRatio
    }))();
    ed25519 = /* @__PURE__ */ (() => twistedEdwards(ed25519Defaults))();
    x25519 = /* @__PURE__ */ (() => {
      const P2 = Fp.ORDER;
      return montgomery({
        P: P2,
        type: "x25519",
        powPminus2: (x) => {
          const { pow_p_5_8, b2 } = ed25519_pow_2_252_3(x);
          return mod(pow2(pow_p_5_8, _3n2, P2) * b2, P2);
        },
        adjustScalarBytes
      });
    })();
    SQRT_M1 = ED25519_SQRT_M1;
    SQRT_AD_MINUS_ONE = /* @__PURE__ */ BigInt("25063068953384623474111414158702152701244531502492656460079210482610430750235");
    INVSQRT_A_MINUS_D = /* @__PURE__ */ BigInt("54469307008909316920995813868745141605393597292927456921205312896311721017578");
    ONE_MINUS_D_SQ = /* @__PURE__ */ BigInt("1159843021668779879193775521855586647937357759715417654439879720876111806838");
    D_MINUS_ONE_SQ = /* @__PURE__ */ BigInt("40440834346308536858101042469323190826248399146238708352240133220865137265952");
    invertSqrt = (number) => uvRatio(_1n6, number);
    MAX_255B = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    bytes255ToNumberLE = (bytes) => ed25519.Point.Fp.create(bytesToNumberLE(bytes) & MAX_255B);
    _RistrettoPoint = class __RistrettoPoint extends PrimeEdwardsPoint {
      constructor(ep) {
        super(ep);
      }
      static fromAffine(ap) {
        return new __RistrettoPoint(ed25519.Point.fromAffine(ap));
      }
      assertSame(other) {
        if (!(other instanceof __RistrettoPoint))
          throw new Error("RistrettoPoint expected");
      }
      init(ep) {
        return new __RistrettoPoint(ep);
      }
      /** @deprecated use `import { ristretto255_hasher } from '@noble/curves/ed25519.js';` */
      static hashToCurve(hex) {
        return ristretto255_map(ensureBytes("ristrettoHash", hex, 64));
      }
      static fromBytes(bytes) {
        abytes(bytes, 32);
        const { a, d } = ed25519_CURVE;
        const P2 = ed25519_CURVE_p;
        const mod2 = (n) => Fp.create(n);
        const s = bytes255ToNumberLE(bytes);
        if (!equalBytes(Fp.toBytes(s), bytes) || isNegativeLE(s, P2))
          throw new Error("invalid ristretto255 encoding 1");
        const s2 = mod2(s * s);
        const u1 = mod2(_1n6 + a * s2);
        const u2 = mod2(_1n6 - a * s2);
        const u1_2 = mod2(u1 * u1);
        const u2_2 = mod2(u2 * u2);
        const v = mod2(a * d * u1_2 - u2_2);
        const { isValid, value: I } = invertSqrt(mod2(v * u2_2));
        const Dx = mod2(I * u2);
        const Dy = mod2(I * Dx * v);
        let x = mod2((s + s) * Dx);
        if (isNegativeLE(x, P2))
          x = mod2(-x);
        const y = mod2(u1 * Dy);
        const t = mod2(x * y);
        if (!isValid || isNegativeLE(t, P2) || y === _0n6)
          throw new Error("invalid ristretto255 encoding 2");
        return new __RistrettoPoint(new ed25519.Point(x, y, _1n6, t));
      }
      /**
       * Converts ristretto-encoded string to ristretto point.
       * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-decode).
       * @param hex Ristretto-encoded 32 bytes. Not every 32-byte string is valid ristretto encoding
       */
      static fromHex(hex) {
        return __RistrettoPoint.fromBytes(ensureBytes("ristrettoHex", hex, 32));
      }
      static msm(points, scalars) {
        return pippenger(__RistrettoPoint, ed25519.Point.Fn, points, scalars);
      }
      /**
       * Encodes ristretto point to Uint8Array.
       * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-encode).
       */
      toBytes() {
        let { X, Y, Z, T } = this.ep;
        const P2 = ed25519_CURVE_p;
        const mod2 = (n) => Fp.create(n);
        const u1 = mod2(mod2(Z + Y) * mod2(Z - Y));
        const u2 = mod2(X * Y);
        const u2sq = mod2(u2 * u2);
        const { value: invsqrt } = invertSqrt(mod2(u1 * u2sq));
        const D1 = mod2(invsqrt * u1);
        const D2 = mod2(invsqrt * u2);
        const zInv = mod2(D1 * D2 * T);
        let D;
        if (isNegativeLE(T * zInv, P2)) {
          let _x = mod2(Y * SQRT_M1);
          let _y = mod2(X * SQRT_M1);
          X = _x;
          Y = _y;
          D = mod2(D1 * INVSQRT_A_MINUS_D);
        } else {
          D = D2;
        }
        if (isNegativeLE(X * zInv, P2))
          Y = mod2(-Y);
        let s = mod2((Z - Y) * D);
        if (isNegativeLE(s, P2))
          s = mod2(-s);
        return Fp.toBytes(s);
      }
      /**
       * Compares two Ristretto points.
       * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-equals).
       */
      equals(other) {
        this.assertSame(other);
        const { X: X1, Y: Y1 } = this.ep;
        const { X: X2, Y: Y2 } = other.ep;
        const mod2 = (n) => Fp.create(n);
        const one = mod2(X1 * Y2) === mod2(Y1 * X2);
        const two = mod2(Y1 * Y2) === mod2(X1 * X2);
        return one || two;
      }
      is0() {
        return this.equals(__RistrettoPoint.ZERO);
      }
    };
    _RistrettoPoint.BASE = /* @__PURE__ */ (() => new _RistrettoPoint(ed25519.Point.BASE))();
    _RistrettoPoint.ZERO = /* @__PURE__ */ (() => new _RistrettoPoint(ed25519.Point.ZERO))();
    _RistrettoPoint.Fp = /* @__PURE__ */ (() => Fp)();
    _RistrettoPoint.Fn = /* @__PURE__ */ (() => Fn)();
  }
});

// node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/hmac.js
var HMAC, hmac;
var init_hmac = __esm({
  "node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/hmac.js"() {
    init_utils();
    HMAC = class extends Hash {
      constructor(hash, _key) {
        super();
        this.finished = false;
        this.destroyed = false;
        ahash(hash);
        const key = toBytes(_key);
        this.iHash = hash.create();
        if (typeof this.iHash.update !== "function")
          throw new Error("Expected instance of class which extends utils.Hash");
        this.blockLen = this.iHash.blockLen;
        this.outputLen = this.iHash.outputLen;
        const blockLen = this.blockLen;
        const pad = new Uint8Array(blockLen);
        pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
        for (let i = 0; i < pad.length; i++)
          pad[i] ^= 54;
        this.iHash.update(pad);
        this.oHash = hash.create();
        for (let i = 0; i < pad.length; i++)
          pad[i] ^= 54 ^ 92;
        this.oHash.update(pad);
        clean(pad);
      }
      update(buf) {
        aexists(this);
        this.iHash.update(buf);
        return this;
      }
      digestInto(out) {
        aexists(this);
        abytes(out, this.outputLen);
        this.finished = true;
        this.iHash.digestInto(out);
        this.oHash.update(out);
        this.oHash.digestInto(out);
        this.destroy();
      }
      digest() {
        const out = new Uint8Array(this.oHash.outputLen);
        this.digestInto(out);
        return out;
      }
      _cloneInto(to) {
        to || (to = Object.create(Object.getPrototypeOf(this), {}));
        const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
        to = to;
        to.finished = finished;
        to.destroyed = destroyed;
        to.blockLen = blockLen;
        to.outputLen = outputLen;
        to.oHash = oHash._cloneInto(to.oHash);
        to.iHash = iHash._cloneInto(to.iHash);
        return to;
      }
      clone() {
        return this._cloneInto();
      }
      destroy() {
        this.destroyed = true;
        this.oHash.destroy();
        this.iHash.destroy();
      }
    };
    hmac = (hash, key, message) => new HMAC(hash, key).update(message).digest();
    hmac.create = (hash, key) => new HMAC(hash, key);
  }
});

// node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/hkdf.js
function extract(hash, ikm, salt) {
  ahash(hash);
  if (salt === void 0)
    salt = new Uint8Array(hash.outputLen);
  return hmac(hash, toBytes(salt), toBytes(ikm));
}
function expand(hash, prk, info, length = 32) {
  ahash(hash);
  anumber(length);
  const olen = hash.outputLen;
  if (length > 255 * olen)
    throw new Error("Length should be <= 255*HashLen");
  const blocks = Math.ceil(length / olen);
  if (info === void 0)
    info = EMPTY_BUFFER;
  const okm = new Uint8Array(blocks * olen);
  const HMAC2 = hmac.create(hash, prk);
  const HMACTmp = HMAC2._cloneInto();
  const T = new Uint8Array(HMAC2.outputLen);
  for (let counter = 0; counter < blocks; counter++) {
    HKDF_COUNTER[0] = counter + 1;
    HMACTmp.update(counter === 0 ? EMPTY_BUFFER : T).update(info).update(HKDF_COUNTER).digestInto(T);
    okm.set(T, olen * counter);
    HMAC2._cloneInto(HMACTmp);
  }
  HMAC2.destroy();
  HMACTmp.destroy();
  clean(T, HKDF_COUNTER);
  return okm.slice(0, length);
}
var HKDF_COUNTER, EMPTY_BUFFER, hkdf;
var init_hkdf = __esm({
  "node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/hkdf.js"() {
    init_hmac();
    init_utils();
    HKDF_COUNTER = /* @__PURE__ */ Uint8Array.from([0]);
    EMPTY_BUFFER = /* @__PURE__ */ Uint8Array.of();
    hkdf = (hash, ikm, salt, info, length) => expand(hash, extract(hash, ikm, salt), info, length);
  }
});

// packages/crypto-core/src/primitives.ts
function randomBytes2(n) {
  return randomBytes(n);
}
function sha2562(data) {
  return sha256(data);
}
function hkdfSha256(ikm, salt, info, length) {
  return hkdf(sha256, ikm, salt, info, length);
}
function ed25519Generate() {
  const privateKey = ed25519.utils.randomPrivateKey();
  return { privateKey, publicKey: ed25519.getPublicKey(privateKey) };
}
function ed25519PublicFromSeed(seed32) {
  if (seed32.length !== 32) throw new Error("ed25519 seed must be 32 bytes");
  return ed25519.getPublicKey(seed32);
}
function ed25519Sign(message, seed32) {
  if (seed32.length !== 32) throw new Error("ed25519 seed must be 32 bytes");
  return ed25519.sign(message, seed32);
}
function ed25519Verify(message, signature, publicKey32) {
  if (publicKey32.length !== 32 || signature.length !== 64) return false;
  try {
    return ed25519.verify(signature, message, publicKey32);
  } catch {
    return false;
  }
}
function x25519Generate() {
  const privateKey = x25519.utils.randomPrivateKey();
  return { privateKey, publicKey: x25519.getPublicKey(privateKey) };
}
function x25519PublicFromPrivate(private32) {
  if (private32.length !== 32) throw new Error("x25519 private must be 32 bytes");
  return x25519.getPublicKey(private32);
}
function x25519SharedSecret(privateKey32, peerPublicKey32) {
  return x25519.getSharedSecret(privateKey32, peerPublicKey32);
}
var init_primitives = __esm({
  "packages/crypto-core/src/primitives.ts"() {
    "use strict";
    init_ed25519();
    init_sha2();
    init_hkdf();
    init_utils();
  }
});

// node_modules/.pnpm/@noble+ciphers@1.3.0/node_modules/@noble/ciphers/esm/utils.js
function isBytes2(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function abool(b) {
  if (typeof b !== "boolean")
    throw new Error(`boolean expected, not ${b}`);
}
function anumber2(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("positive integer expected, got " + n);
}
function abytes2(b, ...lengths) {
  if (!isBytes2(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function aexists2(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput2(out, instance) {
  abytes2(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function u322(arr) {
  return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
function clean2(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView2(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function utf8ToBytes3(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes2(data) {
  if (typeof data === "string")
    data = utf8ToBytes3(data);
  else if (isBytes2(data))
    data = copyBytes2(data);
  else
    throw new Error("Uint8Array expected, got " + typeof data);
  return data;
}
function checkOpts(defaults, opts) {
  if (opts == null || typeof opts !== "object")
    throw new Error("options must be defined");
  const merged = Object.assign(defaults, opts);
  return merged;
}
function equalBytes2(a, b) {
  if (a.length !== b.length)
    return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++)
    diff |= a[i] ^ b[i];
  return diff === 0;
}
function getOutput(expectedLength, out, onlyAligned = true) {
  if (out === void 0)
    return new Uint8Array(expectedLength);
  if (out.length !== expectedLength)
    throw new Error("invalid output length, expected " + expectedLength + ", got: " + out.length);
  if (onlyAligned && !isAligned32(out))
    throw new Error("invalid output, must be aligned");
  return out;
}
function setBigUint642(view, byteOffset, value, isLE3) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE3);
  const _32n2 = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n2 & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE3 ? 4 : 0;
  const l = isLE3 ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE3);
  view.setUint32(byteOffset + l, wl, isLE3);
}
function u64Lengths(dataLength, aadLength, isLE3) {
  abool(isLE3);
  const num = new Uint8Array(16);
  const view = createView2(num);
  setBigUint642(view, 0, BigInt(aadLength), isLE3);
  setBigUint642(view, 8, BigInt(dataLength), isLE3);
  return num;
}
function isAligned32(bytes) {
  return bytes.byteOffset % 4 === 0;
}
function copyBytes2(bytes) {
  return Uint8Array.from(bytes);
}
var isLE2, wrapCipher;
var init_utils3 = __esm({
  "node_modules/.pnpm/@noble+ciphers@1.3.0/node_modules/@noble/ciphers/esm/utils.js"() {
    isLE2 = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
    wrapCipher = /* @__NO_SIDE_EFFECTS__ */ (params, constructor) => {
      function wrappedCipher(key, ...args) {
        abytes2(key);
        if (!isLE2)
          throw new Error("Non little-endian hardware is not yet supported");
        if (params.nonceLength !== void 0) {
          const nonce = args[0];
          if (!nonce)
            throw new Error("nonce / iv required");
          if (params.varSizeNonce)
            abytes2(nonce);
          else
            abytes2(nonce, params.nonceLength);
        }
        const tagl = params.tagLength;
        if (tagl && args[1] !== void 0) {
          abytes2(args[1]);
        }
        const cipher = constructor(key, ...args);
        const checkOutput = (fnLength, output) => {
          if (output !== void 0) {
            if (fnLength !== 2)
              throw new Error("cipher output not supported");
            abytes2(output);
          }
        };
        let called = false;
        const wrCipher = {
          encrypt(data, output) {
            if (called)
              throw new Error("cannot encrypt() twice with same key + nonce");
            called = true;
            abytes2(data);
            checkOutput(cipher.encrypt.length, output);
            return cipher.encrypt(data, output);
          },
          decrypt(data, output) {
            abytes2(data);
            if (tagl && data.length < tagl)
              throw new Error("invalid ciphertext length: smaller than tagLength=" + tagl);
            checkOutput(cipher.decrypt.length, output);
            return cipher.decrypt(data, output);
          }
        };
        return wrCipher;
      }
      Object.assign(wrappedCipher, params);
      return wrappedCipher;
    };
  }
});

// node_modules/.pnpm/@noble+ciphers@1.3.0/node_modules/@noble/ciphers/esm/_arx.js
function rotl(a, b) {
  return a << b | a >>> 32 - b;
}
function isAligned322(b) {
  return b.byteOffset % 4 === 0;
}
function runCipher(core, sigma, key, nonce, data, output, counter, rounds) {
  const len = data.length;
  const block2 = new Uint8Array(BLOCK_LEN);
  const b32 = u322(block2);
  const isAligned = isAligned322(data) && isAligned322(output);
  const d32 = isAligned ? u322(data) : U32_EMPTY;
  const o32 = isAligned ? u322(output) : U32_EMPTY;
  for (let pos = 0; pos < len; counter++) {
    core(sigma, key, nonce, b32, counter, rounds);
    if (counter >= MAX_COUNTER)
      throw new Error("arx: counter overflow");
    const take = Math.min(BLOCK_LEN, len - pos);
    if (isAligned && take === BLOCK_LEN) {
      const pos32 = pos / 4;
      if (pos % 4 !== 0)
        throw new Error("arx: invalid block position");
      for (let j = 0, posj; j < BLOCK_LEN32; j++) {
        posj = pos32 + j;
        o32[posj] = d32[posj] ^ b32[j];
      }
      pos += BLOCK_LEN;
      continue;
    }
    for (let j = 0, posj; j < take; j++) {
      posj = pos + j;
      output[posj] = data[posj] ^ block2[j];
    }
    pos += take;
  }
}
function createCipher(core, opts) {
  const { allowShortKeys, extendNonceFn, counterLength, counterRight, rounds } = checkOpts({ allowShortKeys: false, counterLength: 8, counterRight: false, rounds: 20 }, opts);
  if (typeof core !== "function")
    throw new Error("core must be a function");
  anumber2(counterLength);
  anumber2(rounds);
  abool(counterRight);
  abool(allowShortKeys);
  return (key, nonce, data, output, counter = 0) => {
    abytes2(key);
    abytes2(nonce);
    abytes2(data);
    const len = data.length;
    if (output === void 0)
      output = new Uint8Array(len);
    abytes2(output);
    anumber2(counter);
    if (counter < 0 || counter >= MAX_COUNTER)
      throw new Error("arx: counter overflow");
    if (output.length < len)
      throw new Error(`arx: output (${output.length}) is shorter than data (${len})`);
    const toClean = [];
    let l = key.length;
    let k;
    let sigma;
    if (l === 32) {
      toClean.push(k = copyBytes2(key));
      sigma = sigma32_32;
    } else if (l === 16 && allowShortKeys) {
      k = new Uint8Array(32);
      k.set(key);
      k.set(key, 16);
      sigma = sigma16_32;
      toClean.push(k);
    } else {
      throw new Error(`arx: invalid 32-byte key, got length=${l}`);
    }
    if (!isAligned322(nonce))
      toClean.push(nonce = copyBytes2(nonce));
    const k32 = u322(k);
    if (extendNonceFn) {
      if (nonce.length !== 24)
        throw new Error(`arx: extended nonce must be 24 bytes`);
      extendNonceFn(sigma, k32, u322(nonce.subarray(0, 16)), k32);
      nonce = nonce.subarray(16);
    }
    const nonceNcLen = 16 - counterLength;
    if (nonceNcLen !== nonce.length)
      throw new Error(`arx: nonce must be ${nonceNcLen} or 16 bytes`);
    if (nonceNcLen !== 12) {
      const nc2 = new Uint8Array(12);
      nc2.set(nonce, counterRight ? 0 : 12 - nonce.length);
      nonce = nc2;
      toClean.push(nonce);
    }
    const n32 = u322(nonce);
    runCipher(core, sigma, k32, n32, data, output, counter, rounds);
    clean2(...toClean);
    return output;
  };
}
var _utf8ToBytes, sigma16, sigma32, sigma16_32, sigma32_32, BLOCK_LEN, BLOCK_LEN32, MAX_COUNTER, U32_EMPTY;
var init_arx = __esm({
  "node_modules/.pnpm/@noble+ciphers@1.3.0/node_modules/@noble/ciphers/esm/_arx.js"() {
    init_utils3();
    _utf8ToBytes = (str) => Uint8Array.from(str.split("").map((c) => c.charCodeAt(0)));
    sigma16 = _utf8ToBytes("expand 16-byte k");
    sigma32 = _utf8ToBytes("expand 32-byte k");
    sigma16_32 = u322(sigma16);
    sigma32_32 = u322(sigma32);
    BLOCK_LEN = 64;
    BLOCK_LEN32 = 16;
    MAX_COUNTER = 2 ** 32 - 1;
    U32_EMPTY = new Uint32Array();
  }
});

// node_modules/.pnpm/@noble+ciphers@1.3.0/node_modules/@noble/ciphers/esm/_poly1305.js
function wrapConstructorWithKey(hashCons) {
  const hashC = (msg, key) => hashCons(key).update(toBytes2(msg)).digest();
  const tmp = hashCons(new Uint8Array(32));
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = (key) => hashCons(key);
  return hashC;
}
var u8to16, Poly1305, poly1305;
var init_poly1305 = __esm({
  "node_modules/.pnpm/@noble+ciphers@1.3.0/node_modules/@noble/ciphers/esm/_poly1305.js"() {
    init_utils3();
    u8to16 = (a, i) => a[i++] & 255 | (a[i++] & 255) << 8;
    Poly1305 = class {
      constructor(key) {
        this.blockLen = 16;
        this.outputLen = 16;
        this.buffer = new Uint8Array(16);
        this.r = new Uint16Array(10);
        this.h = new Uint16Array(10);
        this.pad = new Uint16Array(8);
        this.pos = 0;
        this.finished = false;
        key = toBytes2(key);
        abytes2(key, 32);
        const t0 = u8to16(key, 0);
        const t1 = u8to16(key, 2);
        const t2 = u8to16(key, 4);
        const t3 = u8to16(key, 6);
        const t4 = u8to16(key, 8);
        const t5 = u8to16(key, 10);
        const t6 = u8to16(key, 12);
        const t7 = u8to16(key, 14);
        this.r[0] = t0 & 8191;
        this.r[1] = (t0 >>> 13 | t1 << 3) & 8191;
        this.r[2] = (t1 >>> 10 | t2 << 6) & 7939;
        this.r[3] = (t2 >>> 7 | t3 << 9) & 8191;
        this.r[4] = (t3 >>> 4 | t4 << 12) & 255;
        this.r[5] = t4 >>> 1 & 8190;
        this.r[6] = (t4 >>> 14 | t5 << 2) & 8191;
        this.r[7] = (t5 >>> 11 | t6 << 5) & 8065;
        this.r[8] = (t6 >>> 8 | t7 << 8) & 8191;
        this.r[9] = t7 >>> 5 & 127;
        for (let i = 0; i < 8; i++)
          this.pad[i] = u8to16(key, 16 + 2 * i);
      }
      process(data, offset, isLast = false) {
        const hibit = isLast ? 0 : 1 << 11;
        const { h, r } = this;
        const r0 = r[0];
        const r1 = r[1];
        const r2 = r[2];
        const r3 = r[3];
        const r4 = r[4];
        const r5 = r[5];
        const r6 = r[6];
        const r7 = r[7];
        const r8 = r[8];
        const r9 = r[9];
        const t0 = u8to16(data, offset + 0);
        const t1 = u8to16(data, offset + 2);
        const t2 = u8to16(data, offset + 4);
        const t3 = u8to16(data, offset + 6);
        const t4 = u8to16(data, offset + 8);
        const t5 = u8to16(data, offset + 10);
        const t6 = u8to16(data, offset + 12);
        const t7 = u8to16(data, offset + 14);
        let h0 = h[0] + (t0 & 8191);
        let h1 = h[1] + ((t0 >>> 13 | t1 << 3) & 8191);
        let h2 = h[2] + ((t1 >>> 10 | t2 << 6) & 8191);
        let h3 = h[3] + ((t2 >>> 7 | t3 << 9) & 8191);
        let h4 = h[4] + ((t3 >>> 4 | t4 << 12) & 8191);
        let h5 = h[5] + (t4 >>> 1 & 8191);
        let h6 = h[6] + ((t4 >>> 14 | t5 << 2) & 8191);
        let h7 = h[7] + ((t5 >>> 11 | t6 << 5) & 8191);
        let h8 = h[8] + ((t6 >>> 8 | t7 << 8) & 8191);
        let h9 = h[9] + (t7 >>> 5 | hibit);
        let c = 0;
        let d0 = c + h0 * r0 + h1 * (5 * r9) + h2 * (5 * r8) + h3 * (5 * r7) + h4 * (5 * r6);
        c = d0 >>> 13;
        d0 &= 8191;
        d0 += h5 * (5 * r5) + h6 * (5 * r4) + h7 * (5 * r3) + h8 * (5 * r2) + h9 * (5 * r1);
        c += d0 >>> 13;
        d0 &= 8191;
        let d1 = c + h0 * r1 + h1 * r0 + h2 * (5 * r9) + h3 * (5 * r8) + h4 * (5 * r7);
        c = d1 >>> 13;
        d1 &= 8191;
        d1 += h5 * (5 * r6) + h6 * (5 * r5) + h7 * (5 * r4) + h8 * (5 * r3) + h9 * (5 * r2);
        c += d1 >>> 13;
        d1 &= 8191;
        let d2 = c + h0 * r2 + h1 * r1 + h2 * r0 + h3 * (5 * r9) + h4 * (5 * r8);
        c = d2 >>> 13;
        d2 &= 8191;
        d2 += h5 * (5 * r7) + h6 * (5 * r6) + h7 * (5 * r5) + h8 * (5 * r4) + h9 * (5 * r3);
        c += d2 >>> 13;
        d2 &= 8191;
        let d3 = c + h0 * r3 + h1 * r2 + h2 * r1 + h3 * r0 + h4 * (5 * r9);
        c = d3 >>> 13;
        d3 &= 8191;
        d3 += h5 * (5 * r8) + h6 * (5 * r7) + h7 * (5 * r6) + h8 * (5 * r5) + h9 * (5 * r4);
        c += d3 >>> 13;
        d3 &= 8191;
        let d4 = c + h0 * r4 + h1 * r3 + h2 * r2 + h3 * r1 + h4 * r0;
        c = d4 >>> 13;
        d4 &= 8191;
        d4 += h5 * (5 * r9) + h6 * (5 * r8) + h7 * (5 * r7) + h8 * (5 * r6) + h9 * (5 * r5);
        c += d4 >>> 13;
        d4 &= 8191;
        let d5 = c + h0 * r5 + h1 * r4 + h2 * r3 + h3 * r2 + h4 * r1;
        c = d5 >>> 13;
        d5 &= 8191;
        d5 += h5 * r0 + h6 * (5 * r9) + h7 * (5 * r8) + h8 * (5 * r7) + h9 * (5 * r6);
        c += d5 >>> 13;
        d5 &= 8191;
        let d6 = c + h0 * r6 + h1 * r5 + h2 * r4 + h3 * r3 + h4 * r2;
        c = d6 >>> 13;
        d6 &= 8191;
        d6 += h5 * r1 + h6 * r0 + h7 * (5 * r9) + h8 * (5 * r8) + h9 * (5 * r7);
        c += d6 >>> 13;
        d6 &= 8191;
        let d7 = c + h0 * r7 + h1 * r6 + h2 * r5 + h3 * r4 + h4 * r3;
        c = d7 >>> 13;
        d7 &= 8191;
        d7 += h5 * r2 + h6 * r1 + h7 * r0 + h8 * (5 * r9) + h9 * (5 * r8);
        c += d7 >>> 13;
        d7 &= 8191;
        let d8 = c + h0 * r8 + h1 * r7 + h2 * r6 + h3 * r5 + h4 * r4;
        c = d8 >>> 13;
        d8 &= 8191;
        d8 += h5 * r3 + h6 * r2 + h7 * r1 + h8 * r0 + h9 * (5 * r9);
        c += d8 >>> 13;
        d8 &= 8191;
        let d9 = c + h0 * r9 + h1 * r8 + h2 * r7 + h3 * r6 + h4 * r5;
        c = d9 >>> 13;
        d9 &= 8191;
        d9 += h5 * r4 + h6 * r3 + h7 * r2 + h8 * r1 + h9 * r0;
        c += d9 >>> 13;
        d9 &= 8191;
        c = (c << 2) + c | 0;
        c = c + d0 | 0;
        d0 = c & 8191;
        c = c >>> 13;
        d1 += c;
        h[0] = d0;
        h[1] = d1;
        h[2] = d2;
        h[3] = d3;
        h[4] = d4;
        h[5] = d5;
        h[6] = d6;
        h[7] = d7;
        h[8] = d8;
        h[9] = d9;
      }
      finalize() {
        const { h, pad } = this;
        const g = new Uint16Array(10);
        let c = h[1] >>> 13;
        h[1] &= 8191;
        for (let i = 2; i < 10; i++) {
          h[i] += c;
          c = h[i] >>> 13;
          h[i] &= 8191;
        }
        h[0] += c * 5;
        c = h[0] >>> 13;
        h[0] &= 8191;
        h[1] += c;
        c = h[1] >>> 13;
        h[1] &= 8191;
        h[2] += c;
        g[0] = h[0] + 5;
        c = g[0] >>> 13;
        g[0] &= 8191;
        for (let i = 1; i < 10; i++) {
          g[i] = h[i] + c;
          c = g[i] >>> 13;
          g[i] &= 8191;
        }
        g[9] -= 1 << 13;
        let mask = (c ^ 1) - 1;
        for (let i = 0; i < 10; i++)
          g[i] &= mask;
        mask = ~mask;
        for (let i = 0; i < 10; i++)
          h[i] = h[i] & mask | g[i];
        h[0] = (h[0] | h[1] << 13) & 65535;
        h[1] = (h[1] >>> 3 | h[2] << 10) & 65535;
        h[2] = (h[2] >>> 6 | h[3] << 7) & 65535;
        h[3] = (h[3] >>> 9 | h[4] << 4) & 65535;
        h[4] = (h[4] >>> 12 | h[5] << 1 | h[6] << 14) & 65535;
        h[5] = (h[6] >>> 2 | h[7] << 11) & 65535;
        h[6] = (h[7] >>> 5 | h[8] << 8) & 65535;
        h[7] = (h[8] >>> 8 | h[9] << 5) & 65535;
        let f = h[0] + pad[0];
        h[0] = f & 65535;
        for (let i = 1; i < 8; i++) {
          f = (h[i] + pad[i] | 0) + (f >>> 16) | 0;
          h[i] = f & 65535;
        }
        clean2(g);
      }
      update(data) {
        aexists2(this);
        data = toBytes2(data);
        abytes2(data);
        const { buffer, blockLen } = this;
        const len = data.length;
        for (let pos = 0; pos < len; ) {
          const take = Math.min(blockLen - this.pos, len - pos);
          if (take === blockLen) {
            for (; blockLen <= len - pos; pos += blockLen)
              this.process(data, pos);
            continue;
          }
          buffer.set(data.subarray(pos, pos + take), this.pos);
          this.pos += take;
          pos += take;
          if (this.pos === blockLen) {
            this.process(buffer, 0, false);
            this.pos = 0;
          }
        }
        return this;
      }
      destroy() {
        clean2(this.h, this.r, this.buffer, this.pad);
      }
      digestInto(out) {
        aexists2(this);
        aoutput2(out, this);
        this.finished = true;
        const { buffer, h } = this;
        let { pos } = this;
        if (pos) {
          buffer[pos++] = 1;
          for (; pos < 16; pos++)
            buffer[pos] = 0;
          this.process(buffer, 0, true);
        }
        this.finalize();
        let opos = 0;
        for (let i = 0; i < 8; i++) {
          out[opos++] = h[i] >>> 0;
          out[opos++] = h[i] >>> 8;
        }
        return out;
      }
      digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
      }
    };
    poly1305 = wrapConstructorWithKey((key) => new Poly1305(key));
  }
});

// node_modules/.pnpm/@noble+ciphers@1.3.0/node_modules/@noble/ciphers/esm/chacha.js
function chachaCore(s, k, n, out, cnt, rounds = 20) {
  let y00 = s[0], y01 = s[1], y02 = s[2], y03 = s[3], y04 = k[0], y05 = k[1], y06 = k[2], y07 = k[3], y08 = k[4], y09 = k[5], y10 = k[6], y11 = k[7], y12 = cnt, y13 = n[0], y14 = n[1], y15 = n[2];
  let x00 = y00, x01 = y01, x02 = y02, x03 = y03, x04 = y04, x05 = y05, x06 = y06, x07 = y07, x08 = y08, x09 = y09, x10 = y10, x11 = y11, x12 = y12, x13 = y13, x14 = y14, x15 = y15;
  for (let r = 0; r < rounds; r += 2) {
    x00 = x00 + x04 | 0;
    x12 = rotl(x12 ^ x00, 16);
    x08 = x08 + x12 | 0;
    x04 = rotl(x04 ^ x08, 12);
    x00 = x00 + x04 | 0;
    x12 = rotl(x12 ^ x00, 8);
    x08 = x08 + x12 | 0;
    x04 = rotl(x04 ^ x08, 7);
    x01 = x01 + x05 | 0;
    x13 = rotl(x13 ^ x01, 16);
    x09 = x09 + x13 | 0;
    x05 = rotl(x05 ^ x09, 12);
    x01 = x01 + x05 | 0;
    x13 = rotl(x13 ^ x01, 8);
    x09 = x09 + x13 | 0;
    x05 = rotl(x05 ^ x09, 7);
    x02 = x02 + x06 | 0;
    x14 = rotl(x14 ^ x02, 16);
    x10 = x10 + x14 | 0;
    x06 = rotl(x06 ^ x10, 12);
    x02 = x02 + x06 | 0;
    x14 = rotl(x14 ^ x02, 8);
    x10 = x10 + x14 | 0;
    x06 = rotl(x06 ^ x10, 7);
    x03 = x03 + x07 | 0;
    x15 = rotl(x15 ^ x03, 16);
    x11 = x11 + x15 | 0;
    x07 = rotl(x07 ^ x11, 12);
    x03 = x03 + x07 | 0;
    x15 = rotl(x15 ^ x03, 8);
    x11 = x11 + x15 | 0;
    x07 = rotl(x07 ^ x11, 7);
    x00 = x00 + x05 | 0;
    x15 = rotl(x15 ^ x00, 16);
    x10 = x10 + x15 | 0;
    x05 = rotl(x05 ^ x10, 12);
    x00 = x00 + x05 | 0;
    x15 = rotl(x15 ^ x00, 8);
    x10 = x10 + x15 | 0;
    x05 = rotl(x05 ^ x10, 7);
    x01 = x01 + x06 | 0;
    x12 = rotl(x12 ^ x01, 16);
    x11 = x11 + x12 | 0;
    x06 = rotl(x06 ^ x11, 12);
    x01 = x01 + x06 | 0;
    x12 = rotl(x12 ^ x01, 8);
    x11 = x11 + x12 | 0;
    x06 = rotl(x06 ^ x11, 7);
    x02 = x02 + x07 | 0;
    x13 = rotl(x13 ^ x02, 16);
    x08 = x08 + x13 | 0;
    x07 = rotl(x07 ^ x08, 12);
    x02 = x02 + x07 | 0;
    x13 = rotl(x13 ^ x02, 8);
    x08 = x08 + x13 | 0;
    x07 = rotl(x07 ^ x08, 7);
    x03 = x03 + x04 | 0;
    x14 = rotl(x14 ^ x03, 16);
    x09 = x09 + x14 | 0;
    x04 = rotl(x04 ^ x09, 12);
    x03 = x03 + x04 | 0;
    x14 = rotl(x14 ^ x03, 8);
    x09 = x09 + x14 | 0;
    x04 = rotl(x04 ^ x09, 7);
  }
  let oi = 0;
  out[oi++] = y00 + x00 | 0;
  out[oi++] = y01 + x01 | 0;
  out[oi++] = y02 + x02 | 0;
  out[oi++] = y03 + x03 | 0;
  out[oi++] = y04 + x04 | 0;
  out[oi++] = y05 + x05 | 0;
  out[oi++] = y06 + x06 | 0;
  out[oi++] = y07 + x07 | 0;
  out[oi++] = y08 + x08 | 0;
  out[oi++] = y09 + x09 | 0;
  out[oi++] = y10 + x10 | 0;
  out[oi++] = y11 + x11 | 0;
  out[oi++] = y12 + x12 | 0;
  out[oi++] = y13 + x13 | 0;
  out[oi++] = y14 + x14 | 0;
  out[oi++] = y15 + x15 | 0;
}
function hchacha(s, k, i, o32) {
  let x00 = s[0], x01 = s[1], x02 = s[2], x03 = s[3], x04 = k[0], x05 = k[1], x06 = k[2], x07 = k[3], x08 = k[4], x09 = k[5], x10 = k[6], x11 = k[7], x12 = i[0], x13 = i[1], x14 = i[2], x15 = i[3];
  for (let r = 0; r < 20; r += 2) {
    x00 = x00 + x04 | 0;
    x12 = rotl(x12 ^ x00, 16);
    x08 = x08 + x12 | 0;
    x04 = rotl(x04 ^ x08, 12);
    x00 = x00 + x04 | 0;
    x12 = rotl(x12 ^ x00, 8);
    x08 = x08 + x12 | 0;
    x04 = rotl(x04 ^ x08, 7);
    x01 = x01 + x05 | 0;
    x13 = rotl(x13 ^ x01, 16);
    x09 = x09 + x13 | 0;
    x05 = rotl(x05 ^ x09, 12);
    x01 = x01 + x05 | 0;
    x13 = rotl(x13 ^ x01, 8);
    x09 = x09 + x13 | 0;
    x05 = rotl(x05 ^ x09, 7);
    x02 = x02 + x06 | 0;
    x14 = rotl(x14 ^ x02, 16);
    x10 = x10 + x14 | 0;
    x06 = rotl(x06 ^ x10, 12);
    x02 = x02 + x06 | 0;
    x14 = rotl(x14 ^ x02, 8);
    x10 = x10 + x14 | 0;
    x06 = rotl(x06 ^ x10, 7);
    x03 = x03 + x07 | 0;
    x15 = rotl(x15 ^ x03, 16);
    x11 = x11 + x15 | 0;
    x07 = rotl(x07 ^ x11, 12);
    x03 = x03 + x07 | 0;
    x15 = rotl(x15 ^ x03, 8);
    x11 = x11 + x15 | 0;
    x07 = rotl(x07 ^ x11, 7);
    x00 = x00 + x05 | 0;
    x15 = rotl(x15 ^ x00, 16);
    x10 = x10 + x15 | 0;
    x05 = rotl(x05 ^ x10, 12);
    x00 = x00 + x05 | 0;
    x15 = rotl(x15 ^ x00, 8);
    x10 = x10 + x15 | 0;
    x05 = rotl(x05 ^ x10, 7);
    x01 = x01 + x06 | 0;
    x12 = rotl(x12 ^ x01, 16);
    x11 = x11 + x12 | 0;
    x06 = rotl(x06 ^ x11, 12);
    x01 = x01 + x06 | 0;
    x12 = rotl(x12 ^ x01, 8);
    x11 = x11 + x12 | 0;
    x06 = rotl(x06 ^ x11, 7);
    x02 = x02 + x07 | 0;
    x13 = rotl(x13 ^ x02, 16);
    x08 = x08 + x13 | 0;
    x07 = rotl(x07 ^ x08, 12);
    x02 = x02 + x07 | 0;
    x13 = rotl(x13 ^ x02, 8);
    x08 = x08 + x13 | 0;
    x07 = rotl(x07 ^ x08, 7);
    x03 = x03 + x04 | 0;
    x14 = rotl(x14 ^ x03, 16);
    x09 = x09 + x14 | 0;
    x04 = rotl(x04 ^ x09, 12);
    x03 = x03 + x04 | 0;
    x14 = rotl(x14 ^ x03, 8);
    x09 = x09 + x14 | 0;
    x04 = rotl(x04 ^ x09, 7);
  }
  let oi = 0;
  o32[oi++] = x00;
  o32[oi++] = x01;
  o32[oi++] = x02;
  o32[oi++] = x03;
  o32[oi++] = x12;
  o32[oi++] = x13;
  o32[oi++] = x14;
  o32[oi++] = x15;
}
function computeTag(fn, key, nonce, data, AAD) {
  const authKey = fn(key, nonce, ZEROS32);
  const h = poly1305.create(authKey);
  if (AAD)
    updatePadded(h, AAD);
  updatePadded(h, data);
  const num = u64Lengths(data.length, AAD ? AAD.length : 0, true);
  h.update(num);
  const res = h.digest();
  clean2(authKey, num);
  return res;
}
var chacha20, xchacha20, ZEROS16, updatePadded, ZEROS32, _poly1305_aead, chacha20poly1305, xchacha20poly1305;
var init_chacha = __esm({
  "node_modules/.pnpm/@noble+ciphers@1.3.0/node_modules/@noble/ciphers/esm/chacha.js"() {
    init_arx();
    init_poly1305();
    init_utils3();
    chacha20 = /* @__PURE__ */ createCipher(chachaCore, {
      counterRight: false,
      counterLength: 4,
      allowShortKeys: false
    });
    xchacha20 = /* @__PURE__ */ createCipher(chachaCore, {
      counterRight: false,
      counterLength: 8,
      extendNonceFn: hchacha,
      allowShortKeys: false
    });
    ZEROS16 = /* @__PURE__ */ new Uint8Array(16);
    updatePadded = (h, msg) => {
      h.update(msg);
      const left = msg.length % 16;
      if (left)
        h.update(ZEROS16.subarray(left));
    };
    ZEROS32 = /* @__PURE__ */ new Uint8Array(32);
    _poly1305_aead = (xorStream) => (key, nonce, AAD) => {
      const tagLength = 16;
      return {
        encrypt(plaintext, output) {
          const plength = plaintext.length;
          output = getOutput(plength + tagLength, output, false);
          output.set(plaintext);
          const oPlain = output.subarray(0, -tagLength);
          xorStream(key, nonce, oPlain, oPlain, 1);
          const tag = computeTag(xorStream, key, nonce, oPlain, AAD);
          output.set(tag, plength);
          clean2(tag);
          return output;
        },
        decrypt(ciphertext, output) {
          output = getOutput(ciphertext.length - tagLength, output, false);
          const data = ciphertext.subarray(0, -tagLength);
          const passedTag = ciphertext.subarray(-tagLength);
          const tag = computeTag(xorStream, key, nonce, data, AAD);
          if (!equalBytes2(passedTag, tag))
            throw new Error("invalid tag");
          output.set(ciphertext.subarray(0, -tagLength));
          xorStream(key, nonce, output, output, 1);
          clean2(tag);
          return output;
        }
      };
    };
    chacha20poly1305 = /* @__PURE__ */ wrapCipher({ blockSize: 64, nonceLength: 12, tagLength: 16 }, _poly1305_aead(chacha20));
    xchacha20poly1305 = /* @__PURE__ */ wrapCipher({ blockSize: 64, nonceLength: 24, tagLength: 16 }, _poly1305_aead(xchacha20));
  }
});

// packages/crypto-core/src/xchacha.ts
function rotl2(x, n) {
  return (x << n | x >>> 32 - n) >>> 0;
}
function quarterRound(s, a, b, c, d) {
  s[a] = s[a] + s[b] >>> 0;
  s[d] = rotl2(s[d] ^ s[a], 16);
  s[c] = s[c] + s[d] >>> 0;
  s[b] = rotl2(s[b] ^ s[c], 12);
  s[a] = s[a] + s[b] >>> 0;
  s[d] = rotl2(s[d] ^ s[a], 8);
  s[c] = s[c] + s[d] >>> 0;
  s[b] = rotl2(s[b] ^ s[c], 7);
}
function readLE32(b, off) {
  return (b[off] | b[off + 1] << 8 | b[off + 2] << 16 | b[off + 3] << 24) >>> 0;
}
function writeLE32(out, off, v) {
  out[off] = v & 255;
  out[off + 1] = v >>> 8 & 255;
  out[off + 2] = v >>> 16 & 255;
  out[off + 3] = v >>> 24 & 255;
}
function hchacha20(key, nonce16) {
  if (key.length !== 32) throw new Error("hchacha20 key must be 32 bytes");
  if (nonce16.length !== 16) throw new Error("hchacha20 nonce must be 16 bytes");
  const s = new Uint32Array(16);
  s[0] = SIGMA[0];
  s[1] = SIGMA[1];
  s[2] = SIGMA[2];
  s[3] = SIGMA[3];
  for (let i = 0; i < 8; i++) s[4 + i] = readLE32(key, i * 4);
  for (let i = 0; i < 4; i++) s[12 + i] = readLE32(nonce16, i * 4);
  for (let i = 0; i < 10; i++) {
    quarterRound(s, 0, 4, 8, 12);
    quarterRound(s, 1, 5, 9, 13);
    quarterRound(s, 2, 6, 10, 14);
    quarterRound(s, 3, 7, 11, 15);
    quarterRound(s, 0, 5, 10, 15);
    quarterRound(s, 1, 6, 11, 12);
    quarterRound(s, 2, 7, 8, 13);
    quarterRound(s, 3, 4, 9, 14);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) writeLE32(out, i * 4, s[i]);
  for (let i = 0; i < 4; i++) writeLE32(out, 16 + i * 4, s[12 + i]);
  return out;
}
function xchachaSeal(key, nonce24, plaintext, aad) {
  if (key.length !== XCHACHA_KEY_BYTES) throw new Error("key must be 32 bytes");
  if (nonce24.length !== XCHACHA_NONCE_BYTES) throw new Error("nonce must be 24 bytes");
  const combined = xchacha20poly1305(key, nonce24, aad).encrypt(plaintext);
  const split2 = combined.length - XCHACHA_TAG_BYTES;
  return {
    nonce: nonce24,
    ciphertext: combined.subarray(0, split2),
    tag: combined.subarray(split2)
  };
}
function xchachaOpen(key, nonce24, ciphertext, tag, aad) {
  if (key.length !== XCHACHA_KEY_BYTES) throw new Error("key must be 32 bytes");
  if (nonce24.length !== XCHACHA_NONCE_BYTES) throw new Error("nonce must be 24 bytes");
  if (tag.length !== XCHACHA_TAG_BYTES) return null;
  try {
    return xchacha20poly1305(key, nonce24, aad).decrypt(concatBytes2(ciphertext, tag));
  } catch {
    return null;
  }
}
var SIGMA, XCHACHA_NONCE_BYTES, XCHACHA_TAG_BYTES, XCHACHA_KEY_BYTES;
var init_xchacha = __esm({
  "packages/crypto-core/src/xchacha.ts"() {
    "use strict";
    init_chacha();
    init_encoding();
    SIGMA = new Uint32Array([1634760805, 857760878, 2036477234, 1797285236]);
    XCHACHA_NONCE_BYTES = 24;
    XCHACHA_TAG_BYTES = 16;
    XCHACHA_KEY_BYTES = 32;
  }
});

// packages/protocol/src/constants.ts
var PROTOCOL_VERSION, NS_PREFIX_WEB, SHARED_POINTER, REQUEST_MAX_SKEW_MS, SESSION_DEFAULT_TTL_MS, SESSION_ABSOLUTE_MAX_TTL_MS, DELEGATION_DEFAULT_TTL_MS, MAX_ENVELOPE_BYTES, MAX_PLAINTEXT_BYTES, MAX_JSON_DEPTH, MAX_PATHS_PER_REQUEST, MAX_PATCH_OPS, MAX_NAMESPACE_BYTES, MAX_FIELD_PATH_LEN, MAX_FOREIGN_ORIGINS, MAX_FOREIGN_PATHS_PER_ORIGIN;
var init_constants = __esm({
  "packages/protocol/src/constants.ts"() {
    "use strict";
    PROTOCOL_VERSION = "1";
    NS_PREFIX_WEB = "web";
    SHARED_POINTER = "/shared";
    REQUEST_MAX_SKEW_MS = 3e4;
    SESSION_DEFAULT_TTL_MS = 4 * 60 * 6e4;
    SESSION_ABSOLUTE_MAX_TTL_MS = 7 * 24 * 60 * 6e4;
    DELEGATION_DEFAULT_TTL_MS = 5 * 6e4;
    MAX_ENVELOPE_BYTES = 256 * 1024;
    MAX_PLAINTEXT_BYTES = 128 * 1024;
    MAX_JSON_DEPTH = 32;
    MAX_PATHS_PER_REQUEST = 64;
    MAX_PATCH_OPS = 128;
    MAX_NAMESPACE_BYTES = 16 * 1024 * 1024;
    MAX_FIELD_PATH_LEN = 512;
    MAX_FOREIGN_ORIGINS = 8;
    MAX_FOREIGN_PATHS_PER_ORIGIN = 16;
  }
});

// packages/protocol/src/errors.ts
var ErrorCode, CODE_TO_NAME, DEFAULT_MESSAGE, VaultError;
var init_errors = __esm({
  "packages/protocol/src/errors.ts"() {
    "use strict";
    ErrorCode = {
      /** User explicitly rejected the request at the vault. */
      UserRejected: 4001,
      /** No grant, or the grant does not cover this operation. */
      Unauthorized: 4100,
      /** Method not supported by this vault / not in the identity record. */
      UnsupportedMethod: 4200,
      /** The caller's derived namespace does not match the addressed namespace. */
      NamespaceMismatch: 4300,
      /** Identity could not be verified (well-known fetch / proof / signature). */
      IdentityUnverified: 4301,
      /** A request or delegation signature failed to verify. */
      BadSignature: 4302,
      /** Nonce already seen within the freshness window (replay). */
      NonceReplay: 4303,
      /** issuedAt/expiry outside the accepted window. */
      Expired: 4304,
      /** A path is outside the granted field scope. */
      FieldOutOfScope: 4305,
      /** Write attempted on a read-only field. */
      WriteForbidden: 4306,
      /** Biometric authentication failed or was cancelled. */
      BiometricFailed: 4310,
      /** Hardware key was invalidated (e.g. biometric re-enrollment). */
      KeyInvalidated: 4311,
      /** Vault is locked; unlock required before this operation. */
      VaultLocked: 4312,
      /** Optimistic-concurrency conflict: baseVersion is stale. */
      VersionConflict: 4321,
      /** A size/rate quota was exceeded. */
      QuotaExceeded: 4330,
      /** Protocol version not supported by the peer. */
      ProtocolUnsupported: 4400,
      /** Session/transport is not connected. */
      Disconnected: 4900,
      /** Malformed request that failed strict validation. */
      InvalidRequest: 4010
    };
    CODE_TO_NAME = new Map(
      Object.entries(ErrorCode).map(([k, v]) => [v, k])
    );
    DEFAULT_MESSAGE = {
      UserRejected: "The user rejected the request.",
      Unauthorized: "The application is not authorized for this operation.",
      UnsupportedMethod: "The requested method is not supported.",
      NamespaceMismatch: "The addressed namespace does not match the verified caller identity.",
      IdentityUnverified: "The caller identity could not be cryptographically verified.",
      BadSignature: "A required signature failed to verify.",
      NonceReplay: "The request nonce has already been used (possible replay).",
      Expired: "The request timestamp is outside the accepted freshness window.",
      FieldOutOfScope: "A requested field path is outside the granted scope.",
      WriteForbidden: "Write access was not granted for this field path.",
      BiometricFailed: "Biometric authentication failed or was cancelled.",
      KeyInvalidated: "The device key was invalidated and must be re-provisioned.",
      VaultLocked: "The vault is locked.",
      VersionConflict: "The write conflicts with a newer version (stale baseVersion).",
      QuotaExceeded: "A size or rate limit was exceeded.",
      ProtocolUnsupported: "The protocol version is not supported.",
      Disconnected: "The session is not connected.",
      InvalidRequest: "The request failed strict validation."
    };
    VaultError = class _VaultError extends Error {
      code;
      codeName;
      data;
      constructor(code, message, data) {
        const name = CODE_TO_NAME.get(code);
        super(message ?? (name ? DEFAULT_MESSAGE[name] : `Vault error ${code}`));
        this.name = "VaultError";
        this.code = code;
        this.codeName = name ?? "Unknown";
        if (data !== void 0) this.data = data;
      }
      static of(name, message, data) {
        return new _VaultError(ErrorCode[name], message ?? DEFAULT_MESSAGE[name], data);
      }
      toJSON() {
        const out = { code: this.code, name: this.codeName, message: this.message };
        if (this.data !== void 0) out.data = this.data;
        return out;
      }
      /** JSON-RPC `error` member. */
      toRpcError() {
        const out = {
          code: this.code,
          message: this.message
        };
        if (this.data !== void 0) out.data = this.data;
        return out;
      }
      static fromUnknown(err) {
        if (err instanceof _VaultError) return err;
        if (err instanceof Error) return new _VaultError(ErrorCode.InvalidRequest, err.message);
        return new _VaultError(ErrorCode.InvalidRequest, String(err));
      }
    };
  }
});

// packages/protocol/src/canonical.ts
function encodeString(s) {
  return JSON.stringify(s);
}
function canonicalString(value) {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") {
    const n = value;
    if (!Number.isFinite(n)) {
      throw new CanonicalizeError(`non-finite number is not canonicalizable: ${String(n)}`);
    }
    if (!Number.isInteger(n)) {
      throw new CanonicalizeError(`non-integer number is not canonicalizable: ${String(n)}`);
    }
    if (!Number.isSafeInteger(n)) {
      throw new CanonicalizeError(`unsafe-integer number is not canonicalizable: ${String(n)}`);
    }
    return Object.is(n, -0) ? "0" : String(n);
  }
  if (t === "string") return encodeString(value);
  if (Array.isArray(value)) {
    const parts = value.map((item) => {
      if (item === void 0) {
        throw new CanonicalizeError("undefined is not allowed as an array element");
      }
      return canonicalString(item);
    });
    return `[${parts.join(",")}]`;
  }
  if (t === "object") {
    const obj = value;
    const keys = Object.keys(obj).filter((k) => obj[k] !== void 0).sort(compareUtf16);
    const parts = keys.map((k) => `${encodeString(k)}:${canonicalString(obj[k])}`);
    return `{${parts.join(",")}}`;
  }
  throw new CanonicalizeError(`unsupported value type: ${t}`);
}
function compareUtf16(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
function canonicalStringify(value) {
  return canonicalString(value);
}
function canonicalBytes(value) {
  return textEncoder.encode(canonicalStringify(value));
}
var CanonicalizeError, textEncoder;
var init_canonical = __esm({
  "packages/protocol/src/canonical.ts"() {
    "use strict";
    CanonicalizeError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "CanonicalizeError";
      }
    };
    textEncoder = new TextEncoder();
  }
});

// packages/protocol/src/strict-json.ts
function parseJsonStrict(text, opts = {}) {
  const maxDepth = opts.maxDepth ?? MAX_JSON_DEPTH;
  let i = 0;
  const n = text.length;
  const err = (m) => {
    throw new StrictJsonError(m, i);
  };
  const ws = () => {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) i++;
      else break;
    }
  };
  const parseValue = (depth) => {
    ws();
    if (i >= n) err("unexpected end of input");
    const c = text[i];
    if (c === "{") return parseObject(depth);
    if (c === "[") return parseArray(depth);
    if (c === '"') return parseString();
    if (c === "-" || c >= "0" && c <= "9") return parseNumber();
    if (text.startsWith("true", i)) return i += 4, true;
    if (text.startsWith("false", i)) return i += 5, false;
    if (text.startsWith("null", i)) return i += 4, null;
    return err(`unexpected token '${c}'`);
  };
  const parseObject = (depth) => {
    const d = depth + 1;
    if (d > maxDepth) err("maximum nesting depth exceeded");
    i++;
    const obj = /* @__PURE__ */ Object.create(null);
    const seen = /* @__PURE__ */ new Set();
    ws();
    if (text[i] === "}") return i++, obj;
    for (; ; ) {
      ws();
      if (text[i] !== '"') err("expected object key string");
      const key = parseString();
      if (seen.has(key)) err(`duplicate object key '${key}'`);
      seen.add(key);
      ws();
      if (text[i] !== ":") err("expected ':'");
      i++;
      obj[key] = parseValue(d);
      ws();
      const ch = text[i];
      if (ch === ",") {
        i++;
        continue;
      }
      if (ch === "}") {
        i++;
        return obj;
      }
      err("expected ',' or '}'");
    }
  };
  const parseArray = (depth) => {
    const d = depth + 1;
    if (d > maxDepth) err("maximum nesting depth exceeded");
    i++;
    const arr = [];
    ws();
    if (text[i] === "]") return i++, arr;
    for (; ; ) {
      arr.push(parseValue(d));
      ws();
      const ch = text[i];
      if (ch === ",") {
        i++;
        continue;
      }
      if (ch === "]") {
        i++;
        return arr;
      }
      err("expected ',' or ']'");
    }
  };
  const parseString = () => {
    i++;
    let out = "";
    for (; ; ) {
      if (i >= n) err("unterminated string");
      const c = text[i];
      if (c === '"') {
        i++;
        return out;
      }
      if (c === "\\") {
        i++;
        const e = text[i];
        switch (e) {
          case '"':
            out += '"';
            break;
          case "\\":
            out += "\\";
            break;
          case "/":
            out += "/";
            break;
          case "b":
            out += "\b";
            break;
          case "f":
            out += "\f";
            break;
          case "n":
            out += "\n";
            break;
          case "r":
            out += "\r";
            break;
          case "t":
            out += "	";
            break;
          case "u": {
            const hex = text.slice(i + 1, i + 5);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) err("invalid \\u escape");
            out += String.fromCharCode(parseInt(hex, 16));
            i += 4;
            break;
          }
          default:
            err("invalid escape");
        }
        i++;
      } else if (c.charCodeAt(0) < 32) {
        err("unescaped control character in string");
      } else {
        out += c;
        i++;
      }
    }
  };
  const isDigit = (c) => c !== void 0 && c >= "0" && c <= "9";
  const parseNumber = () => {
    const start = i;
    if (text[i] === "-") i++;
    if (text[i] === "0") {
      i++;
    } else if (isDigit(text[i])) {
      i++;
      while (isDigit(text[i])) i++;
    } else {
      err("invalid number: expected a digit");
    }
    if (text[i] === ".") {
      i++;
      if (!isDigit(text[i])) err("invalid number: a digit is required after '.'");
      while (isDigit(text[i])) i++;
    }
    if (text[i] === "e" || text[i] === "E") {
      i++;
      if (text[i] === "+" || text[i] === "-") i++;
      if (!isDigit(text[i])) err("invalid number: a digit is required in the exponent");
      while (isDigit(text[i])) i++;
    }
    const num = Number(text.slice(start, i));
    if (!Number.isFinite(num)) err("non-finite number");
    return num;
  };
  const value = parseValue(0);
  ws();
  if (i !== n) err("trailing content after JSON value");
  return value;
}
var StrictJsonError;
var init_strict_json = __esm({
  "packages/protocol/src/strict-json.ts"() {
    "use strict";
    init_constants();
    StrictJsonError = class extends Error {
      constructor(message, position) {
        super(`${message} at position ${position}`);
        this.position = position;
        this.name = "StrictJsonError";
      }
    };
  }
});

// packages/protocol/src/types.ts
var init_types = __esm({
  "packages/protocol/src/types.ts"() {
    "use strict";
  }
});

// packages/protocol/src/typed-data.ts
function typedSigningPreimage(td) {
  const envelope = {
    tag: "VAULT712",
    primaryType: td.primaryType,
    domain: td.domain,
    message: td.message
  };
  return canonicalBytes(envelope);
}
function settleSigningPreimage(input) {
  return canonicalBytes({
    tag: "vault-settle/v1",
    sessionId: input.sessionId,
    namespace: input.namespace,
    grantId: input.grantId,
    responderPublicKey: input.responderPublicKey,
    vaultDeviceKey: input.vaultDeviceKey,
    expiresAt: input.expiresAt,
    methods: [...input.methods].sort()
  });
}
var init_typed_data = __esm({
  "packages/protocol/src/typed-data.ts"() {
    "use strict";
    init_canonical();
    init_constants();
  }
});

// packages/protocol/src/jsonrpc.ts
function makeNotification(method, params) {
  return { jsonrpc: JSONRPC_VERSION, method, params };
}
function makeSuccess(id, result) {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}
function makeFailure(id, error) {
  return { jsonrpc: JSONRPC_VERSION, id, error };
}
var JSONRPC_VERSION;
var init_jsonrpc = __esm({
  "packages/protocol/src/jsonrpc.ts"() {
    "use strict";
    JSONRPC_VERSION = "2.0";
  }
});

// packages/protocol/src/methods.ts
var Method;
var init_methods = __esm({
  "packages/protocol/src/methods.ts"() {
    "use strict";
    Method = {
      SessionPropose: "vault_sessionPropose",
      SessionSettle: "vault_sessionSettle",
      SessionExtend: "vault_sessionExtend",
      SessionDelete: "vault_sessionDelete",
      SessionPing: "vault_sessionPing",
      GetData: "vault_getData",
      GetSharedData: "vault_getSharedData",
      SetData: "vault_setData",
      PatchData: "vault_patchData",
      Subscribe: "vault_subscribe",
      Unsubscribe: "vault_unsubscribe",
      Subscription: "vault_subscription",
      GetPermissions: "vault_getPermissions",
      RequestPermissions: "vault_requestPermissions",
      Revoke: "vault_revoke",
      PermissionsChanged: "vault_permissionsChanged"
    };
  }
});

// packages/protocol/src/envelope.ts
var init_envelope = __esm({
  "packages/protocol/src/envelope.ts"() {
    "use strict";
    init_constants();
  }
});

// packages/protocol/src/pairing.ts
var init_pairing = __esm({
  "packages/protocol/src/pairing.ts"() {
    "use strict";
    init_constants();
  }
});

// packages/protocol/src/transport.ts
var init_transport = __esm({
  "packages/protocol/src/transport.ts"() {
    "use strict";
  }
});

// packages/protocol/src/index.ts
var init_src = __esm({
  "packages/protocol/src/index.ts"() {
    "use strict";
    init_constants();
    init_errors();
    init_canonical();
    init_strict_json();
    init_types();
    init_typed_data();
    init_jsonrpc();
    init_methods();
    init_envelope();
    init_pairing();
    init_transport();
  }
});

// packages/crypto-core/src/handshake.ts
function transcriptHash(p) {
  const bytes = canonicalBytes({
    tag: "vault-handshake/v1",
    proposerPublicKey: p.proposerPublicKey,
    responderPublicKey: p.responderPublicKey,
    protocolVersion: p.protocolVersion,
    pairingNonce: p.pairingNonce
  });
  return `sha256:${toHex(sha2562(bytes))}`;
}
function deriveSessionKey(ourPrivate, peerPublic, params) {
  const shared = x25519SharedSecret(ourPrivate, peerPublic);
  const salt = sha2562(
    concatBytes2(fromBase64Url(params.proposerPublicKey), fromBase64Url(params.responderPublicKey))
  );
  const info = concatBytes2(utf8ToBytes2("vault-session/v1|"), utf8ToBytes2(transcriptHash(params)));
  return hkdfSha256(shared, salt, info, 32);
}
var init_handshake = __esm({
  "packages/crypto-core/src/handshake.ts"() {
    "use strict";
    init_src();
    init_primitives();
    init_encoding();
  }
});

// packages/crypto-core/src/session-envelope.ts
function base64UrlLen(n) {
  return n === 0 ? 0 : Math.floor(n / 3) * 4 + (n % 3 === 0 ? 0 : n % 3 + 1);
}
function aadBytes(aad) {
  return canonicalBytes({
    topic: aad.topic,
    tag: aad.tag,
    pv: aad.pv,
    msgType: aad.msgType,
    dir: aad.dir
  });
}
function sealEnvelope(sessionKey, aad, body) {
  const plaintext = utf8ToBytes2(JSON.stringify(body));
  const nonce = randomBytes2(XCHACHA_NONCE_BYTES);
  const box = xchachaSeal(sessionKey, nonce, plaintext, aadBytes(aad));
  const packed = concatBytes2(new Uint8Array([VERSION_BYTE]), box.nonce, box.tag, box.ciphertext);
  return toBase64Url(packed);
}
function openEnvelope(sessionKey, aad, payload) {
  if (payload.length > MAX_ENVELOPE_B64_LEN) {
    throw new Error("envelope frame exceeds size cap");
  }
  const packed = fromBase64Url(payload);
  const headerLen = 1 + XCHACHA_NONCE_BYTES + XCHACHA_TAG_BYTES;
  if (packed.length < headerLen) throw new Error("envelope too short");
  if (packed[0] !== VERSION_BYTE) throw new Error("unsupported envelope version");
  const nonce = packed.subarray(1, 1 + XCHACHA_NONCE_BYTES);
  const tag = packed.subarray(1 + XCHACHA_NONCE_BYTES, headerLen);
  const ct = packed.subarray(headerLen);
  const pt = xchachaOpen(sessionKey, nonce, ct, tag, aadBytes(aad));
  if (pt === null) throw new Error("envelope authentication failed");
  if (pt.length > MAX_PLAINTEXT_BYTES) throw new Error("envelope plaintext exceeds size cap");
  return parseJsonStrict(bytesToUtf8(pt));
}
var VERSION_BYTE, MAX_ENVELOPE_B64_LEN;
var init_session_envelope = __esm({
  "packages/crypto-core/src/session-envelope.ts"() {
    "use strict";
    init_src();
    init_xchacha();
    init_primitives();
    init_encoding();
    VERSION_BYTE = 1;
    MAX_ENVELOPE_B64_LEN = base64UrlLen(MAX_ENVELOPE_BYTES);
  }
});

// packages/crypto-core/src/namespace.ts
function storageKeyForNamespace(namespace) {
  return toHex(sha2562(utf8ToBytes2(namespace)));
}
function deriveOriginNamespace(origin) {
  if (typeof origin !== "string" || origin.trim().length === 0) {
    throw new NamespaceError("empty origin");
  }
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new NamespaceError(`invalid origin: ${origin}`);
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new NamespaceError("origin must not contain userinfo");
  }
  if (url.search.length > 0) throw new NamespaceError("origin must not contain a query");
  if (url.hash.length > 0) throw new NamespaceError("origin must not contain a fragment");
  if (url.pathname.length > 0 && url.pathname !== "/") {
    throw new NamespaceError("origin must not contain a path");
  }
  const scheme = url.protocol.replace(/:$/, "").toLowerCase();
  if (scheme !== "http" && scheme !== "https" && !DWEB_SCHEMES.has(scheme)) {
    throw new NamespaceError(`unsupported origin scheme: ${scheme}`);
  }
  const rawAuthority = url.host;
  if (rawAuthority.length === 0) throw new NamespaceError(`origin has no authority: ${origin}`);
  const authority = CASE_INSENSITIVE_DWEB_SCHEMES.has(scheme) ? rawAuthority.toLowerCase() : rawAuthority;
  const canonicalKey = `${scheme}://${authority}`;
  const namespace = `${NS_PREFIX_WEB}:${canonicalKey}`;
  return { namespace, canonicalKey, storageKey: storageKeyForNamespace(namespace) };
}
function confusableSkeleton(s) {
  const lowered = s.normalize("NFKC").toLowerCase();
  let out = "";
  for (const ch of lowered) out += CONFUSABLES[ch] ?? ch;
  return out;
}
function isMixedScript(s) {
  const scripts = /* @__PURE__ */ new Set();
  for (const ch of s.normalize("NFC")) {
    const cp = ch.codePointAt(0);
    for (const r of SCRIPT_RANGES) if (r.test(cp)) scripts.add(r.name);
  }
  return scripts.has("latin") && (scripts.has("cyrillic") || scripts.has("greek"));
}
function detectHomograph(displayHost, knownDomains = []) {
  const host = displayHost.toLowerCase();
  if (isMixedScript(host)) return { flag: true, reason: "mixed-script host" };
  if (host.split(".").some((l) => l.startsWith("xn--"))) {
    return { flag: true, reason: "internationalized (punycode) host" };
  }
  const skel = confusableSkeleton(host);
  for (const known of knownDomains) {
    const k = known.toLowerCase();
    if (k !== host && confusableSkeleton(k) === skel) {
      return { flag: true, reason: `look-alike of previously-approved ${known}` };
    }
  }
  return { flag: false };
}
var NamespaceError, DWEB_SCHEMES, CASE_INSENSITIVE_DWEB_SCHEMES, CONFUSABLES, SCRIPT_RANGES;
var init_namespace = __esm({
  "packages/crypto-core/src/namespace.ts"() {
    "use strict";
    init_src();
    init_primitives();
    init_encoding();
    NamespaceError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "NamespaceError";
      }
    };
    DWEB_SCHEMES = /* @__PURE__ */ new Set([
      "bzz",
      "ipfs",
      "ipns",
      "hyper",
      "ens",
      "rad",
      "swarm",
      "ar"
    ]);
    CASE_INSENSITIVE_DWEB_SCHEMES = /* @__PURE__ */ new Set(["ens", "bzz", "swarm", "hyper"]);
    CONFUSABLES = {
      // Cyrillic -> Latin
      \u0430: "a",
      \u0435: "e",
      \u043E: "o",
      \u0440: "p",
      \u0441: "c",
      \u0445: "x",
      \u0443: "y",
      \u0456: "i",
      \u0455: "s",
      \u0458: "j",
      "\u041A": "k",
      "\u041C": "m",
      // Greek -> Latin
      \u03BF: "o",
      \u03B1: "a",
      \u03C1: "p",
      \u03BD: "v",
      \u03C4: "t",
      \u03B9: "i",
      \u03BA: "k",
      "\u0391": "a",
      "\u0392": "b",
      "\u0395": "e",
      "\u039F": "o",
      // digit / punctuation look-alikes
      "0": "o",
      "1": "l",
      "5": "s",
      "\u029F": "l",
      "\u0269": "i",
      "\u217C": "l",
      "\uFF47": "g"
    };
    SCRIPT_RANGES = [
      { name: "latin", test: (c) => c >= 65 && c <= 90 || c >= 97 && c <= 122 },
      { name: "cyrillic", test: (c) => c >= 1024 && c <= 1279 },
      { name: "greek", test: (c) => c >= 880 && c <= 1023 }
    ];
  }
});

// packages/crypto-core/src/identity.ts
function omit(obj, key) {
  const { [key]: _drop, ...rest } = obj;
  return rest;
}
function findKey(record, kid) {
  return record.keys.find((k) => k.kid === kid);
}
function keyUsable(key, now) {
  if (key.status !== "active") return false;
  if (key.expires && Date.parse(key.expires) < now) return false;
  return true;
}
function verifyIdentityRecordProof(record, now = Date.now()) {
  if (record.schema !== "vault-identity/1") return { ok: false, reason: "unknown schema" };
  const key = findKey(record, record.proof.kid);
  if (!key) return { ok: false, reason: "proof kid not in keys" };
  if (key.alg !== "Ed25519") return { ok: false, reason: "unsupported proof alg" };
  if (!keyUsable(key, now)) return { ok: false, reason: "proof key not usable" };
  let sig;
  let pub;
  try {
    sig = fromBase64Url(record.proof.sig);
    pub = fromBase64Url(key.publicKey);
  } catch {
    return { ok: false, reason: "malformed proof/key encoding" };
  }
  const preimage = canonicalBytes(omit(record, "proof"));
  if (!ed25519Verify(preimage, sig, pub)) return { ok: false, reason: "proof signature invalid" };
  return { ok: true, kid: record.proof.kid };
}
function verifyDelegation(delegation, record, now = Date.now()) {
  if (delegation.domain !== record.domain) return { ok: false, reason: "delegation domain mismatch" };
  const key = findKey(record, delegation.keyId);
  if (!key) return { ok: false, reason: "delegation keyId not in record" };
  if (key.alg !== "Ed25519") return { ok: false, reason: "unsupported delegation alg" };
  if (!keyUsable(key, now)) return { ok: false, reason: "delegation key not usable" };
  let sig;
  let pub;
  try {
    sig = fromBase64Url(delegation.sig);
    pub = fromBase64Url(key.publicKey);
  } catch {
    return { ok: false, reason: "malformed delegation encoding" };
  }
  const preimage = canonicalBytes(omit(delegation, "sig"));
  if (!ed25519Verify(preimage, sig, pub)) return { ok: false, reason: "delegation signature invalid" };
  return { ok: true, keyId: delegation.keyId };
}
function signIdentityRecord(recordNoProof, kid, seed32) {
  const preimage = canonicalBytes(recordNoProof);
  const sig = toBase64Url(ed25519Sign(preimage, seed32));
  return { ...recordNoProof, proof: { kid, sig } };
}
function signDelegation(delegationNoSig, seed32) {
  const preimage = canonicalBytes(delegationNoSig);
  const sig = toBase64Url(ed25519Sign(preimage, seed32));
  return { ...delegationNoSig, sig };
}
var init_identity = __esm({
  "packages/crypto-core/src/identity.ts"() {
    "use strict";
    init_src();
    init_primitives();
    init_encoding();
  }
});

// packages/crypto-core/src/signing.ts
function signTyped(typed, seed32) {
  return toBase64Url(ed25519Sign(typedSigningPreimage(typed), seed32));
}
function verifyTyped(typed, sigB64, publicKey32B64) {
  let sig;
  let pub;
  try {
    sig = fromBase64Url(sigB64);
    pub = fromBase64Url(publicKey32B64);
  } catch {
    return false;
  }
  return ed25519Verify(typedSigningPreimage(typed), sig, pub);
}
var init_signing = __esm({
  "packages/crypto-core/src/signing.ts"() {
    "use strict";
    init_src();
    init_primitives();
    init_encoding();
  }
});

// packages/crypto-core/src/value-hash.ts
function stableJsonStringify(value) {
  return serialize(value);
}
function serialize(value) {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number cannot be hashed");
    return JSON.stringify(value);
  }
  if (t === "boolean" || t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`;
  if (t === "object") {
    const obj = value;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${serialize(obj[k])}`).join(",")}}`;
  }
  throw new Error(`unsupported value type: ${t}`);
}
function hashJsonValue(value) {
  return `sha256:${toHex(sha2562(utf8ToBytes2(stableJsonStringify(value))))}`;
}
var init_value_hash = __esm({
  "packages/crypto-core/src/value-hash.ts"() {
    "use strict";
    init_primitives();
    init_encoding();
  }
});

// node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/_blake.js
var BSIGMA;
var init_blake = __esm({
  "node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/_blake.js"() {
    BSIGMA = /* @__PURE__ */ Uint8Array.from([
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      14,
      10,
      4,
      8,
      9,
      15,
      13,
      6,
      1,
      12,
      0,
      2,
      11,
      7,
      5,
      3,
      11,
      8,
      12,
      0,
      5,
      2,
      15,
      13,
      10,
      14,
      3,
      6,
      7,
      1,
      9,
      4,
      7,
      9,
      3,
      1,
      13,
      12,
      11,
      14,
      2,
      6,
      5,
      10,
      4,
      0,
      15,
      8,
      9,
      0,
      5,
      7,
      2,
      4,
      10,
      15,
      14,
      1,
      11,
      12,
      6,
      8,
      3,
      13,
      2,
      12,
      6,
      10,
      0,
      11,
      8,
      3,
      4,
      13,
      7,
      5,
      15,
      14,
      1,
      9,
      12,
      5,
      1,
      15,
      14,
      13,
      4,
      10,
      0,
      7,
      6,
      3,
      9,
      2,
      8,
      11,
      13,
      11,
      7,
      14,
      12,
      1,
      3,
      9,
      5,
      0,
      15,
      4,
      8,
      6,
      2,
      10,
      6,
      15,
      14,
      9,
      11,
      3,
      0,
      8,
      12,
      2,
      13,
      7,
      1,
      4,
      10,
      5,
      10,
      2,
      8,
      4,
      7,
      6,
      1,
      5,
      15,
      11,
      9,
      14,
      3,
      12,
      13,
      0,
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      14,
      10,
      4,
      8,
      9,
      15,
      13,
      6,
      1,
      12,
      0,
      2,
      11,
      7,
      5,
      3,
      // Blake1, unused in others
      11,
      8,
      12,
      0,
      5,
      2,
      15,
      13,
      10,
      14,
      3,
      6,
      7,
      1,
      9,
      4,
      7,
      9,
      3,
      1,
      13,
      12,
      11,
      14,
      2,
      6,
      5,
      10,
      4,
      0,
      15,
      8,
      9,
      0,
      5,
      7,
      2,
      4,
      10,
      15,
      14,
      1,
      11,
      12,
      6,
      8,
      3,
      13,
      2,
      12,
      6,
      10,
      0,
      11,
      8,
      3,
      4,
      13,
      7,
      5,
      15,
      14,
      1,
      9
    ]);
  }
});

// node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/blake2.js
function G1b(a, b, c, d, msg, x) {
  const Xl = msg[x], Xh = msg[x + 1];
  let Al = BBUF[2 * a], Ah = BBUF[2 * a + 1];
  let Bl = BBUF[2 * b], Bh = BBUF[2 * b + 1];
  let Cl = BBUF[2 * c], Ch = BBUF[2 * c + 1];
  let Dl = BBUF[2 * d], Dh = BBUF[2 * d + 1];
  let ll = add3L(Al, Bl, Xl);
  Ah = add3H(ll, Ah, Bh, Xh);
  Al = ll | 0;
  ({ Dh, Dl } = { Dh: Dh ^ Ah, Dl: Dl ^ Al });
  ({ Dh, Dl } = { Dh: rotr32H(Dh, Dl), Dl: rotr32L(Dh, Dl) });
  ({ h: Ch, l: Cl } = add(Ch, Cl, Dh, Dl));
  ({ Bh, Bl } = { Bh: Bh ^ Ch, Bl: Bl ^ Cl });
  ({ Bh, Bl } = { Bh: rotrSH(Bh, Bl, 24), Bl: rotrSL(Bh, Bl, 24) });
  BBUF[2 * a] = Al, BBUF[2 * a + 1] = Ah;
  BBUF[2 * b] = Bl, BBUF[2 * b + 1] = Bh;
  BBUF[2 * c] = Cl, BBUF[2 * c + 1] = Ch;
  BBUF[2 * d] = Dl, BBUF[2 * d + 1] = Dh;
}
function G2b(a, b, c, d, msg, x) {
  const Xl = msg[x], Xh = msg[x + 1];
  let Al = BBUF[2 * a], Ah = BBUF[2 * a + 1];
  let Bl = BBUF[2 * b], Bh = BBUF[2 * b + 1];
  let Cl = BBUF[2 * c], Ch = BBUF[2 * c + 1];
  let Dl = BBUF[2 * d], Dh = BBUF[2 * d + 1];
  let ll = add3L(Al, Bl, Xl);
  Ah = add3H(ll, Ah, Bh, Xh);
  Al = ll | 0;
  ({ Dh, Dl } = { Dh: Dh ^ Ah, Dl: Dl ^ Al });
  ({ Dh, Dl } = { Dh: rotrSH(Dh, Dl, 16), Dl: rotrSL(Dh, Dl, 16) });
  ({ h: Ch, l: Cl } = add(Ch, Cl, Dh, Dl));
  ({ Bh, Bl } = { Bh: Bh ^ Ch, Bl: Bl ^ Cl });
  ({ Bh, Bl } = { Bh: rotrBH(Bh, Bl, 63), Bl: rotrBL(Bh, Bl, 63) });
  BBUF[2 * a] = Al, BBUF[2 * a + 1] = Ah;
  BBUF[2 * b] = Bl, BBUF[2 * b + 1] = Bh;
  BBUF[2 * c] = Cl, BBUF[2 * c + 1] = Ch;
  BBUF[2 * d] = Dl, BBUF[2 * d + 1] = Dh;
}
function checkBlake2Opts(outputLen, opts = {}, keyLen, saltLen, persLen) {
  anumber(keyLen);
  if (outputLen < 0 || outputLen > keyLen)
    throw new Error("outputLen bigger than keyLen");
  const { key, salt, personalization } = opts;
  if (key !== void 0 && (key.length < 1 || key.length > keyLen))
    throw new Error("key length must be undefined or 1.." + keyLen);
  if (salt !== void 0 && salt.length !== saltLen)
    throw new Error("salt must be undefined or " + saltLen);
  if (personalization !== void 0 && personalization.length !== persLen)
    throw new Error("personalization must be undefined or " + persLen);
}
var B2B_IV, BBUF, BLAKE2, BLAKE2b, blake2b;
var init_blake2 = __esm({
  "node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/blake2.js"() {
    init_blake();
    init_u64();
    init_utils();
    B2B_IV = /* @__PURE__ */ Uint32Array.from([
      4089235720,
      1779033703,
      2227873595,
      3144134277,
      4271175723,
      1013904242,
      1595750129,
      2773480762,
      2917565137,
      1359893119,
      725511199,
      2600822924,
      4215389547,
      528734635,
      327033209,
      1541459225
    ]);
    BBUF = /* @__PURE__ */ new Uint32Array(32);
    BLAKE2 = class extends Hash {
      constructor(blockLen, outputLen) {
        super();
        this.finished = false;
        this.destroyed = false;
        this.length = 0;
        this.pos = 0;
        anumber(blockLen);
        anumber(outputLen);
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.buffer = new Uint8Array(blockLen);
        this.buffer32 = u32(this.buffer);
      }
      update(data) {
        aexists(this);
        data = toBytes(data);
        abytes(data);
        const { blockLen, buffer, buffer32 } = this;
        const len = data.length;
        const offset = data.byteOffset;
        const buf = data.buffer;
        for (let pos = 0; pos < len; ) {
          if (this.pos === blockLen) {
            swap32IfBE(buffer32);
            this.compress(buffer32, 0, false);
            swap32IfBE(buffer32);
            this.pos = 0;
          }
          const take = Math.min(blockLen - this.pos, len - pos);
          const dataOffset = offset + pos;
          if (take === blockLen && !(dataOffset % 4) && pos + take < len) {
            const data32 = new Uint32Array(buf, dataOffset, Math.floor((len - pos) / 4));
            swap32IfBE(data32);
            for (let pos32 = 0; pos + blockLen < len; pos32 += buffer32.length, pos += blockLen) {
              this.length += blockLen;
              this.compress(data32, pos32, false);
            }
            swap32IfBE(data32);
            continue;
          }
          buffer.set(data.subarray(pos, pos + take), this.pos);
          this.pos += take;
          this.length += take;
          pos += take;
        }
        return this;
      }
      digestInto(out) {
        aexists(this);
        aoutput(out, this);
        const { pos, buffer32 } = this;
        this.finished = true;
        clean(this.buffer.subarray(pos));
        swap32IfBE(buffer32);
        this.compress(buffer32, 0, true);
        swap32IfBE(buffer32);
        const out32 = u32(out);
        this.get().forEach((v, i) => out32[i] = swap8IfBE(v));
      }
      digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
      }
      _cloneInto(to) {
        const { buffer, length, finished, destroyed, outputLen, pos } = this;
        to || (to = new this.constructor({ dkLen: outputLen }));
        to.set(...this.get());
        to.buffer.set(buffer);
        to.destroyed = destroyed;
        to.finished = finished;
        to.length = length;
        to.pos = pos;
        to.outputLen = outputLen;
        return to;
      }
      clone() {
        return this._cloneInto();
      }
    };
    BLAKE2b = class extends BLAKE2 {
      constructor(opts = {}) {
        const olen = opts.dkLen === void 0 ? 64 : opts.dkLen;
        super(128, olen);
        this.v0l = B2B_IV[0] | 0;
        this.v0h = B2B_IV[1] | 0;
        this.v1l = B2B_IV[2] | 0;
        this.v1h = B2B_IV[3] | 0;
        this.v2l = B2B_IV[4] | 0;
        this.v2h = B2B_IV[5] | 0;
        this.v3l = B2B_IV[6] | 0;
        this.v3h = B2B_IV[7] | 0;
        this.v4l = B2B_IV[8] | 0;
        this.v4h = B2B_IV[9] | 0;
        this.v5l = B2B_IV[10] | 0;
        this.v5h = B2B_IV[11] | 0;
        this.v6l = B2B_IV[12] | 0;
        this.v6h = B2B_IV[13] | 0;
        this.v7l = B2B_IV[14] | 0;
        this.v7h = B2B_IV[15] | 0;
        checkBlake2Opts(olen, opts, 64, 16, 16);
        let { key, personalization, salt } = opts;
        let keyLength = 0;
        if (key !== void 0) {
          key = toBytes(key);
          keyLength = key.length;
        }
        this.v0l ^= this.outputLen | keyLength << 8 | 1 << 16 | 1 << 24;
        if (salt !== void 0) {
          salt = toBytes(salt);
          const slt = u32(salt);
          this.v4l ^= swap8IfBE(slt[0]);
          this.v4h ^= swap8IfBE(slt[1]);
          this.v5l ^= swap8IfBE(slt[2]);
          this.v5h ^= swap8IfBE(slt[3]);
        }
        if (personalization !== void 0) {
          personalization = toBytes(personalization);
          const pers = u32(personalization);
          this.v6l ^= swap8IfBE(pers[0]);
          this.v6h ^= swap8IfBE(pers[1]);
          this.v7l ^= swap8IfBE(pers[2]);
          this.v7h ^= swap8IfBE(pers[3]);
        }
        if (key !== void 0) {
          const tmp = new Uint8Array(this.blockLen);
          tmp.set(key);
          this.update(tmp);
        }
      }
      // prettier-ignore
      get() {
        let { v0l, v0h, v1l, v1h, v2l, v2h, v3l, v3h, v4l, v4h, v5l, v5h, v6l, v6h, v7l, v7h } = this;
        return [v0l, v0h, v1l, v1h, v2l, v2h, v3l, v3h, v4l, v4h, v5l, v5h, v6l, v6h, v7l, v7h];
      }
      // prettier-ignore
      set(v0l, v0h, v1l, v1h, v2l, v2h, v3l, v3h, v4l, v4h, v5l, v5h, v6l, v6h, v7l, v7h) {
        this.v0l = v0l | 0;
        this.v0h = v0h | 0;
        this.v1l = v1l | 0;
        this.v1h = v1h | 0;
        this.v2l = v2l | 0;
        this.v2h = v2h | 0;
        this.v3l = v3l | 0;
        this.v3h = v3h | 0;
        this.v4l = v4l | 0;
        this.v4h = v4h | 0;
        this.v5l = v5l | 0;
        this.v5h = v5h | 0;
        this.v6l = v6l | 0;
        this.v6h = v6h | 0;
        this.v7l = v7l | 0;
        this.v7h = v7h | 0;
      }
      compress(msg, offset, isLast) {
        this.get().forEach((v, i) => BBUF[i] = v);
        BBUF.set(B2B_IV, 16);
        let { h, l } = fromBig(BigInt(this.length));
        BBUF[24] = B2B_IV[8] ^ l;
        BBUF[25] = B2B_IV[9] ^ h;
        if (isLast) {
          BBUF[28] = ~BBUF[28];
          BBUF[29] = ~BBUF[29];
        }
        let j = 0;
        const s = BSIGMA;
        for (let i = 0; i < 12; i++) {
          G1b(0, 4, 8, 12, msg, offset + 2 * s[j++]);
          G2b(0, 4, 8, 12, msg, offset + 2 * s[j++]);
          G1b(1, 5, 9, 13, msg, offset + 2 * s[j++]);
          G2b(1, 5, 9, 13, msg, offset + 2 * s[j++]);
          G1b(2, 6, 10, 14, msg, offset + 2 * s[j++]);
          G2b(2, 6, 10, 14, msg, offset + 2 * s[j++]);
          G1b(3, 7, 11, 15, msg, offset + 2 * s[j++]);
          G2b(3, 7, 11, 15, msg, offset + 2 * s[j++]);
          G1b(0, 5, 10, 15, msg, offset + 2 * s[j++]);
          G2b(0, 5, 10, 15, msg, offset + 2 * s[j++]);
          G1b(1, 6, 11, 12, msg, offset + 2 * s[j++]);
          G2b(1, 6, 11, 12, msg, offset + 2 * s[j++]);
          G1b(2, 7, 8, 13, msg, offset + 2 * s[j++]);
          G2b(2, 7, 8, 13, msg, offset + 2 * s[j++]);
          G1b(3, 4, 9, 14, msg, offset + 2 * s[j++]);
          G2b(3, 4, 9, 14, msg, offset + 2 * s[j++]);
        }
        this.v0l ^= BBUF[0] ^ BBUF[16];
        this.v0h ^= BBUF[1] ^ BBUF[17];
        this.v1l ^= BBUF[2] ^ BBUF[18];
        this.v1h ^= BBUF[3] ^ BBUF[19];
        this.v2l ^= BBUF[4] ^ BBUF[20];
        this.v2h ^= BBUF[5] ^ BBUF[21];
        this.v3l ^= BBUF[6] ^ BBUF[22];
        this.v3h ^= BBUF[7] ^ BBUF[23];
        this.v4l ^= BBUF[8] ^ BBUF[24];
        this.v4h ^= BBUF[9] ^ BBUF[25];
        this.v5l ^= BBUF[10] ^ BBUF[26];
        this.v5h ^= BBUF[11] ^ BBUF[27];
        this.v6l ^= BBUF[12] ^ BBUF[28];
        this.v6h ^= BBUF[13] ^ BBUF[29];
        this.v7l ^= BBUF[14] ^ BBUF[30];
        this.v7h ^= BBUF[15] ^ BBUF[31];
        clean(BBUF);
      }
      destroy() {
        this.destroyed = true;
        clean(this.buffer32);
        this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      }
    };
    blake2b = /* @__PURE__ */ createOptHasher((opts) => new BLAKE2b(opts));
  }
});

// node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/argon2.js
function mul(a, b) {
  const aL = a & 65535;
  const aH = a >>> 16;
  const bL = b & 65535;
  const bH = b >>> 16;
  const ll = Math.imul(aL, bL);
  const hl = Math.imul(aH, bL);
  const lh = Math.imul(aL, bH);
  const hh = Math.imul(aH, bH);
  const carry = (ll >>> 16) + (hl & 65535) + lh;
  const high = hh + (hl >>> 16) + (carry >>> 16) | 0;
  const low = carry << 16 | ll & 65535;
  return { h: high, l: low };
}
function mul2(a, b) {
  const { h, l } = mul(a, b);
  return { h: (h << 1 | l >>> 31) & 4294967295, l: l << 1 & 4294967295 };
}
function blamka(Ah, Al, Bh, Bl) {
  const { h: Ch, l: Cl } = mul2(Al, Bl);
  const Rll = add3L(Al, Bl, Cl);
  return { h: add3H(Rll, Ah, Bh, Ch), l: Rll | 0 };
}
function G(a, b, c, d) {
  let Al = A2_BUF[2 * a], Ah = A2_BUF[2 * a + 1];
  let Bl = A2_BUF[2 * b], Bh = A2_BUF[2 * b + 1];
  let Cl = A2_BUF[2 * c], Ch = A2_BUF[2 * c + 1];
  let Dl = A2_BUF[2 * d], Dh = A2_BUF[2 * d + 1];
  ({ h: Ah, l: Al } = blamka(Ah, Al, Bh, Bl));
  ({ Dh, Dl } = { Dh: Dh ^ Ah, Dl: Dl ^ Al });
  ({ Dh, Dl } = { Dh: rotr32H(Dh, Dl), Dl: rotr32L(Dh, Dl) });
  ({ h: Ch, l: Cl } = blamka(Ch, Cl, Dh, Dl));
  ({ Bh, Bl } = { Bh: Bh ^ Ch, Bl: Bl ^ Cl });
  ({ Bh, Bl } = { Bh: rotrSH(Bh, Bl, 24), Bl: rotrSL(Bh, Bl, 24) });
  ({ h: Ah, l: Al } = blamka(Ah, Al, Bh, Bl));
  ({ Dh, Dl } = { Dh: Dh ^ Ah, Dl: Dl ^ Al });
  ({ Dh, Dl } = { Dh: rotrSH(Dh, Dl, 16), Dl: rotrSL(Dh, Dl, 16) });
  ({ h: Ch, l: Cl } = blamka(Ch, Cl, Dh, Dl));
  ({ Bh, Bl } = { Bh: Bh ^ Ch, Bl: Bl ^ Cl });
  ({ Bh, Bl } = { Bh: rotrBH(Bh, Bl, 63), Bl: rotrBL(Bh, Bl, 63) });
  A2_BUF[2 * a] = Al, A2_BUF[2 * a + 1] = Ah;
  A2_BUF[2 * b] = Bl, A2_BUF[2 * b + 1] = Bh;
  A2_BUF[2 * c] = Cl, A2_BUF[2 * c + 1] = Ch;
  A2_BUF[2 * d] = Dl, A2_BUF[2 * d + 1] = Dh;
}
function P(v00, v01, v02, v03, v04, v05, v06, v07, v08, v09, v10, v11, v12, v13, v14, v15) {
  G(v00, v04, v08, v12);
  G(v01, v05, v09, v13);
  G(v02, v06, v10, v14);
  G(v03, v07, v11, v15);
  G(v00, v05, v10, v15);
  G(v01, v06, v11, v12);
  G(v02, v07, v08, v13);
  G(v03, v04, v09, v14);
}
function block(x, xPos, yPos, outPos, needXor) {
  for (let i = 0; i < 256; i++)
    A2_BUF[i] = x[xPos + i] ^ x[yPos + i];
  for (let i = 0; i < 128; i += 16) {
    P(i, i + 1, i + 2, i + 3, i + 4, i + 5, i + 6, i + 7, i + 8, i + 9, i + 10, i + 11, i + 12, i + 13, i + 14, i + 15);
  }
  for (let i = 0; i < 16; i += 2) {
    P(i, i + 1, i + 16, i + 17, i + 32, i + 33, i + 48, i + 49, i + 64, i + 65, i + 80, i + 81, i + 96, i + 97, i + 112, i + 113);
  }
  if (needXor)
    for (let i = 0; i < 256; i++)
      x[outPos + i] ^= A2_BUF[i] ^ x[xPos + i] ^ x[yPos + i];
  else
    for (let i = 0; i < 256; i++)
      x[outPos + i] = A2_BUF[i] ^ x[xPos + i] ^ x[yPos + i];
  clean(A2_BUF);
}
function Hp(A, dkLen) {
  const A8 = u8(A);
  const T = new Uint32Array(1);
  const T8 = u8(T);
  T[0] = dkLen;
  if (dkLen <= 64)
    return blake2b.create({ dkLen }).update(T8).update(A8).digest();
  const out = new Uint8Array(dkLen);
  let V = blake2b.create({}).update(T8).update(A8).digest();
  let pos = 0;
  out.set(V.subarray(0, 32));
  pos += 32;
  for (; dkLen - pos > 64; pos += 32) {
    const Vh = blake2b.create({}).update(V);
    Vh.digestInto(V);
    Vh.destroy();
    out.set(V.subarray(0, 32), pos);
  }
  out.set(blake2b(V, { dkLen: dkLen - pos }), pos);
  clean(V, T);
  return u32(out);
}
function indexAlpha(r, s, laneLen, segmentLen, index, randL, sameLane = false) {
  let area;
  if (r === 0) {
    if (s === 0)
      area = index - 1;
    else if (sameLane)
      area = s * segmentLen + index - 1;
    else
      area = s * segmentLen + (index == 0 ? -1 : 0);
  } else if (sameLane)
    area = laneLen - segmentLen + index - 1;
  else
    area = laneLen - segmentLen + (index == 0 ? -1 : 0);
  const startPos = r !== 0 && s !== ARGON2_SYNC_POINTS - 1 ? (s + 1) * segmentLen : 0;
  const rel = area - 1 - mul(area, mul(randL, randL).h).h;
  return (startPos + rel) % laneLen;
}
function isU32(num) {
  return Number.isSafeInteger(num) && num >= 0 && num < maxUint32;
}
function argon2Opts(opts) {
  const merged = {
    version: 19,
    dkLen: 32,
    maxmem: maxUint32 - 1,
    asyncTick: 10
  };
  for (let [k, v] of Object.entries(opts))
    if (v != null)
      merged[k] = v;
  const { dkLen, p, m, t, version, onProgress } = merged;
  if (!isU32(dkLen) || dkLen < 4)
    throw new Error("dkLen should be at least 4 bytes");
  if (!isU32(p) || p < 1 || p >= Math.pow(2, 24))
    throw new Error("p should be 1 <= p < 2^24");
  if (!isU32(m))
    throw new Error("m should be 0 <= m < 2^32");
  if (!isU32(t) || t < 1)
    throw new Error("t (iterations) should be 1 <= t < 2^32");
  if (onProgress !== void 0 && typeof onProgress !== "function")
    throw new Error("progressCb should be function");
  if (!isU32(m) || m < 8 * p)
    throw new Error("memory should be at least 8*p bytes");
  if (version !== 16 && version !== 19)
    throw new Error("unknown version=" + version);
  return merged;
}
function argon2Init(password, salt, type, opts) {
  password = kdfInputToBytes(password);
  salt = kdfInputToBytes(salt);
  abytes(password);
  abytes(salt);
  if (!isU32(password.length))
    throw new Error("password should be less than 4 GB");
  if (!isU32(salt.length) || salt.length < 8)
    throw new Error("salt should be at least 8 bytes and less than 4 GB");
  if (!Object.values(AT).includes(type))
    throw new Error("invalid type");
  let { p, dkLen, m, t, version, key, personalization, maxmem, onProgress, asyncTick } = argon2Opts(opts);
  key = abytesOrZero(key);
  personalization = abytesOrZero(personalization);
  const h = blake2b.create({});
  const BUF = new Uint32Array(1);
  const BUF8 = u8(BUF);
  for (let item of [p, dkLen, m, t, version, type]) {
    BUF[0] = item;
    h.update(BUF8);
  }
  for (let i of [password, salt, key, personalization]) {
    BUF[0] = i.length;
    h.update(BUF8).update(i);
  }
  const H0 = new Uint32Array(18);
  const H0_8 = u8(H0);
  h.digestInto(H0_8);
  const lanes = p;
  const mP = 4 * p * Math.floor(m / (ARGON2_SYNC_POINTS * p));
  const laneLen = Math.floor(mP / p);
  const segmentLen = Math.floor(laneLen / ARGON2_SYNC_POINTS);
  const memUsed = mP * 256;
  if (!isU32(maxmem) || memUsed > maxmem)
    throw new Error("mem should be less than 2**32, got: maxmem=" + maxmem + ", memused=" + memUsed);
  const B = new Uint32Array(memUsed);
  for (let l = 0; l < p; l++) {
    const i = 256 * laneLen * l;
    H0[17] = l;
    H0[16] = 0;
    B.set(Hp(H0, 1024), i);
    H0[16] = 1;
    B.set(Hp(H0, 1024), i + 256);
  }
  let perBlock = () => {
  };
  if (onProgress) {
    const totalBlock = t * ARGON2_SYNC_POINTS * p * segmentLen;
    const callbackPer = Math.max(Math.floor(totalBlock / 1e4), 1);
    let blockCnt = 0;
    perBlock = () => {
      blockCnt++;
      if (onProgress && (!(blockCnt % callbackPer) || blockCnt === totalBlock))
        onProgress(blockCnt / totalBlock);
    };
  }
  clean(BUF, H0);
  return { type, mP, p, t, version, B, laneLen, lanes, segmentLen, dkLen, perBlock, asyncTick };
}
function argon2Output(B, p, laneLen, dkLen) {
  const B_final = new Uint32Array(256);
  for (let l = 0; l < p; l++)
    for (let j = 0; j < 256; j++)
      B_final[j] ^= B[256 * (laneLen * l + laneLen - 1) + j];
  const res = u8(Hp(B_final, dkLen));
  clean(B_final);
  return res;
}
function processBlock(B, address, l, r, s, index, laneLen, segmentLen, lanes, offset, prev, dataIndependent, needXor) {
  if (offset % laneLen)
    prev = offset - 1;
  let randL, randH;
  if (dataIndependent) {
    let i128 = index % 128;
    if (i128 === 0) {
      address[256 + 12]++;
      block(address, 256, 2 * 256, 0, false);
      block(address, 0, 2 * 256, 0, false);
    }
    randL = address[2 * i128];
    randH = address[2 * i128 + 1];
  } else {
    const T = 256 * prev;
    randL = B[T];
    randH = B[T + 1];
  }
  const refLane = r === 0 && s === 0 ? l : randH % lanes;
  const refPos = indexAlpha(r, s, laneLen, segmentLen, index, randL, refLane == l);
  const refBlock = laneLen * refLane + refPos;
  block(B, 256 * prev, 256 * refBlock, offset * 256, needXor);
}
function argon2(type, password, salt, opts) {
  const { mP, p, t, version, B, laneLen, lanes, segmentLen, dkLen, perBlock } = argon2Init(password, salt, type, opts);
  const address = new Uint32Array(3 * 256);
  address[256 + 6] = mP;
  address[256 + 8] = t;
  address[256 + 10] = type;
  for (let r = 0; r < t; r++) {
    const needXor = r !== 0 && version === 19;
    address[256 + 0] = r;
    for (let s = 0; s < ARGON2_SYNC_POINTS; s++) {
      address[256 + 4] = s;
      const dataIndependent = type == AT.Argon2i || type == AT.Argon2id && r === 0 && s < 2;
      for (let l = 0; l < p; l++) {
        address[256 + 2] = l;
        address[256 + 12] = 0;
        let startPos = 0;
        if (r === 0 && s === 0) {
          startPos = 2;
          if (dataIndependent) {
            address[256 + 12]++;
            block(address, 256, 2 * 256, 0, false);
            block(address, 0, 2 * 256, 0, false);
          }
        }
        let offset = l * laneLen + s * segmentLen + startPos;
        let prev = offset % laneLen ? offset - 1 : offset + laneLen - 1;
        for (let index = startPos; index < segmentLen; index++, offset++, prev++) {
          perBlock();
          processBlock(B, address, l, r, s, index, laneLen, segmentLen, lanes, offset, prev, dataIndependent, needXor);
        }
      }
    }
  }
  clean(address);
  return argon2Output(B, p, laneLen, dkLen);
}
var AT, ARGON2_SYNC_POINTS, abytesOrZero, A2_BUF, maxUint32, argon2id;
var init_argon2 = __esm({
  "node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/argon2.js"() {
    init_u64();
    init_blake2();
    init_utils();
    AT = { Argond2d: 0, Argon2i: 1, Argon2id: 2 };
    ARGON2_SYNC_POINTS = 4;
    abytesOrZero = (buf) => {
      if (buf === void 0)
        return Uint8Array.of();
      return kdfInputToBytes(buf);
    };
    A2_BUF = new Uint32Array(256);
    maxUint32 = Math.pow(2, 32);
    argon2id = (password, salt, opts) => argon2(AT.Argon2id, password, salt, opts);
  }
});

// node_modules/.pnpm/@scure+base@1.2.6/node_modules/@scure/base/lib/esm/index.js
function isBytes3(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function isArrayOf(isString, arr) {
  if (!Array.isArray(arr))
    return false;
  if (arr.length === 0)
    return true;
  if (isString) {
    return arr.every((item) => typeof item === "string");
  } else {
    return arr.every((item) => Number.isSafeInteger(item));
  }
}
function afn(input) {
  if (typeof input !== "function")
    throw new Error("function expected");
  return true;
}
function astr(label, input) {
  if (typeof input !== "string")
    throw new Error(`${label}: string expected`);
  return true;
}
function anumber3(n) {
  if (!Number.isSafeInteger(n))
    throw new Error(`invalid integer: ${n}`);
}
function aArr(input) {
  if (!Array.isArray(input))
    throw new Error("array expected");
}
function astrArr(label, input) {
  if (!isArrayOf(true, input))
    throw new Error(`${label}: array of strings expected`);
}
function anumArr(label, input) {
  if (!isArrayOf(false, input))
    throw new Error(`${label}: array of numbers expected`);
}
// @__NO_SIDE_EFFECTS__
function chain(...args) {
  const id = (a) => a;
  const wrap = (a, b) => (c) => a(b(c));
  const encode = args.map((x) => x.encode).reduceRight(wrap, id);
  const decode = args.map((x) => x.decode).reduce(wrap, id);
  return { encode, decode };
}
// @__NO_SIDE_EFFECTS__
function alphabet(letters) {
  const lettersA = typeof letters === "string" ? letters.split("") : letters;
  const len = lettersA.length;
  astrArr("alphabet", lettersA);
  const indexes = new Map(lettersA.map((l, i) => [l, i]));
  return {
    encode: (digits) => {
      aArr(digits);
      return digits.map((i) => {
        if (!Number.isSafeInteger(i) || i < 0 || i >= len)
          throw new Error(`alphabet.encode: digit index outside alphabet "${i}". Allowed: ${letters}`);
        return lettersA[i];
      });
    },
    decode: (input) => {
      aArr(input);
      return input.map((letter) => {
        astr("alphabet.decode", letter);
        const i = indexes.get(letter);
        if (i === void 0)
          throw new Error(`Unknown letter: "${letter}". Allowed: ${letters}`);
        return i;
      });
    }
  };
}
// @__NO_SIDE_EFFECTS__
function join(separator = "") {
  astr("join", separator);
  return {
    encode: (from) => {
      astrArr("join.decode", from);
      return from.join(separator);
    },
    decode: (to) => {
      astr("join.decode", to);
      return to.split(separator);
    }
  };
}
// @__NO_SIDE_EFFECTS__
function padding(bits, chr = "=") {
  anumber3(bits);
  astr("padding", chr);
  return {
    encode(data) {
      astrArr("padding.encode", data);
      while (data.length * bits % 8)
        data.push(chr);
      return data;
    },
    decode(input) {
      astrArr("padding.decode", input);
      let end = input.length;
      if (end * bits % 8)
        throw new Error("padding: invalid, string should have whole number of bytes");
      for (; end > 0 && input[end - 1] === chr; end--) {
        const last = end - 1;
        const byte = last * bits;
        if (byte % 8 === 0)
          throw new Error("padding: invalid, string has too much padding");
      }
      return input.slice(0, end);
    }
  };
}
function convertRadix(data, from, to) {
  if (from < 2)
    throw new Error(`convertRadix: invalid from=${from}, base cannot be less than 2`);
  if (to < 2)
    throw new Error(`convertRadix: invalid to=${to}, base cannot be less than 2`);
  aArr(data);
  if (!data.length)
    return [];
  let pos = 0;
  const res = [];
  const digits = Array.from(data, (d) => {
    anumber3(d);
    if (d < 0 || d >= from)
      throw new Error(`invalid integer: ${d}`);
    return d;
  });
  const dlen = digits.length;
  while (true) {
    let carry = 0;
    let done = true;
    for (let i = pos; i < dlen; i++) {
      const digit = digits[i];
      const fromCarry = from * carry;
      const digitBase = fromCarry + digit;
      if (!Number.isSafeInteger(digitBase) || fromCarry / from !== carry || digitBase - digit !== fromCarry) {
        throw new Error("convertRadix: carry overflow");
      }
      const div = digitBase / to;
      carry = digitBase % to;
      const rounded = Math.floor(div);
      digits[i] = rounded;
      if (!Number.isSafeInteger(rounded) || rounded * to + carry !== digitBase)
        throw new Error("convertRadix: carry overflow");
      if (!done)
        continue;
      else if (!rounded)
        pos = i;
      else
        done = false;
    }
    res.push(carry);
    if (done)
      break;
  }
  for (let i = 0; i < data.length - 1 && data[i] === 0; i++)
    res.push(0);
  return res.reverse();
}
function convertRadix2(data, from, to, padding2) {
  aArr(data);
  if (from <= 0 || from > 32)
    throw new Error(`convertRadix2: wrong from=${from}`);
  if (to <= 0 || to > 32)
    throw new Error(`convertRadix2: wrong to=${to}`);
  if (/* @__PURE__ */ radix2carry(from, to) > 32) {
    throw new Error(`convertRadix2: carry overflow from=${from} to=${to} carryBits=${/* @__PURE__ */ radix2carry(from, to)}`);
  }
  let carry = 0;
  let pos = 0;
  const max = powers[from];
  const mask = powers[to] - 1;
  const res = [];
  for (const n of data) {
    anumber3(n);
    if (n >= max)
      throw new Error(`convertRadix2: invalid data word=${n} from=${from}`);
    carry = carry << from | n;
    if (pos + from > 32)
      throw new Error(`convertRadix2: carry overflow pos=${pos} from=${from}`);
    pos += from;
    for (; pos >= to; pos -= to)
      res.push((carry >> pos - to & mask) >>> 0);
    const pow = powers[pos];
    if (pow === void 0)
      throw new Error("invalid carry");
    carry &= pow - 1;
  }
  carry = carry << to - pos & mask;
  if (!padding2 && pos >= from)
    throw new Error("Excess padding");
  if (!padding2 && carry > 0)
    throw new Error(`Non-zero padding: ${carry}`);
  if (padding2 && pos > 0)
    res.push(carry >>> 0);
  return res;
}
// @__NO_SIDE_EFFECTS__
function radix(num) {
  anumber3(num);
  const _256 = 2 ** 8;
  return {
    encode: (bytes) => {
      if (!isBytes3(bytes))
        throw new Error("radix.encode input should be Uint8Array");
      return convertRadix(Array.from(bytes), _256, num);
    },
    decode: (digits) => {
      anumArr("radix.decode", digits);
      return Uint8Array.from(convertRadix(digits, num, _256));
    }
  };
}
// @__NO_SIDE_EFFECTS__
function radix2(bits, revPadding = false) {
  anumber3(bits);
  if (bits <= 0 || bits > 32)
    throw new Error("radix2: bits should be in (0..32]");
  if (/* @__PURE__ */ radix2carry(8, bits) > 32 || /* @__PURE__ */ radix2carry(bits, 8) > 32)
    throw new Error("radix2: carry overflow");
  return {
    encode: (bytes) => {
      if (!isBytes3(bytes))
        throw new Error("radix2.encode input should be Uint8Array");
      return convertRadix2(Array.from(bytes), 8, bits, !revPadding);
    },
    decode: (digits) => {
      anumArr("radix2.decode", digits);
      return Uint8Array.from(convertRadix2(digits, bits, 8, revPadding));
    }
  };
}
function checksum(len, fn) {
  anumber3(len);
  afn(fn);
  return {
    encode(data) {
      if (!isBytes3(data))
        throw new Error("checksum.encode: input should be Uint8Array");
      const sum = fn(data).slice(0, len);
      const res = new Uint8Array(data.length + len);
      res.set(data);
      res.set(sum, data.length);
      return res;
    },
    decode(data) {
      if (!isBytes3(data))
        throw new Error("checksum.decode: input should be Uint8Array");
      const payload = data.slice(0, -len);
      const oldChecksum = data.slice(-len);
      const newChecksum = fn(payload).slice(0, len);
      for (let i = 0; i < len; i++)
        if (newChecksum[i] !== oldChecksum[i])
          throw new Error("Invalid checksum");
      return payload;
    }
  };
}
var gcd, radix2carry, powers, utils;
var init_esm = __esm({
  "node_modules/.pnpm/@scure+base@1.2.6/node_modules/@scure/base/lib/esm/index.js"() {
    gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    radix2carry = /* @__NO_SIDE_EFFECTS__ */ (from, to) => from + (to - gcd(from, to));
    powers = /* @__PURE__ */ (() => {
      let res = [];
      for (let i = 0; i < 40; i++)
        res.push(2 ** i);
      return res;
    })();
    utils = {
      alphabet,
      chain,
      checksum,
      convertRadix,
      convertRadix2,
      radix,
      radix2,
      join,
      padding
    };
  }
});

// node_modules/.pnpm/@scure+bip39@1.6.0/node_modules/@scure/bip39/esm/index.js
function nfkd(str) {
  if (typeof str !== "string")
    throw new TypeError("invalid mnemonic type: " + typeof str);
  return str.normalize("NFKD");
}
function normalize(str) {
  const norm = nfkd(str);
  const words = norm.split(" ");
  if (![12, 15, 18, 21, 24].includes(words.length))
    throw new Error("Invalid mnemonic");
  return { nfkd: norm, words };
}
function aentropy(ent) {
  abytes(ent, 16, 20, 24, 28, 32);
}
function generateMnemonic(wordlist2, strength = 128) {
  anumber(strength);
  if (strength % 32 !== 0 || strength > 256)
    throw new TypeError("Invalid entropy");
  return entropyToMnemonic(randomBytes(strength / 8), wordlist2);
}
function getCoder(wordlist2) {
  if (!Array.isArray(wordlist2) || wordlist2.length !== 2048 || typeof wordlist2[0] !== "string")
    throw new Error("Wordlist: expected array of 2048 strings");
  wordlist2.forEach((i) => {
    if (typeof i !== "string")
      throw new Error("wordlist: non-string element: " + i);
  });
  return utils.chain(utils.checksum(1, calcChecksum), utils.radix2(11, true), utils.alphabet(wordlist2));
}
function mnemonicToEntropy(mnemonic, wordlist2) {
  const { words } = normalize(mnemonic);
  const entropy = getCoder(wordlist2).decode(words);
  aentropy(entropy);
  return entropy;
}
function entropyToMnemonic(entropy, wordlist2) {
  aentropy(entropy);
  const words = getCoder(wordlist2).encode(entropy);
  return words.join(isJapanese(wordlist2) ? "\u3000" : " ");
}
function validateMnemonic(mnemonic, wordlist2) {
  try {
    mnemonicToEntropy(mnemonic, wordlist2);
  } catch (e) {
    return false;
  }
  return true;
}
var isJapanese, calcChecksum;
var init_esm2 = __esm({
  "node_modules/.pnpm/@scure+bip39@1.6.0/node_modules/@scure/bip39/esm/index.js"() {
    init_sha2();
    init_utils();
    init_esm();
    isJapanese = (wordlist2) => wordlist2[0] === "\u3042\u3044\u3053\u304F\u3057\u3093";
    calcChecksum = (entropy) => {
      const bitsLeft = 8 - entropy.length / 4;
      return new Uint8Array([sha256(entropy)[0] >> bitsLeft << bitsLeft]);
    };
  }
});

// node_modules/.pnpm/@scure+bip39@1.6.0/node_modules/@scure/bip39/esm/wordlists/english.js
var wordlist;
var init_english = __esm({
  "node_modules/.pnpm/@scure+bip39@1.6.0/node_modules/@scure/bip39/esm/wordlists/english.js"() {
    wordlist = `abandon
ability
able
about
above
absent
absorb
abstract
absurd
abuse
access
accident
account
accuse
achieve
acid
acoustic
acquire
across
act
action
actor
actress
actual
adapt
add
addict
address
adjust
admit
adult
advance
advice
aerobic
affair
afford
afraid
again
age
agent
agree
ahead
aim
air
airport
aisle
alarm
album
alcohol
alert
alien
all
alley
allow
almost
alone
alpha
already
also
alter
always
amateur
amazing
among
amount
amused
analyst
anchor
ancient
anger
angle
angry
animal
ankle
announce
annual
another
answer
antenna
antique
anxiety
any
apart
apology
appear
apple
approve
april
arch
arctic
area
arena
argue
arm
armed
armor
army
around
arrange
arrest
arrive
arrow
art
artefact
artist
artwork
ask
aspect
assault
asset
assist
assume
asthma
athlete
atom
attack
attend
attitude
attract
auction
audit
august
aunt
author
auto
autumn
average
avocado
avoid
awake
aware
away
awesome
awful
awkward
axis
baby
bachelor
bacon
badge
bag
balance
balcony
ball
bamboo
banana
banner
bar
barely
bargain
barrel
base
basic
basket
battle
beach
bean
beauty
because
become
beef
before
begin
behave
behind
believe
below
belt
bench
benefit
best
betray
better
between
beyond
bicycle
bid
bike
bind
biology
bird
birth
bitter
black
blade
blame
blanket
blast
bleak
bless
blind
blood
blossom
blouse
blue
blur
blush
board
boat
body
boil
bomb
bone
bonus
book
boost
border
boring
borrow
boss
bottom
bounce
box
boy
bracket
brain
brand
brass
brave
bread
breeze
brick
bridge
brief
bright
bring
brisk
broccoli
broken
bronze
broom
brother
brown
brush
bubble
buddy
budget
buffalo
build
bulb
bulk
bullet
bundle
bunker
burden
burger
burst
bus
business
busy
butter
buyer
buzz
cabbage
cabin
cable
cactus
cage
cake
call
calm
camera
camp
can
canal
cancel
candy
cannon
canoe
canvas
canyon
capable
capital
captain
car
carbon
card
cargo
carpet
carry
cart
case
cash
casino
castle
casual
cat
catalog
catch
category
cattle
caught
cause
caution
cave
ceiling
celery
cement
census
century
cereal
certain
chair
chalk
champion
change
chaos
chapter
charge
chase
chat
cheap
check
cheese
chef
cherry
chest
chicken
chief
child
chimney
choice
choose
chronic
chuckle
chunk
churn
cigar
cinnamon
circle
citizen
city
civil
claim
clap
clarify
claw
clay
clean
clerk
clever
click
client
cliff
climb
clinic
clip
clock
clog
close
cloth
cloud
clown
club
clump
cluster
clutch
coach
coast
coconut
code
coffee
coil
coin
collect
color
column
combine
come
comfort
comic
common
company
concert
conduct
confirm
congress
connect
consider
control
convince
cook
cool
copper
copy
coral
core
corn
correct
cost
cotton
couch
country
couple
course
cousin
cover
coyote
crack
cradle
craft
cram
crane
crash
crater
crawl
crazy
cream
credit
creek
crew
cricket
crime
crisp
critic
crop
cross
crouch
crowd
crucial
cruel
cruise
crumble
crunch
crush
cry
crystal
cube
culture
cup
cupboard
curious
current
curtain
curve
cushion
custom
cute
cycle
dad
damage
damp
dance
danger
daring
dash
daughter
dawn
day
deal
debate
debris
decade
december
decide
decline
decorate
decrease
deer
defense
define
defy
degree
delay
deliver
demand
demise
denial
dentist
deny
depart
depend
deposit
depth
deputy
derive
describe
desert
design
desk
despair
destroy
detail
detect
develop
device
devote
diagram
dial
diamond
diary
dice
diesel
diet
differ
digital
dignity
dilemma
dinner
dinosaur
direct
dirt
disagree
discover
disease
dish
dismiss
disorder
display
distance
divert
divide
divorce
dizzy
doctor
document
dog
doll
dolphin
domain
donate
donkey
donor
door
dose
double
dove
draft
dragon
drama
drastic
draw
dream
dress
drift
drill
drink
drip
drive
drop
drum
dry
duck
dumb
dune
during
dust
dutch
duty
dwarf
dynamic
eager
eagle
early
earn
earth
easily
east
easy
echo
ecology
economy
edge
edit
educate
effort
egg
eight
either
elbow
elder
electric
elegant
element
elephant
elevator
elite
else
embark
embody
embrace
emerge
emotion
employ
empower
empty
enable
enact
end
endless
endorse
enemy
energy
enforce
engage
engine
enhance
enjoy
enlist
enough
enrich
enroll
ensure
enter
entire
entry
envelope
episode
equal
equip
era
erase
erode
erosion
error
erupt
escape
essay
essence
estate
eternal
ethics
evidence
evil
evoke
evolve
exact
example
excess
exchange
excite
exclude
excuse
execute
exercise
exhaust
exhibit
exile
exist
exit
exotic
expand
expect
expire
explain
expose
express
extend
extra
eye
eyebrow
fabric
face
faculty
fade
faint
faith
fall
false
fame
family
famous
fan
fancy
fantasy
farm
fashion
fat
fatal
father
fatigue
fault
favorite
feature
february
federal
fee
feed
feel
female
fence
festival
fetch
fever
few
fiber
fiction
field
figure
file
film
filter
final
find
fine
finger
finish
fire
firm
first
fiscal
fish
fit
fitness
fix
flag
flame
flash
flat
flavor
flee
flight
flip
float
flock
floor
flower
fluid
flush
fly
foam
focus
fog
foil
fold
follow
food
foot
force
forest
forget
fork
fortune
forum
forward
fossil
foster
found
fox
fragile
frame
frequent
fresh
friend
fringe
frog
front
frost
frown
frozen
fruit
fuel
fun
funny
furnace
fury
future
gadget
gain
galaxy
gallery
game
gap
garage
garbage
garden
garlic
garment
gas
gasp
gate
gather
gauge
gaze
general
genius
genre
gentle
genuine
gesture
ghost
giant
gift
giggle
ginger
giraffe
girl
give
glad
glance
glare
glass
glide
glimpse
globe
gloom
glory
glove
glow
glue
goat
goddess
gold
good
goose
gorilla
gospel
gossip
govern
gown
grab
grace
grain
grant
grape
grass
gravity
great
green
grid
grief
grit
grocery
group
grow
grunt
guard
guess
guide
guilt
guitar
gun
gym
habit
hair
half
hammer
hamster
hand
happy
harbor
hard
harsh
harvest
hat
have
hawk
hazard
head
health
heart
heavy
hedgehog
height
hello
helmet
help
hen
hero
hidden
high
hill
hint
hip
hire
history
hobby
hockey
hold
hole
holiday
hollow
home
honey
hood
hope
horn
horror
horse
hospital
host
hotel
hour
hover
hub
huge
human
humble
humor
hundred
hungry
hunt
hurdle
hurry
hurt
husband
hybrid
ice
icon
idea
identify
idle
ignore
ill
illegal
illness
image
imitate
immense
immune
impact
impose
improve
impulse
inch
include
income
increase
index
indicate
indoor
industry
infant
inflict
inform
inhale
inherit
initial
inject
injury
inmate
inner
innocent
input
inquiry
insane
insect
inside
inspire
install
intact
interest
into
invest
invite
involve
iron
island
isolate
issue
item
ivory
jacket
jaguar
jar
jazz
jealous
jeans
jelly
jewel
job
join
joke
journey
joy
judge
juice
jump
jungle
junior
junk
just
kangaroo
keen
keep
ketchup
key
kick
kid
kidney
kind
kingdom
kiss
kit
kitchen
kite
kitten
kiwi
knee
knife
knock
know
lab
label
labor
ladder
lady
lake
lamp
language
laptop
large
later
latin
laugh
laundry
lava
law
lawn
lawsuit
layer
lazy
leader
leaf
learn
leave
lecture
left
leg
legal
legend
leisure
lemon
lend
length
lens
leopard
lesson
letter
level
liar
liberty
library
license
life
lift
light
like
limb
limit
link
lion
liquid
list
little
live
lizard
load
loan
lobster
local
lock
logic
lonely
long
loop
lottery
loud
lounge
love
loyal
lucky
luggage
lumber
lunar
lunch
luxury
lyrics
machine
mad
magic
magnet
maid
mail
main
major
make
mammal
man
manage
mandate
mango
mansion
manual
maple
marble
march
margin
marine
market
marriage
mask
mass
master
match
material
math
matrix
matter
maximum
maze
meadow
mean
measure
meat
mechanic
medal
media
melody
melt
member
memory
mention
menu
mercy
merge
merit
merry
mesh
message
metal
method
middle
midnight
milk
million
mimic
mind
minimum
minor
minute
miracle
mirror
misery
miss
mistake
mix
mixed
mixture
mobile
model
modify
mom
moment
monitor
monkey
monster
month
moon
moral
more
morning
mosquito
mother
motion
motor
mountain
mouse
move
movie
much
muffin
mule
multiply
muscle
museum
mushroom
music
must
mutual
myself
mystery
myth
naive
name
napkin
narrow
nasty
nation
nature
near
neck
need
negative
neglect
neither
nephew
nerve
nest
net
network
neutral
never
news
next
nice
night
noble
noise
nominee
noodle
normal
north
nose
notable
note
nothing
notice
novel
now
nuclear
number
nurse
nut
oak
obey
object
oblige
obscure
observe
obtain
obvious
occur
ocean
october
odor
off
offer
office
often
oil
okay
old
olive
olympic
omit
once
one
onion
online
only
open
opera
opinion
oppose
option
orange
orbit
orchard
order
ordinary
organ
orient
original
orphan
ostrich
other
outdoor
outer
output
outside
oval
oven
over
own
owner
oxygen
oyster
ozone
pact
paddle
page
pair
palace
palm
panda
panel
panic
panther
paper
parade
parent
park
parrot
party
pass
patch
path
patient
patrol
pattern
pause
pave
payment
peace
peanut
pear
peasant
pelican
pen
penalty
pencil
people
pepper
perfect
permit
person
pet
phone
photo
phrase
physical
piano
picnic
picture
piece
pig
pigeon
pill
pilot
pink
pioneer
pipe
pistol
pitch
pizza
place
planet
plastic
plate
play
please
pledge
pluck
plug
plunge
poem
poet
point
polar
pole
police
pond
pony
pool
popular
portion
position
possible
post
potato
pottery
poverty
powder
power
practice
praise
predict
prefer
prepare
present
pretty
prevent
price
pride
primary
print
priority
prison
private
prize
problem
process
produce
profit
program
project
promote
proof
property
prosper
protect
proud
provide
public
pudding
pull
pulp
pulse
pumpkin
punch
pupil
puppy
purchase
purity
purpose
purse
push
put
puzzle
pyramid
quality
quantum
quarter
question
quick
quit
quiz
quote
rabbit
raccoon
race
rack
radar
radio
rail
rain
raise
rally
ramp
ranch
random
range
rapid
rare
rate
rather
raven
raw
razor
ready
real
reason
rebel
rebuild
recall
receive
recipe
record
recycle
reduce
reflect
reform
refuse
region
regret
regular
reject
relax
release
relief
rely
remain
remember
remind
remove
render
renew
rent
reopen
repair
repeat
replace
report
require
rescue
resemble
resist
resource
response
result
retire
retreat
return
reunion
reveal
review
reward
rhythm
rib
ribbon
rice
rich
ride
ridge
rifle
right
rigid
ring
riot
ripple
risk
ritual
rival
river
road
roast
robot
robust
rocket
romance
roof
rookie
room
rose
rotate
rough
round
route
royal
rubber
rude
rug
rule
run
runway
rural
sad
saddle
sadness
safe
sail
salad
salmon
salon
salt
salute
same
sample
sand
satisfy
satoshi
sauce
sausage
save
say
scale
scan
scare
scatter
scene
scheme
school
science
scissors
scorpion
scout
scrap
screen
script
scrub
sea
search
season
seat
second
secret
section
security
seed
seek
segment
select
sell
seminar
senior
sense
sentence
series
service
session
settle
setup
seven
shadow
shaft
shallow
share
shed
shell
sheriff
shield
shift
shine
ship
shiver
shock
shoe
shoot
shop
short
shoulder
shove
shrimp
shrug
shuffle
shy
sibling
sick
side
siege
sight
sign
silent
silk
silly
silver
similar
simple
since
sing
siren
sister
situate
six
size
skate
sketch
ski
skill
skin
skirt
skull
slab
slam
sleep
slender
slice
slide
slight
slim
slogan
slot
slow
slush
small
smart
smile
smoke
smooth
snack
snake
snap
sniff
snow
soap
soccer
social
sock
soda
soft
solar
soldier
solid
solution
solve
someone
song
soon
sorry
sort
soul
sound
soup
source
south
space
spare
spatial
spawn
speak
special
speed
spell
spend
sphere
spice
spider
spike
spin
spirit
split
spoil
sponsor
spoon
sport
spot
spray
spread
spring
spy
square
squeeze
squirrel
stable
stadium
staff
stage
stairs
stamp
stand
start
state
stay
steak
steel
stem
step
stereo
stick
still
sting
stock
stomach
stone
stool
story
stove
strategy
street
strike
strong
struggle
student
stuff
stumble
style
subject
submit
subway
success
such
sudden
suffer
sugar
suggest
suit
summer
sun
sunny
sunset
super
supply
supreme
sure
surface
surge
surprise
surround
survey
suspect
sustain
swallow
swamp
swap
swarm
swear
sweet
swift
swim
swing
switch
sword
symbol
symptom
syrup
system
table
tackle
tag
tail
talent
talk
tank
tape
target
task
taste
tattoo
taxi
teach
team
tell
ten
tenant
tennis
tent
term
test
text
thank
that
theme
then
theory
there
they
thing
this
thought
three
thrive
throw
thumb
thunder
ticket
tide
tiger
tilt
timber
time
tiny
tip
tired
tissue
title
toast
tobacco
today
toddler
toe
together
toilet
token
tomato
tomorrow
tone
tongue
tonight
tool
tooth
top
topic
topple
torch
tornado
tortoise
toss
total
tourist
toward
tower
town
toy
track
trade
traffic
tragic
train
transfer
trap
trash
travel
tray
treat
tree
trend
trial
tribe
trick
trigger
trim
trip
trophy
trouble
truck
true
truly
trumpet
trust
truth
try
tube
tuition
tumble
tuna
tunnel
turkey
turn
turtle
twelve
twenty
twice
twin
twist
two
type
typical
ugly
umbrella
unable
unaware
uncle
uncover
under
undo
unfair
unfold
unhappy
uniform
unique
unit
universe
unknown
unlock
until
unusual
unveil
update
upgrade
uphold
upon
upper
upset
urban
urge
usage
use
used
useful
useless
usual
utility
vacant
vacuum
vague
valid
valley
valve
van
vanish
vapor
various
vast
vault
vehicle
velvet
vendor
venture
venue
verb
verify
version
very
vessel
veteran
viable
vibrant
vicious
victory
video
view
village
vintage
violin
virtual
virus
visa
visit
visual
vital
vivid
vocal
voice
void
volcano
volume
vote
voyage
wage
wagon
wait
walk
wall
walnut
want
warfare
warm
warrior
wash
wasp
waste
water
wave
way
wealth
weapon
wear
weasel
weather
web
wedding
weekend
weird
welcome
west
wet
whale
what
wheat
wheel
when
where
whip
whisper
wide
width
wife
wild
will
win
window
wine
wing
wink
winner
winter
wire
wisdom
wise
wish
witness
wolf
woman
wonder
wood
wool
word
work
world
worry
worth
wrap
wreck
wrestle
wrist
write
wrong
yard
year
yellow
you
young
youth
zebra
zero
zone
zoo`.split("\n");
  }
});

// packages/crypto-core/src/recovery.ts
function generateRecoveryMnemonic() {
  return generateMnemonic(wordlist, 256);
}
function isValidRecoveryMnemonic(mnemonic) {
  return validateMnemonic(mnemonic.trim(), wordlist);
}
function deriveRecoveryKey(mnemonic, salt, params) {
  return argon2id(utf8ToBytes2(mnemonic.normalize("NFKD").trim()), salt, {
    t: params.t,
    m: params.m,
    p: params.p,
    dkLen: 32
  });
}
function recoveryAad(context, t, m, p, salt) {
  return canonicalBytes({ tag: "vault-recovery/1", kdf: "argon2id", context, t, m, p, salt: toBase64Url(salt) });
}
function paramsValid(t, m, p) {
  return Number.isInteger(t) && t >= 1 && t <= 16 && Number.isInteger(m) && m >= 1024 && m <= 4 * 1024 * 1024 && Number.isInteger(p) && p >= 1 && p <= 16;
}
function createRecoveryBlob(dek, mnemonic, context, params = DEFAULT_RECOVERY_PARAMS) {
  if (dek.length !== DEK_BYTES) throw new Error("DEK must be 32 bytes");
  if (!isValidRecoveryMnemonic(mnemonic)) throw new Error("invalid recovery mnemonic");
  if (typeof context !== "string" || context.length === 0) throw new Error("recovery context required");
  if (!paramsValid(params.t, params.m, params.p)) throw new Error("invalid Argon2id parameters");
  const salt = randomBytes2(SALT_BYTES);
  const key = deriveRecoveryKey(mnemonic, salt, params);
  const nonce = randomBytes2(24);
  const box = xchachaSeal(key, nonce, dek, recoveryAad(context, params.t, params.m, params.p, salt));
  return {
    v: 1,
    kdf: "argon2id",
    context,
    t: params.t,
    m: params.m,
    p: params.p,
    salt: toBase64Url(salt),
    nonce: toBase64Url(nonce),
    ct: toBase64Url(box.ciphertext),
    tag: toBase64Url(box.tag)
  };
}
function restoreDekFromRecovery(blob, mnemonic, expectedContext) {
  try {
    if (!blob || blob.v !== 1 || blob.kdf !== "argon2id") return null;
    if (typeof blob.context !== "string" || blob.context !== expectedContext) return null;
    if (!paramsValid(blob.t, blob.m, blob.p)) return null;
    if (!isValidRecoveryMnemonic(mnemonic)) return null;
    const salt = fromBase64Url(blob.salt);
    const nonce = fromBase64Url(blob.nonce);
    const ct = fromBase64Url(blob.ct);
    const tag = fromBase64Url(blob.tag);
    if (salt.length < 8 || salt.length > 64 || nonce.length !== 24 || tag.length !== 16 || ct.length !== DEK_BYTES) {
      return null;
    }
    const key = deriveRecoveryKey(mnemonic, salt, { t: blob.t, m: blob.m, p: blob.p });
    const pt = xchachaOpen(key, nonce, ct, tag, recoveryAad(blob.context, blob.t, blob.m, blob.p, salt));
    return pt && pt.length === DEK_BYTES ? pt : null;
  } catch {
    return null;
  }
}
function serializeRecoveryBlob(blob) {
  return toBase64Url(utf8ToBytes2(JSON.stringify(blob)));
}
function parseRecoveryBlob(s) {
  const obj = JSON.parse(new TextDecoder().decode(fromBase64Url(s)));
  if (obj.v !== 1 || obj.kdf !== "argon2id") throw new Error("unsupported recovery blob");
  return obj;
}
var DEFAULT_RECOVERY_PARAMS, DEK_BYTES, SALT_BYTES;
var init_recovery = __esm({
  "packages/crypto-core/src/recovery.ts"() {
    "use strict";
    init_argon2();
    init_esm2();
    init_english();
    init_src();
    init_xchacha();
    init_primitives();
    init_encoding();
    DEFAULT_RECOVERY_PARAMS = { t: 3, m: 64 * 1024, p: 1 };
    DEK_BYTES = 32;
    SALT_BYTES = 16;
  }
});

// packages/crypto-core/src/browser.ts
var browser_exports = {};
__export(browser_exports, {
  DEFAULT_RECOVERY_PARAMS: () => DEFAULT_RECOVERY_PARAMS,
  DWEB_SCHEMES: () => DWEB_SCHEMES,
  NamespaceError: () => NamespaceError,
  XCHACHA_KEY_BYTES: () => XCHACHA_KEY_BYTES,
  XCHACHA_NONCE_BYTES: () => XCHACHA_NONCE_BYTES,
  XCHACHA_TAG_BYTES: () => XCHACHA_TAG_BYTES,
  bytesToUtf8: () => bytesToUtf8,
  concatBytes: () => concatBytes2,
  confusableSkeleton: () => confusableSkeleton,
  createRecoveryBlob: () => createRecoveryBlob,
  deriveOriginNamespace: () => deriveOriginNamespace,
  deriveRecoveryKey: () => deriveRecoveryKey,
  deriveSessionKey: () => deriveSessionKey,
  detectHomograph: () => detectHomograph,
  ed25519Generate: () => ed25519Generate,
  ed25519PublicFromSeed: () => ed25519PublicFromSeed,
  ed25519Sign: () => ed25519Sign,
  ed25519Verify: () => ed25519Verify,
  fromBase64Url: () => fromBase64Url,
  fromHex: () => fromHex,
  generateRecoveryMnemonic: () => generateRecoveryMnemonic,
  hashJsonValue: () => hashJsonValue,
  hchacha20: () => hchacha20,
  hkdfSha256: () => hkdfSha256,
  isMixedScript: () => isMixedScript,
  isValidRecoveryMnemonic: () => isValidRecoveryMnemonic,
  openEnvelope: () => openEnvelope,
  parseRecoveryBlob: () => parseRecoveryBlob,
  randomBytes: () => randomBytes2,
  restoreDekFromRecovery: () => restoreDekFromRecovery,
  sealEnvelope: () => sealEnvelope,
  serializeRecoveryBlob: () => serializeRecoveryBlob,
  sha256: () => sha2562,
  signDelegation: () => signDelegation,
  signIdentityRecord: () => signIdentityRecord,
  signTyped: () => signTyped,
  stableJsonStringify: () => stableJsonStringify,
  storageKeyForNamespace: () => storageKeyForNamespace,
  timingSafeEqual: () => timingSafeEqual,
  toBase64Url: () => toBase64Url,
  toHex: () => toHex,
  transcriptHash: () => transcriptHash,
  utf8ToBytes: () => utf8ToBytes2,
  verifyDelegation: () => verifyDelegation,
  verifyIdentityRecordProof: () => verifyIdentityRecordProof,
  verifyTyped: () => verifyTyped,
  x25519Generate: () => x25519Generate,
  x25519PublicFromPrivate: () => x25519PublicFromPrivate,
  x25519SharedSecret: () => x25519SharedSecret,
  xchachaOpen: () => xchachaOpen,
  xchachaSeal: () => xchachaSeal
});
var init_browser = __esm({
  "packages/crypto-core/src/browser.ts"() {
    "use strict";
    init_encoding();
    init_primitives();
    init_xchacha();
    init_handshake();
    init_session_envelope();
    init_namespace();
    init_identity();
    init_signing();
    init_value_hash();
    init_recovery();
  }
});

// packages/vault-core/src/in-memory.ts
var PACK_VERSION, InMemoryKeystore, InMemoryStorage, StaticIdentityResolver, StaticRevocationChecker, AutoConsent;
var init_in_memory = __esm({
  "packages/vault-core/src/in-memory.ts"() {
    "use strict";
    init_browser();
    init_src();
    PACK_VERSION = 1;
    InMemoryKeystore = class {
      masterDek;
      device;
      id;
      authResponder;
      unlocked;
      constructor(opts = {}) {
        this.masterDek = randomBytes2(32);
        this.device = ed25519Generate();
        this.id = opts.vaultId ?? toBase64Url(randomBytes2(16));
        this.authResponder = opts.authResponder ?? (() => true);
        this.unlocked = !opts.startsLocked;
      }
      isUnlocked() {
        return this.unlocked;
      }
      async unlock(req) {
        if (this.unlocked) return true;
        const ok = await this.authResponder(req ?? { reason: "unlock", prompt: "Unlock your vault" });
        if (ok) this.unlocked = true;
        return ok;
      }
      lock() {
        this.unlocked = false;
      }
      async authenticate(req) {
        return this.authResponder(req);
      }
      nsKey(storageKey) {
        if (!this.unlocked) throw VaultError.of("VaultLocked");
        const salt = sha2562(utf8ToBytes2(`vault-ns-salt|${storageKey}`));
        const info = utf8ToBytes2(`vault-ns/v1|${storageKey}`);
        return hkdfSha256(this.masterDek, salt, info, 32);
      }
      async sealNamespace(storageKey, aad, plaintext) {
        const key = this.nsKey(storageKey);
        const nonce = randomBytes2(24);
        const box = xchachaSeal(key, nonce, plaintext, aad);
        return concatBytes2(new Uint8Array([PACK_VERSION]), box.nonce, box.tag, box.ciphertext);
      }
      async openNamespace(storageKey, aad, blob) {
        const key = this.nsKey(storageKey);
        if (blob.length < 1 + 24 + 16 || blob[0] !== PACK_VERSION) return null;
        const nonce = blob.subarray(1, 25);
        const tag = blob.subarray(25, 41);
        const ct = blob.subarray(41);
        return xchachaOpen(key, nonce, ct, tag, aad);
      }
      deviceKeyPublic() {
        return toBase64Url(this.device.publicKey);
      }
      async signDevice(bytes) {
        return toBase64Url(ed25519Sign(bytes, this.device.privateKey));
      }
      vaultId() {
        return this.id;
      }
    };
    InMemoryStorage = class {
      map = /* @__PURE__ */ new Map();
      async get(key) {
        return this.map.get(key) ?? null;
      }
      async put(key, value) {
        this.map.set(key, value);
      }
      async delete(key) {
        this.map.delete(key);
      }
      async listKeys(prefix) {
        return [...this.map.keys()].filter((k) => k.startsWith(prefix));
      }
    };
    StaticIdentityResolver = class {
      records = /* @__PURE__ */ new Map();
      set(record) {
        this.records.set(record.domain, record);
      }
      remove(domain) {
        this.records.delete(domain);
      }
      async resolve(domain) {
        return this.records.get(domain) ?? null;
      }
    };
    StaticRevocationChecker = class {
      revoked = /* @__PURE__ */ new Set();
      revoke(statusEndpoint, kid) {
        this.revoked.add(`${statusEndpoint}|${kid}`);
      }
      async isRevoked(statusEndpoint, kid) {
        return this.revoked.has(`${statusEndpoint}|${kid}`);
      }
    };
    AutoConsent = class {
      constructor(decide = () => ({
        approved: true
      })) {
        this.decide = decide;
      }
      async requestConnect(req) {
        return this.decide(req);
      }
    };
  }
});

// packages/vault-core/src/json-pointer.ts
function parsePointer(pointer) {
  if (typeof pointer !== "string") throw VaultError.of("FieldOutOfScope", "pointer must be a string");
  if (utf8.encode(pointer).length > MAX_FIELD_PATH_LEN) throw VaultError.of("QuotaExceeded", "pointer too long");
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) {
    throw VaultError.of("FieldOutOfScope", `pointer must be empty or start with '/': ${pointer}`);
  }
  const parts = pointer.split("/").slice(1);
  if (parts.length > MAX_TOKENS) {
    throw VaultError.of("QuotaExceeded", "pointer too deep");
  }
  const tokens = parts.map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  for (const t of tokens) {
    if (FORBIDDEN_TOKENS.has(t)) throw VaultError.of("FieldOutOfScope", `disallowed pointer token: ${t}`);
  }
  return tokens;
}
function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function pointerGet(doc, pointer) {
  const tokens = parsePointer(pointer);
  let cur = doc;
  for (const t of tokens) {
    if (cur === void 0 || cur === null) return void 0;
    if (Array.isArray(cur)) {
      const arr = cur;
      const idx = t === "-" ? arr.length : Number(t);
      if (!Number.isInteger(idx) || idx < 0 || idx >= arr.length) return void 0;
      cur = arr[idx];
    } else if (isPlainObject(cur)) {
      if (!Object.prototype.hasOwnProperty.call(cur, t)) return void 0;
      cur = cur[t];
    } else {
      return void 0;
    }
  }
  return cur;
}
function pointerSet(doc, pointer, value) {
  const tokens = parsePointer(pointer);
  if (tokens.length === 0) return value;
  const root = doc === void 0 || doc === null ? {} : structuredClone(doc);
  let cur = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (isPlainObject(cur)) {
      const next = cur[t];
      if (!isPlainObject(next) && !Array.isArray(next)) cur[t] = {};
      cur = cur[t];
    } else if (Array.isArray(cur)) {
      const idx = t === "-" ? cur.length : Number(t);
      if (!Number.isInteger(idx) || idx < 0 || idx > cur.length) {
        throw VaultError.of("FieldOutOfScope", `bad array index: ${t}`);
      }
      if (!isPlainObject(cur[idx]) && !Array.isArray(cur[idx])) cur[idx] = {};
      cur = cur[idx];
    } else {
      throw VaultError.of("FieldOutOfScope", `cannot descend into non-container at '${t}'`);
    }
  }
  const last = tokens[tokens.length - 1];
  if (isPlainObject(cur)) {
    cur[last] = value;
  } else if (Array.isArray(cur)) {
    const idx = last === "-" ? cur.length : Number(last);
    if (!Number.isInteger(idx) || idx < 0 || idx > cur.length) {
      throw VaultError.of("FieldOutOfScope", `bad array index: ${last}`);
    }
    cur[idx] = value;
  } else {
    throw VaultError.of("FieldOutOfScope", "cannot set on a non-container");
  }
  return root;
}
function pointerRemove(doc, pointer) {
  const tokens = parsePointer(pointer);
  if (tokens.length === 0) return null;
  const root = structuredClone(doc);
  let cur = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (isPlainObject(cur)) cur = cur[t];
    else if (Array.isArray(cur)) cur = cur[Number(t)];
    else return root;
    if (cur === void 0) return root;
  }
  const last = tokens[tokens.length - 1];
  if (isPlainObject(cur)) {
    delete cur[last];
  } else if (Array.isArray(cur)) {
    const idx = Number(last);
    if (Number.isInteger(idx) && idx >= 0 && idx < cur.length) cur.splice(idx, 1);
  }
  return root;
}
function withinDepth(v, maxDepth) {
  const isContainer = Array.isArray(v) || isPlainObject(v);
  if (isContainer) {
    if (maxDepth <= 0) return false;
    const children = Array.isArray(v) ? v : Object.values(v);
    return children.every((x) => withinDepth(x, maxDepth - 1));
  }
  return true;
}
function applyPatch(doc, ops) {
  let cur = doc;
  for (const op of ops) {
    switch (op.op) {
      case "add":
      case "replace":
        cur = pointerSet(cur, op.path, op.value ?? null);
        break;
      case "remove":
        cur = pointerRemove(cur, op.path);
        break;
      case "test": {
        const got = pointerGet(cur, op.path);
        if (JSON.stringify(got) !== JSON.stringify(op.value ?? null)) {
          throw VaultError.of("VersionConflict", `patch test failed at ${op.path}`);
        }
        break;
      }
      default:
        throw VaultError.of("InvalidRequest", `unsupported patch op`);
    }
  }
  return cur;
}
var MAX_TOKENS, utf8, FORBIDDEN_TOKENS;
var init_json_pointer = __esm({
  "packages/vault-core/src/json-pointer.ts"() {
    "use strict";
    init_src();
    MAX_TOKENS = 64;
    utf8 = new TextEncoder();
    FORBIDDEN_TOKENS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
  }
});

// packages/vault-core/src/grants.ts
function pointerCovers(rulePath, path) {
  const ruleTokens = parsePointer(rulePath);
  const pathTokens = parsePointer(path);
  if (ruleTokens.length > pathTokens.length) return false;
  for (let i = 0; i < ruleTokens.length; i++) {
    if (ruleTokens[i] !== pathTokens[i]) return false;
  }
  return true;
}
function fieldAllows(fields, path, mode) {
  return fields.some((r) => pointerCovers(r.path, path) && (mode === "read" ? r.read : r.write));
}
function pathIsSensitive(fields, path) {
  return fields.some((r) => pointerCovers(r.path, path) && r.sensitive === true);
}
function isUnderShared(path) {
  return pointerCovers(SHARED_POINTER, path);
}
function foreignReadAllows(entry, path) {
  if (!isUnderShared(path)) return false;
  if (!Array.isArray(entry?.paths)) return false;
  return entry.paths.some((p) => typeof p === "string" && isUnderShared(p) && pointerCovers(p, path));
}
function publishAllows(fields, path) {
  return fields.some((r) => r.write && isUnderShared(r.path) && pointerCovers(r.path, path));
}
function intersectScopes(requested, allowedMethods) {
  const methodSet = /* @__PURE__ */ new Set();
  const fields = [];
  for (const scope of requested) {
    for (const m of scope.methods) {
      if (allowedMethods.includes(m)) methodSet.add(m);
    }
    for (const f of scope.fields) fields.push(f);
  }
  return { methods: [...methodSet], fields };
}
function normalizeFields(fields) {
  const byPath = /* @__PURE__ */ new Map();
  for (const f of fields) {
    const existing = byPath.get(f.path);
    if (existing) {
      existing.read = existing.read || f.read;
      existing.write = existing.write || f.write;
      existing.sensitive = existing.sensitive || f.sensitive;
    } else {
      byPath.set(f.path, { ...f });
    }
  }
  return [...byPath.values()];
}
var init_grants = __esm({
  "packages/vault-core/src/grants.ts"() {
    "use strict";
    init_src();
    init_json_pointer();
  }
});

// packages/vault-core/src/replay.ts
var ReplayGuard;
var init_replay = __esm({
  "packages/vault-core/src/replay.ts"() {
    "use strict";
    init_src();
    ReplayGuard = class {
      seen = /* @__PURE__ */ new Map();
      maxEntries;
      maxSkewMs;
      constructor(opts = {}) {
        this.maxEntries = opts.maxEntries ?? 1e5;
        this.maxSkewMs = opts.maxSkewMs ?? REQUEST_MAX_SKEW_MS;
      }
      prune(now) {
        for (const [k, v] of this.seen) {
          if (v.expiry <= now) this.seen.delete(k);
        }
      }
      /**
       * Validate freshness and record the nonce. Throws Expired / NonceReplay /
       * QuotaExceeded. `key` should scope the nonce to a session.
       */
      check(key, nonce, issuedAt, expiry, now) {
        if (!Number.isFinite(issuedAt) || !Number.isFinite(expiry)) {
          throw VaultError.of("Expired", "missing timestamps");
        }
        if (expiry <= now) throw VaultError.of("Expired", "request expired");
        if (issuedAt > now + this.maxSkewMs) throw VaultError.of("Expired", "request issued in the future");
        if (expiry - issuedAt > 10 * 6e4) throw VaultError.of("Expired", "request TTL too long");
        this.prune(now);
        if (this.seen.size >= this.maxEntries) {
          throw VaultError.of("QuotaExceeded", "replay cache saturated");
        }
        const id = `${key}\0${nonce}`;
        if (this.seen.has(id)) throw VaultError.of("NonceReplay");
        this.seen.set(id, { expiry });
      }
    };
  }
});

// packages/vault-core/src/document-store.ts
function docStorageId(storageKey) {
  return `doc:${storageKey}`;
}
function docAad(storageKey) {
  return utf8ToBytes2(`vault-doc/1|${storageKey}`);
}
function versionToEtag(v) {
  return `etag:${v}`;
}
function etagToVersion(etag) {
  if (!etag) return void 0;
  const m = /^etag:(\d+)$/.exec(etag);
  return m ? Number(m[1]) : void 0;
}
var MANIFEST_KEY, MANIFEST_STORAGE_KEY, MANIFEST_AAD, OWNER_KEY, OWNER_DOMAIN, DocumentStore;
var init_document_store = __esm({
  "packages/vault-core/src/document-store.ts"() {
    "use strict";
    init_browser();
    init_src();
    MANIFEST_KEY = "manifest";
    MANIFEST_STORAGE_KEY = "__vault_manifest__";
    MANIFEST_AAD = utf8ToBytes2("vault-manifest/1");
    OWNER_KEY = "manifest-owner";
    OWNER_DOMAIN = "vault-owner/1|";
    DocumentStore = class {
      constructor(keystore, storage) {
        this.keystore = keystore;
        this.storage = storage;
      }
      /**
       * Every mutation runs through this one queue. A per-namespace lock would not
       * be enough, for two reasons:
       *
       *  1. `save` does a read-modify-write on the SHARED manifest, so two saves to
       *     different namespaces can each load the manifest, each add their own
       *     entry, and the second write drops the first's.
       *  2. Nothing lets the store assume the adapter makes overlapping writes to
       *     one key atomic against each other; a real filesystem adapter with a
       *     shared temp path tore blobs in practice.
       *
       * Vault writes are small and rare — a dapp saving a profile — so strict
       * serialisation costs nothing measurable and is obviously correct.
       */
      writeQueue = Promise.resolve();
      /**
       * Run `fn` after every previously queued mutation has settled, and before any
       * queued after it. Callers that do load → modify → `save` MUST wrap the whole
       * sequence, or two of them can both load the same version and the second save
       * silently discards the first's changes.
       */
      serialize(fn) {
        const run = this.writeQueue.then(fn, fn);
        this.writeQueue = run.then(
          () => void 0,
          () => void 0
        );
        return run;
      }
      async loadManifest() {
        const blob = await this.storage.get(MANIFEST_KEY);
        if (!blob) return {};
        const pt = await this.keystore.openNamespace(MANIFEST_STORAGE_KEY, MANIFEST_AAD, blob);
        if (pt === null) throw await this.authFailure("manifest");
        return JSON.parse(bytesToUtf8(pt));
      }
      async saveManifest(m) {
        const blob = await this.keystore.sealNamespace(MANIFEST_STORAGE_KEY, MANIFEST_AAD, utf8ToBytes2(JSON.stringify(m)));
        await this.storage.put(MANIFEST_KEY, blob);
        await this.recordOwner();
      }
      /** The current keystore's owner fingerprint, or null if it cannot be read (locked). */
      ownerFingerprint() {
        let id;
        try {
          id = this.keystore.vaultId();
        } catch {
          return null;
        }
        if (typeof id !== "string" || id.length === 0) return null;
        return toHex(sha2562(utf8ToBytes2(OWNER_DOMAIN + id)));
      }
      /** Write the owner fingerprint if absent or stale. One read per save; a write only on change. */
      async recordOwner() {
        const current = this.ownerFingerprint();
        if (!current) return;
        const stored = await this.storage.get(OWNER_KEY);
        if (stored && bytesToUtf8(stored) === current) return;
        await this.storage.put(OWNER_KEY, utf8ToBytes2(current));
      }
      /**
       * Build the KeyInvalidated error for a blob that failed to authenticate, naming
       * the cause when the owner fingerprint lets us: sealed by a different identity,
       * or corrupt under the right one. `unknown` when no fingerprint was recorded
       * (stores written before this existed) or the keystore is locked.
       */
      async authFailure(what) {
        const stored = await this.storage.get(OWNER_KEY);
        const current = this.ownerFingerprint();
        let reason = "unknown";
        if (stored && current) reason = bytesToUtf8(stored) === current ? "corrupt" : "wrong-identity";
        const message = reason === "wrong-identity" ? `${what} was sealed under a different identity (mnemonic) than the one unlocked now` : reason === "corrupt" ? `${what} is corrupt \u2014 it failed to authenticate under the identity that sealed it` : `${what} failed to authenticate`;
        return VaultError.of("KeyInvalidated", message, { reason });
      }
      /** Load a namespace document, enforcing anti-rollback against the manifest. */
      async load(storageKey) {
        const manifest = await this.loadManifest();
        const expected = manifest[storageKey] ?? 0;
        const blob = await this.storage.get(docStorageId(storageKey));
        if (!blob) {
          if (expected > 0) throw VaultError.of("KeyInvalidated", "namespace blob missing (rollback/deletion)");
          return { doc: {}, version: 0 };
        }
        const pt = await this.keystore.openNamespace(storageKey, docAad(storageKey), blob);
        if (pt === null) throw await this.authFailure("namespace blob");
        const parsed = JSON.parse(bytesToUtf8(pt));
        if (parsed.v < expected) throw VaultError.of("KeyInvalidated", "namespace blob is stale (rollback)");
        return { doc: parsed.doc, version: parsed.v };
      }
      /**
       * Persist a new version of a namespace document and advance the manifest.
       * Call only inside `serialize` — see the note there.
       */
      async save(storageKey, doc, newVersion) {
        const payload = { v: newVersion, doc };
        const blob = await this.keystore.sealNamespace(storageKey, docAad(storageKey), utf8ToBytes2(JSON.stringify(payload)));
        await this.storage.put(docStorageId(storageKey), blob);
        const manifest = await this.loadManifest();
        manifest[storageKey] = newVersion;
        await this.saveManifest(manifest);
      }
      /**
       * Owner-initiated deletion of a namespace's document. Removes the sealed blob
       * AND clears its manifest entry, so the anti-rollback guard in `load` treats a
       * later absence as "never existed" rather than a rollback/deletion attack. This
       * is the ONLY legitimate way to drop a namespace; a bare `storage.delete` would
       * leave the manifest expecting the blob and brick every future load.
       *
       * The manifest is loaded BEFORE the blob is removed. In the other order, a
       * manifest that fails to open leaves the blob already gone with the manifest
       * still expecting it — the exact bricked state this method exists to prevent.
       * Serialised with every other mutation.
       */
      async deleteNamespace(storageKey) {
        await this.serialize(async () => {
          const manifest = await this.loadManifest();
          await this.storage.delete(docStorageId(storageKey));
          if (storageKey in manifest) {
            delete manifest[storageKey];
            await this.saveManifest(manifest);
          }
        });
      }
    };
  }
});

// packages/vault-core/src/session.ts
var SessionStore;
var init_session = __esm({
  "packages/vault-core/src/session.ts"() {
    "use strict";
    SessionStore = class {
      sessions = /* @__PURE__ */ new Map();
      create(session) {
        this.sessions.set(session.id, session);
      }
      get(id) {
        return this.sessions.get(id);
      }
      delete(id) {
        this.sessions.delete(id);
      }
      all() {
        return [...this.sessions.values()];
      }
      /** Sessions addressing a namespace (for cross-session change fan-out). */
      forNamespace(namespace) {
        return this.all().filter((s) => s.namespace === namespace);
      }
    };
  }
});

// packages/vault-core/src/engine.ts
function normalizeForeignPaths(paths) {
  const kept = [];
  for (const p of paths ?? []) {
    parsePointer(p);
    if (!isUnderShared(p)) {
      throw VaultError.of("FieldOutOfScope", `cross-origin reads are limited to ${SHARED_POINTER}`);
    }
    if (p === SHARED_POINTER) return [SHARED_POINTER];
    kept.push(p);
  }
  return [...new Set(kept)];
}
function clampForeignToRequested(granted, requested) {
  const byNamespace = new Map(requested.map((e) => [e.namespace, e]));
  const out = [];
  for (const g of granted) {
    const want = byNamespace.get(g.namespace);
    if (!want) continue;
    const paths = normalizeForeignPaths(g.paths ?? []).filter(
      (p) => want.paths.some((w) => pointerCovers(w, p))
    );
    if (paths.length > 0) out.push({ ...want, paths });
  }
  return out;
}
var VaultEngine;
var init_engine = __esm({
  "packages/vault-core/src/engine.ts"() {
    "use strict";
    init_src();
    init_browser();
    init_browser();
    init_adapters();
    init_document_store();
    init_grants();
    init_json_pointer();
    init_replay();
    init_session();
    VaultEngine = class {
      keystore;
      resolver;
      consent;
      verifier;
      revocation;
      revocationRecheckMs;
      clock;
      docStore;
      sessions = new SessionStore();
      replay = new ReplayGuard();
      sessionTtlMs;
      randomId;
      knownDomains;
      emitter;
      constructor(config) {
        this.keystore = config.keystore;
        this.resolver = config.resolver;
        this.consent = config.consent;
        this.verifier = config.verifier;
        this.revocation = config.revocation;
        this.revocationRecheckMs = config.revocationRecheckMs ?? 6e4;
        this.clock = config.clock ?? systemClock;
        this.docStore = new DocumentStore(config.keystore, config.storage);
        this.sessionTtlMs = config.sessionTtlMs ?? SESSION_DEFAULT_TTL_MS;
        this.randomId = config.randomId ?? (() => toBase64Url(randomBytes2(16)));
        this.knownDomains = config.knownDomains ?? [];
      }
      setEmitter(fn) {
        this.emitter = fn;
      }
      /** This vault's stable install id (used in typed-domain separation). */
      vaultId() {
        return this.keystore.vaultId();
      }
      /** Connected apps, for the vault's own management UI. */
      listConnections() {
        return this.sessions.all().map((s) => ({ sessionId: s.id, grant: s.grant, expiresAt: s.expiresAt }));
      }
      /** User-initiated revocation from the vault UI (no signed request required). */
      adminRevoke(sessionId) {
        this.sessions.delete(sessionId);
      }
      // --------------------------------------------------------------------------
      // Owner / admin plane (vault management UI)
      //
      // These operate on a namespace's storageKey directly and INTENTIONALLY bypass
      // the per-site grant model — they serve the vault OWNER managing their own data
      // through a trusted management surface (the browser's wallet UI), never a
      // website. They must never be reachable from a site's provider path.
      // --------------------------------------------------------------------------
      /** Owner view: decrypt and return a namespace's whole document. Requires unlock. */
      async adminReadPartition(storageKey) {
        if (!this.keystore.isUnlocked()) throw VaultError.of("VaultLocked");
        const { doc } = await this.docStore.load(storageKey);
        return doc;
      }
      /** Owner delete: drop a namespace's data (anti-rollback-safe) + tear down its live sessions. */
      async adminDeletePartition(storageKey) {
        await this.docStore.deleteNamespace(storageKey);
        for (const s of this.sessions.all()) {
          if (s.storageKey === storageKey) this.sessions.delete(s.id);
        }
      }
      async unlock() {
        return this.keystore.unlock({ reason: "unlock", prompt: "Unlock your vault" });
      }
      // --------------------------------------------------------------------------
      // Connection
      // --------------------------------------------------------------------------
      async connect(params, ctx) {
        const now = this.clock.now();
        if (!this.verifier) {
          throw VaultError.of(
            "IdentityUnverified",
            "this vault does not serve signed connections: no proposal verifier is configured"
          );
        }
        const verified = await this.verifier(params, {
          resolver: this.resolver,
          ...this.revocation ? { revocation: this.revocation } : {},
          vaultId: this.keystore.vaultId(),
          responderPublicKey: ctx.responderPublicKey,
          pairingNonce: ctx.pairingNonce,
          knownDomains: this.knownDomains,
          now
        });
        const requested = intersectScopes(params.requestedScopes, verified.verification.allowedMethods);
        if (requested.methods.length === 0) {
          throw VaultError.of("UnsupportedMethod", "no requested method is permitted by the identity record");
        }
        const decision = await this.consent.requestConnect({
          verification: verified.verification,
          appMetadata: params.appMetadata,
          requestedScopes: params.requestedScopes,
          pairingChallenge: params.pairingChallenge,
          ...verified.delegation.assertedAccount !== void 0 ? { assertedAccount: verified.delegation.assertedAccount } : {}
        });
        if (!decision.approved) throw VaultError.of("UserRejected", decision.reason ?? "user declined");
        const bio = await this.keystore.authenticate({ reason: "connect", prompt: `Connect ${verified.verification.domain}` });
        if (!bio) throw VaultError.of("BiometricFailed");
        if (!this.keystore.isUnlocked() && !await this.keystore.unlock()) throw VaultError.of("VaultLocked");
        const grantedMethods = decision.grantedMethods ?? requested.methods;
        const grantedFields = normalizeFields(decision.grantedFields ?? requested.fields);
        const writePolicy = decision.writePolicy ?? "ask-once-per-session";
        const expiresAt = now + this.sessionTtlMs;
        const grantId = this.randomId();
        const grant = {
          id: grantId,
          namespace: verified.verification.namespace,
          domain: verified.verification.domain,
          appMetadata: params.appMetadata,
          verified: verified.verification.ok,
          methods: grantedMethods,
          fields: grantedFields,
          // The signed (remote) plane has no cross-origin reads: they are declared
          // through `connectLocal`'s requestedScopes, and this empty literal is the
          // documentation of that rather than an oversight.
          foreignReads: [],
          writePolicy,
          createdAt: now,
          expiresAt,
          identityKid: verified.verification.identityKid
        };
        const sessionId = this.randomId();
        const deviceKeyPub = this.keystore.deviceKeyPublic();
        const session = {
          id: sessionId,
          namespace: verified.verification.namespace,
          // From the namespace the verification derived, not a second derivation of
          // its own: two derivations of one value are two chances to disagree.
          storageKey: storageKeyForNamespace(verified.verification.namespace),
          grant,
          foreignReads: /* @__PURE__ */ new Map(),
          delegatedKeyPub: verified.delegatedKeyPub,
          proposerPublicKey: params.proposerPublicKey,
          responderPublicKey: ctx.responderPublicKey,
          deviceKeyPub,
          createdAt: now,
          expiresAt,
          statusEndpoint: verified.statusEndpoint,
          identityKid: verified.verification.identityKid,
          lastRevocationCheckAt: now,
          writePolicy,
          writeApprovedThisSession: false,
          subscriptions: /* @__PURE__ */ new Map(),
          domain: verified.verification.domain,
          verified: verified.verification.ok
        };
        this.sessions.create(session);
        if (verified.verification.domain && !this.knownDomains.includes(verified.verification.domain)) {
          this.knownDomains.push(verified.verification.domain);
        }
        const vaultSig = await this.keystore.signDevice(
          settleSigningPreimage({
            sessionId,
            namespace: session.namespace,
            grantId,
            responderPublicKey: ctx.responderPublicKey,
            vaultDeviceKey: deviceKeyPub,
            expiresAt,
            methods: grantedMethods
          })
        );
        return {
          sessionId,
          granted: grant,
          responderPublicKey: ctx.responderPublicKey,
          vaultDeviceKey: deviceKeyPub,
          expiresAt,
          vaultSig
        };
      }
      // --------------------------------------------------------------------------
      // Request dispatch
      // --------------------------------------------------------------------------
      async handleRequest(sessionId, req) {
        try {
          const session = this.requireSession(sessionId);
          if (!this.keystore.isUnlocked()) throw VaultError.of("VaultLocked");
          await this.enforceRevocation(session, false);
          const result = await this.dispatch(session, req);
          return makeSuccess(req.id, result);
        } catch (err) {
          return makeFailure(req.id, VaultError.fromUnknown(err).toRpcError());
        }
      }
      /**
       * Re-check the pinned revocation status on the data plane so a key revoked
       * AFTER connect loses access without waiting for the session to expire. Cached
       * to `revocationRecheckMs` on normal requests; `force` bypasses the cache (used
       * on session extension). Fails closed: a revoked key OR a checker error tears
       * the session down.
       */
      async enforceRevocation(session, force) {
        if (!session.statusEndpoint || !session.identityKid) return;
        if (!this.revocation) {
          this.sessions.delete(session.id);
          throw VaultError.of("Disconnected", "revocation checker missing for a session that requires it");
        }
        const now = this.clock.now();
        if (!force && now - session.lastRevocationCheckAt < this.revocationRecheckMs) return;
        let revoked;
        try {
          revoked = await this.revocation.isRevoked(session.statusEndpoint, session.identityKid);
        } catch {
          this.sessions.delete(session.id);
          throw VaultError.of("Disconnected", "revocation status could not be re-checked");
        }
        if (revoked) {
          this.sessions.delete(session.id);
          throw VaultError.of("Disconnected", "identity key has been revoked");
        }
        session.lastRevocationCheckAt = now;
      }
      requireSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) throw VaultError.of("Disconnected", "unknown session");
        const now = this.clock.now();
        if (now > session.createdAt + SESSION_ABSOLUTE_MAX_TTL_MS) {
          this.sessions.delete(sessionId);
          throw VaultError.of("Disconnected", "session reached its absolute lifetime cap");
        }
        if (now > session.expiresAt) {
          this.sessions.delete(sessionId);
          throw VaultError.of("Disconnected", "session expired");
        }
        return session;
      }
      async dispatch(session, req) {
        switch (req.method) {
          case Method.GetData:
            return this.getData(session, req.params);
          case Method.SetData:
            return this.setData(session, req.params);
          case Method.PatchData:
            return this.patchData(session, req.params);
          case Method.Subscribe:
            return this.subscribe(session, req.params);
          case Method.Unsubscribe:
            return this.unsubscribe(session, req.params);
          case Method.Revoke:
            return this.revoke(session, req.params);
          case Method.SessionExtend:
            return this.extendSession(session, req.params);
          case Method.GetPermissions:
            return this.getPermissions(session, req.params);
          default:
            throw VaultError.of("UnsupportedMethod", `method not supported: ${req.method}`);
        }
      }
      /** The one chokepoint every signed data-plane request passes through. */
      authorizeSigned(session, signed, primaryType, methodName, opts = {}) {
        const now = this.clock.now();
        const typed = signed.typed;
        if (typed.primaryType !== primaryType) throw VaultError.of("InvalidRequest", "wrong primaryType");
        if (typed.domain.vaultId !== this.keystore.vaultId() || typed.domain.version !== PROTOCOL_VERSION) {
          throw VaultError.of("BadSignature", "typed-domain separator mismatch");
        }
        if (!verifyTyped(signed.typed, signed.sig, session.delegatedKeyPub)) {
          throw VaultError.of("BadSignature", "request signature invalid");
        }
        const msg = typed.message;
        if (msg["sessionId"] !== session.id) throw VaultError.of("Unauthorized", "session mismatch");
        if (msg["namespace"] !== session.namespace) throw VaultError.of("NamespaceMismatch");
        this.replay.check(
          session.id,
          String(msg["nonce"]),
          Number(msg["issuedAt"]),
          Number(msg["expiry"]),
          now
        );
        if (!opts.skipMethodCheck && !session.grant.methods.includes(methodName)) {
          throw VaultError.of("Unauthorized", `method not granted: ${methodName}`);
        }
        return msg;
      }
      async getData(session, params) {
        const msg = this.authorizeSigned(session, params, "VaultRead", Method.GetData);
        const paths = msg["paths"] ?? [];
        if (paths.length > MAX_PATHS_PER_REQUEST) throw VaultError.of("QuotaExceeded", "too many paths");
        for (const path of paths) {
          if (!fieldAllows(session.grant.fields, path, "read")) {
            throw VaultError.of("FieldOutOfScope", `read not granted: ${path}`);
          }
          if (pathIsSensitive(session.grant.fields, path)) {
            const ok = await this.keystore.authenticate({ reason: "sensitive-read", prompt: `Read ${path}` });
            if (!ok) throw VaultError.of("BiometricFailed");
          }
        }
        const { doc, version } = await this.docStore.load(session.storageKey);
        const values = {};
        for (const path of paths) {
          const got = pointerGet(doc, path);
          values[path] = got === void 0 ? null : got;
        }
        return { values, version: versionToEtag(version) };
      }
      async setData(session, params) {
        const msg = this.authorizeSigned(session, params, "VaultWrite", Method.SetData);
        const version = await this.applyChanges(
          session,
          msg["changes"],
          params.values,
          msg["baseVersion"]
        );
        return { applied: true, version: versionToEtag(version) };
      }
      async patchData(session, params) {
        const msg = this.authorizeSigned(session, params, "VaultPatch", Method.PatchData);
        const changes = msg["changes"] ?? [];
        const version = await this.applyChanges(session, changes, params.values, msg["baseVersion"]);
        return { applied: true, version: versionToEtag(version) };
      }
      /** Shared write path for setData/patchData with per-op scope + value-hash checks. */
      async applyChanges(session, changes, values, baseVersion) {
        if (changes.length > MAX_PATCH_OPS) throw VaultError.of("QuotaExceeded", "too many changes in one request");
        const anySensitive = changes.some((c) => pathIsSensitive(session.grant.fields, c.path));
        const needBiometric = anySensitive || session.writePolicy === "ask-every" || session.writePolicy === "ask-once-per-session" && !session.writeApprovedThisSession;
        if (needBiometric) {
          const ok = await this.keystore.authenticate({ reason: anySensitive ? "sensitive-write" : "write", prompt: "Approve write" });
          if (!ok) throw VaultError.of("BiometricFailed");
          session.writeApprovedThisSession = true;
        }
        const { doc, changedPaths, newVersion } = await this.docStore.serialize(
          () => this.applyChangesLocked(session, changes, values, baseVersion)
        );
        this.fanOutChanges(session, changedPaths, doc, newVersion);
        return newVersion;
      }
      /** The serialised half of applyChanges: load, apply, validate, save. */
      async applyChangesLocked(session, changes, values, baseVersion) {
        const loaded = await this.docStore.load(session.storageKey);
        const baseV = etagToVersion(baseVersion);
        if (baseV !== void 0 && baseV !== loaded.version) {
          throw VaultError.of(
            "VersionConflict",
            `stale baseVersion (have ${loaded.version})`,
            { version: versionToEtag(loaded.version) }
          );
        }
        let doc = loaded.doc;
        const changedPaths = [];
        for (const change of changes) {
          const path = change.path;
          if (isUnderShared(path) && !publishAllows(session.grant.fields, path)) {
            throw VaultError.of("WriteForbidden", `publishing to ${path} needs an explicit ${SHARED_POINTER} grant`);
          }
          if (change.op === "remove") {
            if (!fieldAllows(session.grant.fields, path, "write")) {
              throw fieldAllows(session.grant.fields, path, "read") ? VaultError.of("WriteForbidden", path) : VaultError.of("FieldOutOfScope", path);
            }
            doc = pointerRemove(doc, path);
            changedPaths.push(path);
            continue;
          }
          if (!fieldAllows(session.grant.fields, path, "write")) {
            throw fieldAllows(session.grant.fields, path, "read") ? VaultError.of("WriteForbidden", path) : VaultError.of("FieldOutOfScope", path);
          }
          if (!(path in values)) throw VaultError.of("InvalidRequest", `missing value for ${path}`);
          const value = values[path];
          if (change.valueHash !== void 0 && hashJsonValue(value) !== change.valueHash) {
            throw VaultError.of("BadSignature", `value hash mismatch for ${path}`);
          }
          doc = pointerSet(doc, path, value);
          changedPaths.push(path);
        }
        if (!withinDepth(doc, MAX_JSON_DEPTH)) {
          throw VaultError.of("QuotaExceeded", "namespace document exceeds nesting depth");
        }
        if (utf8ToBytes2(JSON.stringify(doc)).length > MAX_NAMESPACE_BYTES) {
          throw VaultError.of("QuotaExceeded", "namespace document exceeds size cap");
        }
        const newVersion = loaded.version + 1;
        await this.docStore.save(session.storageKey, doc, newVersion);
        return { doc, changedPaths, newVersion };
      }
      fanOutChanges(source, changedPaths, doc, version) {
        if (!this.emitter || changedPaths.length === 0) return;
        for (const session of this.sessions.forNamespace(source.namespace)) {
          for (const sub of session.subscriptions.values()) {
            const hit = changedPaths.filter(
              (p) => sub.paths.some((watch) => p === watch || p.startsWith(`${watch}/`)) && fieldAllows(session.grant.fields, p, "read")
            );
            if (hit.length === 0) continue;
            const changes = {};
            for (const p of hit) {
              const got = pointerGet(doc, p);
              changes[p] = got === void 0 ? null : got;
            }
            this.emitter(
              session.id,
              makeNotification(Method.Subscription, { subscriptionId: sub.id, changes, version: versionToEtag(version) })
            );
          }
        }
      }
      async subscribe(session, params) {
        const msg = this.authorizeSigned(session, params, "VaultRead", Method.Subscribe);
        const paths = msg["paths"] ?? [];
        if (paths.length > MAX_PATHS_PER_REQUEST) throw VaultError.of("QuotaExceeded", "too many subscription paths");
        for (const path of paths) {
          if (!fieldAllows(session.grant.fields, path, "read")) {
            throw VaultError.of("FieldOutOfScope", `read not granted: ${path}`);
          }
        }
        const subscriptionId = this.randomId();
        session.subscriptions.set(subscriptionId, { id: subscriptionId, paths });
        return { subscriptionId };
      }
      async unsubscribe(session, params) {
        session.subscriptions.delete(params.subscriptionId);
        return { ok: true };
      }
      async revoke(session, params) {
        this.authorizeSigned(session, params, "VaultRevoke", Method.Revoke, { skipMethodCheck: true });
        this.sessions.delete(session.id);
        return { ok: true };
      }
      async extendSession(session, params) {
        const msg = this.authorizeSigned(session, params, "VaultExtend", Method.SessionExtend, { skipMethodCheck: true });
        const now = this.clock.now();
        const cap = session.createdAt + SESSION_ABSOLUTE_MAX_TTL_MS;
        if (now >= cap) {
          this.sessions.delete(session.id);
          throw VaultError.of("Disconnected", "session at absolute cap; reconnect required");
        }
        await this.enforceRevocation(session, true);
        const ok = await this.keystore.authenticate({ reason: "grant-change", prompt: "Extend session" });
        if (!ok) throw VaultError.of("BiometricFailed");
        const requested = Math.max(0, Number(msg["requestedTtlMs"]) || 0);
        session.expiresAt = Math.min(cap, Math.max(session.expiresAt, now + requested));
        return { expiresAt: session.expiresAt, atAbsoluteCap: session.expiresAt >= cap };
      }
      /**
       * User-initiated grant narrowing from the vault UI. Replaces the granted fields,
       * tears down any subscription that is no longer in scope, and notifies the app
       * with a permissions_changed event so it can't keep relying on stale access.
       */
      narrowGrant(sessionId, fields) {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        session.grant.fields = fields;
        const revokedSubscriptions = [];
        for (const [subId, sub] of session.subscriptions) {
          const stillReadable = sub.paths.some((p) => fieldAllows(fields, p, "read"));
          if (!stillReadable) {
            session.subscriptions.delete(subId);
            revokedSubscriptions.push(subId);
          }
        }
        const note = { sessionId, fields, revokedSubscriptions };
        this.emitter?.(sessionId, makeNotification(Method.PermissionsChanged, note));
      }
      async getPermissions(session, _params) {
        return { grant: session.grant };
      }
      // --------------------------------------------------------------------------
      // Trusted in-process host mode (browser Option B)
      //
      // When the engine is embedded in a host that supplies the caller's origin
      // authoritatively (an Electron main process owning the webContents, a mobile
      // WebView bridge), the transport IS the trust boundary. There is no relay, no
      // `.well-known` identity proof, no delegation, and no per-request signature —
      // so this path deliberately SKIPS `authorizeSigned`. It still enforces every
      // property that protects the user's data: per-origin namespace isolation,
      // explicit consent, per-field grants, the same document store, the same input
      // caps, and subscriptions. The two trust models never cross: these methods
      // operate only on `local === true` sessions and the signed handlers only on
      // `local !== true` ones.
      // --------------------------------------------------------------------------
      /** Trusted connect: derive namespace from the host-attested origin, take consent, mint a session. */
      async connectLocal(input) {
        const now = this.clock.now();
        const derived = deriveOriginNamespace(input.origin);
        const requestedMethods = [...new Set(input.requestedScopes.flatMap((s) => s.methods))];
        const requestedFields = normalizeFields(input.requestedScopes.flatMap((s) => s.fields));
        if (requestedMethods.length === 0) throw VaultError.of("UnsupportedMethod", "no method requested");
        const requestedForeign = this.resolveForeignRequests(input.requestedScopes, derived.namespace);
        const verification = {
          ok: true,
          tier: "verified",
          namespace: derived.namespace,
          domain: input.origin,
          // Granularity is a relay concept: it says how much of a PROVEN domain the
          // namespace keeps. Here the namespace is the origin itself, so there is
          // nothing to choose.
          granularity: null,
          identityKid: null,
          homographFlag: false,
          allowedMethods: requestedMethods
        };
        const decision = await this.consent.requestConnect({
          verification,
          appMetadata: input.appMetadata,
          requestedScopes: input.requestedScopes,
          pairingChallenge: "",
          // Resolved, not the page's text: canonical owner origin, namespace the
          // vault derived, paths already clamped to the published subtree.
          foreignReads: requestedForeign.map(({ namespace, origin, paths }) => ({ namespace, origin, paths }))
        });
        if (!decision.approved) throw VaultError.of("UserRejected", decision.reason ?? "user declined");
        if (!this.keystore.isUnlocked() && !await this.keystore.unlock()) throw VaultError.of("VaultLocked");
        const grantedMethods = decision.grantedMethods ?? requestedMethods;
        const grantedFields = normalizeFields(decision.grantedFields ?? requestedFields);
        const writePolicy = decision.writePolicy ?? "ask-once-per-session";
        const grantedForeign = clampForeignToRequested(decision.grantedForeignReads ?? [], requestedForeign);
        const expiresAt = now + this.sessionTtlMs;
        const grantId = this.randomId();
        const grant = {
          id: grantId,
          namespace: derived.namespace,
          domain: input.origin,
          appMetadata: input.appMetadata,
          verified: true,
          methods: grantedMethods,
          fields: grantedFields,
          foreignReads: grantedForeign.map(({ namespace, origin, paths }) => ({ namespace, origin, paths })),
          writePolicy,
          createdAt: now,
          expiresAt,
          identityKid: null
        };
        const sessionId = this.randomId();
        const session = {
          id: sessionId,
          namespace: derived.namespace,
          storageKey: derived.storageKey,
          grant,
          foreignReads: new Map(grantedForeign.map((e) => [e.namespace, e])),
          delegatedKeyPub: "",
          proposerPublicKey: "",
          responderPublicKey: "",
          deviceKeyPub: this.keystore.deviceKeyPublic(),
          createdAt: now,
          expiresAt,
          statusEndpoint: null,
          identityKid: null,
          lastRevocationCheckAt: now,
          writePolicy,
          writeApprovedThisSession: false,
          subscriptions: /* @__PURE__ */ new Map(),
          domain: input.origin,
          verified: true,
          local: true
        };
        this.sessions.create(session);
        return { sessionId, grant, namespace: derived.namespace };
      }
      /**
       * Resolve a trusted session for a data-plane op, failing closed. `requireSession`
       * already enforces session expiry and the absolute-lifetime cap; we additionally
       * reject a signed session presented here, require the keystore to be unlocked, and
       * run the same revocation check the signed path runs (a no-op unless the host
       * pinned a status endpoint). Trusted-mode revocation is primarily host-driven:
       * when the user revokes a site in the browser UI the host calls `adminRevoke` /
       * `localRevoke` and drops the remembered grant, so the session ceases to exist.
       */
      async requireLocalSession(sessionId) {
        const session = this.requireSession(sessionId);
        if (!session.local) throw VaultError.of("Unauthorized", "not a trusted local session");
        if (!this.keystore.isUnlocked()) throw VaultError.of("VaultLocked");
        await this.enforceRevocation(session, false);
        return session;
      }
      assertLocalMethod(session, method) {
        if (!session.grant.methods.includes(method)) {
          throw VaultError.of("Unauthorized", `method not granted: ${method}`);
        }
      }
      /**
       * Resolve a connect's declared cross-origin reads. THE single derivation site:
       * neither the host, nor the consent UI, nor the page ever turns an origin into
       * a namespace, so every rule `deriveOriginNamespace` enforces applies here too.
       */
      resolveForeignRequests(scopes, ownNamespace) {
        const rules = scopes.flatMap((s) => s.foreign ?? []);
        if (rules.length === 0) return [];
        const byNamespace = /* @__PURE__ */ new Map();
        for (const rule of rules) {
          let derived;
          try {
            derived = deriveOriginNamespace(rule.origin);
          } catch {
            throw VaultError.of("InvalidRequest", "cross-origin read names an unresolvable site");
          }
          if (derived.namespace === ownNamespace) continue;
          const paths = normalizeForeignPaths(rule.paths);
          if (paths.length === 0) continue;
          if (paths.length > MAX_FOREIGN_PATHS_PER_ORIGIN) {
            throw VaultError.of("QuotaExceeded", "too many published paths for one site");
          }
          const existing = byNamespace.get(derived.namespace);
          if (existing) {
            existing.paths = normalizeForeignPaths([...existing.paths, ...paths]);
          } else {
            byNamespace.set(derived.namespace, {
              namespace: derived.namespace,
              origin: rule.origin,
              storageKey: derived.storageKey,
              paths
            });
          }
        }
        if (byNamespace.size > MAX_FOREIGN_ORIGINS) {
          throw VaultError.of("QuotaExceeded", "too many sites named");
        }
        return [...byNamespace.values()];
      }
      /**
       * Trusted cross-origin read of another site's PUBLISHED subtree.
       *
       * Mechanically this is `adminReadPartition`'s unlock check plus an
       * arbitrary-key `docStore.load`. It must never call that method: that is the
       * owner plane, documented above as deliberately grant-bypassing. Everything
       * that makes this safe is the code between here and the load — the method
       * grant, the approved-owner lookup, and the published-subtree clamp.
       *
       * ABSENCE IS UNIFORM, by design. A site the user has never visited, an owner
       * with no published subtree, an owner that has the pointer empty, an owner the
       * user did not approve for this reader, and a pointer outside the published
       * subtree all answer `null`. Any difference between them is an existence
       * oracle over the user's browsing history — which is the thing this vault
       * exists to prevent — so this returns rather than throws where `connect`
       * throws for the same path.
       *
       * One owner per call, never a batch: a multi-owner call would make one request
       * decrypt up to `MAX_FOREIGN_ORIGINS` other partitions.
       */
      async localGetShared(sessionId, origin, paths) {
        const session = await this.requireLocalSession(sessionId);
        this.assertLocalMethod(session, Method.GetSharedData);
        if (paths.length > MAX_PATHS_PER_REQUEST) throw VaultError.of("QuotaExceeded", "too many paths");
        let namespace;
        try {
          namespace = deriveOriginNamespace(origin).namespace;
        } catch {
          throw VaultError.of("InvalidRequest", "unresolvable site");
        }
        const entry = session.foreignReads.get(namespace);
        const values = {};
        const readable = [];
        for (const path of paths) {
          parsePointer(path);
          values[path] = null;
          if (entry && foreignReadAllows(entry, path)) readable.push(path);
        }
        if (!entry || readable.length === 0) return { values };
        const { doc } = await this.docStore.load(entry.storageKey);
        for (const path of readable) {
          const got = pointerGet(doc, path);
          values[path] = got === void 0 ? null : got;
        }
        return { values };
      }
      async localGet(sessionId, paths) {
        const session = await this.requireLocalSession(sessionId);
        this.assertLocalMethod(session, Method.GetData);
        if (paths.length > MAX_PATHS_PER_REQUEST) throw VaultError.of("QuotaExceeded", "too many paths");
        for (const path of paths) {
          if (!fieldAllows(session.grant.fields, path, "read")) {
            throw VaultError.of("FieldOutOfScope", `read not granted: ${path}`);
          }
          if (pathIsSensitive(session.grant.fields, path)) {
            const ok = await this.keystore.authenticate({ reason: "sensitive-read", prompt: `Read ${path}` });
            if (!ok) throw VaultError.of("BiometricFailed");
          }
        }
        const { doc, version } = await this.docStore.load(session.storageKey);
        const values = {};
        for (const path of paths) {
          const got = pointerGet(doc, path);
          values[path] = got === void 0 ? null : got;
        }
        return { values, version: versionToEtag(version) };
      }
      async localSet(sessionId, values, baseVersion) {
        const session = await this.requireLocalSession(sessionId);
        this.assertLocalMethod(session, Method.SetData);
        const changes = Object.keys(values).map((path) => ({ op: "replace", path }));
        const version = await this.applyChanges(session, changes, values, baseVersion);
        return { applied: true, version: versionToEtag(version) };
      }
      async localPatch(sessionId, ops, baseVersion) {
        const session = await this.requireLocalSession(sessionId);
        this.assertLocalMethod(session, Method.PatchData);
        const values = {};
        const changes = ops.map((o) => {
          if (o.op !== "remove") values[o.path] = o.value;
          return { op: o.op, path: o.path };
        });
        const version = await this.applyChanges(session, changes, values, baseVersion);
        return { applied: true, version: versionToEtag(version) };
      }
      async localSubscribe(sessionId, paths) {
        const session = await this.requireLocalSession(sessionId);
        this.assertLocalMethod(session, Method.Subscribe);
        if (paths.length > MAX_PATHS_PER_REQUEST) throw VaultError.of("QuotaExceeded", "too many subscription paths");
        for (const path of paths) {
          if (!fieldAllows(session.grant.fields, path, "read")) {
            throw VaultError.of("FieldOutOfScope", `read not granted: ${path}`);
          }
        }
        const subscriptionId = this.randomId();
        session.subscriptions.set(subscriptionId, { id: subscriptionId, paths });
        return { subscriptionId };
      }
      // No method-grant check: unsubscribe is idempotent local cleanup that only
      // removes a subscription this same session owns — the signed `unsubscribe`
      // handler likewise performs no method/signature check.
      async localUnsubscribe(sessionId, subscriptionId) {
        const session = await this.requireLocalSession(sessionId);
        session.subscriptions.delete(subscriptionId);
        return { ok: true };
      }
      // No method-grant check: a session revoking *itself* is always allowed, mirroring
      // the signed `revoke` path (which authorizes with `skipMethodCheck: true`).
      async localRevoke(sessionId) {
        const session = await this.requireLocalSession(sessionId);
        this.sessions.delete(session.id);
        return { ok: true };
      }
      async localGetPermissions(sessionId) {
        const session = await this.requireLocalSession(sessionId);
        this.assertLocalMethod(session, Method.GetPermissions);
        return { grant: session.grant };
      }
    };
  }
});

// packages/vault-core/src/browser.ts
var browser_exports2 = {};
__export(browser_exports2, {
  AutoConsent: () => AutoConsent,
  DocumentStore: () => DocumentStore,
  InMemoryKeystore: () => InMemoryKeystore,
  InMemoryStorage: () => InMemoryStorage,
  ReplayGuard: () => ReplayGuard,
  SessionStore: () => SessionStore,
  StaticIdentityResolver: () => StaticIdentityResolver,
  StaticRevocationChecker: () => StaticRevocationChecker,
  VaultEngine: () => VaultEngine,
  applyPatch: () => applyPatch,
  etagToVersion: () => etagToVersion,
  fieldAllows: () => fieldAllows,
  foreignReadAllows: () => foreignReadAllows,
  intersectScopes: () => intersectScopes,
  isUnderShared: () => isUnderShared,
  normalizeFields: () => normalizeFields,
  parsePointer: () => parsePointer,
  pathIsSensitive: () => pathIsSensitive,
  pointerCovers: () => pointerCovers,
  pointerGet: () => pointerGet,
  pointerRemove: () => pointerRemove,
  pointerSet: () => pointerSet,
  publishAllows: () => publishAllows,
  systemClock: () => systemClock,
  versionToEtag: () => versionToEtag,
  withinDepth: () => withinDepth
});
var init_browser2 = __esm({
  "packages/vault-core/src/browser.ts"() {
    "use strict";
    init_adapters();
    init_in_memory();
    init_json_pointer();
    init_grants();
    init_replay();
    init_document_store();
    init_session();
    init_engine();
  }
});

// ../freedom-browser/src/main/vault/vendor/_entry.cjs
module.exports = {
  vaultCore: (init_browser2(), __toCommonJS(browser_exports2)),
  cryptoCore: (init_browser(), __toCommonJS(browser_exports))
};
/*! Bundled license information:

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/esm/utils.js:
@noble/curves/esm/abstract/modular.js:
@noble/curves/esm/abstract/curve.js:
@noble/curves/esm/abstract/edwards.js:
@noble/curves/esm/abstract/montgomery.js:
@noble/curves/esm/ed25519.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/ciphers/esm/utils.js:
  (*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) *)

@scure/base/lib/esm/index.js:
  (*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@scure/bip39/esm/index.js:
  (*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) *)
*/
