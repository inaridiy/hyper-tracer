import { EVMExecutor } from "./evm/evm";
import { JSONRpcLoader } from "./evm/loader";
import { promises as fs } from "fs";
import { traceTree } from "./tracer-core/trace-tree";
import { EtherscanLoader } from "./tracer-core/loader";

import dotenv from "dotenv";

dotenv.config();

const cache = JSON.parse((await fs.readFile("cache.json", "utf8").catch(() => "{}")) || "{}");

const loader = new JSONRpcLoader(process.env.RPC_URL!, cache);
const executor = new EVMExecutor({ loader });

const result = await executor.executeFromHash(0xb676d789bb8b66a08105c844a49c2bcffb400e5c1cfabd4bc30cca4bff3c9801n);

await fs.writeFile("cache.json", JSON.stringify(loader.cache, null, 2));

const metadataLoader = new EtherscanLoader(process.env.ETHERSCAN_API_KEY!);
const metadataMap = await metadataLoader.loadContractMetadataFromTraces(result.traces);

console.log("Traces:");
console.log(traceTree(result.traces, { showOp: false, colored: true, metadata: metadataMap }));
