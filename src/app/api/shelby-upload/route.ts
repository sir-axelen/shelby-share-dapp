import { NextRequest, NextResponse } from "next/server";
import { Account, Ed25519PrivateKey, Network } from "@aptos-labs/ts-sdk";
import { ShelbyClient } from "@shelby-protocol/sdk/node";

// Server-side only env vars (no NEXT_PUBLIC_ prefix = never sent to browser)
const SHELBY_PRIVATE_KEY = process.env.SHELBY_SERVER_PRIVATE_KEY || "";
const SHELBY_API_KEY = process.env.SHELBY_API_KEY || "";
const SHELBY_RPC_ENDPOINT =
  process.env.SHELBY_RPC_ENDPOINT ||
  "https://api.shelbynet.shelby.xyz/shelby";

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

    // Initialize Shelby SDK server client with correct rpc.baseUrl config
    const shelbyClient = new ShelbyClient({
      network: Network.SHELBYNET as any,
      rpc: {
        baseUrl: SHELBY_RPC_ENDPOINT,
        apiKey: SHELBY_API_KEY,
      },
      locationHint: "shelbynet-1",
    });

    console.log(`[shelby-upload] Uploading blob uid=${uid}, size=${blobData.length} bytes`);

    // Intercept fetch to attach Origin header for Client API keys in server environment
    const clientOrigin =
      req.headers.get("origin") ||
      req.nextUrl.origin ||
      "https://axel-share-dapp.vercel.app";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (!headers.has("Origin")) {
        headers.set("Origin", clientOrigin);
      }
      return originalFetch(input, { ...init, headers });
    };

    try {
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
    } finally {
      globalThis.fetch = originalFetch;
    }

    console.log(`[shelby-upload] Upload complete for uid=${uid}`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[shelby-upload] Error:", err);
    const msg = err.message || "Upload failed";
    if (msg.includes("Service type S3Gateway is not allowed")) {
      return NextResponse.json(
        {
          error:
            "Shelby API key configuration error: Your SHELBY_API_KEY has service type 'S3Gateway'. " +
            "The upload RPC requires service type 'Api' or 'All'. " +
            "Please generate an API key with service type 'Api' or 'All' at https://build.aptoslabs.com and update SHELBY_API_KEY in .env.local.",
        },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
