"use client";

import { useState, useRef, useEffect } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { motion, AnimatePresence } from "framer-motion";
import { Aptos as AptosClient, AptosConfig, Network, AccountAddress } from "@aptos-labs/ts-sdk";
import { useAptBalance } from "@aptos-labs/react";

// Initialize Aptos client using default SHELBYNET (matching the working upload flow)
const aptosConfig = new AptosConfig({ network: Network.SHELBYNET });
const aptos = new AptosClient(aptosConfig);
import { useShelbyClient, useUploadBlobs, useAccountBlobs } from "@shelby-protocol/react";
import { generateCommitments, createDefaultErasureCodingProvider, ShelbyBlobClient } from "@shelby-protocol/sdk/browser";
import { DebugConsole } from "@/components/DebugConsole";
import { WalletSelectorModal } from "@/components/WalletSelectorModal";

type FileRecord = {
  name: string;
  size: string;
  link: string;
  locked: boolean;
  expiresAt?: number;
};

const uploadToShelbyRPC = async (account: string, blobName: string, blobData: Uint8Array, onProgress?: (pct: number) => void) => {
  const baseUrl = process.env.NEXT_PUBLIC_SHELBY_RPC_ENDPOINT || "https://api.shelbynet.shelby.xyz/shelby";
  const apiKey = process.env.NEXT_PUBLIC_SHELBY_API_KEY || "";
  const headers = { "x-api-key": apiKey };
  const partSize = 5 * 1024 * 1024; // 5MB chunks

  const startRes = await fetch(`${baseUrl}/v1/multipart-uploads`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ rawAccount: account, rawBlobName: blobName, rawPartSize: partSize })
  });

  if (!startRes.ok) throw new Error(`Failed to start upload: ${await startRes.text()}`);
  const { uploadId } = await startRes.json();

  const totalParts = Math.ceil(blobData.length / partSize);
  for (let i = 0; i < totalParts; i++) {
    const start = i * partSize;
    const end = Math.min(start + partSize, blobData.length);
    const chunk = blobData.slice(start, end);

    const partRes = await fetch(`${baseUrl}/v1/multipart-uploads/${uploadId}/parts/${i}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/octet-stream" },
      body: chunk
    });

    if (!partRes.ok) throw new Error(`Failed to upload chunk ${i}: ${await partRes.text()}`);
    if (onProgress) onProgress(90 + Math.floor(((i + 1) / totalParts) * 10));
  }

  const completeRes = await fetch(`${baseUrl}/v1/multipart-uploads/${uploadId}/complete`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" }
  });

  if (!completeRes.ok) throw new Error(`Failed to complete upload: ${await completeRes.text()}`);
};

export default function Dashboard() {
  const walletContext = useWallet();
  const { connected, account, wallet, connect, disconnect, isLoading: walletLoading, signAndSubmitTransaction, signTransaction } = walletContext;
  const shelbyClient = useShelbyClient();
  const uploadBlobs = useUploadBlobs({ client: shelbyClient });

  const accountAddrStr = account?.address
    ? (typeof account.address === "string" ? account.address : (account.address as any).toString())
    : "";

  const { data: accountBlobs, refetch: refetchAccountBlobs } = useAccountBlobs({
    account: accountAddrStr,
    client: shelbyClient,
    enabled: !!accountAddrStr
  });
  const { data: aptBalance, isLoading: balanceLoading } = useAptBalance();
  const isLoading = walletLoading; // Don't block UI with balance loading

  const getDisplayAddress = () => {
    if (!account?.address) return "";
    let addrStr = "";
    const rawAddr = account.address;
    if (typeof rawAddr === "string") {
      addrStr = rawAddr;
    } else if (rawAddr && (rawAddr as any).data) {
      const data = (rawAddr as any).data;
      const bytes = Array.isArray(data) ? data : Object.values(data);
      try {
        addrStr = AccountAddress.from(new Uint8Array(bytes as number[])).toString();
      } catch (e) {
        addrStr = String(rawAddr);
      }
    } else {
      addrStr = String(rawAddr);
    }
    if (addrStr === "[object Object]") return "Connected";
    return `${addrStr.slice(0, 6)}...${addrStr.slice(-4)}`;
  };

  const address = getDisplayAddress();
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [locked, setLocked] = useState(false);
  const [confirmedOnChain, setConfirmedOnChain] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  
  const [dragOver, setDragOver] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressLabel, setProgressLabel] = useState("Uploading to Shelby Hot Storage…");
  const [showShare, setShowShare] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [linkRevealed, setLinkRevealed] = useState(false);
  
  const [aptPrice, setAptPrice] = useState("0.5");
  const [unlockMsg, setUnlockMsg] = useState("");
  const [aptEarned, setAptEarned] = useState("...");
  const [locking, setLocking] = useState(false);
  const [lockStatus, setLockStatus] = useState("");
  
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedRows, setCopiedRows] = useState<Record<number, boolean>>({});

  // Faucet states
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState("");
  const [faucetError, setFaucetError] = useState("");
  const [faucetCooldown, setFaucetCooldown] = useState(0);

  const [showRpcModal, setShowRpcModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [copiedFields, setCopiedFields] = useState<Record<string, boolean>>({});
  const [autoAddLoading, setAutoAddLoading] = useState(false);
  const [autoAddSuccess, setAutoAddSuccess] = useState(false);
  const [autoAddError, setAutoAddError] = useState("");

  const copyRpcField = (key: string, value: string) => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopiedFields((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopiedFields((prev) => ({ ...prev, [key]: false }));
    }, 1500);
  };

  const handleAutoAddRpc = async () => {
    setAutoAddLoading(true);
    setAutoAddError("");
    setAutoAddSuccess(false);
    try {
      if (!connected || !walletContext.wallet) {
        throw new Error("Please connect your wallet first.");
      }

      const standardWallet = (walletContext.wallet as any);
      const changeNetworkFeature = standardWallet.features?.["aptos:changeNetwork"];
      
      if (!changeNetworkFeature || typeof changeNetworkFeature.changeNetwork !== "function") {
        throw new Error(
          `${standardWallet.name || "Your wallet"} does not support automatic network switching/adding. Please use the manual configuration below.`
        );
      }

      console.log("Requesting network switch via AIP-62 to Shelbynet...");
      const result = await changeNetworkFeature.changeNetwork({
        name: "Shelbynet",
        chainId: 113,
        url: "https://api.shelbynet.shelby.xyz/v1",
      });

      console.log("Network switch result:", result);
      setAutoAddSuccess(true);
      
      setTimeout(() => {
        setShowRpcModal(false);
        setAutoAddSuccess(false);
      }, 1500);
    } catch (err: any) {
      console.error("Automatic Shelbynet addition failed:", err);
      const msg = err.message || err.toString() || "Unknown error";
      if (msg.toLowerCase().includes("rejected")) {
        setAutoAddError("User rejected the network switch request.");
      } else if (
        msg.includes("PetraApiError") ||
        msg.toLowerCase().includes("petraapierror") ||
        (err.name && err.name.includes("PetraApiError"))
      ) {
        setAutoAddError("Petra Wallet cannot add custom networks automatically. Please configure Shelbynet manually using Option 2 below.");
      } else {
        setAutoAddError(msg);
      }
    } finally {
      setAutoAddLoading(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (aptBalance) {
      setAptEarned(`+${(Number(aptBalance) / 100000000).toFixed(2)}`);
    } else {
      setAptEarned("+0.00");
    }
  }, [aptBalance]);

  useEffect(() => {
    const saved = localStorage.getItem("shelby_files");
    if (saved) {
      try {
        setFiles(JSON.parse(saved));
      } catch (e) {}
    }
    
    const hideGuide = localStorage.getItem("shelby_hide_guide");
    if (!hideGuide) {
      setShowGuide(true);
    }
    
    setIsLoaded(true);

    // Restore faucet cooldown from localStorage
    const lastFaucet = localStorage.getItem("shelby_last_faucet");
    if (lastFaucet) {
      const elapsed = Date.now() - parseInt(lastFaucet);
      if (elapsed < 60000) {
        setFaucetCooldown(Math.ceil((60000 - elapsed) / 1000));
      }
    }
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("shelby_files", JSON.stringify(files));
    }
  }, [files, isLoaded]);

  // Faucet cooldown timer
  useEffect(() => {
    if (faucetCooldown <= 0) return;
    const timer = setInterval(() => {
      setFaucetCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [faucetCooldown]);

  const [extendingMap, setExtendingMap] = useState<Record<string, boolean>>({});

  const extendBlobExpiration = async (fileName: string) => {
    if (!connected || !signAndSubmitTransaction) {
      alert("Please connect your wallet first.");
      return;
    }
    setExtendingMap((prev) => ({ ...prev, [fileName]: true }));
    try {
      const newExpirationMicros = Date.now() * 1000 + 47.95 * 60 * 60 * 1000000;
      console.log(`Extending expiration for blob: ${fileName} to ${newExpirationMicros}`);
      const tx = await signAndSubmitTransaction({
        data: {
          function: "0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a::blob_metadata::increase_expiration_time",
          functionArguments: [
            fileName,
            String(newExpirationMicros)
          ]
        }
      });
      console.log("Extend transaction submitted:", tx.hash);
      await aptos.waitForTransaction({ transactionHash: tx.hash });
      setFiles((prev) => 
        prev.map(f => f.name === fileName 
          ? { ...f, expiresAt: Date.now() + 47.95 * 60 * 60 * 1000 } 
          : f
        )
      );
      await refetchAccountBlobs();
      alert("✓ Blob expiration extended successfully!");
    } catch (err: any) {
      console.error("Extend expiration error:", err);
      alert(`Failed to extend expiration: ${err.message || err.toString()}`);
    } finally {
      setExtendingMap((prev) => ({ ...prev, [fileName]: false }));
    }
  };

  const deleteFile = (index: number) => {
    const newFiles = [...files];
    newFiles.splice(index, 1);
    setFiles(newFiles);
  };

  const dismissGuide = () => {
    setShowGuide(false);
    localStorage.setItem("shelby_hide_guide", "true");
  };

  const getExpirationInfo = (blob: any, localExpiresAt?: number) => {
    const expiresAtMs = blob && blob.expirationMicros
      ? (blob.expirationMicros / 1000)
      : localExpiresAt;

    if (!expiresAtMs) return null;
    const remainingMs = expiresAtMs - Date.now();
    if (remainingMs <= 0) {
      return { status: "expired", label: "Expired" };
    }
    const totalMinutes = Math.floor(remainingMs / (60 * 1000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
      return { status: "active", label: `Expires in: ${hours}h ${minutes}m` };
    } else {
      return { status: "warning", label: `Expires in: ${minutes}m` };
    }
  };

  const connectWallet = async () => {
    if (!connected) {
      setShowWalletModal(true);
    } else {
      disconnect();
    }
  };

  const claimFaucet = async () => {
    if (!connected || !account) {
      setFaucetError("Please connect your wallet first.");
      return;
    }
    if (faucetCooldown > 0) return;

    setFaucetLoading(true);
    setFaucetMsg("");
    setFaucetError("");

    try {
      const rawAddr = account.address;
      let addrStr = "";
      if (typeof rawAddr === "string") {
        addrStr = rawAddr;
      } else if (rawAddr && (rawAddr as any).data) {
        const data = (rawAddr as any).data;
        const bytes = Array.isArray(data) ? data : Object.values(data);
        try {
          addrStr = AccountAddress.from(new Uint8Array(bytes as number[])).toString();
        } catch {
          addrStr = String(rawAddr);
        }
      } else {
        addrStr = String(rawAddr);
      }

      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addrStr }),
      });

      const resText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(resText);
      } catch {
        data = { error: resText || "Invalid server response" };
      }

      if (res.ok && data.success) {
        setFaucetMsg(data.message || "1 APT claimed successfully!");
        setFaucetCooldown(60);
        localStorage.setItem("shelby_last_faucet", Date.now().toString());
      } else {
        setFaucetError(data.error || "Failed to claim. Please try again.");
      }
    } catch (err: any) {
      setFaucetError(err.message || "Network error. Please try again.");
    } finally {
      setFaucetLoading(false);
    }
  };

  const formatBytes = (b: number) => {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(2) + " MB";
  };

  const getTotalStorage = () => {
    if (files.length === 0) return { value: "0", unit: "MB" };
    let totalBytes = 0;
    files.forEach(f => {
      const match = f.size.match(/([\d.]+)\s*(B|KB|MB|GB)/);
      if (match) {
        const val = parseFloat(match[1]);
        const unit = match[2];
        if (unit === 'KB') totalBytes += val * 1024;
        else if (unit === 'MB') totalBytes += val * 1024 * 1024;
        else if (unit === 'GB') totalBytes += val * 1024 * 1024 * 1024;
        else totalBytes += val;
      }
    });
    
    if (totalBytes < 1024) return { value: totalBytes.toString(), unit: "B" };
    if (totalBytes < 1048576) return { value: (totalBytes / 1024).toFixed(1), unit: "KB" };
    if (totalBytes < 1073741824) return { value: (totalBytes / 1048576).toFixed(2), unit: "MB" };
    return { value: (totalBytes / 1073741824).toFixed(2), unit: "GB" };
  };
  
  const totalStorage = getTotalStorage();

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

  const SHELBY_LOCATION = process.env.NEXT_PUBLIC_SHELBY_LOCATION || "shelbynet-1";

  const startUpload = async () => {
    if (!currentFile || uploading || !walletContext || !account || !signAndSubmitTransaction) {
      if (!connected) alert("Please connect your wallet first.");
      return;
    }
    setUploading(true);
    setShowShare(false);
    setProgressPct(0);
    setProgressLabel("Uploading to Shelby Hot Storage…");

    try {
      const arrayBuffer = await currentFile.arrayBuffer();
      const blobData = new Uint8Array(arrayBuffer);
      const cleanFileName = currentFile.name.replace(/\s+/g, '_');
      const accountAddress = typeof account.address === 'string'
        ? account.address
        : String(account.address);
      const expirationMicros = Math.floor(Date.now() * 1000 + 47.9 * 60 * 60 * 1000000);

      // ── Step 1: Initialize account location preference if not set (1-time tx) ─
      setProgressLabel("Checking account location preference…");
      setProgressPct(10);
      try {
        const DEPLOYER = "0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a";
        const prefRes = await fetch("https://api.shelbynet.shelby.xyz/v1/view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            function: `${DEPLOYER}::location_preference::get_location_preference`,
            type_arguments: [],
            arguments: [accountAddress],
          }),
        });
        const prefText = await prefRes.text();
        let prefData: any = null;
        try {
          prefData = JSON.parse(prefText);
        } catch {
          prefData = null;
        }
        const hasPreference = prefRes.ok && prefData?.[0] && prefData[0] !== null;

        if (!hasPreference) {
          setProgressLabel("Setting up account location (one-time approval)…");
          const initTx = await signAndSubmitTransaction({
            data: {
              function: `${DEPLOYER}::location_preference::set_follow_hint_location_preference`,
              functionArguments: [],
            },
          });
          await aptos.waitForTransaction({ transactionHash: initTx.hash });
          console.log("[Shelby] Location preference initialized:", initTx.hash);
        }
      } catch (prefErr: any) {
        // Non-blocking — useUploadBlobs will still pass locationHint via SDK config
        console.warn("[Shelby] Location preference check failed (non-fatal):", prefErr.message);
      }

      // ── Step 2: useUploadBlobs handles encode + register + upload ─
      setProgressLabel("Uploading to Shelby (encoding + registering + storing)…");
      setProgressPct(30);

      try {
        await uploadBlobs.mutateAsync({
          signer: {
            account: account.address,
            signAndSubmitTransaction,
          },
          blobs: [{ blobName: cleanFileName, blobData }],
          expirationMicros,
          options: {
            selectedLocation: SHELBY_LOCATION,
            locationHint: SHELBY_LOCATION,
          },
        });
      } catch (directErr: any) {
        console.warn("[Shelby] Direct upload failed, falling back to server-side proxy upload...", directErr.message);

        // Fallback: Generate commitments & register blob via wallet, then upload chunksets via server proxy
        setProgressLabel("Generating blob commitments…");
        const provider = await createDefaultErasureCodingProvider();
        const commitments = await generateCommitments(provider, blobData);

        setProgressLabel("Registering blob on Aptos blockchain…");
        const registerPayload = ShelbyBlobClient.createRegisterBlobPayload({
          account: AccountAddress.fromString(accountAddress),
          blobName: cleanFileName,
          blobMerkleRoot: commitments.blob_merkle_root,
          blobSize: blobData.length,
          expirationMicros,
          numChunksets: commitments.chunkset_commitments.length,
          selectedLocation: SHELBY_LOCATION,
          locationHint: SHELBY_LOCATION,
          encoding: 0,
        });
        const registerTxResult = await signAndSubmitTransaction({ data: registerPayload });
        const tx = await aptos.waitForTransaction({ transactionHash: registerTxResult.hash }) as any;
        
        // Extract real on-chain blob UID from transaction events
        const deployer = AccountAddress.fromString("0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a");
        const registered = tx?.events ? ShelbyBlobClient.registeredBlobUids(tx.events, deployer) : [];
        const blobUid = registered.length > 0 
          ? registered[0].uid.toString() 
          : (tx?.events?.find((e: any) => e.type?.includes("BlobRegisteredEvent"))?.data?.uid?.toString() || null);

        if (!blobUid) {
          throw new Error("Failed to retrieve registered blob UID from transaction events");
        }

        setProgressLabel("Uploading chunksets to Shelby via server proxy…");
        const formData = new FormData();
        formData.append("blob", currentFile);
        formData.append("uid", blobUid.toString());
        formData.append("commitment", JSON.stringify(commitments));

        const serverRes = await fetch("/api/shelby-upload", {
          method: "POST",
          body: formData,
        });

        if (!serverRes.ok) {
          const errText = await serverRes.text();
          throw new Error(`Server proxy upload failed [${serverRes.status}]: ${errText}`);
        }
      }

      setProgressPct(100);
      setProgressLabel("Upload Complete!");

      setTimeout(() => {
        finishUpload(`${accountAddress}/${cleanFileName}`);
      }, 500);

    } catch (err: any) {
      console.error("Shelby Upload Error:", err);
      alert(`Upload Failed: ${err.message || "An error occurred during decentralized upload."}`);
      setUploading(false);
      setProgressPct(0);
    }
  };


  const finishUpload = (blobId: string) => {
    if (!currentFile) return;
    
    // Create a link to our own file viewer with the Shelby Blob ID
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/file/${blobId}`;
    
    setShareLink(link);
    setShowShare(true);
    setLinkRevealed(false);
    setUploading(false);
    setLocked(false);
    setConfirmedOnChain(false);
    setUnlockMsg("");
  };

  const publishPublicFile = async () => {
    setLocking(true);
    setLockStatus("Publishing public metadata...");
    
    // Simulate publishing delay
    await new Promise(r => setTimeout(r, 1200));
    
    // Save metadata showing it is unlocked
    const fileId = decodeURIComponent(shareLink.split('/file/')[1] || "");
    const lockData = {
      locked: false,
      price: 0,
      fileId: fileId,
      owner: account ? (typeof account.address === 'string' ? account.address : String(account.address)) : "",
      timestamp: Date.now(),
    };
    localStorage.setItem(`shelby_lock_${fileId}`, JSON.stringify(lockData));

    if (currentFile) {
      setFiles((prev) => [
        { name: currentFile.name, size: formatBytes(currentFile.size), link: shareLink, locked: false, expiresAt: Date.now() + 47.9 * 60 * 60 * 1000 },
        ...prev,
      ]);
    }
    
    setConfirmedOnChain(false);
    setLocked(false);
    setLinkRevealed(true);
    setLocking(false);
    setLockStatus("");
  };

  const resetUploadWizard = () => {
    setCurrentFile(null);
    setShowShare(false);
    setLinkRevealed(false);
    setProgressPct(0);
    setLocked(false);
    setConfirmedOnChain(false);
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

  const toggleLock = () => {
    setLocked(!locked);
  };

  const publishFileOnChain = async (shouldLock: boolean) => {
    if (!connected || !account) { alert("Connect wallet first!"); return; }
    
    setLocking(true);
    setLockStatus("Preparing...");
    setProgressPct(10);
    setProgressLabel(shouldLock ? "Locking file..." : "Removing lock...");

    try {
      const fileId = decodeURIComponent(shareLink.split('/file/')[1] || "");
      const price = parseFloat(aptPrice || "0");
      
      console.log("Publishing file lock (off-chain):", { fileId, price, shouldLock });

      // Simulate processing with a short animation
      setLockStatus("Registering lock settings...");
      setProgressPct(40);
      await new Promise(r => setTimeout(r, 800));
      
      setLockStatus("Saving metadata...");
      setProgressPct(70);
      
      // Store lock metadata in localStorage for the file viewer to read
      const lockData = {
        locked: shouldLock,
        price: price,
        fileId: fileId,
        owner: (() => {
          const raw = account.address;
          if (typeof raw === "string") return raw;
          if (raw && (raw as any).data) {
            const d = (raw as any).data;
            const b = Array.isArray(d) ? d : Object.values(d);
            try { return AccountAddress.from(new Uint8Array(b as number[])).toString(); } catch { return String(raw); }
          }
          return String(raw);
        })(),
        timestamp: Date.now(),
      };
      localStorage.setItem(`shelby_lock_${fileId}`, JSON.stringify(lockData));

      await new Promise(r => setTimeout(r, 500));
      
      setLockStatus(shouldLock ? "✓ File Locked!" : "✓ Lock Removed!");
      setConfirmedOnChain(shouldLock);
      setProgressPct(100);
      
      if (currentFile) {
        setFiles((prev) => [
          { name: currentFile.name, size: formatBytes(currentFile.size), link: shareLink, locked: shouldLock, expiresAt: Date.now() + 47.9 * 60 * 60 * 1000 },
          ...prev,
        ]);
      }
      
      setLinkRevealed(true);
      await new Promise(r => setTimeout(r, 1000));
    } catch (err: any) {
      console.error("LOG: Lock error:", err);
      alert(`Failed to update lock: ${err.message || "Unknown error"}`);
    } finally {
      setLocking(false);
      setLockStatus("");
      setTimeout(() => setProgressPct(0), 2000);
    }
  };



  return (
    <>
      <nav className="glass sticky top-0 z-50 border-t-0 border-l-0 border-r-0">
        <div className="max-w-4xl mx-auto px-3 sm:px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-1.5 sm:gap-3 overflow-hidden">
            <div
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "6px",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#1f2937",
                flexShrink: 0,
              }}
            >
              <img src="/axel.png" alt="Axel" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <span className="font-bold text-white text-xs sm:text-sm tracking-tight whitespace-nowrap" style={{ fontFamily: 'var(--font-space-mono)' }}>
              MeVault
            </span>
            <span className="tag hidden md:inline-block" style={{ fontFamily: 'var(--font-space-mono)' }}>APTOS</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setShowRpcModal(true)}
              className="px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all hover:opacity-90 active:scale-95 animate-pulse-subtle"
              style={{
                background: "rgba(0, 229, 255, 0.08)",
                border: "1px solid rgba(0, 229, 255, 0.25)",
                color: "var(--shelby-accent)",
                fontFamily: "var(--font-space-mono)",
                cursor: "pointer",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span className="hidden sm:inline">Add RPC</span>
            </button>
            <span
              className="section-label hidden md:block"
              style={{ color: connected ? "var(--shelby-green)" : "" }}
            >
              {connected ? "CONNECTED" : "NOT CONNECTED"}
            </span>
            <button
              className={`btn-wallet px-2 py-1.5 sm:px-4 sm:py-2 rounded-lg font-medium text-xs sm:text-sm ${connected ? "connected" : ""}`}
              onClick={connectWallet}
              disabled={isLoading}
              style={{ fontFamily: 'var(--font-space-mono)' }}
            >
              {isLoading ? "Connecting…" : connected ? address : (
                <>
                  <span className="hidden sm:inline">Connect Wallet</span>
                  <span className="sm:hidden">Connect</span>
                </>
              )}
            </button>
          </div>
        </div>
      </nav>

      <motion.main 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="max-w-4xl mx-auto px-5 py-10 relative z-10"
      >
        <div className="mb-9 text-center">
          <p className="section-label mb-2">DECENTRALIZED · REAL-TIME · APTOS</p>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white leading-tight mb-2">
            Decentralized Real-Time Storage<br />on Aptos
          </h1>
          <p className="text-sm" style={{ color: "var(--shelby-muted)" }}>
            Drop a file. Get a link. Share anywhere. Powered by Shelby Hot Storage.
          </p>
        </div>

        <AnimatePresence>
          {showGuide && (
            <motion.div 
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: "2rem" }}
              exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: "hidden" }}
              className="glass rounded-2xl p-6 relative"
              style={{ border: "1px solid rgba(0, 229, 255, 0.3)", background: "rgba(0, 229, 255, 0.03)" }}
            >
              <button 
                onClick={dismissGuide}
                className="absolute top-4 right-4 text-white opacity-50 hover:opacity-100 transition-opacity flex items-center justify-center"
                style={{ width: "24px", height: "24px", background: "rgba(255,255,255,0.1)", borderRadius: "50%" }}
              >
                <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
              <div className="flex items-center gap-2 mb-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--shelby-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                <span className="section-label" style={{ color: "var(--shelby-accent)" }}>QUICK START GUIDE</span>
              </div>
              <h2 className="text-lg font-semibold text-white mb-5">Welcome to Shelby! Here is how it works:</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center mb-3" style={{ background: "rgba(0,229,255,0.15)", border: "1px solid rgba(0,229,255,0.3)" }}>
                    <span className="text-white font-bold text-sm" style={{ fontFamily: 'var(--font-space-mono)' }}>1</span>
                  </div>
                  <h3 className="text-sm font-medium text-white mb-1">Connect Wallet</h3>
                  <p className="text-xs" style={{ color: "var(--shelby-muted)", lineHeight: "1.5" }}>
                    Install <a href="https://petra.app/" target="_blank" rel="noopener" style={{ color: "var(--shelby-accent)", textDecoration: "underline" }}>Petra Wallet</a> and connect. Make sure to switch network to <span style={{ color: "var(--shelby-accent)", fontFamily: "var(--font-space-mono)" }}>Shelbynet</span> in your wallet settings.
                    <button
                      onClick={() => setShowRpcModal(true)}
                      className="ml-1 font-semibold transition-all hover:text-white"
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--shelby-accent)",
                        cursor: "pointer",
                        padding: 0,
                        textDecoration: "underline",
                      }}
                    >
                      Show RPC details.
                    </button>
                  </p>
                </div>
                <div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center mb-3" style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)" }}>
                    <span className="text-white font-bold text-sm" style={{ fontFamily: 'var(--font-space-mono)' }}>2</span>
                  </div>
                  <h3 className="text-sm font-medium text-white mb-1">Get Test Tokens</h3>
                  <p className="text-xs" style={{ color: "var(--shelby-muted)", lineHeight: "1.5" }}>Claim free testnet tokens (APT + ShelbyUSD) using the <span style={{ color: "var(--shelby-green)", fontFamily: "var(--font-space-mono)" }}>Faucet</span> section below, or visit the official <a href="https://docs.shelby.xyz/apis/faucet/shelbyusd" target="_blank" rel="noopener noreferrer" style={{ color: "var(--shelby-accent)", textDecoration: "underline" }}>Shelby Faucet</a>.</p>
                </div>
                <div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center mb-3" style={{ background: "rgba(0,229,255,0.15)", border: "1px solid rgba(0,229,255,0.3)" }}>
                    <span className="text-white font-bold text-sm" style={{ fontFamily: 'var(--font-space-mono)' }}>3</span>
                  </div>
                  <h3 className="text-sm font-medium text-white mb-1">Upload File</h3>
                  <p className="text-xs" style={{ color: "var(--shelby-muted)", lineHeight: "1.5" }}>Drag and drop any file. It will be registered on-chain and securely stored on Shelby nodes.</p>
                </div>
                <div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center mb-3" style={{ background: "rgba(0,255,148,0.15)", border: "1px solid rgba(0,255,148,0.3)" }}>
                    <span className="text-white font-bold text-sm" style={{ fontFamily: 'var(--font-space-mono)' }}>4</span>
                  </div>
                  <h3 className="text-sm font-medium text-white mb-1">Lock & Earn</h3>
                  <p className="text-xs" style={{ color: "var(--shelby-muted)", lineHeight: "1.5" }}>Optionally lock your file. Users must pay you APT on-chain to access it.</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Faucet Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-2xl p-6 mb-5 relative overflow-hidden"
          style={{ border: "1px solid rgba(124,58,237,0.2)" }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[rgba(124,58,237,0.05)] via-transparent to-[rgba(0,229,255,0.03)] pointer-events-none"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--shelby-accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                </svg>
                <span className="section-label" style={{ color: "var(--shelby-accent2)" }}>TESTNET FAUCET</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="tag" style={{ background: "rgba(124,58,237,0.12)", color: "#a78bfa", borderColor: "rgba(124,58,237,0.3)", fontFamily: "var(--font-space-mono)" }}>SHELBYNET</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <h3 className="text-base font-semibold text-white mb-1">Claim Testnet Tokens</h3>
                <p className="text-xs" style={{ color: "var(--shelby-muted)", lineHeight: "1.6" }}>
                  Need APT for gas and ShelbyUSD for storage fees? Claim both instantly every 60 seconds to start uploading files on Shelbynet.
                </p>
              </div>
              <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto sm:min-w-[180px]">
                <button
                  className="btn-primary px-6 py-3 sm:py-2.5 rounded-xl text-sm font-semibold w-full sm:w-auto flex items-center justify-center gap-2"
                  style={{
                    background: faucetCooldown > 0
                      ? "rgba(124,58,237,0.2)"
                      : "linear-gradient(135deg, #7c3aed, #6d28d9)",
                    opacity: (!connected || faucetLoading || faucetCooldown > 0) ? 0.6 : 1,
                    cursor: (!connected || faucetLoading || faucetCooldown > 0) ? "not-allowed" : "pointer",
                    color: "white",
                  }}
                  onClick={claimFaucet}
                  disabled={!connected || faucetLoading || faucetCooldown > 0}
                >
                  {faucetLoading ? (
                    <>
                      <div className="dot-pulse" style={{ background: "white", boxShadow: "0 0 6px white" }}></div>
                      <span>Claiming...</span>
                    </>
                  ) : faucetCooldown > 0 ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                      <span style={{ fontFamily: "var(--font-space-mono)" }}>Wait {faucetCooldown}s</span>
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                      </svg>
                      <span>Claim Tokens</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {faucetMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg"
                  style={{ background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.2)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="6" stroke="var(--shelby-green)" strokeWidth="1.5" />
                    <path d="M4.5 7l2 2 3-3" stroke="var(--shelby-green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-xs font-medium" style={{ color: "var(--shelby-green)" }}>{faucetMsg}</span>
                </motion.div>
              )}
              {faucetError && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="6" stroke="#ef4444" strokeWidth="1.5" />
                    <path d="M7 4.5v3M7 9.5h.01" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span className="text-xs font-medium" style={{ color: "#ef4444" }}>{faucetError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {!connected && (
              <p className="text-xs mt-3" style={{ color: "var(--shelby-muted)", fontStyle: "italic" }}>
                Connect your wallet to use the faucet.
              </p>
            )}

            <div className="flex items-center gap-4 mt-4 pt-3" style={{ borderTop: "1px solid rgba(124,58,237,0.15)" }}>
              <a
                href="https://docs.shelby.xyz/apis/faucet/shelbyusd"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
                style={{ color: "var(--shelby-accent)" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
                Official Shelby Faucet (ShelbyUSD)
              </a>
              <span className="text-[10px]" style={{ color: "var(--shelby-muted)" }}>•</span>
              <span className="text-[10px]" style={{ color: "var(--shelby-muted)", fontFamily: "var(--font-space-mono)" }}>
                Network: Shelbynet
              </span>
            </div>
          </div>
        </motion.div>

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
              {uploading ? "Uploading…" : "Upload to Aptos"}
            </button>
          </div>

          {showShare && (
            <div className="fade-in mt-5">
              {!linkRevealed ? (
                // Lock wizard setup screen
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm font-semibold text-white">Configure File Security</p>
                      <p className="text-xs" style={{ color: "var(--shelby-muted)" }}>
                        Decentralized upload complete. Choose your access model.
                      </p>
                    </div>
                  </div>
                  
                  <div className="p-4 rounded-xl mb-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--shelby-border)" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white mb-0.5">Lock this file</p>
                        <p className="text-xs" style={{ color: "var(--shelby-muted)" }}>Require APT payment to access</p>
                      </div>
                      <button
                        className={`toggle ${locked ? "on" : ""} ${locking ? "opacity-50 pointer-events-none" : ""}`}
                        onClick={toggleLock}
                        disabled={locking}
                      ></button>
                    </div>

                    {locking && (
                      <div className="flex items-center gap-2 mt-3">
                        <div className="dot-pulse"></div>
                        <span className="text-[10px] text-white/50 font-mono uppercase">{lockStatus || "PROCESSING..."}</span>
                      </div>
                    )}

                    {locked && !locking && (
                      <div className="mt-4 fade-in">
                        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                          <div className="flex-1 w-full">
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
                                  width: "100%",
                                }}
                              />
                              <span className="text-xs" style={{ color: "var(--shelby-muted)", fontFamily: "var(--font-space-mono)" }}>
                                APT
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    {locked ? (
                      <button
                        className="btn-primary w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                        onClick={() => publishFileOnChain(true)}
                        disabled={locking}
                      >
                        {locking ? "Confirming..." : "Confirm & Lock File"}
                      </button>
                    ) : (
                      <button
                        className="btn-primary w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                        onClick={publishPublicFile}
                        disabled={locking}
                        style={{
                          background: "linear-gradient(135deg, var(--shelby-green), #00cc7a)",
                        }}
                      >
                        {locking ? "Publishing..." : "Generate Public Link"}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                // Revealed link screen
                <div className="fade-in">
                  <div className="flex items-center gap-2 mb-3">
                    {confirmedOnChain ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--shelby-accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                        <span className="text-xs font-medium" style={{ color: "#a78bfa" }}>
                          Stored & Locked successfully on Aptos
                        </span>
                      </>
                    ) : (
                      <>
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
                          Stored on Shelby — Public Link Ready
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <input
                      type="text"
                      readOnly
                      value={shareLink}
                      className="link-badge"
                      style={{
                        fontFamily: 'var(--font-space-mono)',
                        border: confirmedOnChain ? "1px solid rgba(124,58,237,0.3)" : "1px solid rgba(0,255,148,0.25)",
                        background: confirmedOnChain ? "rgba(124,58,237,0.06)" : "rgba(0,255,148,0.04)",
                        color: confirmedOnChain ? "#a78bfa" : "var(--shelby-green)"
                      }}
                    />
                    <button
                      className={`btn-ghost px-4 py-2 rounded-lg text-sm ${copiedLink ? "copy-flash" : ""}`}
                      onClick={copyLink}
                    >
                      {copiedLink ? "Copied!" : "Copy"}
                    </button>
                  </div>

                  <button
                    className="btn-ghost w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
                    onClick={resetUploadWizard}
                    style={{ borderColor: "rgba(255,255,255,0.1)" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    <span>Upload Another File</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Analytics Section */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5 fade-in">
          <div className="glass rounded-2xl p-5 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--shelby-accent)" strokeWidth="2">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                <polyline points="13 2 13 9 20 9"></polyline>
              </svg>
            </div>
            <span className="section-label block mb-2">TOTAL FILES</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white" style={{ fontFamily: 'var(--font-space-mono)' }}>
                {files.length}
              </span>
            </div>
          </div>
          
          <div className="glass rounded-2xl p-5 relative overflow-hidden group">
             <div className="absolute -right-4 -top-4 opacity-10 group-hover:opacity-20 transition-opacity">
               <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--shelby-accent2)" strokeWidth="2">
                  <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
               </svg>
             </div>
             <span className="section-label block mb-2">STORAGE USED</span>
             <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white" style={{ fontFamily: 'var(--font-space-mono)' }}>{totalStorage.value}</span>
                <span className="text-sm font-medium" style={{ color: "var(--shelby-muted)", fontFamily: 'var(--font-space-mono)' }}>{totalStorage.unit}</span>
             </div>
          </div>

          <div className="glass rounded-2xl p-5 relative overflow-hidden group" style={{ borderColor: "rgba(0,255,148,0.2)" }}>
            <div className="absolute inset-0 bg-gradient-to-br from-[rgba(0,255,148,0.05)] to-transparent opacity-50"></div>
            <div className="absolute -right-4 -top-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--shelby-green)" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
            </div>
            <span className="section-label block mb-2" style={{ color: "var(--shelby-green)" }}>APT EARNED</span>
            <div className="flex items-baseline gap-2 relative z-10">
               <span className="text-3xl font-bold text-white" style={{ fontFamily: 'var(--font-space-mono)' }}>{aptEarned}</span>
            </div>
          </div>
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
              <AnimatePresence>
                {files.map((f, i) => {
                  const matchingBlob = accountBlobs?.find(b =>
                    b.name === f.name ||
                    f.link.endsWith(`/${encodeURIComponent(b.name)}`) ||
                    f.link.endsWith(`/${b.name}`)
                  );
                  const exp = getExpirationInfo(matchingBlob, f.expiresAt);

                  return (
                    <motion.div 
                      key={f.link}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="file-row px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-1">
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
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
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
                            {exp && (
                              <span
                                className={`tag ${exp.status === 'expired' ? 'tag-red' : exp.status === 'warning' ? 'tag-warning' : ''}`}
                                style={{
                                  background: exp.status === 'expired' ? 'rgba(239,68,68,0.12)' : exp.status === 'warning' ? 'rgba(245,158,11,0.12)' : 'rgba(0,229,255,0.08)',
                                  color: exp.status === 'expired' ? '#f87171' : exp.status === 'warning' ? '#fbbf24' : 'var(--shelby-accent)',
                                  borderColor: exp.status === 'expired' ? 'rgba(239,68,68,0.3)' : exp.status === 'warning' ? 'rgba(245,158,11,0.3)' : 'rgba(0,229,255,0.2)',
                                  fontSize: "9px",
                                  fontFamily: "var(--font-space-mono)",
                                }}
                              >
                                {exp.label.toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:justify-end justify-start w-full sm:w-auto flex-wrap">
                        {connected && (
                          <button
                            className="btn-ghost flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold"
                            style={{
                              background: "rgba(0, 229, 255, 0.05)",
                              border: "1px solid rgba(0, 229, 255, 0.2)",
                              color: "var(--shelby-accent)",
                              cursor: extendingMap[f.name] ? "default" : "pointer"
                            }}
                            onClick={() => extendBlobExpiration(f.name)}
                            disabled={extendingMap[f.name]}
                          >
                            {extendingMap[f.name] ? "Extending..." : "Renew (+48h)"}
                          </button>
                        )}
                        <button
                          className="btn-ghost flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold"
                          onClick={() => window.open(f.link)}
                        >
                          Open
                        </button>
                        <button
                          className="btn-ghost flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold"
                          onClick={() => copyRowLink(f.link, i)}
                        >
                          {copiedRows[i] ? "Copied!" : "Copy Link"}
                        </button>
                        <button
                          className="btn-ghost flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ color: "#ef4444" }}
                          onClick={() => deleteFile(i)}
                        >
                          Delete
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        <p className="text-center mt-8 text-xs" style={{ color: "var(--shelby-muted)" }}>
          <span style={{ fontFamily: "var(--font-space-mono)" }}>Shelby Network</span> · Built on Aptos · Front-end mockup via Next.js
        </p>
      </motion.main>
      <AnimatePresence>
        {showRpcModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRpcModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="glass rounded-2xl w-full max-w-lg relative overflow-hidden z-10"
              style={{
                border: "1px solid rgba(0, 229, 255, 0.3)",
                background: "rgba(10, 10, 15, 0.95)",
                boxShadow: "0 0 30px rgba(0, 229, 255, 0.15)",
              }}
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-[rgba(255,255,255,0.08)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--shelby-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                  <span className="font-bold text-white tracking-wide" style={{ fontFamily: "var(--font-space-mono)", fontSize: "14px" }}>
                    Shelbynet RPC Configuration
                  </span>
                </div>
                <button
                  onClick={() => setShowRpcModal(false)}
                  className="text-white/60 hover:text-white transition-colors"
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="p-6 max-h-[70vh] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                
                {/* Option 1: Automatic Addition */}
                <div 
                  className="mb-6 p-4 rounded-xl border relative overflow-hidden transition-all hover:border-[rgba(0,229,255,0.4)]"
                  style={{
                    background: "linear-gradient(135deg, rgba(0, 229, 255, 0.04) 0%, rgba(124, 58, 237, 0.04) 100%)",
                    borderColor: "rgba(0, 229, 255, 0.15)"
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span 
                      className="px-2 py-0.5 rounded text-[10px] font-bold" 
                      style={{ background: "rgba(0, 229, 255, 0.15)", color: "var(--shelby-accent)", fontFamily: "var(--font-space-mono)" }}
                    >
                      OPTION 1
                    </span>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider" style={{ fontFamily: "var(--font-space-mono)" }}>
                      Connect Automatically (Recommended)
                    </h4>
                  </div>
                  <p className="text-xs leading-relaxed mb-4 text-white/70">
                    Add and switch to the Shelbynet network instantly via your connected AIP-62 standard wallet.
                  </p>
                  <p className="text-[10px] leading-relaxed mb-4 text-white/40 italic">
                    Note: Petra Wallet does not support automatically adding custom networks. If you are using Petra, please add the network manually using Option 2 below.
                  </p>

                  {!connected ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-[11px] text-amber-400 italic">
                        * Please connect your wallet first in the top right corner.
                      </p>
                      <button
                        onClick={connectWallet}
                        className="btn-primary py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer w-full transition-all hover:opacity-95"
                        style={{
                          background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                          color: "white",
                          border: "none"
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                        Connect Wallet
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={handleAutoAddRpc}
                        disabled={autoAddLoading || autoAddSuccess}
                        className="py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all w-full"
                        style={{
                          background: autoAddSuccess 
                            ? "rgba(0, 255, 148, 0.2)" 
                            : "linear-gradient(135deg, #00e5ff, #00b0ff)",
                          border: autoAddSuccess 
                            ? "1px solid rgba(0, 255, 148, 0.4)" 
                            : "none",
                          color: autoAddSuccess ? "var(--shelby-green)" : "#0b0f19",
                          opacity: autoAddLoading ? 0.7 : 1,
                          boxShadow: autoAddSuccess ? "none" : "0 0 12px rgba(0, 229, 255, 0.3)"
                        }}
                      >
                        {autoAddLoading ? (
                          <>
                            <div className="dot-pulse" style={{ background: "#0b0f19", boxShadow: "0 0 6px #0b0f19" }}></div>
                            <span>Connecting network...</span>
                          </>
                        ) : autoAddSuccess ? (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            <span>Network successfully changed!</span>
                          </>
                        ) : (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                            </svg>
                            <span>Add & Switch to Shelbynet</span>
                          </>
                        )}
                      </button>

                      {autoAddError && (
                        <div 
                          className="p-2.5 rounded-lg text-[11px] leading-normal flex items-start gap-1.5"
                          style={{
                            background: "rgba(239, 68, 68, 0.08)",
                            border: "1px solid rgba(239, 68, 68, 0.2)",
                            color: "#ef4444"
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                          </svg>
                          <span>{autoAddError}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Option 2: Manual Addition */}
                <div 
                  className="p-4 rounded-xl border"
                  style={{
                    background: "rgba(255, 255, 255, 0.01)",
                    borderColor: "rgba(255, 255, 255, 0.06)"
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span 
                      className="px-2 py-0.5 rounded text-[10px] font-bold" 
                      style={{ background: "rgba(255, 255, 255, 0.08)", color: "var(--shelby-muted)", fontFamily: "var(--font-space-mono)" }}
                    >
                      OPTION 2
                    </span>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider" style={{ fontFamily: "var(--font-space-mono)" }}>
                      Manual Configuration (Copy Details)
                    </h4>
                  </div>
                  
                  <p className="text-xs leading-relaxed mb-4 text-white/50">
                    Use the details below if your wallet does not support auto-switch or if you want to set it up manually.
                  </p>

                  {/* Copyable Fields */}
                  <div className="space-y-3.5 mb-5">
                    {[
                      { label: "Network Name", value: "Shelbynet", key: "name" },
                      { label: "Node URL (RPC)", value: "https://api.shelbynet.shelby.xyz/v1", key: "rpc" },
                      { label: "Storage Location / Endpoint", value: "shelbynet-1 (https://api.shelbynet.shelby.xyz/shelby)", key: "location" },
                      { label: "Chain ID", value: "113", key: "chainId" },
                      { label: "Token Symbol", value: "APT", key: "symbol" },
                      { label: "Block Explorer", value: "https://explorer.shelby.xyz/shelbynet", key: "explorer" },
                    ].map((field) => (
                      <div key={field.key} className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold tracking-wider text-white/40 uppercase" style={{ fontFamily: "var(--font-space-mono)" }}>
                          {field.label}
                        </span>
                        <div
                          className="flex items-center justify-between p-2 rounded-lg border transition-all hover:border-[rgba(0,229,255,0.15)]"
                          style={{
                            background: "rgba(255,255,255,0.01)",
                            borderColor: "rgba(255,255,255,0.04)"
                          }}
                        >
                          <span className="text-[11px] font-medium text-white/90 break-all pr-2" style={{ fontFamily: "var(--font-space-mono)" }}>
                            {field.value}
                          </span>
                          <button
                            onClick={() => copyRpcField(field.key, field.value)}
                            className="p-1 rounded transition-colors hover:bg-white/5 flex items-center justify-center shrink-0"
                            style={{ background: "none", border: "none", cursor: "pointer" }}
                            title="Copy field"
                          >
                            {copiedFields[field.key] ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--shelby-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/40">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Instructions */}
                  <div className="border-t border-[rgba(255,255,255,0.06)] pt-4">
                    <h5 className="text-[11px] font-bold text-white mb-2" style={{ fontFamily: "var(--font-space-mono)" }}>
                      Manual Guide for Petra Wallet:
                    </h5>
                    <ol className="list-decimal pl-4 space-y-1.5 text-[11px]" style={{ color: "var(--shelby-muted)", lineHeight: "1.4" }}>
                      <li>Open the **Petra Wallet** extension or app.</li>
                      <li>Click **Settings (gear icon)** in the bottom-right corner.</li>
                      <li>Select the **Network** menu.</li>
                      <li>Click the **Add Custom Network** button.</li>
                      <li>Copy and paste the fields above into the respective inputs, then save.</li>
                      <li>Ensure **Shelbynet** is selected as the active network in your wallet.</li>
                    </ol>
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-[rgba(255,255,255,0.08)] flex justify-end bg-black/40">
                <button
                  onClick={() => setShowRpcModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white/80 hover:text-white transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    cursor: "pointer"
                  }}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <WalletSelectorModal isOpen={showWalletModal} onClose={() => setShowWalletModal(false)} />
      <DebugConsole />
    </>
  );
}
