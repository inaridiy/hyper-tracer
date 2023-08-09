import { Address, getContractAddress, hexToBigInt, keccak256, toBytes, toHex } from "viem";
import { bigIntToUint8Array } from "./bytes";

export const calcContractAddress = (from: bigint, nonce: bigint): bigint => {
  const address = getContractAddress({
    opcode: "CREATE",
    from: ("0x" + from.toString(16)) as Address,
    nonce: nonce,
  });

  return BigInt(address);
};

export const calcCreate2Address = (from: bigint, salt: bigint, code: Uint8Array): bigint => {
  const address = getContractAddress({
    opcode: "CREATE2",
    from: ("0x" + from.toString(16)) as Address,
    bytecode: code,
    salt: toBytes(salt),
  });

  return BigInt(address);
};
