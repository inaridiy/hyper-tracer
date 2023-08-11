import { normalizeTransaction } from "../utils/normalizer";
import {
  ContractFrame,
  Storage,
  ContractContext,
  Address,
  Code,
  VisualTransaction,
  Transaction,
  ExecutionResult,
  TransactionType,
  Trace,
  FrameStartTrace,
  FrameResultTrace,
  OPCodeStartTrace,
  InteractedContext,
  OPCodeResultTrace,
} from "./types";
import { EmptyLoader, JSONRpcLoader, Loader } from "./loader";
import { insertIntoArray } from "../utils/bytes";
import { PRESET_OPCODES, PRESET_PRECOMPILED_CONTRACTS } from "./preset";
import { OPCode } from "./opcodes";
import { uint8ArrayToHex } from "../utils/converter";
import { PrecompiledContracts } from "./precompiled";

export interface EVMOpts {
  rpcUrl?: string;
  chainId?: bigint;
  blocknumber?: bigint;
  opcodes?: OPCode[];
  precompiled?: PrecompiledContracts[];
  loader?: Loader;
  codes?: Map<Address, Code>;
  nonces?: Map<Address, bigint>;
  balances?: Map<Address, bigint>;
  storage?: Map<Address, Storage>;
}

export class EVMExecutor {
  private chainId: bigint;
  private blocknumber: bigint;

  private loader: Loader;

  private opcodes: Map<number, OPCode>; //<OPCode.code, OPCode>
  private codes: Map<Address, Code>; //<Address, Code>
  private precompiled: Map<Address, PrecompiledContracts>; //<Address, PrecompiledContracts>
  private nonces: Map<Address, bigint>;
  private balances: Map<Address, bigint>;
  private storage: Map<Address, Storage>; //<Address, Storage>

  private trace: Trace[] = [];

  constructor(options: EVMOpts) {
    this.chainId = options.chainId || 1n;
    this.blocknumber = options.blocknumber || 0n;
    this.loader = options.loader || (options.rpcUrl ? new JSONRpcLoader(options.rpcUrl!) : new EmptyLoader());
    this.opcodes = new Map((options.opcodes || PRESET_OPCODES).map((op) => [Number(op.code), op]));
    this.codes = options.codes || new Map();
    this.precompiled = new Map((options.precompiled || PRESET_PRECOMPILED_CONTRACTS).map((pre) => [pre.address, pre]));
    this.nonces = options.nonces || new Map();
    this.balances = options.balances || new Map();
    this.storage = options.storage || new Map();
  }

  async getCode(address: Address) {
    if (10n >= address && !this.precompiled.has(address)) throw new Error("PRECOMPILED NOT IMPLEMENTED");
    const code = this.codes.get(address) || (await this.loader.getCode(this.blocknumber, address));
    return code;
  }

  async getBalance(address: Address) {
    const balance = this.balances.get(address) ?? (await this.loader.getBalance(this.blocknumber - 1n, address));
    return balance;
  }

  private async _setBalance(address: Address, balance: bigint) {
    if (balance < 0) throw new Error("Invalid balance");
    this.balances.set(address, balance);
  }

  async getTransactionCount(address: Address) {
    const nonce = this.nonces.get(address) || (await this.loader.getTransactionCount(this.blocknumber, address));
    return nonce;
  }

  private async _createFrame(
    tx: Transaction,
    others: { depth: number; code: Code; type: TransactionType }
  ): Promise<ContractFrame> {
    const frame = {
      ...{ ...tx, ...others },
      ...{ chainId: this.chainId, blocknumber: this.blocknumber },
      ...{ pc: 0, stack: [], calldata: tx.calldata, memory: new Uint8Array() },
    } satisfies ContractFrame;
    return frame;
  }

  private _cloneStorage(address: Address): Storage {
    const storage = new Map(Array.from(this.storage.get(address) || new Map()).map(([k, v]) => [k, v]));
    return storage;
  }

  private _cloneBalances(): Map<Address, bigint> {
    const balances = new Map(Array.from(this.balances).map(([k, v]) => [k, v]));
    return balances;
  }

  private _storageDiff(before: Storage, after: Storage): Storage {
    const diff = new Map();
    for (const [k, v] of after) {
      if (before.get(k) !== v) diff.set(k, v);
    }
    return diff;
  }

  private _balancesDiff(before: Map<Address, bigint>, after: Map<Address, bigint>): Map<Address, bigint> {
    const diff = new Map();
    for (const [k, v] of after) {
      if (before.get(k) !== v) diff.set(k, v);
    }
    return diff;
  }

  private _createContext(frame: ContractFrame): ContractContext {
    const { depth, ...others } = frame;
    const context = {
      ...others,
      blocknumber: this.blocknumber,
      codes: this.codes,
      balances: this._cloneBalances(),
      storage: this.storage.get(frame.to) || new Map(),
    } satisfies ContractContext;
    return context;
  }

  private _insertOpCodeStartTrace(frame: ContractFrame, opcode: OPCode) {
    const trace = {
      type: "opcode-start",
      opcode: { name: opcode.name, code: Number(opcode.code) },
      pc: frame.pc,
      stack: frame.stack,
      memory: frame.memory,
    } satisfies OPCodeStartTrace;
    this.trace.push(trace);
  }

  private _insertOpCodeResultTrace(result: InteractedContext, storageSnapshot: Storage) {
    const trace = {
      type: "opcode-result",
      log: result.log,
      return: result.return,
      revert: result.revert,
      selfdestruct: result.selfdestruct,
      storageDiff: this._storageDiff(storageSnapshot, result.storage),
    } satisfies OPCodeResultTrace;
    this.trace.push(trace);
  }

  private _insertFrameStartTrace(frame: ContractFrame) {
    const storageSnapshot = this._cloneStorage(frame.to);
    const balanceSnapshot = this._cloneBalances();

    const trace: FrameStartTrace = {
      type: "frame-start",
      txType: frame.type,
      depth: frame.depth,
      from: frame.from,
      to: frame.to,
      origin: frame.origin,
      calldata: frame.calldata,
      value: frame.value,
      storage: storageSnapshot,
      balances: balanceSnapshot,
    };
    this.trace.push(trace);
  }

  private _insertFrameResultTrace(
    frame: ContractFrame,
    result: ExecutionResult,
    storageSnapshot: Storage,
    balanceSnapshot: Map<Address, bigint>
  ) {
    const storageDiff = this._storageDiff(storageSnapshot, this.storage.get(frame.to) || new Map());
    const balancesDiff = this._balancesDiff(balanceSnapshot, this.balances);

    const trace = {
      type: "frame-result",
      return: result.return,
      revert: result.revert,
      storageDiff,
      balancesDiff,
    } satisfies FrameResultTrace;
    this.trace.push(trace);
  }

  async execute(tx: Partial<VisualTransaction & { blocknumber: bigint }>) {
    if (tx.blocknumber) this.blocknumber = tx.blocknumber;
    const transaction = normalizeTransaction(tx) as Transaction;
    transaction.nonce = await this.getTransactionCount(transaction.from);
    await this._execute(transaction);

    return { traces: this.trace };
  }

  async executeFromHash(hash: bigint) {
    const transaction = await this.loader.getTransactionByHash(hash);
    if (transaction.blocknumber) this.blocknumber = transaction.blocknumber;
    await this._execute(transaction);

    return { traces: this.trace };
  }

  private async _execute(tx: Transaction): Promise<ExecutionResult> {
    this.trace = [];
    const transaction = normalizeTransaction(tx) as Transaction;
    if (!transaction.to) {
      await this._executeCreation(transaction);
      return {};
    } else {
      const code = await this.getCode(transaction.to);
      const frame = await this._createFrame(transaction, { depth: 0, code, type: "call" });
      return await this._executeFrame(frame);
    }
  }

  private async _executeCreation(_transaction: Transaction) {
    throw new Error("Not implemented");
  }

  private async _executeFrame(_frame: ContractFrame): Promise<ExecutionResult> {
    let frame = _frame;
    let storageSnapshot: Storage = this._cloneStorage(frame.to);
    let balanceSnapshot: Map<Address, bigint> = this._cloneBalances();

    if (frame.type === "call") {
      const oldFromBalance = await this.getBalance(frame.from);
      const oldToBalance = await this.getBalance(frame.to);
      if (oldFromBalance - frame.value < 0n) {
        console.log("Insufficient balance");
        return { revert: new Uint8Array() };
      }
      this._setBalance(frame.from, oldFromBalance - frame.value);
      this._setBalance(frame.to, oldToBalance + frame.value);
    }

    this._insertFrameStartTrace(frame);

    const precompiled = this.precompiled.get(frame.to);
    if (precompiled) {
      const result = await precompiled.call(await this._createContext(frame), this.loader);
      this._insertFrameResultTrace(frame, result, storageSnapshot, balanceSnapshot);
      return result;
    }
    if (frame.code.length === 0 && !precompiled) {
      this._insertFrameResultTrace(frame, {}, storageSnapshot, balanceSnapshot);
      return {};
    }

    while (true) {
      if (frame.pc >= frame.code.length) throw new Error("Invalid pc");

      const opcode = this.opcodes.get(frame.code[frame.pc]);
      if (!opcode) throw new Error(`Invalid opcode: ${frame.code[frame.pc].toString(16)}`);

      this._insertOpCodeStartTrace(frame, opcode);
      const context = this._createContext(frame);
      const interacted = await opcode.execute(context, this.loader);

      frame.pc = interacted.pc;
      frame.stack = interacted.stack;
      frame.memory = interacted.memory;
      this.storage.set(frame.to, interacted.storage);
      this._insertOpCodeResultTrace(interacted, storageSnapshot);

      if (interacted.call && interacted.call.type === "call") {
        // if (frame.type === "staticcall") throw new Error("Cannot call in staticcall");
        const call = interacted.call;
        const code = await this.getCode(interacted.call.to);
        const transaction = {
          ...{ from: frame.to, to: call.to, origin: frame.origin, value: call.value, calldata: call.calldata },
          nonce: await this.getTransactionCount(frame.to),
        } satisfies Transaction;
        const childFrame = await this._createFrame(transaction, {
          type: call.type,
          code: code,
          depth: frame.depth + 1,
        });
        const childResult = await this._executeFrame(childFrame);
        frame.stack.push(childResult.revert ? 0n : 1n); // set success flag
        frame.returnedData = childResult.return;
        if (childResult.return)
          frame.memory = insertIntoArray(
            frame.memory,
            call.returnOffset,
            new Uint8Array(childResult.return!, call.returnSize)
          );
      }

      if (interacted.call && interacted.call.type === "creation") {
        // if (frame.type === "staticcall") throw new Error("Cannot create contract in staticcall");
        const call = interacted.call;
        const initCodeEnd = call.calldata.findIndex((b) => b === 0xf3);
        const initCode = call.calldata.slice(0, initCodeEnd + 1);
        const code = call.calldata.slice(initCodeEnd + 1);
        const transaction = {
          ...{ from: frame.to, to: call.to, origin: frame.origin, value: call.value, calldata: initCode },
          nonce: await this.getTransactionCount(frame.to),
        } satisfies Transaction;
        this.codes.set(transaction.to, code);
        const childFrame = await this._createFrame(transaction, {
          type: call.type,
          code: code,
          depth: frame.depth + 1,
        });
        const childResult = await this._executeFrame(childFrame);
        if (childResult.revert) throw new Error("Contract creation failed");
        frame.stack.push(transaction.to);
      }

      if (interacted.call && interacted.call.type === "delegatecall") {
        // if (frame.type === "staticcall") throw new Error("Cannot delegatecall in staticcall");
        const call = interacted.call;
        const code = await this.getCode(call.to);
        const transaction = {
          ...{ from: frame.from, to: frame.to, origin: frame.origin, value: call.value, calldata: call.calldata },
          nonce: await this.getTransactionCount(frame.to),
        } satisfies Transaction;
        const childFrame = await this._createFrame(transaction, {
          type: call.type,
          code: code,
          depth: frame.depth + 1,
        });
        // console.log(call, childFrame);
        const childResult = await this._executeFrame(childFrame);
        frame.stack.push(childResult.revert ? 0n : 1n); // set success flag
        frame.returnedData = childResult.return;
        if (childResult.return)
          frame.memory = insertIntoArray(
            frame.memory,
            call.returnOffset,
            new Uint8Array(childResult.return!, call.returnSize)
          );
      }

      if (interacted.call && interacted.call.type === "staticcall") {
        const call = interacted.call;
        const code = await this.getCode(interacted.call.to);
        const transaction = {
          ...{ from: frame.to, to: call.to, origin: frame.origin, value: 0n, calldata: call.calldata },
          nonce: await this.getTransactionCount(frame.to),
        } satisfies Transaction;
        const childFrame = await this._createFrame(transaction, {
          type: call.type,
          code: code,
          depth: frame.depth + 1,
        });

        const subFrameStorageSnapshot = this._cloneStorage(frame.to);
        const childResult = await this._executeFrame(childFrame);

        const isStorageUnchanged = Array.from(subFrameStorageSnapshot).every(([k, v]) => {
          const value = this.storage.get(frame.to)?.get(k);
          return value === v;
        });
        if (!isStorageUnchanged) throw new Error("Cannot modify storage in staticcall");

        frame.stack.push(childResult.revert ? 0n : 1n); // set success flag
        frame.returnedData = childResult.return;
        if (childResult.return)
          frame.memory = insertIntoArray(
            frame.memory,
            call.returnOffset,
            new Uint8Array(childResult.return!, call.returnSize)
          );
      }

      if (interacted.log) {
        // console.log(interacted.log);
      }

      if (interacted.revert) {
        console.log("revert:", frame.to.toString(16), ":");
        this.storage.set(frame.to, storageSnapshot);
        this.balances = balanceSnapshot;
        this._insertFrameResultTrace(frame, { revert: interacted.revert }, storageSnapshot, balanceSnapshot);
        return { revert: interacted.revert };
      }
      if (interacted.return) {
        this.nonces.set(frame.from, (frame.nonce || 0n) + 1n);
        this._insertFrameResultTrace(frame, { return: interacted.return }, storageSnapshot, balanceSnapshot);
        return { return: interacted.return };
      }
    }
  }
}
