import type { PayeeHistory, PreparedPayment, Units, VerifyResult } from "../types";

/** Everything Allowance needs from a chain. Live = Tatum Sui RPC, Sim = local ledger. */
export interface ChainAdapter {
  readonly name: string;
  agentAddress(): string;
  getBalance(owner: string, coinType: string): Promise<Units>;
  payeeHistory(address: string): Promise<PayeeHistory>;
  /** Build + dry-run (never signs). */
  preparePayment(to: string, coinType: string, amount: Units): Promise<PreparedPayment>;
  /** Sign + execute a prepared payment. Returns tx digest. */
  executePayment(p: PreparedPayment): Promise<string>;
  /** Vendor side: did `digest` move >= amount of coinType to payTo, successfully? */
  verifyPayment(digest: string, expect: { payTo: string; coinType: string; amount: Units }): Promise<VerifyResult>;
  explorerTxUrl(digest: string): string | null;
}
