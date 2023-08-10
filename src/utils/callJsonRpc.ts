export const callJsonRpc = async (rpcUrl: string, method: string, params: any[]) => {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    });
    const json = await response.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  } catch (e) {
    throw new Error(`Failed to call JSON-RPC: ${e} ${method} ${JSON.stringify(params)}`);
  }
};
