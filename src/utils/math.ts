import { TWO_256 } from "../constants";

export const mod = (a: bigint, b: bigint): bigint => {
  return (a + b) % b;
};

export const ethMod = (a: bigint): bigint => {
  return (a + TWO_256) % TWO_256;
};

export const i256ToBigint = (a: bigint): bigint => {
  if (a & (1n << 255n)) {
    return a - (1n << 256n);
  }
  return a;
};

export const bigintToi256 = (a: bigint): bigint => {
  return a & ((1n << 256n) - 1n);
};

export const i256Div = (a: bigint, b: bigint): bigint => {
  if (b === 0n) return 0n;
  return bigintToi256(i256ToBigint(a) / i256ToBigint(b));
};

export const i256Mod = (a: bigint, b: bigint): bigint => {
  if (b === 0n) return 0n;
  return bigintToi256(i256ToBigint(a) % i256ToBigint(b));
};

export const signExtend = (a: bigint, b: bigint): bigint => {
  if (a >= 32n) return b;
  const bitIndex = 8n * a + 7n;
  const bit = (b >> bitIndex) & 1n;
  const mask = (1n << bitIndex) - 1n;
  return bit ? b | ~mask : b & mask;
};

export const fastPow = (x: bigint, n: bigint, mod: bigint) => {
  let res = 1n;
  while (n > 0n) {
    if (n & 1n) res = (res * x) % mod;
    x = (x * x) % mod;
    n >>= 1n;
  }
  return res;
};
