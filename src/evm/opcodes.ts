import { keccak256 } from "viem";
import { TWO_256 } from "../constants";
import { bigIntToUint8Array, insertIntoArray, sliceBytes } from "../utils/bytes";
import { hexToUint8Array, uint8ArrayToBigint } from "../utils/converter";
import { ethMod, fastPow, i256Div, i256Mod, i256ToBigint, mod, signExtend } from "../utils/math";
import { Loader } from "./loader";
import { ContractContext, InteractedContext } from "./types";
import { calcContractAddress, calcCreate2Address } from "../utils/eth";

export abstract class OPCode {
  constructor(public code: bigint, public name: string) {}

  abstract execute(ctx: ContractContext, loader: Loader): Promise<InteractedContext>;

  toString() {
    return this.name;
  }
}

export class STOP extends OPCode {
  constructor() {
    super(0x0n, "STOP");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1, return: new Uint8Array() });
  }
}

const oneArgMathCodeGenerator = (code: bigint, name: string, op: (a: bigint) => bigint): OPCode => {
  return new (class extends OPCode {
    constructor(code: bigint, name: string, private op: (a: bigint) => bigint) {
      super(code, name);
    }

    execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
      const a = ctx.stack.pop()!;
      ctx.stack.push(this.op(a));
      return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
    }
  })(code, name, op);
};

const twoArgsMathCodeGenerator = (code: bigint, name: string, op: (a: bigint, b: bigint) => bigint): OPCode => {
  return new (class extends OPCode {
    constructor(code: bigint, name: string, private op: (a: bigint, b: bigint) => bigint) {
      super(code, name);
    }

    execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
      const a = ctx.stack.pop()!;
      const b = ctx.stack.pop()!;
      ctx.stack.push(this.op(a, b));
      return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
    }
  })(code, name, op);
};

export const ADD = twoArgsMathCodeGenerator(0x1n, "ADD", (a, b) => ethMod(a + b));
export const MUL = twoArgsMathCodeGenerator(0x2n, "MUL", (a, b) => ethMod(a * b));
export const SUB = twoArgsMathCodeGenerator(0x3n, "SUB", (a, b) => ethMod(a - b));
export const DIV = twoArgsMathCodeGenerator(0x4n, "DIV", (a, b) => (b === 0n ? 0n : ethMod(a / b)));
export const SDIV = twoArgsMathCodeGenerator(0x5n, "SDIV", (a, b) => i256Div(a, b));
export const MOD = twoArgsMathCodeGenerator(0x6n, "MOD", (a, b) => (b === 0n ? 0n : ethMod(a % b)));
export const SMOD = twoArgsMathCodeGenerator(0x7n, "SMOD", (a, b) => i256Mod(a, b));

export class ADDMOD extends OPCode {
  constructor() {
    super(0x8n, "ADDMOD");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const a = ctx.stack.pop()!;
    const b = ctx.stack.pop()!;
    const N = ctx.stack.pop()!;
    ctx.stack.push(mod(a + b, N));
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class MULMOD extends OPCode {
  constructor() {
    super(0x9n, "MULMOD");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const a = ctx.stack.pop()!;
    const b = ctx.stack.pop()!;
    const N = ctx.stack.pop()!;
    ctx.stack.push(mod(a * b, N));
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export const EXP = twoArgsMathCodeGenerator(0xan, "EXP", (a, b) => fastPow(a, b, TWO_256));
export const SIGNEXTEND = twoArgsMathCodeGenerator(0xbn, "SIGNEXTEND", (a, b) => signExtend(a, b));
export const LT = twoArgsMathCodeGenerator(0x10n, "LT", (a, b) => (a < b ? 1n : 0n));
export const GT = twoArgsMathCodeGenerator(0x11n, "GT", (a, b) => (a > b ? 1n : 0n));
export const SLT = twoArgsMathCodeGenerator(0x12n, "SLT", (a, b) => (i256ToBigint(a) < i256ToBigint(b) ? 1n : 0n));
export const SGT = twoArgsMathCodeGenerator(0x13n, "SGT", (a, b) => (i256ToBigint(a) > i256ToBigint(b) ? 1n : 0n));
export const EQ = twoArgsMathCodeGenerator(0x14n, "EQ", (a, b) => (a === b ? 1n : 0n));

export const IZERO = oneArgMathCodeGenerator(0x15n, "ISZERO", (a) => (a === 0n ? 1n : 0n));

export const AND = twoArgsMathCodeGenerator(0x16n, "AND", (a, b) => ethMod(a & b));
export const OR = twoArgsMathCodeGenerator(0x17n, "OR", (a, b) => ethMod(a | b));
export const XOR = twoArgsMathCodeGenerator(0x18n, "XOR", (a, b) => ethMod(a ^ b));
export const NOT = oneArgMathCodeGenerator(0x19n, "NOT", (a) => ethMod(~a));

export const BYTE = twoArgsMathCodeGenerator(0x1an, "BYTE", (a, b) =>
  a >= 32n ? 0n : (b >> (8n * (31n - a))) & 0xffn
);

export const SHL = twoArgsMathCodeGenerator(0x1bn, "SHL", (a, b) => ethMod(b << a));
export const SHR = twoArgsMathCodeGenerator(0x1cn, "SHR", (a, b) => ethMod(b >> a));
export const SAR = twoArgsMathCodeGenerator(0x1dn, "SAR", (a, b) => i256Div(b, 2n ** a));

export class SHA3 extends OPCode {
  constructor() {
    super(0x20n, "SHA3");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const offset = ctx.stack.pop()!;
    const size = ctx.stack.pop()!;
    const value = ctx.memory.slice(Number(offset), Number(offset) + Number(size));
    const hashed = hexToUint8Array(keccak256(value));
    ctx.stack.push(uint8ArrayToBigint(hashed));
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export const COMMON_MATH_OPCODES = [
  ...[ADD, SUB, MUL, DIV, SDIV, MOD, SMOD, new ADDMOD(), new MULMOD(), EXP, SIGNEXTEND],
  ...[LT, GT, SLT, SGT, EQ, IZERO, new SHA3()],
  ...[AND, OR, XOR, NOT, BYTE, SHL, SHR, SAR],
];

export class ADDRESS extends OPCode {
  constructor() {
    super(0x30n, "ADDRESS");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    ctx.stack.push(ctx.to);
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class BALANCE extends OPCode {
  constructor() {
    super(0x31n, "BALANCE");
  }

  async execute(ctx: ContractContext, loader: Loader): Promise<InteractedContext> {
    const address = ctx.stack.pop()!;
    const balance = ctx.balances.get(address) ?? (await loader.getBalance(ctx.blocknumber - 1n, address));
    ctx.stack.push(balance);
    return { ...ctx, pc: ctx.pc + 1 };
  }
}

export class ORIGIN extends OPCode {
  constructor() {
    super(0x32n, "ORIGIN");
  }

  async execute(_ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    throw new Error("Not implemented");
  }
}

export class CALLER extends OPCode {
  constructor() {
    super(0x33n, "CALLER");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    ctx.stack.push(ctx.from);
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class CALLVALUE extends OPCode {
  constructor() {
    super(0x34n, "CALLVALUE");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    ctx.stack.push(ctx.value);
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class CALLDATALOAD extends OPCode {
  constructor() {
    super(0x35n, "CALLDATALOAD");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const offset = ctx.stack.pop()!;
    const end = Number(offset) + 32;
    const value = sliceBytes(ctx.calldata, Number(offset), end);
    ctx.stack.push(uint8ArrayToBigint(value));
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class CALLDATASIZE extends OPCode {
  constructor() {
    super(0x36n, "CALLDATASIZE");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    ctx.stack.push(BigInt(ctx.calldata.length));
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class CALLDATACOPY extends OPCode {
  constructor() {
    super(0x37n, "CALLDATACOPY");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const destOffset = ctx.stack.pop()!;
    const offset = ctx.stack.pop()!;
    const size = ctx.stack.pop()!;
    const end = Number(offset) + Number(size);

    const value = sliceBytes(ctx.calldata, Number(offset), end);

    ctx.memory = insertIntoArray(ctx.memory, Number(destOffset), value);
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class CODESIZE extends OPCode {
  constructor() {
    super(0x38n, "CODESIZE");
  }

  async execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const size = ctx.type === "creation" ? 0n : BigInt(ctx.code.length);
    ctx.stack.push(size);
    return { ...ctx, pc: ctx.pc + 1 };
  }
}

export class CODECOPY extends OPCode {
  constructor() {
    super(0x39n, "CODECOPY");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const destOffset = ctx.stack.pop()!;
    const offset = ctx.stack.pop()!;
    const size = ctx.stack.pop()!;
    const end = Number(offset) + Number(size);

    const value = sliceBytes(ctx.code, Number(offset), end);

    ctx.memory = insertIntoArray(ctx.memory, Number(destOffset), value);
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class GASPRICE extends OPCode {
  constructor() {
    super(0x3an, "GASPRICE");
  }

  execute(_ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    throw new Error("Not implemented");
  }
}

export class EXTCODESIZE extends OPCode {
  constructor() {
    super(0x3bn, "EXTCODESIZE");
  }

  async execute(ctx: ContractContext, loader: Loader): Promise<InteractedContext> {
    const address = ctx.stack.pop()!;
    const code = await loader.getCode(ctx.blocknumber - 1n, address);
    ctx.stack.push(BigInt(code.length));
    return { ...ctx, pc: ctx.pc + 1 };
  }
}

export class EXTCODECOPY extends OPCode {
  constructor() {
    super(0x3cn, "EXTCODECOPY");
  }

  async execute(ctx: ContractContext, loader: Loader): Promise<InteractedContext> {
    const [address, destOffset, offset, size] = [
      ...[ctx.stack.pop()!, ctx.stack.pop()!],
      ...[ctx.stack.pop()!, ctx.stack.pop()!],
    ];
    const end = Number(offset) + Number(size);

    const code = await loader.getCode(ctx.blocknumber - 1n, address);
    const value = sliceBytes(code, Number(offset), end);

    ctx.memory = insertIntoArray(ctx.memory, Number(destOffset), value);
    return { ...ctx, pc: ctx.pc + 1 };
  }
}

export class RETURNDATASIZE extends OPCode {
  constructor() {
    super(0x3dn, "RETURNDATASIZE");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const value = ctx.returnedData ? BigInt(ctx.returnedData.length) : 0n;
    ctx.stack.push(value);
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class RETURNDATACOPY extends OPCode {
  constructor() {
    super(0x3en, "RETURNDATACOPY");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const destOffset = ctx.stack.pop()!;
    const offset = ctx.stack.pop()!;
    const size = ctx.stack.pop()!;
    const end = Number(offset) + Number(size);

    const value =
      ctx.returnedData === undefined ? new Uint8Array(0) : sliceBytes(ctx.returnedData, Number(offset), end);

    ctx.memory = insertIntoArray(ctx.memory, Number(destOffset), value);
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class EXTCODEHASH extends OPCode {
  constructor() {
    super(0x3fn, "EXTCODEHASH");
  }

  async execute(ctx: ContractContext, loader: Loader): Promise<InteractedContext> {
    const address = ctx.stack.pop()!;
    const code = await loader.getCode(ctx.blocknumber - 1n, address);
    ctx.stack.push(uint8ArrayToBigint(hexToUint8Array(keccak256(code))));

    return { ...ctx, pc: ctx.pc + 1 };
  }
}

export class BLOCKHASH extends OPCode {
  constructor() {
    super(0x40n, "BLOCKHASH");
  }

  async execute(ctx: ContractContext, loader: Loader): Promise<InteractedContext> {
    const blocknumber = ctx.stack.pop()!;
    const block = await loader.getBlock(blocknumber);
    if (block === null) throw new Error("Block not found");
    ctx.stack.push(block.hash);
    return { ...ctx, pc: ctx.pc + 1 };
  }
}

export class COINBASE extends OPCode {
  constructor() {
    super(0x41n, "COINBASE");
  }

  async execute(_ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    throw new Error("Not implemented");
  }
}

export class TIMESTAMP extends OPCode {
  constructor() {
    super(0x42n, "TIMESTAMP");
  }

  async execute(ctx: ContractContext, loader: Loader): Promise<InteractedContext> {
    const block = await loader.getBlock(ctx.blocknumber);
    const timestamp = block === null ? BigInt(Date.now() / 1000) : block.timestamp;

    ctx.stack.push(timestamp);
    return { ...ctx, pc: ctx.pc + 1 };
  }
}

export class NUMBER extends OPCode {
  constructor() {
    super(0x43n, "NUMBER");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    ctx.stack.push(ctx.blocknumber);
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class PREVRANDAO extends OPCode {
  constructor() {
    super(0x44n, "PREVRANDAO");
  }

  async execute(_ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    throw new Error("Not implemented");
  }
}

export class GASLMIT extends OPCode {
  constructor() {
    super(0x45n, "GASLMIT");
  }

  async execute(_ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    throw new Error("Not implemented");
  }
}

export class CHAINID extends OPCode {
  constructor() {
    super(0x46n, "CHAINID");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    ctx.stack.push(ctx.chainId);
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class SELFBALANCE extends OPCode {
  constructor() {
    super(0x47n, "SELFBALANCE");
  }

  async execute(ctx: ContractContext, loader: Loader): Promise<InteractedContext> {
    const balance = ctx.balances.get(ctx.to) ?? (await loader.getBalance(ctx.blocknumber - 1n, ctx.to));

    ctx.stack.push(balance);
    return { ...ctx, pc: ctx.pc + 1 };
  }
}

export class BASEFEE extends OPCode {
  constructor() {
    super(0x48n, "BASEFEE");
  }

  async execute(_ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    throw new Error("Not implemented");
  }
}

export class POP extends OPCode {
  constructor() {
    super(0x50n, "POP");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    ctx.stack.pop();
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class MLOAD extends OPCode {
  constructor() {
    super(0x51n, "MLOAD");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const offset = ctx.stack.pop()!;
    const value = sliceBytes(ctx.memory, Number(offset), Number(offset) + 32);
    ctx.stack.push(uint8ArrayToBigint(value));
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class MSTORE extends OPCode {
  constructor() {
    super(0x52n, "MSTORE");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const offset = ctx.stack.pop()!;
    const value = ctx.stack.pop()!;
    ctx.memory = insertIntoArray(ctx.memory, Number(offset), bigIntToUint8Array(value, 32));
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class MSTORE8 extends OPCode {
  constructor() {
    super(0x53n, "MSTORE8");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const offset = ctx.stack.pop()!;
    const value = ctx.stack.pop()!;

    const bytes = value & 0xffn;
    ctx.memory = insertIntoArray(ctx.memory, Number(offset), bigIntToUint8Array(bytes, 1));
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class SLOAD extends OPCode {
  constructor() {
    super(0x54n, "SLOAD");
  }

  async execute(ctx: ContractContext, loader: Loader): Promise<InteractedContext> {
    const index = ctx.stack.pop()!;
    const value = ctx.storage.get(index) || (await loader.getStorageAt(ctx.blocknumber - 1n, ctx.to, index));
    ctx.stack.push(value);
    return { ...ctx, pc: ctx.pc + 1 };
  }
}

export class SSTORE extends OPCode {
  constructor() {
    super(0x55n, "SSTORE");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const [index, value] = [ctx.stack.pop()!, ctx.stack.pop()!];
    ctx.storage.set(index, value);
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class JUMP extends OPCode {
  constructor() {
    super(0x56n, "JUMP");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const dest = ctx.stack.pop()!;
    const jumpTo = ctx.code[Number(dest)];
    if (jumpTo !== 0x5b) throw new Error("Invalid JUMPDEST");
    return Promise.resolve({ ...ctx, pc: Number(dest) });
  }
}

export class JUMPI extends OPCode {
  constructor() {
    super(0x57n, "JUMPI");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const [dest, cond] = [ctx.stack.pop()!, ctx.stack.pop()!];
    const jumpTo = ctx.code[Number(dest)];
    if (jumpTo !== 0x5b) throw new Error("Invalid JUMPDEST");
    return Promise.resolve({ ...ctx, pc: Number(cond) === 0 ? ctx.pc + 1 : Number(dest) });
  }
}

export class PC extends OPCode {
  constructor() {
    super(0x58n, "PC");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    ctx.stack.push(BigInt(ctx.pc));
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class MSIZE extends OPCode {
  constructor() {
    super(0x59n, "MSIZE");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    ctx.stack.push(BigInt(ctx.memory.length));
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class GAS extends OPCode {
  constructor() {
    super(0x5an, "GAS");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    ctx.stack.push(BigInt(2n ** 256n - 1n));
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class JUMPDEST extends OPCode {
  constructor() {
    super(0x5bn, "JUMPDEST");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class PUSHN extends OPCode {
  n: number;

  constructor(n: bigint) {
    if (n < 0n || n > 32n) throw new Error("Invalid PUSHN");
    super(0x5fn + n, `PUSH${n}`);
    this.n = Number(n);
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const value = ctx.code.slice(ctx.pc + 1, ctx.pc + 1 + this.n);
    ctx.stack.push(uint8ArrayToBigint(value));
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 + this.n });
  }
}

export class DUPN extends OPCode {
  n: number;

  constructor(n: bigint) {
    if (n < 1n || n > 16n) throw new Error("Invalid DUPN");
    super(0x7fn + n, `DUP${n}`);
    this.n = Number(n);
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const value = ctx.stack[ctx.stack.length - Number(this.n)];
    ctx.stack.push(value);
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class SWAPN extends OPCode {
  n: number;

  constructor(n: bigint) {
    if (n < 1n || n > 16n) throw new Error("Invalid SWAPN");
    super(0x8fn + n, `SWAP${n}`);
    this.n = Number(n);
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const [a, b] = [ctx.stack[ctx.stack.length - 1], ctx.stack[ctx.stack.length - 1 - Number(this.n)]];
    ctx.stack[ctx.stack.length - 1] = b;
    ctx.stack[ctx.stack.length - 1 - Number(this.n)] = a;
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1 });
  }
}

export class LOGN extends OPCode {
  n: number;

  constructor(n: bigint) {
    if (n < 0n || n > 4n) throw new Error("Invalid LOGN");
    super(0xa0n + n, `LOG${n}`);
    this.n = Number(n);
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const [offset, size] = [ctx.stack.pop()!, ctx.stack.pop()!];
    const topics = Array.from({ length: Number(this.n) }, () => ctx.stack.pop()!);
    const data = ctx.memory.slice(Number(offset), Number(offset) + Number(size));
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1, log: { topics, data } });
  }
}

export class CREATE extends OPCode {
  constructor() {
    super(0xf0n, "CREATE");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const [value, offset, size] = [ctx.stack.pop()!, ctx.stack.pop()!, ctx.stack.pop()!];
    const address = calcContractAddress(ctx.to, ctx.nonce);
    const code = ctx.memory.slice(Number(offset), Number(offset) + Number(size));

    return Promise.resolve({
      ...ctx,
      pc: ctx.pc + 1,
      call: { type: "creation", to: address, value, calldata: code, returnOffset: 0, returnSize: 0 },
    });
  }
}

export class CALL extends OPCode {
  constructor() {
    super(0xf1n, "CALL");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const [_gas, address, value, argsOffset] = [ctx.stack.pop()!, ctx.stack.pop()!, ctx.stack.pop()!, ctx.stack.pop()!];
    const [argsSize, retOffset, retSize] = [ctx.stack.pop()!, ctx.stack.pop()!, ctx.stack.pop()!];

    const calldata = ctx.memory.slice(Number(argsOffset), Number(argsOffset) + Number(argsSize));
    const [returnOffset, returnSize] = [Number(retOffset), Number(retSize)];
    const call = { type: "call", to: address, value, calldata, returnOffset, returnSize } as const;

    return Promise.resolve({ ...ctx, pc: ctx.pc + 1, call });
  }
}

export class CALLCODE extends OPCode {
  constructor() {
    super(0xf2n, "CALLCODE");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    throw new Error("Not implemented");
  }
}

export class RETURN extends OPCode {
  constructor() {
    super(0xf3n, "RETURN");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const offset = ctx.stack.pop()!;
    const size = ctx.stack.pop()!;
    const value = ctx.memory.slice(Number(offset), Number(offset) + Number(size));
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1, return: value });
  }
}

export class DELEGATECALL extends OPCode {
  constructor() {
    super(0xf4n, "DELEGATECALL");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const [_gas, address, argsOffset] = [ctx.stack.pop()!, ctx.stack.pop()!, ctx.stack.pop()!];
    const [argsSize, retOffset, retSize] = [ctx.stack.pop()!, ctx.stack.pop()!, ctx.stack.pop()!];

    const calldata = ctx.memory.slice(Number(argsOffset), Number(argsOffset) + Number(argsSize));
    const [returnOffset, returnSize] = [Number(retOffset), Number(retSize)];
    const call = { type: "delegatecall", to: address, value: ctx.value, calldata, returnOffset, returnSize } as const;

    return Promise.resolve({ ...ctx, pc: ctx.pc + 1, call });
  }
}

export class CREATE2 extends OPCode {
  constructor() {
    super(0xf5n, "CREATE2");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const [value, offset, size, salt] = [ctx.stack.pop()!, ctx.stack.pop()!, ctx.stack.pop()!, ctx.stack.pop()!];
    const code = ctx.memory.slice(Number(offset), Number(offset) + Number(size));
    const address = calcCreate2Address(ctx.to, salt, code);

    return Promise.resolve({
      ...ctx,
      pc: ctx.pc + 1,
      call: { type: "creation", to: address, value, calldata: code, returnOffset: 0, returnSize: 0 },
    });
  }
}

export class STATICCALL extends OPCode {
  constructor() {
    super(0xfan, "STATICCALL");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const [_gas, address, argsOffset] = [ctx.stack.pop()!, ctx.stack.pop()!, ctx.stack.pop()!];
    const [argsSize, retOffset, retSize] = [ctx.stack.pop()!, ctx.stack.pop()!, ctx.stack.pop()!];

    const calldata = ctx.memory.slice(Number(argsOffset), Number(argsOffset) + Number(argsSize));
    const [returnOffset, returnSize] = [Number(retOffset), Number(retSize)];
    const call = { type: "staticcall", to: address, value: 0n, calldata, returnOffset, returnSize } as const;

    return Promise.resolve({ ...ctx, pc: ctx.pc + 1, call });
  }
}

export class REVERT extends OPCode {
  constructor() {
    super(0xfdn, "REVERT");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const offset = ctx.stack.pop()!;
    const size = ctx.stack.pop()!;
    const value = ctx.memory.slice(Number(offset), Number(offset) + Number(size));
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1, revert: value });
  }
}

export class INVALID extends OPCode {
  constructor() {
    super(0xfen, "INVALID");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    throw new Error("Invalid opcode");
  }
}

export class SELFDESTRUCT extends OPCode {
  constructor() {
    super(0xffn, "SELFDESTRUCT");
  }

  execute(ctx: ContractContext, _loader: Loader): Promise<InteractedContext> {
    const address = ctx.stack.pop()!;
    return Promise.resolve({ ...ctx, pc: ctx.pc + 1, selfdestruct: address });
  }
}
