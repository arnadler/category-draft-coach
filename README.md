# Category Draft Coach

A local-first web app that helps you make better picks during a season-long **rotisserie / categories** fantasy baseball draft. Instead of just showing "best available," it analyzes your roster construction and recommends players that maximize your expected roto points across all scoring categories.

## Quick Start

```bash
cd category-draft-coach
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

All state is saved in your browser's localStorage -- you can close the tab and come back without losing your draft.

## How It Works

### During Your Live Draft (on CBS, ESPN, Yahoo, etc.)

1. **Quick Add** -- Paste a player name from your draft room into the Quick Add bar at the top. It fuzzy-matches names, even with CBS-style formatting like `"Acuna Jr., Ronald"`. If there's one clear match, it auto-adds; otherwise you pick from a short dropdown.

2. **Player Pool** -- Browse or search available players in the left panel. Click a player to draft them as "My Pick" or mark them as "Other Team" (removes from pool without adding to your roster).

3. **Category Dashboard** -- The center panel shows your roster slots and a live z-score dashboard for every category. Green bars = you're ahead of the league; red bars = you're behind.

4. **Recommendations** -- The right panel shows the top 5 recommended players, ranked by **marginal z-score gain**. Each recommendation includes:
   - A composite Z-score improvement value
   - Per-category impact badges (e.g., `SB +0.45`, `ERA +0.22`)
   - A plain-English explanation of why this pick helps your roster

### The Math (z-score recommendation engine)

For each available player, the engine:

1. Simulates adding them to your roster
2. Computes z-scores for each active category using league-wide distributions (estimated via Monte Carlo draft simulation)
3. Weights categories where you're behind a competitive threshold more heavily (1.0-2.8x)
4. Applies position scarcity bonuses (catchers get a +0.15 boost)
5. Adjusts for player risk (controlled by the risk slider) and ADP awareness
6. Ranks by total weighted marginal z-score gain

Rate stats (AVG, OBP, ERA, WHIP) are computed correctly from component stats -- never by averaging averages.

## League Settings

Click **Settings** to configure:

- **Teams**: 8-20 (default 12)
- **Categories**: Toggle R, HR, RBI, SB, AVG/OBP, W, SV, K, ERA, WHIP, QS, HLD
- **AVG vs OBP**: One-click toggle
- **Roster slots**: Customize C, 1B, 2B, 3B, SS, OF, UTIL, SP, RP, P, BN counts
- **Targets**: Edit per-category target totals (used as z-score fallbacks)
- **Import CSV**: Drag-and-drop a projection CSV from Steamer, ZiPS, ATC, etc. with column auto-detection

## Swapping In Full Projections

The app ships with a sample ~230-player dataset. To use full projections:

### Option 1: Replace the JSON file

Replace `src/data/players.sample.json` with your full projection file. The format should match:

```json
[
  {
    "playerId": "unique_id",
    "name": "Player Name",
    "team": "NYY",
    "positions": ["SS", "2B"],
    "hitterOrPitcher": "hitter",
    "AB": 580, "H": 165, "R": 95, "HR": 25,
    "RBI": 85, "SB": 15, "BB": 60, "HBP": 5, "SF": 4,
    "AVG": 0.284, "OBP": 0.355,
    "ADP": 42, "overallRank": 40, "risk": 0.2
  }
]
```

For pitchers, include: `W, SV, K, IP, ER, HA (hits allowed), BBA (walks allowed), ERA, WHIP, QS, HLD`.

### Option 2: CSV Import (in the app)

1. Click **Settings** > **Import CSV** tab
2. Upload your CSV file
3. Map columns using the auto-detect or manual dropdowns
4. Click "Import Players"

## Project Structure

```
src/
  app/
    page.tsx              # Main page
    layout.tsx            # Root layout
    globals.css           # Global styles
  components/
    DraftBoard.tsx        # Main 3-column layout
    QuickAdd.tsx          # Fuzzy search paste input
    PlayerPool.tsx        # Left panel: available players
    MyRoster.tsx          # Center panel: roster + category dashboard
    Recommendations.tsx   # Right panel: top 5 picks + explanations
    SettingsModal.tsx     # League settings (tabbed modal)
    ui/Modal.tsx          # Reusable modal wrapper
  hooks/
    useDraftState.ts      # Central state management hook
    useLocalStorageState.ts # localStorage persistence
  lib/
    types.ts              # Core TypeScript interfaces
    defaults.ts           # Default settings, targets, stdevs
    stats.ts              # Stat aggregation, z-scores, rate stat math
    recommendation.ts     # Z-score marginal value engine
    simulation.ts         # Monte Carlo draft simulation for league distributions
    roster.ts             # Roster slot assignment logic
    draft.ts              # Immutable draft state helpers
    names.ts              # Name normalization for CBS fuzzy matching
    csv.ts                # CSV parser
    importPlayers.ts      # CSV column mapping + player import
    playerData.ts         # Bundled player data loader
    rosterConfig.ts       # Roster config builder from slot counts
    storage.ts            # localStorage key constants
  data/
    players.sample.json   # Bundled sample dataset (~230 players)
```

## Tech Stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4** for styling
- **Fuse.js** for fuzzy name matching
- **localStorage** for persistence (no backend)
