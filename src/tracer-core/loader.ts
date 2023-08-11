export interface TracerLoader {
  getAbi(address: string): Promise<string>;
}
