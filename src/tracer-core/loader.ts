import { FrameStartTrace, Trace } from "../evm/types";
import { bigintToAddressString } from "../utils/converter";

export interface ContractMetadata {
  label?: string;
  source?: string;
  abi?: any[];
}

export interface MetadataLoader {
  loadContractMetadata(address: string): Promise<ContractMetadata>;
}

const CONTRACT_IS_NOT_FOUND = "Contract source code not verified";

export class EtherscanLoader implements MetadataLoader {
  constructor(private apiKey: string) {}

  async loadContractMetadata(address: string): Promise<ContractMetadata> {
    const res = await fetch(
      `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${address}&apikey=${this.apiKey}`
    );
    const json = await res.json().catch(() => ({ status: "0" }));
    if (json.status === "0") return {};

    const contract = json.result[0];

    return {
      label: contract.ContractName || undefined,
      source: contract.SourceCode || undefined,
      abi: contract.ABI && contract.ABI !== CONTRACT_IS_NOT_FOUND ? JSON.parse(contract.ABI) : undefined,
    };
  }

  async loadContractMetadataFromTraces(traces: Trace[]): Promise<Map<bigint, ContractMetadata>> {
    const addresses = traces
      .filter((trace): trace is FrameStartTrace => trace.type === "frame-start")
      .map((trace) => trace.to)
      .filter((address) => address !== 0n);

    const metadataMap = new Map<bigint, ContractMetadata>();
    for (const address of addresses) {
      const metadata = await this.loadContractMetadata(bigintToAddressString(address));
      metadataMap.set(address, metadata);
    }

    return metadataMap;
  }
}
