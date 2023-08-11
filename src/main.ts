import { EVMExecutor } from "./evm/evm";
import { JSONRpcLoader } from "./evm/loader";
import { promises as fs } from "fs";
import { traceTree } from "./tracer-core/trace-tree";

const cache = JSON.parse((await fs.readFile("cache.json", "utf8").catch(() => "{}")) || "{}");

const RPC_URL = "https://eth-mainnet.g.alchemy.com/v2/d61ipHuXZw_RE41xL_yuMrKHyT4LmMzK";

const loader = new JSONRpcLoader(RPC_URL, cache);
const executor = new EVMExecutor({ loader });

const result = await executor.executeFromHash(0xb676d789bb8b66a08105c844a49c2bcffb400e5c1cfabd4bc30cca4bff3c9801n);

await fs.writeFile("cache.json", JSON.stringify(loader.cache, null, 2));

console.log("Traces:");
console.log(traceTree(result.traces));
