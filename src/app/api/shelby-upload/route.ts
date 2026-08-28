import { NextRequest, NextResponse } from "next/server";
import { Account, Ed25519PrivateKey, Network } from "@aptos-labs/ts-sdk";
import { ShelbyClient } from "@shelby-protocol/sdk/node";

// Server-side only env vars (no NEXT_PUBLIC_ prefix = never sent to browser)
const SHELBY_PRIVATE_KEY = process.env.SHELBY_SERVER_PRIVATE_KEY || "";
const SHELBY_API_KEY = process.env.SHELBY_API_KEY || "";
const SHELBY_LOCATION = "shelbynet-1";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const blobFile = formData.get("blob") as File | null;
    const uidStr = formData.get("uid") as string | null;
    const commitmentJson = formData.get("commitment") as string | null;

    if (!blobFile || !uidStr || !commitmentJson) {
      return NextResponse.json(
        { error: "Missing required fields: blob, uid, commitment" },
        { status: 400 }
      );
    }

    if (!SHELBY_PRIVATE_KEY) {
      return NextResponse.json(
        { error: "Server private key not configured (SHELBY_SERVER_PRIVATE_KEY)" },
        { status: 500 }
      );
    }

    if (!SHELBY_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Shelby API key not configured. Add SHELBY_API_KEY to .env.local " +
            "(get a free key at https://build.aptoslabs.com → API Keys)",
        },
        { status: 500 }
      );
    }

    // Build server Account for challenge-response signing
    const privateKey = new Ed25519PrivateKey(
      SHELBY_PRIVATE_KEY.replace("ed25519-priv-", "")
    );
    const serverAccount = Account.fromPrivateKey({ privateKey });

    // Parse inputs
    const uid = BigInt(uidStr);
    const commitment = JSON.parse(commitmentJson);
    const blobArrayBuffer = await blobFile.arrayBuffer();
    const blobData = new Uint8Array(blobArrayBuffer);

    // Initialize Shelby SDK server client with API key for authenticated RPC access
    const shelbyClient = new ShelbyClient({
      network: Network.SHELBYNET as any,
      apiKey: SHELBY_API_KEY,
      locationHint: SHELBY_LOCATION,
    });

    console.log(`[shelby-upload] Uploading blob uid=${uid}, size=${blobData.length} bytes`);

    // Upload via challenge-response auth (serverAccount signs the challenge)
    await shelbyClient.rpc.putBlobChunksets({
      account: serverAccount,
      uid,
      blobData,
      commitments: commitment,
      onProgress: (p) => {
        console.log(
          `[shelby-upload] Progress: chunkset ${p.chunksetIdx + 1}/${p.totalChunksets} (${p.uploadedBytes}/${p.totalBytes} bytes)`
        );
      },
    });

    console.log(`[shelby-upload] Upload complete for uid=${uid}`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[shelby-upload] Error:", err);
    return NextResponse.json(
      { error: err.message || "Upload failed" },
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
