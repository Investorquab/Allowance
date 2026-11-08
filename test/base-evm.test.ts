import { describe, expect, it, vi } from "vitest";
import { encodeEventTopics, erc20Abi, numberToHex } from "viem";
import { BaseEvmChain, BASE_USDC } from "../src/lib/chain/base-evm";

const AGENT = "0x1111111111111111111111111111111111111111";
const PAYEE = "0x2222222222222222222222222222222222222222";
const OTHER = "0x3333333333333333333333333333333333333333";

function transferLog(from: string, to: string, value: bigint, token = BASE_USDC) {
  return {
    address: token,
    topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from: from as `0x${string}`, to: to as `0x${string}` } }),
    data: numberToHex(value, { size: 32 }),
  };
}

describe("BaseEvmChain — experimental second settlement chain (Base/EVM)", () => {
  it("reads an ERC-20 balance", async () => {
    const pub = { readContract: vi.fn().mockResolvedValue(1_000_000n), getTransactionReceipt: vi.fn() };
    const c = new BaseEvmChain({ pub, account: AGENT as `0x${string}` });
    expect(await c.getBalance(AGENT, BASE_USDC)).toBe("1000000");
  });

  it("prepares an exact transfer with a Sui-shaped dry-run the engine understands", async () => {
    const pub = { readContract: vi.fn().mockResolvedValue(1_000_000n), getTransactionReceipt: vi.fn() };
    const c = new BaseEvmChain({ pub, account: AGENT as `0x${string}` });
    const p = await c.preparePayment(PAYEE, BASE_USDC, "10000");
    expect(p.dryRun.ok).toBe(true);
    expect(p.dryRun.changes).toEqual([
      { owner: AGENT.toLowerCase(), coinType: BASE_USDC, amount: "-10000" },
      { owner: PAYEE.toLowerCase(), coinType: BASE_USDC, amount: "10000" },
    ]);
  });

  it("fails the dry-run when the balance can't cover the transfer", async () => {
    const pub = { readContract: vi.fn().mockResolvedValue(500n), getTransactionReceipt: vi.fn() };
    const c = new BaseEvmChain({ pub, account: AGENT as `0x${string}` });
    const p = await c.preparePayment(PAYEE, BASE_USDC, "10000");
    expect(p.dryRun.ok).toBe(false);
  });

  it("refuses to execute without a signer, and returns the hash with one", async () => {
    const pub = { readContract: vi.fn().mockResolvedValue(1_000_000n), getTransactionReceipt: vi.fn() };
    const readonly = new BaseEvmChain({ pub, account: AGENT as `0x${string}` });
    const p = await readonly.preparePayment(PAYEE, BASE_USDC, "10000");
    await expect(readonly.executePayment(p)).rejects.toThrow(/not configured/);

    const wallet = { writeContract: vi.fn().mockResolvedValue("0xabc123" as `0x${string}`) };
    const signer = new BaseEvmChain({ pub, wallet, account: AGENT as `0x${string}` });
    expect(await signer.executePayment(p)).toBe("0xabc123");
    expect(wallet.writeContract).toHaveBeenCalledOnce();
  });

  it("verifies a successful USDC Transfer of the exact amount to the payee", async () => {
    const pub = {
      readContract: vi.fn(),
      getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", logs: [transferLog(AGENT, PAYEE, 10000n)] }),
    };
    const c = new BaseEvmChain({ pub, account: AGENT as `0x${string}` });
    const v = await c.verifyPayment("0xdeadbeef", { payTo: PAYEE, coinType: BASE_USDC, amount: "10000" });
    expect(v.ok).toBe(true);
    expect(v.payer?.toLowerCase()).toBe(AGENT.toLowerCase());
    expect(v.amount).toBe("10000");
  });

  it("rejects a reverted tx and a transfer to the wrong address", async () => {
    const reverted = new BaseEvmChain({ pub: { readContract: vi.fn(), getTransactionReceipt: vi.fn().mockResolvedValue({ status: "reverted", logs: [] }) }, account: AGENT as `0x${string}` });
    expect((await reverted.verifyPayment("0x1", { payTo: PAYEE, coinType: BASE_USDC, amount: "10000" })).ok).toBe(false);

    const wrongDest = new BaseEvmChain({ pub: { readContract: vi.fn(), getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", logs: [transferLog(AGENT, OTHER, 10000n)] }) }, account: AGENT as `0x${string}` });
    expect((await wrongDest.verifyPayment("0x2", { payTo: PAYEE, coinType: BASE_USDC, amount: "10000" })).ok).toBe(false);
  });
});
