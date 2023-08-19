import {
  Hex,
  decodeErrorResult,
  decodeEventLog,
  decodeFunctionData,
  decodeFunctionResult,
  getAbiItem,
  toHex,
} from "viem";
import { bigintToAddressString, bigintToBytes32String, uint8ArrayToHex } from "../utils/converter";
import { ContractMetadata } from "./loader";

export const formatContractName = (address: bigint, metadata: ContractMetadata | undefined) => {
  return metadata?.label || bigintToAddressString(address);
};

export const formatFuncName = (calldata: Uint8Array, metadata: ContractMetadata | undefined) => {
  const abi = metadata?.abi;
  if (!abi && calldata.length === 0) return "fallback";
  else if (!abi) return uint8ArrayToHex(calldata.slice(0, 4));

  const func = decodeFunctionData({ abi, data: uint8ArrayToHex(calldata) as Hex });
  return func?.functionName || uint8ArrayToHex(calldata.slice(0, 4));
};

export const formatFuncArgs = (
  calldata: Uint8Array,
  metadata: ContractMetadata | undefined,
  grayChalk: (str: string) => string
) => {
  const abi = metadata?.abi;
  if (!abi) return toHex(calldata);

  const func = decodeFunctionData({ abi, data: uint8ArrayToHex(calldata) as Hex });
  if (!func.args) return toHex(calldata);

  const funcAbi = getAbiItem({ abi, name: func.functionName });

  return func.args
    .map((arg, i) => (funcAbi.inputs[i]?.name ? `${grayChalk(funcAbi.inputs[i].name + ":")} ${arg}` : `${arg}`))
    .join(", ");
};

export const formatFuncResult = (calldata: Uint8Array, result: Uint8Array, metadata: ContractMetadata | undefined) => {
  if (result.length === 0) return "()";

  const abi = metadata?.abi;
  if (!abi) return toHex(result);

  const func = decodeFunctionData({ abi, data: uint8ArrayToHex(calldata) as Hex });
  if (!func.functionName) return toHex(result);

  const decodedResult = decodeFunctionResult({
    abi,
    functionName: func.functionName,
    data: uint8ArrayToHex(result) as Hex,
  });

  return decodedResult || toHex(result);
};

export const formatErrorResult = (result: Uint8Array, metadata: ContractMetadata | undefined) => {
  if (result.length === 0) return "EvmError: Revert";

  const abi = metadata?.abi;
  if (!abi) return toHex(result);

  const decodedError = decodeErrorResult({ abi, data: uint8ArrayToHex(result) as Hex });
  if (!decodedError) return toHex(result);

  return `${decodedError.errorName}: ${decodedError.args.join(", ")}`;
};

export const fromatEventLog = (
  log: { data: Uint8Array; topics: bigint[] },
  metadata: ContractMetadata | undefined,
  grayChalk: (str: string) => string
) => {
  if (!metadata?.abi) return { name: toHex(log.topics[0]), args: toHex(log.data) };

  const decoded = decodeEventLog({
    abi: metadata.abi,
    data: uint8ArrayToHex(log.data) as Hex,
    topics: log.topics.map((t) => bigintToBytes32String(t)) as [Hex],
  });

  if (!decoded) return { name: toHex(log.topics[0]), args: toHex(log.data) };

  return {
    name: decoded.eventName as unknown as string,
    args: Object.entries(decoded.args || [])
      .map(([k, v]) => `${grayChalk(k + ":")} ${v}`)
      .join(", "),
  };
};
