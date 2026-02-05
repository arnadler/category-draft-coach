"use client";

/**
 * Main page: renders the DraftBoard.
 *
 * TO SWAP IN A FULL PROJECTION DATASET:
 * 1. Replace src/data/players.sample.json with your full projections file
 *    matching the Player interface in src/lib/types.ts.
 * 2. Or use the CSV import feature in League Settings.
 */

import { DraftBoard } from "@/components/DraftBoard";

export default function Home() {
  return <DraftBoard />;
}
