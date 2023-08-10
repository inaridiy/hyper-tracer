export type Address = bigint;
export type Stack = bigint[];
export type Calldata = Uint8Array;
export type ReturnedData = Uint8Array;
export type Memory = Uint8Array;
export type Storage = Map<bigint, bigint>;

export type Code = Uint8Array;

export interface Block {
  number: bigint;
  hash: bigint;
  parentHash: bigint;
  timestamp: bigint;
}

export interface VisualTransaction {
  from: Address | string;
  to: Address | string;
  value: bigint;
  calldata: string | Calldata;
}

export interface Transaction {
  from: Address;
  to: Address;
  value: bigint;
  calldata: Calldata;
  nonce: bigint;
}

export type TransactionType = "call" | "delegatecall" | "staticcall" | "creation";

export interface ContractFrame extends Transaction {
  type: TransactionType;
  pc: number;
  depth: number;
  code: Code;
  chainId: bigint;
  blocknumber: bigint;
  stack: Stack;
  calldata: Calldata;
  returnedData?: ReturnedData;
  memory: Memory;
}

export interface ContractContext extends Transaction {
  type: TransactionType;
  pc: number;
  chainId: bigint;
  blocknumber: bigint;
  code: Code;
  codes: Map<Address, Code>;
  stack: Stack;
  calldata: Calldata;
  returnedData?: ReturnedData;
  balances: Map<Address, bigint>;
  memory: Memory;
  storage: Storage;
}

export interface InteractedContext extends ContractContext {
  call?: {
    type: TransactionType;
    to: Address;
    value: bigint;
    calldata: Calldata;
    returnOffset: number;
    returnSize: number;
  };
  log?: {
    data: Uint8Array;
    topics: bigint[];
  };
  return?: Uint8Array;
  revert?: Uint8Array;
  selfdestruct?: Address;
}

export interface ExecutionResult {
  return?: Uint8Array;
  revert?: Uint8Array;
}
