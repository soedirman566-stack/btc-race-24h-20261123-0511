/**
 * Trend-following cbBTC bot for make.fun's btc-race-24h-20261123-0511.
 *
 * Long only, one position, minute bars. A full round trip costs roughly
 * 26 bps (4 bps fill fee, 2 bps modelled slippage, constant-product impact
 * against the bar's pool depth), so the bot only trades moves that promise
 * much more than that:
 *
 * - Entry (flat): EMA(fast) above EMA(slow) by at least GAP_MIN_BPS and the
 *   last MOM_BARS closes up at least MOM_MIN (a strong, aligned push, not a
 *   one-bar flicker). Buys SIZE_FRAC of the cash on hand.
 * - Exit (holding), whichever comes first: the EMAs cross down, the close
 *   falls TRAIL below the best close since entry, the position is worth
 *   STOP below its cost (fees included), or MAX_HOLD bars pass.
 * - After an exit the bot waits COOLDOWN bars before re-entering, and in
 *   chop it simply never enters: no trade, no cost.
 *
 * Deterministic: bigint money and IEEE float64 indicator arithmetic on the
 * bars alone; no clock, no environment, no randomness.
 */

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

const FAST_SPAN = 12;
const SLOW_SPAN = 36;
const GAP_MIN_BPS = 8;
const MOM_BARS = 10;
const MOM_MIN = 0.0025;
const SIZE_NUM = 95n;
const SIZE_DEN = 100n;
const TRAIL = 0.018;
const STOP_NUM = 980n;
const STOP_DEN = 1000n;
const MAX_HOLD = 360;
const COOLDOWN = 30;
const MAX_SLIPPAGE_BPS = 150;

/** EMA seeded as the mean of its first span of closes, then 2/(span+1). */
class Ema {
  span: number;
  warm: number[] = [];
  value: number | null = null;

  constructor(span: number) {
    this.span = span;
  }

  step(close: number): void {
    if (this.value !== null) {
      this.value += (2 / (this.span + 1)) * (close - this.value);
      return;
    }
    this.warm.push(close);
    if (this.warm.length === this.span) {
      this.value = this.warm.reduce((a, x) => a + x, 0) / this.span;
    }
  }
}

const fast = new Ema(FAST_SPAN);
const slow = new Ema(SLOW_SPAN);
const closes: number[] = [];
let holding = false;
let peak = 0;
let barsHeld = 0;
let cooldown = 0;

function entryOk(price: number): boolean {
  if (fast.value === null || slow.value === null) return false;
  if (closes.length <= MOM_BARS) return false;
  const gapBps = ((fast.value - slow.value) / slow.value) * 10_000;
  if (gapBps < GAP_MIN_BPS) return false;
  const mom = price / closes[closes.length - 1 - MOM_BARS] - 1;
  return mom >= MOM_MIN;
}

function exitDue(state: BarsState, held: { qty: bigint; cost: bigint }, price: number): boolean {
  if (fast.value !== null && slow.value !== null && fast.value < slow.value * 0.999) return true;
  if (peak > 0 && price < peak * (1 - TRAIL)) return true;
  if (state.value(SYMBOL, held.qty) * STOP_DEN <= held.cost * STOP_NUM) return true;
  return barsHeld >= MAX_HOLD;
}

await runBars({
  onBatch(state): OrderInput[] {
    const closeRaw = state.close(SYMBOL);
    if (closeRaw === null) return [];
    const price = Number(closeRaw);
    fast.step(price);
    slow.step(price);
    closes.push(price);
    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    if (held !== undefined && !holding) {
      holding = true;
      peak = price;
      barsHeld = 0;
    } else if (held === undefined && holding) {
      holding = false;
      cooldown = COOLDOWN;
    }
    if (cooldown > 0) cooldown--;

    if (held !== undefined) {
      barsHeld++;
      if (price > peak) peak = price;
      if (exitDue(state, held, price)) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    if (cooldown === 0 && entryOk(price)) {
      let notional = (state.cash * SIZE_NUM) / SIZE_DEN;
      const room = state.weightRoom(SYMBOL);
      if (notional > room) notional = room;
      const minNotional = BigInt(state.hello.fees.min_notional_quote_units);
      if (notional >= minNotional && notional > 0n) {
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
    }
    return [];
  },
});
