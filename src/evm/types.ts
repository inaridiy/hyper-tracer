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
  origin: Address;
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

export interface OPCodeStartTrace {
  type: "opcode-start";
  pc: number;
  opcode: { name: string; code: number };
  stack: Stack;
  memory: Memory;
}

export interface OPCodeResultTrace {
  type: "opcode-result";
  log?: { data: Uint8Array; topics: bigint[] };
  return?: Uint8Array;
  revert?: Uint8Array;
  selfdestruct?: Address;
  storageDiff: Storage;
}

export interface FrameStartTrace {
  type: "frame-start";
  txType: TransactionType;
  depth: number;
  calldata: Calldata;
  from: Address;
  to: Address;
  origin: Address;
  value: bigint;
  storage: Storage;
  balances: Map<Address, bigint>;
}

export interface FrameResultTrace {
  type: "frame-result";
  return?: Uint8Array;
  revert?: Uint8Array;
  storageDiff: Storage;
  balancesDiff: Map<Address, bigint>;
}

export type Trace = OPCodeStartTrace | OPCodeResultTrace | FrameStartTrace | FrameResultTrace;
