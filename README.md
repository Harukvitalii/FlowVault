<p align="center">
  <img src="https://img.shields.io/badge/Electron-191970?style=for-the-badge&logo=Electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind" />
</p>

<h1 align="center">FlowVault</h1>

<p align="center">
  <b>Manage withdrawals across multiple CEX exchanges and EVM wallets</b> from a single desktop app.
  <br>
  All API keys and private keys are <b>AES-256-GCM encrypted</b> and stored locally on your machine.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platforms" />
  <img src="https://img.shields.io/badge/license-private-blue" alt="License" />
</p>

<p align="center">
  <img src="docs/demo.gif" alt="FlowVault demo" width="900" />
</p>

---

## What it does

FlowVault consolidates multi-exchange crypto management into one interface:

- **Withdraw from any CEX** to any other CEX or EVM wallet in a few clicks
- **On-chain EVM transfers** directly from your wallet (sign & broadcast)
- **Deposit monitoring** with live status tracking across all connected exchanges
- **Smart network matching** automatically picks the cheapest compatible chain
- **Internal transfers** between exchange sub-accounts (spot, futures, funding)
- **Activity feed** with real-time withdrawal and deposit tracking

## Supported Exchanges & Wallets

| Source | Balances | Withdraw | Deposit Addr | Deposit Monitor |
|--------|:--------:|:--------:|:------------:|:---------------:|
| Binance  | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| Bybit    | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| OKX      | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| Bitget   | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| Gate     | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| KuCoin   | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| HTX      | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| MEXC     | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| Phemex   | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| EVM Wallets | :white_check_mark: | :white_check_mark: | :white_check_mark: | — |
| Solana Wallets | :white_check_mark: | :white_check_mark: | :white_check_mark: | — |

**EVM Chains:** Ethereum, Arbitrum, Base, Optimism, BSC, Polygon — automatic RPC failover and latency-based routing.
**Solana:** SOL, USDC, USDT balances and transfers.

## Security

| Feature | Detail |
|---------|--------|
| **Vault encryption** | AES-256-GCM with scrypt key derivation (N=2^17, r=8) |
| **Master key** | Minimum 8 characters, exponential backoff on failed attempts |
| **Electron sandbox** | Renderer process runs with `sandbox: true` |
| **Context isolation** | `contextIsolation: true`, `nodeIntegration: false` |
| **CSP** | Strict Content-Security-Policy, no wildcard `connect-src` |
| **Navigation blocked** | `will-navigate` prevented, `shell.openExternal` validates `https://` only |
| **IPC validation** | All renderer→main IPC arguments validated at runtime |
| **Atomic writes** | Vault and history files use tmp+rename to prevent corruption |
| **File permissions** | Vault, history, and cache files written with `mode 0o600` (owner-only) on POSIX |
| **Permissions denied** | Renderer denied mic, camera, geolocation, notifications, and all browser permission prompts |
| **No telemetry** | No analytics, no tracking, no auto-update calls. Outgoing requests are limited to those you initiate (CEX API, EVM/Solana RPC) plus Google Fonts and `api.ipify.org` for public-IP detection on the Setup tab. |

## Architecture

```
src/
├── main/                  # Electron main process
│   ├── vault.ts           # Encrypted vault (keys, credentials, RPCs)
│   ├── exchanges.ts       # CEX operations via ccxt + custom clients
│   ├── phemex.ts          # Custom Phemex REST client (HMAC SHA256)
│   ├── evm-send.ts        # On-chain EVM transfers via viem
│   ├── evm.ts             # EVM balance queries (multi-chain, multi-RPC)
│   ├── withdrawals.ts     # Withdrawal records + status poller
│   ├── deposits.ts        # Deposit monitor (all exchanges)
│   ├── rpc.ts             # RPC health monitoring + latency routing
│   ├── cache-store.ts     # Disk cache for network info + deposit addresses
│   └── prefs.ts           # User preferences
├── renderer/              # React frontend
│   ├── pages/
│   │   ├── Dashboard.tsx  # Source grid + detail takeover view
│   │   ├── Lock.tsx       # Vault unlock / create
│   │   └── Settings.tsx   # Exchanges, wallets, RPCs, setup
│   └── components/
│       ├── ActionPanel    # Transfer builder (CEX↔CEX, CEX↔EVM, EVM↔EVM)
│       ├── ActivityPanel  # Unified withdrawal + deposit feed
│       ├── RpcTicker      # Scrolling RPC latency bar
│       └── ...
├── preload/               # Context bridge (IPC only, no Node access)
└── shared/                # Types, network mappings, address validation
```

## Install

Download the latest pre-built binary from the [Releases page](https://github.com/Harukvitalii/FlowVault/releases/latest).

> ⚠️ **Beta builds are not code-signed.** macOS Gatekeeper, Windows SmartScreen, and Linux launchers will show a warning the first time. Follow the steps below to bypass.

### macOS

| Chip | File |
|------|------|
| Apple Silicon (M1/M2/M3/M4) | `FlowVault-x.y.z-arm64.dmg` |
| Intel | `FlowVault-x.y.z.dmg` |

1. Open the `.dmg` and drag **FlowVault** into Applications.
2. Launch FlowVault. macOS blocks it with *"FlowVault cannot be opened because the developer cannot be verified"* — click **Cancel**.
3. Open **System Settings → Privacy & Security**, scroll to the bottom, click **Open Anyway** next to the FlowVault notice.
4. Confirm with **Open**. The app launches and remembers the exception.

If *Open Anyway* is missing or the dialog says the app is "damaged", clear the quarantine attribute:

```bash
xattr -dr com.apple.quarantine /Applications/FlowVault.app
```

### Windows

Download `FlowVault-x.y.z.exe` (portable — no installer required) and double-click.

1. Windows SmartScreen shows *"Windows protected your PC"*.
2. Click **More info → Run anyway**.

The portable build keeps everything in the `.exe` and does not modify the registry.

### Linux

| Format | File | Run |
|--------|------|-----|
| AppImage | `FlowVault-x.y.z.AppImage` | `chmod +x FlowVault-*.AppImage && ./FlowVault-*.AppImage` |
| Debian / Ubuntu | `flowvault_x.y.z_amd64.deb` | `sudo dpkg -i flowvault_*.deb` |
| Tarball | `flowvault-x.y.z.tar.gz` | `tar -xzf flowvault-*.tar.gz && ./flowvault/flowvault` |

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Install & Run

```bash
# Install dependencies
npm install

# Development mode (hot reload)
npm run dev

# Production build
npm run build
```

### First Launch

1. **Create a master key** — encrypts all stored credentials
2. **Add exchanges** — paste API key + secret (+ passphrase for OKX/KuCoin/Bitget)
3. **Whitelist your IP** — Setup tab shows your public IP and per-exchange instructions
4. **Add wallets** — import EVM private key (for sending) or add watch-only addresses
5. **Configure RPCs** — default RPCs are pre-loaded; add custom ones for better latency

### Build for Distribution

```bash
# macOS (dmg + zip, arm64 + x64)
npm run build:mac

# Windows (nsis + portable)
npm run build:win

# Linux (AppImage + deb)
npm run build:linux
```

## Tech Stack

- **[Electron](https://www.electronjs.org/)** + **[electron-vite](https://electron-vite.org/)** — desktop shell
- **[React](https://react.dev/)** + **[TypeScript](https://www.typescriptlang.org/)** — UI
- **[Tailwind CSS](https://tailwindcss.com/)** — styling
- **[ccxt](https://github.com/ccxt/ccxt)** — unified exchange API (8 exchanges)
- **[viem](https://viem.sh/)** — EVM transactions and contract calls
- **Custom REST clients** — Phemex (HMAC SHA256 signing)

## Data Storage

All data stays on your machine in the Electron `userData` directory:

| File | Content | Encrypted |
|------|---------|:---------:|
| `vault.enc` | API keys, secrets, private keys, RPC configs | :white_check_mark: |
| `withdrawals.json` | Withdrawal history and status | :x: |
| `deposits.json` | Deposit history | :x: |
| `exchange-cache.json` | Network info + deposit address cache (TTL-based) | :x: |
| `prefs.json` | User preferences | :x: |
