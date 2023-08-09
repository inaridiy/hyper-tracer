import { callJsonRpc } from "../utils/callJsonRpc";
import { Address, Code, Block, Transaction } from "./types";

export interface Loader {
  getLatestBlockNumber(): Promise<bigint>;
  getTransactionCount(blocknumber: bigint, address: Address): Promise<bigint>;
  getTransactionByHash(hash: bigint): Promise<Transaction & { blocknumber: bigint }>;
  getBlock(blocknumber: bigint): Promise<Block | null>;
  getCode(blocknumber: bigint, address: Address): Promise<Code>;
  getStorageAt(blocknumber: bigint, address: Address, index: bigint): Promise<bigint>;
  getBalance(blocknumber: bigint, address: Address): Promise<bigint>;
}

export class JSONRpcLoader implements Loader {
  constructor(private rpcUrl: string) {}

  async getLatestBlockNumber(): Promise<bigint> {
    const res = await callJsonRpc(this.rpcUrl, "eth_blockNumber", []);
    return BigInt(res);
  }

  async getTransactionCount(blocknumber: bigint, address: Address): Promise<bigint> {
    const res = await callJsonRpc(this.rpcUrl, "eth_getTransactionCount", [
      "0x" + address.toString(16).padStart(40, "0"),
      "0x" + blocknumber.toString(16),
    ]);
    return BigInt(res);
  }

  async getTransactionByHash(hash: bigint): Promise<Transaction & { blocknumber: bigint }> {
    const res = await callJsonRpc(this.rpcUrl, "eth_getTransactionByHash", ["0x" + hash.toString(16)]);
    if (res === null) throw new Error("Transaction not found");
    return {
      from: BigInt(res.from),
      to: BigInt(res.to),
      value: BigInt(res.value),
      calldata: Uint8Array.from(Buffer.from(res.input.slice(2), "hex")),
      blocknumber: BigInt(res.blockNumber),
      nonce: BigInt(res.nonce),
    };
  }

  async getBlock(blocknumber: bigint): Promise<Block | null> {
    const res = await callJsonRpc(this.rpcUrl, "eth_getBlockByNumber", ["0x" + blocknumber.toString(16), false]);
    if (res === null) return null;
    return {
      number: BigInt(res.number),
      hash: BigInt(res.hash),
      parentHash: BigInt(res.parentHash),
      timestamp: BigInt(res.timestamp),
    };
  }

  async getCode(blocknumber: bigint, address: Address): Promise<Code> {
    const res = await callJsonRpc(this.rpcUrl, "eth_getCode", [
      "0x" + address.toString(16).padStart(40, "0"),
      "0x" + blocknumber.toString(16),
    ]);
    return Uint8Array.from(Buffer.from(res.slice(2), "hex"));
  }

  async getStorageAt(blocknumber: bigint, address: Address, index: bigint): Promise<bigint> {
    const res = await callJsonRpc(this.rpcUrl, "eth_getStorageAt", [
      "0x" + address.toString(16).padStart(40, "0"),
      "0x" + index.toString(16),
      "0x" + blocknumber.toString(16),
    ]);
    return BigInt(res);
  }

  async getBalance(blocknumber: bigint, address: Address): Promise<bigint> {
    const res = await callJsonRpc(this.rpcUrl, "eth_getBalance", [
      "0x" + address.toString(16).padStart(40, "0"),
      "0x" + blocknumber.toString(16),
    ]);
    return BigInt(res);
  }
}

export class EmptyLoader implements Loader {
  async getLatestBlockNumber(): Promise<bigint> {
    return 0n;
  }

  async getTransactionCount(_blocknumber: bigint, _address: Address): Promise<bigint> {
    return 0n;
  }

  async getTransactionByHash(_hash: bigint): Promise<Transaction & { blocknumber: bigint }> {
    return {
      from: 0n,
      to: 0n,
      value: 0n,
      calldata: new Uint8Array(),
      blocknumber: 0n,
      nonce: 0n,
    };
  }

  async getBlock(_blocknumber: bigint): Promise<Block | null> {
    return null;
  }

  async getCode(_blocknumber: bigint, _address: Address): Promise<Code> {
    return new Uint8Array();
  }

  async getStorageAt(_blocknumber: bigint, _address: Address, _index: bigint): Promise<bigint> {
    return 0n;
  }

  async getBalance(_blocknumber: bigint, _address: Address): Promise<bigint> {
    return 0n;
  }
}
