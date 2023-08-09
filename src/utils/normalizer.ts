import { ADDRESS_ZERO } from "../constants";
import { Address, VisualTransaction, Transaction } from "../evm/types";
import { hexToUint8Array } from "./converter";

export const normalizeAddress = (address: Address | string | undefined): Address => {
  if (!address) return ADDRESS_ZERO;
  if (typeof address === "string") return BigInt(address);
  else return address;
};

export const normalizeHex = (calldata: string | Uint8Array | undefined): Uint8Array => {
  if (!calldata) return new Uint8Array();
  if (typeof calldata === "string") return hexToUint8Array(calldata);
  else return calldata;
};

export const normalizeTransaction = (tx: Partial<VisualTransaction>): Omit<Transaction, "nonce"> => {
  return {
    from: normalizeAddress(tx.from),
    to: normalizeAddress(tx.to),
    value: tx.value || 0n,
    calldata: normalizeHex(tx.calldata),
  };
};
