"use client";

if (typeof window !== "undefined") {
  // Suppress unhandled rejections caused by AptosConnect wallet plugin
  // and Chrome extensions trying to fetch from networks that don't support them (SHELBYNET).
  // This prevents Next.js dev mode from crashing with "Unhandled Runtime Error".
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    
    // Catch standard string rejections
    if (typeof reason === "string" && (reason.includes("User rejected") || reason.includes("WalletNotConnectedError"))) {
      event.preventDefault();
      return;
    }

    if (reason instanceof SyntaxError && (reason.message.includes("is not valid JSON") || reason.message.includes("Unexpected token"))) {
      event.preventDefault();
      console.warn("[WalletProvider] Suppressed invalid JSON response error:", reason.message);
      return;
    }

    if (reason instanceof TypeError && reason.message === "Failed to fetch") {
      event.preventDefault();
      return;
    }
    
    // Catch object rejections that might crash Next.js overlay
    if (reason && typeof reason === "object") {
      const msg = reason.message || String(reason);
      const name = reason.name || "";
      if (
        msg.includes("Failed to fetch") ||
        msg.includes("AptosConnect") ||
        msg.includes("getChainId") ||
        msg.includes("getLedgerInfo") ||
        msg.includes("User rejected") ||
        msg.includes("is not valid JSON") ||
        msg.includes("Unexpected token") ||
        name === "WalletNotConnectedError" ||
        msg.includes("WalletNotConnectedError")
      ) {
        event.preventDefault();
        console.warn("[WalletProvider] Suppressed network/wallet/JSON error:", msg || name);
        return;
      }
      
      // If it's a plain object with code 4001 (User rejected), suppress it
      if (reason.code === 4001) {
        event.preventDefault();
        return;
      }
    }
  });
}

import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AptosCoreProvider } from "./AptosCoreProvider";

import { ShelbyClientProvider } from "@shelby-protocol/react";
import { ShelbyClient } from "@shelby-protocol/sdk/browser";
import { Network } from "@aptos-labs/ts-sdk";

const queryClient = new QueryClient();

const shelbyClient = new ShelbyClient({ 
  network: Network.SHELBYNET,
  ...(process.env.NEXT_PUBLIC_SHELBY_API_KEY ? { apiKey: process.env.NEXT_PUBLIC_SHELBY_API_KEY } : {}),
  locationHint: process.env.NEXT_PUBLIC_SHELBY_LOCATION || "shelbynet-1",
  indexer: {
    baseUrl: typeof window !== "undefined" ? `${window.location.origin}/api/shelby-indexer` : "http://localhost:3000/api/shelby-indexer",
    ...(process.env.NEXT_PUBLIC_SHELBY_API_KEY ? { apiKey: process.env.NEXT_PUBLIC_SHELBY_API_KEY } : {}),
  }
});



export function WalletProvider({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <ShelbyClientProvider client={shelbyClient}>
        <AptosWalletAdapterProvider
          optInWallets={["Petra"] as any}
          autoConnect={true}
        >
          <AptosCoreProvider>
            {children}
          </AptosCoreProvider>
        </AptosWalletAdapterProvider>
      </ShelbyClientProvider>
    </QueryClientProvider>
  );
}

