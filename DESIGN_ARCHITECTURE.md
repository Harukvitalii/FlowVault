# Withdraw App — Design Architecture

## Pages & Navigation

| Page | Purpose | Key Components |
|------|---------|----------------|
| **Setup** | First-time vault creation | Password form, validation |
| **Login** | Vault unlock | Password input, error states |
| **Dashboard** | Overview of all assets | Wallet cards, Exchange cards, auto-refresh |
| **Wallets** | Manage crypto wallets | Add form (kind, label, key), list view |
| **Exchanges** | Connect CEX accounts | Add form (exchange, label, API key/secret), list |
| **RPCs** | Manage blockchain nodes | Default RPC list with ping, custom RPC form |
| **Transfer** | Execute transfers | Mode toggle, source/dest selectors, amount input |
| **History** | View transaction log | Filters, transaction list, pagination |

---

## Color System

```
Background:   #0A0A0A (primary) / #111 (panels) / #1A1A1A (cards)
Border:       #262626 (default) / #333 (hover)
Text:         #E5E5E5 (primary) / #A3A3A3 (secondary) / #737373 (muted)
Accents:      Blue #4F46E5 | Green #22C55E | Red #EF4444 | Yellow #F59E0B
```

---

## Component Patterns

### Buttons
- **Primary**: Blue background, white text
- **Ghost**: Transparent with border
- **Danger**: Red background/border

### Cards
- Background: #111
- Border: 1px solid #262626
- Border-radius: 14px
- Padding: 16px

### Pills
- Rounded containers for selectable items
- States: default → hover → selected
- Selected: blue border + darker background

### Icons
- **Exchange**: 32x32 circles with 2-letter codes (BN, GT, BY, MX, KC)
- **Wallet**: 32x32 with type (EVM, SOL)

---

## User Flows

### 1. First-Time Setup
```
Launch → Setup Page → Create Password → Dashboard (empty)
```

### 2. Add Wallet
```
Wallets Page → Select Kind (EVM/Sol) → Enter Label + Key → Add Wallet
```

### 3. Execute Transfer
```
Transfer Page → Select Mode (Wallet→CEX / CEX→CEX)
  → Select Source → Select Asset → Select Destination
  → Enter Amount → Submit → View Result
```

---

## Data Model

```typescript
Wallet: { id, kind, label, address, encryptedKey }
Exchange: { id, exchange, label, apiKey, apiSecret, passphrase? }
RPC: { id, chain, chainId, name, url, isCustom }
Transaction: { id, kind, from, to, asset, amount, network, status, txid, error }
```

---

## Open Questions for Review

1. Should we add USD value display for balances?
2. Should "Max" button deduct network fees?
3. Add search/date filters to History?
4. One-click "Test All RPCs" button?
5. Hardware wallet support in future?
6. Multi-vault support needed?
