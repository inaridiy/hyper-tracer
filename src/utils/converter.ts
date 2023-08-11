export const uint8ArrayToBigint = (uint8Array: Uint8Array): bigint => {
  let result = BigInt(0);
  for (const byte of uint8Array) {
    result = (result << BigInt(8)) | BigInt(byte);
  }
  return result;
};

export const hexToUint8Array = (hex: string): Uint8Array => {
  return Buffer.from(hex.replace(/^0x/, ""), "hex");
};

export const uint8ArrayToHex = (uint8Array: Uint8Array): string => {
  return "0x" + Buffer.from(uint8Array).toString("hex");
};

export const bigintToAddressString = (bigint: bigint): string => {
  return "0x" + bigint.toString(16).padStart(40, "0");
};
