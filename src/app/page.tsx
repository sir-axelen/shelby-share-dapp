"use client";

import { useState, useRef, type DragEvent } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";

type FileRecord = {
  name: string;
  size: string;
  link: string;
  locked: boolean;
};

export default function Home() {
  const { connected, account, connect, disconnect, isLoading, signAndSubmitTransaction } = useWallet();
  const addressString = account?.address?.toString() || "";
  const address = addressString ? `${addressString.slice(0, 6)}...${addressString.slice(-4)}` : "";
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [locked, setLocked] = useState(false);
  
  const [dragOver, setDragOver] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressLabel, setProgressLabel] = useState("Uploading to Shelby Hot Storage…");
  const [showShare, setShowShare] = useState(false);
  const [shareLink, setShareLink] = useState("");
  
  const [aptPrice, setAptPrice] = useState("0.5");
  const [unlockMsg, setUnlockMsg] = useState("");
  
  
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedRows, setCopiedRows] = useState<Record<number, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const connectWallet = () => {
    if (!connected) {
      connect("Petra" as any);
    } else {
      disconnect();
    }
  };

  const formatBytes = (b: number) => {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(2) + " MB";
  };

  const randomHash = (len: number) => {
    const c = "abcdefghijklmnopqrstuvwxyz0123456789";
    let r = "";
    for (let i = 0; i < len; i++) r += c[Math.floor(Math.random() * c.length)];
    return r;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const handleFile = (file: File) => {
    if (!file) return;
    setCurrentFile(file);
    setShowShare(false);
    setProgressPct(0);
  };

  const startUpload = () => {
    if (!currentFile || uploading) return;
    setUploading(true);
    setShowShare(false);
    
    let pct = 0;
    const labels = [
      "Encrypting file…",
      "Connecting to Shelby nodes…",
      "Distributing chunks…",
      "Finalizing upload…",
    ];
    let labelIdx = 0;
    setProgressLabel(labels[0]);

    const interval = setInterval(() => {
      pct += Math.random() * 7 + 2;
      if (pct >= 100) pct = 100;
      setProgressPct(pct);

      if (pct > 25 * (labelIdx + 1) && labelIdx < labels.length - 1) {
        labelIdx++;
        setProgressLabel(labels[labelIdx]);
      }

      if (pct >= 100) {
        clearInterval(interval);
        finishUpload();
      }
    }, 60);
  };

  const finishUpload = () => {
    if (!currentFile) return;
    const hash = randomHash(10);
    const link = "https://shelby.storage/file/" + hash;
    setShareLink(link);
    setShowShare(true);
    setUploading(false);

    setFiles((prev) => [
      { name: currentFile.name, size: formatBytes(currentFile.size), link, locked: false },
      ...prev,
    ]);
    
    setLocked(false);
    setUnlockMsg("");
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1500);
  };

  const copyRowLink = (link: string, i: number) => {
    navigator.clipboard.writeText(link).catch(() => {});
    setCopiedRows((prev) => ({ ...prev, [i]: true }));
    setTimeout(() => {
      setCopiedRows((prev) => ({ ...prev, [i]: false }));
    }, 1400);
  };

  const toggleLock = async () => {
    const newLocked = !locked;

    if (newLocked) {
      if (!connected) { alert("Connect wallet first!"); return; }
      try {
        const hash = shareLink.split('/').pop() || "";
        const priceInOctas = Math.floor(parseFloat(aptPrice) * 100000000);
        await signAndSubmitTransaction({
          data: {
            function: "0x937e427f49ca2f16ff927ccce88cada07d43f7396bafed26b8ad54553fa6a65b::file_share::publish_file",
            typeArguments: [],
            functionArguments: [hash, priceInOctas, newLocked]
          }
        });
      } catch (e) {
        return; // aborted
      }
    }
    
    setLocked(newLocked);
    setUnlockMsg("");
    if (files.length > 0) {
      const newFiles = [...files];
      newFiles[0].locked = newLocked;
      setFiles(newFiles);
    }
  };

  const mockUnlock = async () => {
    if (!connected || !account) { alert("Connect wallet first!"); return; }
    try {
      const hash = shareLink.split('/').pop() || "";
      await signAndSubmitTransaction({
        data: {
          function: "0x937e427f49ca2f16ff927ccce88cada07d43f7396bafed26b8ad54553fa6a65b::file_share::unlock_file",
          typeArguments: [],
          functionArguments: [account.address, hash]
        }
      });
      setUnlockMsg(`✓ Payment of ${aptPrice} APT verified on-chain — access granted`);
    } catch (e) {
      setUnlockMsg(`✗ Transaction failed`);
    }
  };

  return (
    <>
      <nav className="glass sticky top-0 z-50 border-t-0 border-l-0 border-r-0">
        <div className="max-w-4xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              style={{
                width: "28px",
                height: "28px",
                background: "linear-gradient(135deg,#00e5ff,#7c3aed)",
                borderRadius: "7px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1L12 4.5V9.5L7 13L2 9.5V4.5L7 1Z" fill="rgba(0,0,0,0.8)" />
                <path d="M7 4L10 5.8V9.5L7 11.3L4 9.5V5.8L7 4Z" fill="white" opacity=".4" />
              </svg>
            </div>
            <span className="font-bold text-white text-sm tracking-tight" style={{ fontFamily: 'var(--font-space-mono)' }}>
              Shelby<span style={{ color: "var(--shelby-accent)" }}>Share</span>
            </span>
            <span className="tag hidden sm:inline-block" style={{ fontFamily: 'var(--font-space-mono)' }}>APTOS</span>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="section-label hidden sm:block"
              style={{ color: connected ? "var(--shelby-green)" : "" }}
            >
              {connected ? "CONNECTED" : "NOT CONNECTED"}
            </span>
            <button
              className={`btn-wallet px-4 py-2 rounded-lg font-medium text-sm ${connected ? "connected" : ""}`}
              onClick={connectWallet}
              disabled={isLoading}
              style={{ fontFamily: 'var(--font-space-mono)' }}
            >
              {isLoading ? "Connecting…" : connected ? address : "Connect Wallet"}
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-5 py-10 relative z-10">
        <div className="mb-9 text-center">
          <p className="section-label mb-2">DECENTRALIZED · REAL-TIME · APTOS</p>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white leading-tight mb-2">
            Decentralized Real-Time Storage<br />on Aptos
          </h1>
          <p className="text-sm" style={{ color: "var(--shelby-muted)" }}>
            Drop a file. Get a link. Share anywhere. Powered by Shelby Hot Storage.
          </p>
        </div>

        <div className="glass rounded-2xl p-6 mb-5">
          <div className="flex items-center justify-between mb-5">
            <span className="section-label">UPLOAD FILE</span>
            <div className="flex items-center gap-2">
              <div className="dot-pulse"></div>
              <span className="tag tag-green" style={{ fontFamily: 'var(--font-space-mono)' }}>SHELBY HOT STORAGE</span>
            </div>
          </div>

          <div
            className={`drop-zone rounded-xl p-8 text-center mb-5 ${dragOver ? "drag-over" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0]);
              }}
            />
            
            {!currentFile ? (
              <div>
                <div className="mb-3 flex justify-center">
                  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" opacity=".4">
                    <path
                      d="M18 4v20M10 16l8-10 8 10"
                      stroke="var(--shelby-accent)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M6 28h24"
                      stroke="var(--shelby-accent)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <p className="text-white font-medium text-sm mb-1">Drag & drop your file here</p>
                <p className="text-xs" style={{ color: "var(--shelby-muted)" }}>
                  or click to browse — any file type, up to 100MB
                </p>
              </div>
            ) : (
              <div>
                <div className="mb-2 flex justify-center">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <rect
                      x="6"
                      y="2"
                      width="20"
                      height="28"
                      rx="3"
                      fill="rgba(0,229,255,0.12)"
                      stroke="var(--shelby-accent)"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M11 11h10M11 16h10M11 21h6"
                      stroke="var(--shelby-accent)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <p className="text-white font-medium text-sm mb-1" style={{ fontFamily: 'var(--font-space-mono)' }}>
                  {currentFile.name}
                </p>
                <p className="text-xs" style={{ color: "var(--shelby-muted)" }}>
                  {formatBytes(currentFile.size)}
                </p>
              </div>
            )}
          </div>

          {(uploading || progressPct > 0) && (
            <div className="mb-5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs" style={{ color: "var(--shelby-muted)" }}>
                  {progressLabel}
                </span>
                <span className="text-xs" style={{ color: "var(--shelby-accent)", fontFamily: 'var(--font-space-mono)' }}>
                  {Math.floor(progressPct)}%
                </span>
              </div>
              <div style={{ height: "3px", background: "rgba(255,255,255,0.07)", borderRadius: "2px" }}>
                <div className="progress-bar" style={{ width: `${progressPct}%` }}></div>
              </div>
            </div>
          )}

          <div>
            <button
              className="btn-primary w-full py-3 rounded-xl text-sm"
              onClick={startUpload}
              disabled={!currentFile || uploading || showShare}
              style={{
                opacity: !currentFile || uploading || showShare ? 0.35 : 1,
                cursor: !currentFile || uploading || showShare ? "default" : "pointer",
              }}
            >
              {uploading ? "Uploading…" : "Upload to Shelby"}
            </button>
          </div>

          {showShare && (
            <div className="fade-in mt-5">
              <div className="flex items-center gap-2 mb-3">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke="var(--shelby-green)" strokeWidth="1.5" />
                  <path
                    d="M4.5 7l2 2 3-3"
                    stroke="var(--shelby-green)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-xs font-medium" style={{ color: "var(--shelby-green)" }}>
                  Stored on Shelby — Instant Access (&lt;1s)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareLink}
                  className="link-badge"
                  style={{ fontFamily: 'var(--font-space-mono)' }}
                />
                <button
                  className={`btn-ghost px-4 py-2 rounded-lg text-sm ${copiedLink ? "copy-flash" : ""}`}
                  onClick={copyLink}
                >
                  {copiedLink ? "Copied!" : "Copy"}
                </button>
              </div>

              <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--shelby-border)" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white mb-0.5">Lock this file</p>
                    <p className="text-xs" style={{ color: "var(--shelby-muted)" }}>Require APT payment to access</p>
                  </div>
                  <button
                    className={`toggle ${locked ? "on" : ""}`}
                    onClick={toggleLock}
                  ></button>
                </div>
                
                {locked && (
                  <div className="mt-4 fade-in">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="section-label block mb-1.5">ACCESS PRICE (APT)</label>
                        <div
                          className="flex items-center gap-2"
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid var(--shelby-border)",
                            borderRadius: "8px",
                            padding: "8px 12px",
                          }}
                        >
                          <input
                            type="number"
                            value={aptPrice}
                            onChange={(e) => setAptPrice(e.target.value)}
                            step="0.1"
                            min="0.1"
                            style={{
                              background: "transparent",
                              border: "none",
                              outline: "none",
                              color: "white",
                              fontFamily: "var(--font-space-mono)",
                              fontSize: "14px",
                              width: "80px",
                            }}
                          />
                          <span className="text-xs" style={{ color: "var(--shelby-muted)", fontFamily: "var(--font-space-mono)" }}>
                            APT
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button className="btn-primary px-5 py-2 rounded-lg text-sm" onClick={mockUnlock}>
                          Unlock (On-Chain)
                        </button>
                      </div>
                    </div>
                    {unlockMsg && (
                      <p className="text-xs mt-2 fade-in" style={{ color: "var(--shelby-green)" }}>
                        {unlockMsg}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="glass rounded-2xl">
          <div
            className="px-6 py-4 flex items-center justify-between"
            style={{ borderBottom: "1px solid var(--shelby-border)" }}
          >
            <span className="section-label">YOUR FILES</span>
            <span className="tag" style={{ fontFamily: "var(--font-space-mono)" }}>
              {files.length} file{files.length !== 1 ? "s" : ""}
            </span>
          </div>

          {files.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm" style={{ color: "var(--shelby-muted)" }}>No files uploaded yet.</p>
              <p className="text-xs mt-1" style={{ color: "var(--shelby-muted)", opacity: 0.6 }}>
                Upload a file above to get started.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-transparent">
              {files.map((f, i) => (
                <div key={i} className="file-row px-6 py-4 flex items-center gap-4 fade-in">
                  <div
                    style={{
                      width: "34px",
                      height: "34px",
                      background: "rgba(0,229,255,0.08)",
                      border: "1px solid rgba(0,229,255,0.15)",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M3 2h7l3 3v9H3V2z"
                        fill="rgba(0,229,255,0.15)"
                        stroke="var(--shelby-accent)"
                        strokeWidth="1.2"
                      />
                      <path d="M10 2v3h3" stroke="var(--shelby-accent)" strokeWidth="1.2" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{f.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs" style={{ color: "var(--shelby-muted)", fontFamily: "var(--font-space-mono)" }}>
                        {f.size}
                      </span>
                      <span className="tag tag-green" style={{ fontSize: "9px", fontFamily: "var(--font-space-mono)" }}>
                        STORED
                      </span>
                      {f.locked && (
                        <span
                          className="tag"
                          style={{
                            background: "rgba(124,58,237,0.12)",
                            color: "#a78bfa",
                            borderColor: "rgba(124,58,237,0.3)",
                            fontSize: "9px",
                            fontFamily: "var(--font-space-mono)",
                          }}
                        >
                          LOCKED
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn-ghost px-3 py-1.5 rounded-lg text-xs"
                      onClick={() => window.open(f.link)}
                    >
                      Open
                    </button>
                    <button
                      className="btn-ghost px-3 py-1.5 rounded-lg text-xs"
                      onClick={() => copyRowLink(f.link, i)}
                    >
                      {copiedRows[i] ? "Copied!" : "Copy Link"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-center mt-8 text-xs" style={{ color: "var(--shelby-muted)" }}>
          <span style={{ fontFamily: "var(--font-space-mono)" }}>Shelby Network</span> · Built on Aptos · Front-end mockup via Next.js
        </p>
      </main>
    </>
  );
}
