# Technical Requirements Document: AI-Powered Portfolio Terminal & Retirement Planner

## 1. Project Overview
The AI-Powered Portfolio Terminal is a high-performance, real-time investment tracking and financial planning application designed for modern investors. The portal is split into two specialized workspaces:
- **Trading Terminal**: Real-time asset tracker supporting classic Equities, Crypto, Commodities, and Penny Stocks, with automated AI market scanning and discovery engines.
- **Retirement Planner**: Multi-account projection dashboard that manages standard tax-advantaged accounts (Roth IRA, Traditional IRA, 401(k), HSA) alongside custom retirement profiles, using Gemini AI to optimize asset locations, model growth projections, and score potential investments.

## 2. System Architecture
- **Frontend**: React 19+ with TypeScript in a Single-Page Application (SPA) architecture built on Vite.  
- **Styling**: Tailwind CSS 4.x for utility-first responsive layout design.  
- **State Management**: React state hooks synchronized in real time with serverless persistence.  
- **Backend-as-a-Service**: Firebase integration:
  - **Firebase Authentication**: Implements pop-up based OAuth for iframe-safe user sign-in.
  - **Cloud Firestore**: Real-time document listener synchronization (`onSnapshot`) to prevent stale UI layers.
- **AI Engine**: Google Gemini API via `@google/genai` TypeScript SDK:
  - Real-time search/market grounding (via Google Search integration) is utilized for discovery scans, news sentiment analyses, and portfolio sentiment tracking.
  - Contextual planning agents handle retirement modeling, strategic rebalancing, and tax optimizations.
- **Data Visualization**: Recharts SVG line & area engines mapping portfolio trajectory, asset projections up to age 100, and current/recommended allocation profiles.

---

## 3. Functional Requirements

### 3.1 Portfolio Management & Trading Terminal
- **Multi-Asset Tracking**: Direct storage, tracking, and price updates for Equities, Crypto, Commodities, and Penny Stocks.
- **Fractional Precision**: Support for fractional share holdings (up to 4 decimal places) for high-priced stocks and cryptocurrencies.
- **Bulk Operations**: Seamless CSV integration (Import/Export) containing full transactional parameters to enable local backups and quick migrations.
- **Liquid Capital Handling**: User-defined investment-ready cash limits used to contextually shape prospective AI buy recommendation sizing.

### 3.2 Automated Retirement Planner
- **Multi-Account Structuring**: Isolated sub-collections tracking multiple active retirement portfolios: Traditional IRA, Roth IRA, 401(k), and Health Savings Accounts (HSA).
- **Custom Goal Profile**: Dynamic forms tracking current age, retirement targeting thresholds, and customized annual account contribution caps.
- **Compound Projection Modeler**: Mathematical algorithms combined with AI forecasting to chart conservative, expected, and optimistic asset growth pathways up to age 100.
- **Tax & Location Optimizer**: Analytical routines listing specific recommendations to shift assets between taxable trading portfolios and tax-advantaged retirement accounts to capture estimated tax drag savings.
- **Diversified Asset Location Scoring**: AI-driven evaluation rating specific low-expense core ETFs and satellite equities on compound potential, tax-efficiency, stability, diversification, and cost metrics.

### 3.3 Contextual Investment Copilot (Gemini Chatbot)
- **Top-Header Access**: Prominent global navigation button labeled **"Ask me questions"** aligned left of the system "Getting Started" button at the very top of the interface. This ensures the chatbot panel is instantly accessible across **both** workspace states (Trading Terminal and Retirement Planner).
- **Context-Aware Memory**: Keeps historical logs of conversation during the current session, automatically evaluating active portfolio lists, retirement balances, and risk tolerances to answer user queries with razor-sharp personalization.
- **Low-Latency Streaming**: Rapid response rendering giving instantaneous, conversational market analysis.

### 3.4 Market Discovery & Analysis Engines
- **Simultaneous Scanner**: Real-time background execution parsing four independent research layers:
  1. *News Catalysts*: Extracts breaking events shaping trade volumes.
  2. *Industry Trends*: Ranks industry cycles (Rolling Over vs Breaking Out).
  3. *Macro Movers*: Maps global commodity moves to potential equity effects.
  4. *Portfolio-Aware Ranking*: Checks fit scores against user-held assets.
- **Regional Market Oracles**: Consolidates geographic data (US, Europe, Asia, Global) to present a "Market Mood" (Risk-On/Risk-Off) narrative synthesis.

---

## 4. Technical Specifications & Data Models

### 4.1 Core Data Contracts

#### PortfolioItem
```typescript
interface PortfolioItem extends Stock {
  shares: number;
  averageCost: number;
  advisory?: Advisory;
}

interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  sector: string;
  marketCap: string;
  volatility: "Low" | "Medium" | "High";
  performance: number; // 1-year performance %
  assetType: AssetType; // "Equity" | "Crypto" | "Commodity" | "Penny Stock"
}
```

#### RetirementAccount
```typescript
type RetirementAccountType = "Roth IRA" | "Traditional IRA" | "401(k)" | "HSA";

interface RetirementAccount {
  id: string;
  type: RetirementAccountType;
  custodian: string;
  balance: number;
  holdings: PortfolioItem[];
}
```

#### RetirementProfile
```typescript
interface RetirementProfile {
  age: number;
  targetRetirementAge: number;
  riskTolerance: "Conservative" | "Moderate" | "Aggressive";
  investmentStyle: "ETFs Only" | "Mixed" | "Stocks Only";
  annualContributions: Record<string, number>; // accountId -> annual contribution amount
}
```

---

## 5. Security, Database, & Rule Isolation

### 5.1 Cloud Database & Firestore Security Rules
All financial structures are backed by deep rule validation:
- **Tenant Isolation**: Direct owner match check: `request.auth.uid == userId` for every route.
- **Users Rules**: Checks valid schema elements upon creation:
```javascript
function isValidUser(data) {
  return data.keys().hasAll(['uid', 'email']) &&
         data.uid is string &&
         data.email is string &&
         data.email.matches("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$");
}
```
- **Retirement Accounts Validation**: Validates database field structural sanity on write:
```javascript
function isValidRetirementAccount(data) {
  return data.keys().hasAll(['id', 'type', 'custodian', 'balance', 'holdings']) &&
         data.id is string &&
         data.type in ["Roth IRA", "Traditional IRA", "401(k)", "HSA"] &&
         data.custodian is string &&
         data.balance is number && data.balance >= 0 &&
         data.holdings is list;
}
```
- **Retirement Profile Verification**:
```javascript
function isValidRetirementProfile(data) {
  return data.keys().hasAll(['age', 'targetRetirementAge', 'riskTolerance', 'investmentStyle']) &&
         data.age is number && data.age >= 0 &&
         data.targetRetirementAge is number && data.targetRetirementAge >= 0 &&
         data.riskTolerance in ["Conservative", "Moderate", "Aggressive"] &&
         data.investmentStyle in ["ETFs Only", "Mixed", "Stocks Only"];
}
```

---

## 6. UI/UX Design System
- **Visual Palette**: Strict "Terminal-Dark" aesthetic (Bg: `#0D0E11`, Surface: `#14161A`, Line Border: `#20232B`, Accent: Gold/Amber `#FFC107`, Accent Retirement: Teal/Cyan `#14B8A6`).
- **Layout Rhythm**: Clear asymmetry matching a real high-frequency workstation. Display statistics have high contrast while detailed technical descriptions default to clean low-opacity grays.
- **Top Bar Integration**: Minimizes visual clutter by moving interactive widget access (Rules, Onboarding guides, Copilot drawers) entirely into the upper header rows.
- **Micro-Animations**: Uses `@motion` library mapping subtle sliding panels, staggered bento list animations, and smooth overlay visual backdrops.
