import { FrameStartTrace, Trace } from "../evm/types";
import { bigintToAddressString, uint8ArrayToHex } from "../utils/converter";
import { toHex } from "viem";

export const traceTree = (traces: Trace[]) => {
  let frameStartTraces: FrameStartTrace[] = [];
  let treeStr = "";
  for (const trace of traces) {
    if (trace.type === "frame-start") {
      frameStartTraces.push(trace);
      const str = `${bigintToAddressString(trace.to)}::${trace.value ? `{value:${trace.value}}` : ""}${uint8ArrayToHex(
        trace.calldata.slice(0, 4)
      )}(${toHex(trace.calldata)}) [${trace.txType}]`;
      treeStr += "│  ".repeat(trace.depth) + "├─" + str + "\n";
    } else if (trace.type === "opcode-start") {
      //Nothing to print
    } else if (trace.type === "opcode-result") {
      if (!trace.log) continue;
      const startTrace = frameStartTraces[frameStartTraces.length - 1];
      const str = `emit ${toHex(trace.log?.topics[0])} ${toHex(trace.log?.data)}`;
      treeStr += "│  ".repeat(startTrace.depth + 1) + "├─" + str + "\n";
    } else if (trace.type === "frame-result") {
      const startTrace = frameStartTraces.pop()!;
      const str = `← ${trace.return && trace.return.length > 0 ? toHex(trace.return) : "()"}`;
      treeStr += "│  ".repeat(startTrace.depth + 1) + "└─" + str + "\n";
    }
  }

  return treeStr;
};
