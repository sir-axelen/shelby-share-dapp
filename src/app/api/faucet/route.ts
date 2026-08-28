import { NextRequest, NextResponse } from "next/server";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

// Rate limiting: track last faucet request per address (in-memory, resets on server restart)
const lastRequest: Record<string, number> = {};
const COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown

const aptosConfig = new AptosConfig({ network: Network.SHELBYNET });
const aptos = new Aptos(aptosConfig);

export async function POST(req: NextRequest) {
  let address: string | null = null;
  
  try {
    const body = await req.json();
    address = body.address;

    if (!address || typeof address !== "string") {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    // Rate limit check
    const now = Date.now();
    const lastTime = lastRequest[address] || 0;
    if (now - lastTime < COOLDOWN_MS) {
      const remainingSec = Math.ceil((COOLDOWN_MS - (now - lastTime)) / 1000);
      return NextResponse.json(
        { error: `Please wait ${remainingSec}s before requesting again` },
        { status: 429 }
      );
    }

    // 1. Fund account with APT (gas fees)
    let aptSuccess = false;
    let aptTxHash = "";
    try {
      const response = await aptos.fundAccount({
        accountAddress: address,
        amount: 100_000_000,
      });
      aptSuccess = true;
      aptTxHash = response.hash;
    } catch (aptError) {
      console.warn("SDK fundAccount failed, trying endpoint fallback...", aptError);
      try {
        const fallbackRes = await fetch(
          `https://faucet.shelbynet.shelby.xyz/fund?asset=apt`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, amount: 100_000_000 })
          }
        );
        if (fallbackRes.ok) {
          const fallbackText = await fallbackRes.text();
          let data: any = {};
          try {
            data = JSON.parse(fallbackText);
          } catch {}
          aptSuccess = true;
          if (data && data.txn_hashes && data.txn_hashes[0]) {
            aptTxHash = data.txn_hashes[0];
          }
        }
      } catch (e) {
        console.error("APT fallback faucet failed:", e);
      }
    }

    // 2. Fund account with ShelbyUSD (storage fees)
    let shelbySuccess = false;
    try {
      const shelbyRes = await fetch(
        `https://faucet.shelbynet.shelby.xyz/fund?asset=shelbyusd`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, amount: 10_000_000_000 }) // 100 ShelbyUSD
        }
      );
      if (shelbyRes.ok) {
        shelbySuccess = true;
      } else {
        console.warn("ShelbyUSD faucet returned status:", shelbyRes.status);
      }
    } catch (shelbyError) {
      console.error("ShelbyUSD faucet fetch error:", shelbyError);
    }

    if (!aptSuccess && !shelbySuccess) {
      return NextResponse.json(
        { error: "Failed to claim testnet tokens from faucet. Please try again later." },
        { status: 500 }
      );
    }

    lastRequest[address] = Date.now();

    let msg = "";
    if (aptSuccess && shelbySuccess) {
      msg = "Successfully claimed 1 APT and 100 ShelbyUSD!";
    } else if (aptSuccess) {
      msg = "Successfully claimed 1 APT (ShelbyUSD faucet failed)!";
    } else {
      msg = "Successfully claimed 100 ShelbyUSD (APT faucet failed)!";
    }

    return NextResponse.json({
      success: true,
      message: msg,
      txHash: aptTxHash || undefined,
    });
  } catch (error: any) {
    console.error("Faucet error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fund account." },
      { status: 500 }
    );
  }
}
