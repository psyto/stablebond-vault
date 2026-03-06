import { ComplrClient } from "@complr/sdk";

let client: ComplrClient | null = null;

function getClient(): ComplrClient {
  if (!client) {
    client = new ComplrClient({
      apiKey: process.env.COMPLR_API_KEY || "",
    });
  }
  return client;
}

/**
 * Screen a wallet for sanctions/PEP before bond vault deposits.
 * Integrates Fabrknt Off-Chain Compliance with stablebond-vault's
 * tier-based access control.
 */
export async function screenWallet(address: string): Promise<{
  allowed: boolean;
  riskLevel: string;
  sanctions: boolean;
  flags: string[];
}> {
  try {
    const result = await getClient().screenWallet(address, "solana");
    return {
      allowed: !result.sanctions && result.riskLevel !== "critical" && result.riskLevel !== "high",
      riskLevel: result.riskLevel,
      sanctions: result.sanctions,
      flags: result.flags,
    };
  } catch (error) {
    console.error("Compliance screening failed:", error);
    return { allowed: true, riskLevel: "unknown", sanctions: false, flags: [] };
  }
}

/**
 * Check a bond deposit transaction for compliance.
 */
export async function checkDepositCompliance(params: {
  transactionId: string;
  depositorWallet: string;
  vaultWallet: string;
  amount: string;
  currency: string;
}): Promise<{ compliant: boolean; status: string; actionItems: string[] }> {
  try {
    const result = await getClient().checkTransaction({
      transactionId: params.transactionId,
      timestamp: new Date().toISOString(),
      senderWallet: params.depositorWallet,
      recipientWallet: params.vaultWallet,
      amount: params.amount,
      currency: params.currency,
      chain: "solana",
    });
    return {
      compliant: result.overallStatus === "compliant",
      status: result.overallStatus,
      actionItems: result.actionItems,
    };
  } catch (error) {
    console.error("Deposit compliance check failed:", error);
    return { compliant: true, status: "unknown", actionItems: [] };
  }
}
