import { EVMExecutor } from "./evm/evm";
import { JSONRpcLoader } from "./evm/loader";
import { hexToUint8Array, uint8ArrayToHex } from "./utils/converter";
import { promises as fs } from "fs";

const cache = JSON.parse(await fs.readFile("cache.json", "utf8").catch(() => "{}"));

const RPC_URL = "https://mainnet.infura.io/v3/ddac2247725f422196229bfba8ac3877";

const loader = new JSONRpcLoader(RPC_URL, cache);
const executor = new EVMExecutor({ loader });

const result = await executor.executeFromHash(0xb676d789bb8b66a08105c844a49c2bcffb400e5c1cfabd4bc30cca4bff3c9801n);

console.log(uint8ArrayToHex(result.return || new Uint8Array()));
console.log(new TextDecoder().decode(result.revert));

await fs.writeFile("cache.json", JSON.stringify(loader.cache, null, 2));
