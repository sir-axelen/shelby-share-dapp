"use client";

import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { motion, AnimatePresence } from "framer-motion";

interface WalletSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletSelectorModal({ isOpen, onClose }: WalletSelectorModalProps) {
  const { wallets, connect } = useWallet();

  const handleConnect = async (walletName: string) => {
    try {
      console.log(`Attempting to connect to wallet: ${walletName}`);
      await connect(walletName as any);
      onClose();
    } catch (err: any) {
      const errMsg = err instanceof Error ? (err.message || err.name) : (err?.message || String(err));
      console.warn("Wallet connection failed:", errMsg);
      // Fallback redirect for installing wallets
      if (err?.name === "WalletNotReadyError" || err?.name === "WalletNotFoundError" || (err?.message && err.message.includes("not ready"))) {
        if (walletName === "Petra") {
          const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
          if (isMobile) {
            window.location.href = `https://petra.app/explore?link=${encodeURIComponent(window.location.href)}`;
          } else {
            window.open("https://petra.app/", "_blank");
          }
        } else if (walletName === "Martian") {
          window.open("https://martianwallet.xyz/", "_blank");
        } else if (walletName === "Pontem") {
          window.open("https://pontem.network/", "_blank");
        } else {
          alert(`${walletName} wallet is not installed. Please install it first.`);
        }
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.4 }}
            className="glass rounded-2xl w-full max-w-sm relative overflow-hidden z-10 max-h-[85vh] flex flex-col"
            style={{
              border: "1px solid rgba(0, 229, 255, 0.3)",
              background: "rgba(10, 10, 15, 0.95)",
              boxShadow: "0 0 30px rgba(0, 229, 255, 0.15)",
            }}
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-[rgba(255,255,255,0.08)] flex items-center justify-between shrink-0">
              <span className="font-bold text-white tracking-wide text-sm" style={{ fontFamily: "var(--font-space-mono)" }}>
                Select Wallet
              </span>
              <button
                onClick={onClose}
                className="text-white/60 hover:text-white transition-colors"
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {/* Wallet Options list */}
            <div className="p-6 space-y-3 overflow-y-auto flex-1" style={{ scrollbarWidth: "thin" }}>
              {wallets?.filter(wallet => wallet.name === 'Petra').map((wallet) => {
                const isInstalled = wallet.readyState === "Installed";
                return (
                  <button
                    key={wallet.name}
                    onClick={() => handleConnect(wallet.name)}
                    className="w-full text-left p-3.5 rounded-xl border flex items-center justify-between transition-all hover:bg-white/[0.02]"
                    style={{
                      background: "rgba(255,255,255,0.01)",
                      borderColor: isInstalled ? "rgba(0, 229, 255, 0.15)" : "rgba(255, 255, 255, 0.05)",
                      cursor: "pointer",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {wallet.icon && (
                        <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.05] p-1.5 shrink-0">
                          <img src={wallet.icon} alt={wallet.name} className="w-full h-full object-contain" />
                        </div>
                      )}
                      <span className="text-white text-xs font-semibold" style={{ fontFamily: "var(--font-space-mono)" }}>
                        {wallet.name}
                      </span>
                    </div>

                    {/* Status Badge */}
                    <div>
                      {isInstalled ? (
                        <span 
                          className="px-2 py-0.5 rounded text-[9px] font-bold"
                          style={{
                            background: "rgba(0, 255, 148, 0.1)",
                            color: "var(--shelby-green)",
                            border: "1px solid rgba(0, 255, 148, 0.2)",
                            fontFamily: "var(--font-space-mono)",
                          }}
                        >
                          DETECTED
                        </span>
                      ) : (
                        <span 
                          className="px-2 py-0.5 rounded text-[9px] font-bold"
                          style={{
                            background: "rgba(255, 255, 255, 0.04)",
                            color: "var(--shelby-muted)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            fontFamily: "var(--font-space-mono)",
                          }}
                        >
                          INSTALL
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
