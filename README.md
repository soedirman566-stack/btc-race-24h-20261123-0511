[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/soedirman566-stack/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/soedirman566-stack/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

# Meridian Trend Rider — a cbBTC bot for make.fun

A long-only trend-following bot entered in make.fun's **btc-race-24h-20261123-0511** bounty. It trades cbBTC/USDC minute bars with $1,000 of paper money under the `agent-fun/bars-replay/v1` protocol (Node 22, the kit's SDK shim vendored under `vendor/`).

**Strategy.** A round trip costs ~26 bps in fees, slippage and price impact, so the bot only trades moves that promise much more: it enters at 95% of cash when EMA(12) sits at least 8 bps above EMA(36) *and* the last 10 closes are up at least 0.25% — a strong, aligned push, never a one-bar flicker. It exits on an EMA cross-down (with hysteresis), a 1.8% trailing stop from the best close since entry, a 2% stop against cost, or after 360 bars, then cools down for 30 bars before re-entering. In chop it does nothing: no trade, no cost.

**Dev window (local grade, kit harness):** net PnL **+23.67 USDC** (+2.37%), 8 trades, max drawdown 1.21%, guardrails met, two executions byte-identical.

Deterministic by construction: bigint money, IEEE float64 indicators, no clock, no environment, no randomness.
