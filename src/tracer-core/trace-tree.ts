import { FrameResultTrace, FrameStartTrace, Trace } from "../evm/types";
import { bigintToAddressString, uint8ArrayToHex } from "../utils/converter";
import { fallback, toHex } from "viem";
import chalk from "chalk";

export const traceTree = (traces: Trace[]) => {
  let frameStartTraces: FrameStartTrace[] = [];
  let treeStr = "";
  for (const [i, trace] of Object.entries(traces)) {
    if (trace.type === "frame-start") {
      frameStartTraces.push(trace);
      const resultTrace = traces.slice(Number(i) + 1).find((t): t is FrameResultTrace => t.type === "frame-result")!;
      const colored = resultTrace.revert ? chalk.red : chalk.green;

      let str = `${colored(bigintToAddressString(trace.to))}`;
      str +=
        trace.calldata.length > 4
          ? `::${colored(uint8ArrayToHex(trace.calldata.slice(0, 4)))}`
          : `::${colored("fallback")}`;
      if (trace.value) str += `{value:${trace.value}}`;
      str += trace.calldata.length > 0 ? `(${toHex(trace.calldata)})` : `()`;
      str += chalk.yellow(` [${trace.txType}]`);
      treeStr += "│  ".repeat(trace.depth) + "├─ " + str + "\n";
    } else if (trace.type === "opcode-start") {
      //Nothing to print
      const startTrace = frameStartTraces[frameStartTraces.length - 1];
      const str = `${trace.opcode.name} ${trace.stack.map((v) => toHex(v)).join(" ")}`;
      treeStr += "│  ".repeat(startTrace.depth) + "├─ " + str + "\n";
    } else if (trace.type === "opcode-result") {
      if (!trace.log) continue;
      const startTrace = frameStartTraces[frameStartTraces.length - 1];
      const str = `emit ${chalk.cyan(toHex(trace.log?.topics[0]))} ${toHex(trace.log?.data)}`;
      treeStr += "│  ".repeat(startTrace.depth + 1) + "├─ " + str + "\n";
    } else if (trace.type === "frame-result") {
      const startTrace = frameStartTraces.pop()!;
      const str = trace.revert
        ? `${chalk.red("←")} Index: ${i}  ${
            trace.revert.length > 0 ? new TextDecoder().decode(trace.revert) : "EvmError: Revert"
          }`
        : `${chalk.green("←")} ${trace.return && trace.return.length > 0 ? toHex(trace.return) : "()"}`;
      treeStr += "│  ".repeat(startTrace.depth + 1) + "└─ " + str + "\n";
    }
  }

  return treeStr;
};
