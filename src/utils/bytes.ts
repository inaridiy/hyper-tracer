export const concatBytes = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const result = new Uint8Array(a.length + b.length);
  result.set(a);
  result.set(b, a.length);

  return result;
};
export const sliceBytes = (target: Uint8Array, start: number, end: number): Uint8Array => {
  const sliced = target.slice(start, end);
  const result = new Uint8Array(end - start);

  result.set(sliced);

  return result;
};

export const insertIntoArray = (target: Uint8Array, offset: number, dataToInsert: Uint8Array): Uint8Array => {
  const requiredLength = offset + dataToInsert.length;

  let resultArray = target;
  if (requiredLength > target.length) {
    resultArray = new Uint8Array(requiredLength);
    resultArray.set(target);
  }

  resultArray.set(dataToInsert, offset);

  return resultArray;
};

export const bigIntToUint8Array = (value: bigint, length: number): Uint8Array => {
  return Buffer.from(value.toString(16).padStart(length * 2, "0"), "hex");
};
