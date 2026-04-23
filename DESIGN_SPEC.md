# Withdraw App — Design Specification v2.0

## 1. Concept & Vision

**Withdraw** — desktop-додаток для безпечного управління крипто-активами та автоматизації переказів між власними гаманцями (EVM/Solana) та централізованими біржами (CEX).

### Core Philosophy
- **Security First**: Всі ключі шифруються локально з master password
- **Minimal Complexity**: Один екран = одна задача  
- **Visual Clarity**: Чітка ієрархія даних, інтуїтивна навігація
- **Fast Workflow**: Мінімум кліків для типових операцій

---

## 2. Design System

### Color Palette
```
Background Primary:    #0A0A0A (чорний)
Background Secondary:  #111111 (панелі)
Background Tertiary:   #1A1A1A (картки)
Border:                #262626 (лінії)
Border Hover:          #333333 (hover стани)
Text Primary:          #E5E5E5 (основний)
Text Secondary:        #A3A3A3 (підписи)
Text Muted:            #737373 (допоміжний)
Accent Blue:            #4F46E5 (primary)
Accent Blue Light:     #3B82F6 (hover)
Accent Green:          #22C55E (success)
Accent Red:            #EF4444 (error)
Accent Yellow:         #F59E0B (warning)
```

### Blockchain Colors
```
Ethereum:  #4F46E5  |  BSC: #F59E0B  |  Polygon: #9333EA
Arbitrum: #3B82F6  |  Base: #60A5FA |  Optimism: #EF4444
```

### Typography
```
Font: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif
Mono: ui-monospace, monospace

H1: 24px/700  |  H2: 20px/600  |  H3: 16px/600
Body: 14px/400  |  Small: 12px  |  Tiny: 11px
```

### Spacing
```
Base: 4px  |  xs: 4px  |  sm: 8px  |  md: 12px
lg: 16px  |  xl: 24px  |  2xl: 32px  |  3xl: 48px

Border Radius: sm: 6px  |  md: 8px  |  lg: 12px  |  xl: 14px
```

---

## 3. Layout Structure

### Window Layout
```
┌────────────────────────────────────────────────────────┐
│  Title Bar (32px)                              [─][□][×]│
├──────────────┬─────────────────────────────────────────┤
│              │                                         │
│   SIDEBAR    │           MAIN CONTENT AREA             │
│   (220px)    │             (flex-1, max 860px)          │
│              │                                         │
│  Brand       │  ┌─────────────────────────────────┐    │
│  ───────     │  │     Page Title + Actions        │    │
│  Dashboard   │  ├─────────────────────────────────┤    │
│  Wallets      │  │                                 │    │
│  Exchanges    │  │       Content Cards             │    │
│  RPCs         │  │                                 │    │
│  Transfer     │  │                                 │    │
│  History      │  │                                 │    │
│  ───────      │  └─────────────────────────────────┘    │
│  [Lock]       │                                         │
└──────────────┴─────────────────────────────────────────┘
```

### Responsive: Desktop-first (min 900px), sidebar fixed 220px
