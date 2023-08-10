import { Loader } from "./loader";
import { Address, ExecutionResult, ContractContext } from "./types";

export interface PrecompiledContracts {
  address: Address;

  call(context: ContractContext, loader: Loader): Promise<ExecutionResult>;
}

export class MEMCOPY implements PrecompiledContracts {
  address = 0x4n;

  call(context: ContractContext, _loader: Loader): Promise<ExecutionResult> {
    console.log("MEMCOPY");
    return Promise.resolve({ return: new Uint8Array(context.calldata) });
  }
}
