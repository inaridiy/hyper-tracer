import { FrameResultTrace, FrameStartTrace, OPCodeResultTrace, Trace } from "../evm/types";
import { bigintToAddressString, uint8ArrayToHex } from "../utils/converter";
import { toHex } from "viem";
import chalk from "chalk";
import { ContractMetadata } from "./loader";
import {
  formatContractName,
  formatErrorResult,
  formatFuncArgs,
  formatFuncName,
  formatFuncResult,
  fromatEventLog,
} from "./utils";

const TRACE_PREFIX = "│  ";
const BRANCH_PREFIX = "├─ ";
const END_PREFIX = "└─ ";

const optionalChalk = (fn: (str: string) => string, colored: boolean = false) => (colored ? fn : (str: string) => str);

const createTreeString = (depth: number, prefix: string, content: string) => {
  return `${TRACE_PREFIX.repeat(depth)}${prefix}${content}\n`;
};

const traceTreeFrameStart = (
  trace: FrameStartTrace,
  metadata: ContractMetadata | undefined,
  fn: (str: string) => string,
  colored = false
) => {
  let str = `${fn(formatContractName(trace.to, metadata))}`;
  str += `::${fn(formatFuncName(trace.calldata, metadata))}`;
  if (trace.value) str += `{value:${trace.value}}`;
  str +=
    trace.calldata.length > 0
      ? `(${formatFuncArgs(trace.calldata, metadata, optionalChalk(chalk.gray, colored))})`
      : `()`;
  str += optionalChalk(chalk.yellow, colored)(` [${trace.txType}]`);
  return str;
};

const traceTreeOpcodeStart = (trace: any) => {
  return `${trace.opcode.name} ${trace.stack.map((v: any) => toHex(v)).join(" ")}`;
};

const traceTreeOpcodeResult = (
  trace: OPCodeResultTrace,
  metadata: ContractMetadata | undefined,
  fn: (str: string) => string,
  colored = false
) => {
  if (!trace.log) return null;
  const { name, args } = fromatEventLog(trace.log, metadata, optionalChalk(chalk.gray, colored));

  return `emit ${fn(name)}(${args})`;
};

const traceTreeFrameResult = (
  trace: FrameResultTrace,
  startTrace: FrameStartTrace,
  metadata: ContractMetadata | undefined,
  colored: (str: string) => string,
  index: string
) => {
  return trace.revert
    ? `${colored("←")} Index: ${index}  ${formatErrorResult(trace.revert, metadata)}`
    : `${colored("←")} ${formatFuncResult(startTrace.calldata, trace.return || new Uint8Array(), metadata)}`;
};

export interface TraceTreeOptions {
  showOp?: boolean;
  colored?: boolean;
  metadata?: Map<bigint, ContractMetadata>;
}

export const traceTree = (traces: Trace[], options: TraceTreeOptions = { colored: true }) => {
  let frameStartTraces: FrameStartTrace[] = [];
  let treeStr = "";
  for (const [i, trace] of Object.entries(traces)) {
    if (trace.type === "frame-start") {
      frameStartTraces.push(trace);
      const metadata = options?.metadata?.get(trace.to);
      const resultTrace = traces.slice(Number(i) + 1).find((t): t is FrameResultTrace => t.type === "frame-result")!;
      const colored = optionalChalk(resultTrace.revert ? chalk.red : chalk.green, options?.colored);
      const str = traceTreeFrameStart(trace, metadata, colored, options?.colored);
      treeStr += createTreeString(trace.depth, BRANCH_PREFIX, str);
    } else if (trace.type === "opcode-start" && options?.showOp) {
      const str = traceTreeOpcodeStart(trace);
      treeStr += createTreeString(frameStartTraces[frameStartTraces.length - 1].depth, BRANCH_PREFIX, str);
    } else if (trace.type === "opcode-result") {
      const frameStartTrace = frameStartTraces[frameStartTraces.length - 1];
      const metadata = options?.metadata?.get(frameStartTrace.to);
      const colored = optionalChalk(chalk.cyan, options.colored);
      const str = traceTreeOpcodeResult(trace, metadata, colored, options?.colored);
      treeStr += str
        ? createTreeString(frameStartTraces[frameStartTraces.length - 1].depth + 1, BRANCH_PREFIX, str)
        : "";
    } else if (trace.type === "frame-result") {
      const frameStartTrace = frameStartTraces.pop()!;
      const metadata = options?.metadata?.get(frameStartTrace.to);
      const colored = optionalChalk(trace.revert ? chalk.red : chalk.green, options.colored);
      const str = traceTreeFrameResult(trace, frameStartTrace, metadata, colored, i);
      treeStr += createTreeString(frameStartTrace.depth + 1, END_PREFIX, str);
    }
  }

  return treeStr;
};
