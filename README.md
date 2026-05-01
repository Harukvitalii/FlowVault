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

> [!IMPORTANT]
> ## READ BEFORE USE
>
> - **PRIVATE KEYS AND API SECRETS NEVER LEAVE YOUR MACHINE.** Everything is AES-256-GCM encrypted and stored locally inside the vault. No cloud sync, no remote backup, no telemetry.
>
> - **YOU MUST ADD EVERY DESTINATION ADDRESS TO THE EXCHANGE'S WITHDRAWAL WHITELIST MANUALLY.** Each CEX (Binance, Bybit, OKX, etc.) only lets API keys withdraw to addresses you have already approved in their address book / whitelist on the exchange's own website. FlowVault DOES NOT bypass this — it just sends the withdraw request; the exchange enforces the whitelist.
>
> - **THE APP CAN ONLY MOVE FUNDS BETWEEN ACCOUNTS YOU PRE-AUTHORIZED.** In practice this means: **EXCHANGE → EXCHANGE** (when the destination's deposit address is whitelisted on the source), and **EXCHANGE → YOUR OWN WALLET** (when that wallet's address is whitelisted). **THE APP CANNOT SEND TO ARBITRARY ADDRESSES THAT YOU HAVE NOT WHITELISTED IN ADVANCE.**

---

## Quick Start

From zero to your first transfer:

1. **Download** the right file for your OS from the [Releases page](https://github.com/Harukvitalii/FlowVault/releases/latest) and open it. Detailed per-OS install steps are below in the [Install](#install) section.
2. **Set a master password** the first time the app launches. This password encrypts every API key and wallet you add — **there is no recovery if you forget it.** Use a password manager.
3. **Whitelist your public IP on each exchange.** Open Settings → Setup — FlowVault shows your IP and links to the right page on each exchange. Most CEX block API keys that aren't tied to a fixed IP.
4. **Add exchange API keys.** On the exchange's website create a key with **Read** + **Withdraw** permissions; paste key + secret (+ passphrase for OKX / KuCoin / Bitget) into Settings → Exchanges.
5. **(Optional) Add wallets.** Settings → Wallets — paste an EVM private key to enable on-chain sending, or add watch-only addresses for tracking. SOL wallets supported.
6. **Whitelist destinations on each exchange's website.** Add the deposit address of every other exchange / wallet you want to send to. Most exchanges enforce a 24h cooldown after adding a new address.
7. **Make your first transfer.** Open the source on the dashboard, pick the destination, FlowVault picks the cheapest network for you (the **BEST** badge), enter the amount, click **Review & withdraw**.

> **Tip:** RPCs for EVM and Solana come pre-loaded. You can add custom RPCs (Settings → RPCs) for lower latency or stricter routing — but it's not required.

---

## What it does

FlowVault consolidates multi-exchange crypto management into one interface:

- **Exchange-to-exchange transfers in as little as 10 seconds** — pick source, pick destination, click. The app builds the request, the exchange signs it, the deposit is credited the moment it lands.
- **Withdraw from any CEX** to any other CEX or EVM wallet in a few clicks.
- **On-chain EVM transfers** directly from your wallet (sign & broadcast).
- **Deposit monitoring** with live status tracking across all connected exchanges.
- **Smart network matching** automatically picks the cheapest compatible chain.
- **Internal transfers** between exchange sub-accounts (spot, futures, funding).
- **Activity feed** with real-time withdrawal and deposit tracking.

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

In plain words:

- **Your keys live only on this computer.** They never touch any remote server, ever. If you uninstall the app and wipe its data folder, the keys are gone forever.
- **They are encrypted with the same algorithm banks use** (AES-256). Without your master password, the vault file is unreadable — even by you, even by us.
- **The app makes no telemetry calls.** The only outgoing requests are the ones you see in the Activity feed (exchange APIs and the EVM / Solana RPCs you configured), plus a single call to `api.ipify.org` to show your public IP on the Setup tab.
- **No auto-update, no analytics, no error reporting.** What runs on your computer is exactly the version you downloaded.

<details>
<summary><b>Technical details</b> (for developers / auditors)</summary>

| Feature | Detail |
|---------|--------|
| **Vault encryption** | AES-256-GCM with scrypt key derivation (N=2^17, r=8) |
| **Master key** | Minimum 8 characters, exponential backoff on failed attempts (persisted across restarts) |
| **Electron sandbox** | Renderer process runs with `sandbox: true` |
| **Context isolation** | `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true` |
| **CSP** | Strict Content-Security-Policy, no wildcard `connect-src` |
| **Navigation blocked** | `will-navigate` prevented, `shell.openExternal` validates `https://` only |
| **IPC validation** | All renderer→main IPC arguments validated at runtime; errors carry no stack |
| **Atomic writes** | Vault and history files use tmp+rename to prevent corruption |
| **File permissions** | Vault, history, and cache files written with `mode 0o600` (owner-only) on POSIX |
| **Permissions denied** | Renderer denied mic, camera, geolocation, notifications, and all browser permission prompts |
| **DevTools** | Disabled in production builds — `devtools-opened` listener auto-closes the inspector |
| **SSRF guard** | RPC URLs reject loopback / RFC-1918 / link-local / IPv6 ULA addresses |
| **Idempotency** | Each Review modal generates a UUID; main-process dedupes duplicate submits within a 5-min TTL |

</details>

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

<details>
<summary><b>For developers — build from source</b></summary>

### Prerequisites

- Node.js 20+
- npm

### Install & Run

```bash
# Install dependencies
npm install

# Development mode (hot reload)
npm run dev

# Production build (validates types + builds main / preload / renderer)
npm run build
```

### Tech Stack

- **[Electron](https://www.electronjs.org/)** + **[electron-vite](https://electron-vite.org/)** — desktop shell
- **[React](https://react.dev/)** + **[TypeScript](https://www.typescriptlang.org/)** — UI
- **[Tailwind CSS](https://tailwindcss.com/)** — styling
- **[ccxt](https://github.com/ccxt/ccxt)** — unified exchange API (8 exchanges)
- **[viem](https://viem.sh/)** — EVM transactions and contract calls
- **[@solana/web3.js](https://solana-labs.github.io/solana-web3.js/)** + **[bs58](https://github.com/cryptocoinjs/bs58)** + **[@noble/hashes](https://github.com/paulmillr/noble-hashes)** — Solana send + base58check address validation
- **Custom REST clients** — Phemex (HMAC SHA256 signing)

### Data Storage

All data stays on your machine in the Electron `userData` directory:

| File | Content | Encrypted |
|------|---------|:---------:|
| `vault.enc` | API keys, secrets, private keys, RPC configs | :white_check_mark: |
| `vault.lockout.json` | Brute-force backoff counter | :x: |
| `withdrawals.json` | Withdrawal history and status | :x: |
| `deposits.json` | Deposit history | :x: |
| `exchange-cache.json` | Network info + deposit address cache (TTL-based) | :x: |
| `prefs.json` | User preferences | :x: |

</details>

---

## FAQ

<details>
<summary><b>Is my money safe if my laptop breaks or gets stolen?</b></summary>

Your **vault file** is what holds the keys. Back it up to an encrypted location (a password-manager attachment, an encrypted USB stick) and you can restore on a new machine. Without that backup the keys are gone — but **your funds are not**. The funds live on the exchange / on-chain; you can always re-add the API keys / re-import the wallet from your originals.

Vault file location:
- macOS: `~/Library/Application Support/flowvault/vault.enc`
- Windows: `%APPDATA%\flowvault\vault.enc`
- Linux: `~/.config/flowvault/vault.enc`
</details>

<details>
<summary><b>What if I forget my master password?</b></summary>

There is no recovery — by design. The master password is what encrypts the vault; if it could be reset, the encryption would be meaningless. **Use a password manager.** If lost, your only option is to wipe the vault from Settings → Security and start over (re-add API keys + wallets).
</details>

<details>
<summary><b>Why does macOS say the app is "damaged" or won't open?</b></summary>

Beta builds are not code-signed. macOS quarantines them on first run. See [macOS install steps](#macos) — usually one terminal command (`xattr -dr com.apple.quarantine ...`) clears it.
</details>

<details>
<summary><b>Does FlowVault take any fee?</b></summary>

**No.** The app is free and takes nothing on top. You pay only:
- The exchange's withdrawal fee (visible on every network chip).
- The on-chain gas fee (when sending from your own EVM / SOL wallet).
</details>

<details>
<summary><b>Can it trade for me / make money on its own?</b></summary>

**No.** Every transfer is a manual click. There is no auto-trader, no scheduling, no DCA, no signal following. The app only moves funds you explicitly tell it to move.
</details>

<details>
<summary><b>Why does the destination dropdown / Review button not work for some addresses?</b></summary>

The exchange enforces an address whitelist on its API. If the destination's deposit address is not in your withdraw whitelist on the **source** exchange, the API call will fail. Add the address on the exchange's website and wait 24h on most CEX (Bybit / Binance / KuCoin / etc) before retrying.
</details>

<details>
<summary><b>What if a withdrawal gets stuck on "processing"?</b></summary>

FlowVault polls the exchange's status every few seconds for up to 24 hours. Common reasons it stays "processing":
- The exchange is still confirming the on-chain transaction (5–60 min depending on chain).
- The destination CEX is awaiting its own internal confirmations (usually 12+ on EVM L1, fewer on L2).
- The exchange is doing AML / compliance review (rare; can take hours).

You can verify on-chain via the explorer link in the activity row. If the chain shows confirmed but the destination CEX hasn't credited after >2h, contact the destination exchange.
</details>

<details>
<summary><b>Why isn't [my exchange] supported?</b></summary>

The 9 listed CEX are the ones with stable API support via [ccxt](https://github.com/ccxt/ccxt) / direct REST clients. Open an issue on GitHub if you need another. Keep in mind: only exchanges with a documented withdrawal API can be added.
</details>
