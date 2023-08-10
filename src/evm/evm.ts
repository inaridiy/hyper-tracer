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

  private _cloneFrame(frame: ContractFrame): ContractFrame {
    const clone = {
      ...frame,
      ...{ stack: [...frame.stack], memory: new Uint8Array(frame.memory) },
    } satisfies ContractFrame;
    return clone;
  }

  private _cloneStorage(address: Address): Storage {
    const storage = new Map(Array.from(this.storage.get(address) || new Map()).map(([k, v]) => [k, v]));
    return storage;
  }

  private _cloneBalances(): Map<Address, bigint> {
    const balances = new Map(Array.from(this.balances).map(([k, v]) => [k, v]));
    return balances;
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

  async execute(tx: Partial<VisualTransaction & { blocknumber: bigint }>): Promise<ExecutionResult> {
    if (tx.blocknumber) this.blocknumber = tx.blocknumber;
    const transaction = normalizeTransaction(tx) as Transaction;
    transaction.nonce = await this.getTransactionCount(transaction.from);
    if (!transaction.to) {
      await this._executeCreation(transaction);
      return {};
    } else {
      const code = await this.getCode(transaction.to);
      const frame = await this._createFrame(transaction, { depth: 0, code, type: "call" });
      return await this._executeFrame(frame);
    }
  }

  async executeFromHash(hash: bigint): Promise<ExecutionResult> {
    const transaction = await this.loader.getTransactionByHash(hash);
    if (transaction.blocknumber) this.blocknumber = transaction.blocknumber;
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

    console.log(frame.type, ":", frame.to.toString(16), ":", frame.value, uint8ArrayToHex(frame.calldata));

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

    const precompiled = this.precompiled.get(frame.to);
    if (frame.code.length === 0 && !precompiled) return {};
    if (precompiled) return await precompiled.call(await this._createContext(frame), this.loader);

    while (true) {
      if (frame.pc >= frame.code.length) throw new Error("Invalid pc");

      const opcode = this.opcodes.get(frame.code[frame.pc]);
      if (!opcode) throw new Error(`Invalid opcode: ${frame.code[frame.pc].toString(16)}`);

      console.log(
        "depth:",
        frame.depth + 1,
        frame.pc.toString(10),
        ":",
        opcode.name,
        "[",
        frame.stack.map((n) => n.toString(16)).join(","),
        "]"
      );
      const context = this._createContext(frame);
      const interacted = await opcode.execute(context, this.loader);

      frame = this._cloneFrame(frame);
      frame.pc = interacted.pc;
      frame.stack = interacted.stack;
      frame.memory = interacted.memory;
      this.storage.set(frame.to, interacted.storage);

      if (interacted.call && interacted.call.type === "call") {
        // if (frame.type === "staticcall") throw new Error("Cannot call in staticcall");
        const call = interacted.call;
        const code = await this.getCode(interacted.call.to);
        const transaction = {
          ...{ from: frame.to, to: call.to, value: call.value, calldata: call.calldata },
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
          ...{ from: frame.to, to: call.to, value: call.value, calldata: initCode },
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
          ...{ from: frame.from, to: frame.to, value: call.value, calldata: call.calldata },
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
          ...{ from: frame.to, to: call.to, value: 0n, calldata: call.calldata },
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
        console.log("log:", frame.to.toString(16), ":");
        // console.log(interacted.log);
      }

      if (interacted.revert) {
        console.log("revert:", frame.to.toString(16), ":");
        this.storage.set(frame.to, storageSnapshot);
        this.balances = balanceSnapshot;
        return { revert: interacted.revert };
      }
      if (interacted.return) {
        this.nonces.set(frame.from, frame.nonce + 1n);
        return { return: interacted.return };
      }
    }
  }
}
