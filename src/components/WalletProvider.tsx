"use client";

import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

export function WalletProvider({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <AptosWalletAdapterProvider autoConnect={true}>
        {children}
      </AptosWalletAdapterProvider>
    </QueryClientProvider>
  );
}
