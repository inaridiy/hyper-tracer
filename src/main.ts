import { EVMExecutor } from "./evm/evm";
import { hexToUint8Array, uint8ArrayToHex } from "./utils/converter";

const executor = new EVMExecutor({
  blocknumber: 17878763n,
  rpcUrl: "https://mainnet.infura.io/v3/ddac2247725f422196229bfba8ac3877",
});

const result = await executor.executeFromHash(0x426eb538ef7d46eee52d8bff5b828fe2dcc2f4557a26ff1afd05be197523ea05n);

console.log(result.revert);

console.log(uint8ArrayToHex(result.return || new Uint8Array()));
console.log(new TextDecoder().decode(result.revert));
