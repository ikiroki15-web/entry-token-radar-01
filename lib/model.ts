// Token Radar, model radar-3: one sealed snapshot in, one ranked board out.
//
// The board ranks every protocol that records no token and could still launch one: the whole
// watchlist plus every rankable pre-token protocol in the snapshot, at any TVL. The watchlist is
// the floor, never the ceiling: a protocol above the floor that the watchlist does not name is
// still rankable, and cutting the board at the floor would silently drop it. A protocol is
// rankable when it records no token (no market cap, no CoinGecko id, no symbol) and is not a
// wrapped, staked or bridged product of a token that already trades: not a CEX, not a versioned
// pool (a name ending in V2, v2, 2.0 or the like), not a Bridge / Canonical Bridge / Liquid
// Staking / Liquid Restaking / Restaked BTC product, its name carrying no whole word wrapped,
// staked or staking, and not beginning with an exchange's name. That is the house's own watchlist
// rule, minus the TVL floor, applied to the whole snapshot. Live-token protocols are kept apart
// and shown with the market's own values, never mixed into the ranking.
//
// Implied value follows only from the snapshot's own figures, never from a name, and radar-3
// calibrates its size term from the snapshot itself instead of a hardcoded coefficient. The
// anchor is the market's own pricing of live tokens: for each category, the median
// market-cap-to-TVL ratio of the live protocols in that category (a category needs at least five
// live protocols with a recorded market cap above zero, or the row falls back to the median over
// all live protocols). The multiple is clamped to [0.05, 0.65] so one outlier category cannot
// set the board's scale. Then:
//
//   multiple = category median mcap/TVL, or the overall median when the category is too thin
//   growth   = clamp(change_7d, -50, 150)   (per cent; unknown growth counts as 0)
//   growth x = 1 + growth/100 x 0.6         (growth rewarded) or x 0.4 when growth is negative
//                                            (a shrinking protocol is discounted, not punished)
//   age      = days since listed_at, or 365 when unlisted
//   maturity = 0.55 + 0.45 x (1 - e^(-age/400))
//                                            (a protocol that has run for years with no token
//                                            has proven staying power; a young one is discounted
//                                            for being unproven, and the curve flattens with age)
//   breadth  = 1 + 0.02 x min(chains - 1, 4) (a protocol live on more chains reaches more users)
//   implied  = max(1, round(tvl_usd x multiple x growth x maturity x breadth))
//
// No protocol name is ever special-cased: the same function scores every row, and the dashboard
// recomputes each row from the same figures so the page and board.json visibly agree. The
// dashboard also prints the comparables table the multiples come from, so a reader can check
// every multiple against the live protocols that anchor it.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** radar-3's constants, as the dashboard states them. */
export interface ModelConstants {
  multiple_floor: number;
  multiple_cap: number;
  min_live_for_category: number;
  growth_weight_up: number;
  growth_weight_down: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_half_life_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
}

export const MODEL: ModelConstants = {
  multiple_floor: 0.05,
  multiple_cap: 0.65,
  min_live_for_category: 5,
  growth_weight_up: 0.6,
  growth_weight_down: 0.4,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_half_life_days: 400,
  unknown_age_days: 365,
  breadth_per_chain: 0.02,
  breadth_max_chains: 5,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** One row of the comparables table: what the market pays for live tokens in a category. */
export interface Comparable {
  category: string;
  live_n: number;
  median_mcap_tvl: number;
  multiple: number;
  source: 'category' | 'overall';
}

/** The comparables table and the overall median it falls back to. */
export interface Comparables {
  overall_median_mcap_tvl: number;
  overall_live_n: number;
  rows: Comparable[];
}

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_usd: number;
    multiple: number;
    multiple_source: 'category' | 'overall';
    comparable_live_n: number;
    comparable_median_mcap_tvl: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the farm plan generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  multiple: number;
  multiple_source: 'category' | 'overall';
  comparable_live_n: number;
  comparable_median_mcap_tvl: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the comparables, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  comparables: Comparables;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a sorted list of numbers; null when the list is empty. */
function medianOf(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** The comparables table, read off the snapshot's own live-token protocols: for every category
 * with at least `min_live_for_category` live protocols carrying a market cap above zero, the
 * median market-cap-to-TVL ratio of those protocols; every other category falls back to the
 * median over all live protocols. A live protocol with no market cap, a zero market cap, no TVL
 * or a CEX record is not a comparable: a token with no quoted price is not a price. The multiple
 * is the median clamped to [multiple_floor, multiple_cap], so one rich category cannot set the
 * board's scale. The table is sorted by multiple, strongest first, so the dashboard can print
 * it as the market's own ranking of what a token is worth per dollar of TVL. */
export function comparables(snapshot: Snapshot, model: ModelConstants = MODEL): Comparables {
  const live = snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.category !== 'CEX' && p.tvl_usd > 0 && p.mcap_usd !== null && p.mcap_usd > 0,
  );
  const overall = medianOf(live.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b)) ?? 0;
  const clamp = (v: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, v));
  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(key, list);
  }
  const rows: Comparable[] = [...byCategory.entries()]
    .map(([category, ratios]) => {
      const median = medianOf(ratios.sort((a, b) => a - b)) ?? overall;
      const thin = ratios.length < model.min_live_for_category;
      return {
        category,
        live_n: ratios.length,
        median_mcap_tvl: round4(median),
        multiple: round4(clamp(thin ? overall : median)),
        source: (thin ? 'overall' : 'category') as 'category' | 'overall',
      };
    })
    .sort((a, b) => b.multiple - a.multiple || b.live_n - a.live_n || (a.category < b.category ? -1 : 1));
  return { overall_median_mcap_tvl: round4(overall), overall_live_n: live.length, rows };
}

/** The multiple one category's rows are scored with: its own median when the category has
 * enough live protocols to anchor one, else the overall median, clamped to the model's band. */
export function multipleFor(category: string | null, table: Comparables, model: ModelConstants = MODEL): Comparable {
  const clamp = (v: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, v));
  const row = table.rows.find((r) => r.category === (category ?? 'Other'));
  if (row !== undefined && row.source === 'category') return row;
  return {
    category: category ?? 'Other',
    live_n: table.overall_live_n,
    median_mcap_tvl: table.overall_median_mcap_tvl,
    multiple: round4(clamp(table.overall_median_mcap_tvl)),
    source: 'overall',
  };
}

/** The growth term: clamped growth, rewarded when positive, discounted when negative. */
export function growthMultiplier(change7d: number | null, model: ModelConstants): { pct: number; mult: number } {
  const pct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(change7d, 0)));
  const weight = pct >= 0 ? model.growth_weight_up : model.growth_weight_down;
  return { pct, mult: 1 + (pct / 100) * weight };
}

/** The maturity term: how long the protocol has run with no token, on an exponential curve. */
export function maturityMultiplier(age: number | null, model: ModelConstants): number {
  const days = age ?? model.unknown_age_days;
  const settled = 1 - Math.exp(-Math.max(0, days) / model.maturity_half_life_days);
  return model.maturity_floor + model.maturity_range * settled;
}

/** The breadth term: a protocol live on more chains reaches more users. */
export function breadthMultiplier(chains: string[], model: ModelConstants): number {
  const extra = Math.min(Math.max(chains.length - 1, 0), model.breadth_max_chains - 1);
  return 1 + extra * model.breadth_per_chain;
}

/** Every multiplier and the implied value one protocol gets under `model`. */
export function scoreProtocol(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  multiple: Comparable,
): { implied: number; base: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const base = protocol.tvl_usd * multiple.multiple;
  const { pct: growthPct, mult: growthMult } = growthMultiplier(protocol.change_7d, model);
  const maturityMult = maturityMultiplier(age, model);
  const breadthMult = breadthMultiplier(protocol.chains, model);
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  return { implied, base: Math.round(base), growthPct, growthMult, maturityMult, breadthMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist rule treats as a wrapped, staked or bridged product. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a protocol may not begin with: it is the exchange's own product. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A whole word wrapped, staked or staking anywhere in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol could still launch a token of its own: pre-token and not a wrapped, staked
 * or bridged product of a token that already trades, under the watchlist's own rule.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, table: Comparables = comparables(snapshot, model)): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot,
  // but the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol the watchlist does not name, at any TVL.
  // The floor is the watchlist's own cut, not the board's: a rankable protocol above the floor
  // that the watchlist missed is still a protocol that could launch a token, so no cut by TVL
  // and no hand-picked list — if it could launch a token, it is on the board.
  for (const p of snapshot.protocols) {
    if (chosen.has(p.slug)) continue;
    if (!isRankable(p)) continue;
    chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const multiple = multipleFor(p.category, table, model);
    const s = scoreProtocol(p, snapshot.as_of, model, multiple);
    return { p, multiple, ...s };
  });
  // Strongest implied value first; ties break on TVL, then slug, so the order is deterministic.
  scored.sort(
    (a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_usd: s.base,
      multiple: s.multiple.multiple,
      multiple_source: s.multiple.source,
      comparable_live_n: s.multiple.live_n,
      comparable_median_mcap_tvl: s.multiple.median_mcap_tvl,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield aggregator')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('yield') || c.includes('leveraged farm')) return `Deposit $${capital} into ${name}'s highest-yield vault on ${chain} and keep the shares.`;
  if (c.includes('bridge') || c.includes('canonical')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak') || c.includes('staking pool')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk curator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('oracle')) return `Use $${capital} of ${name} data by opening a position that reads its feed on ${chain}.`;
  if (c.includes('gaming') || c.includes('game')) return `Spend $${capital} inside ${name}'s game on ${chain} and keep the account active.`;
  if (c.includes('social')) return `Deposit $${capital} into ${name} on ${chain} and use its social features weekly.`;
  if (c.includes('ai') || c.includes('infrastructure')) return `Spend $${capital} on ${name}'s service on ${chain} and keep the usage going.`;
  if (c.includes('payment') || c.includes('pay')) return `Route $${capital} of payments through ${name} on ${chain} and keep the account active.`;
  if (c.includes('chain')) return `Use $${capital} on ${name}'s chain and keep the address active.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second qualifying action, different from the first, so the activity is not one transaction. */
function secondActionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp')) return `Borrow a small amount against the deposit on ${p.name} and repay it the same week.`;
  if (c.includes('dex') || c.includes('yield')) return `Swap a small amount in ${p.name}'s main pool on ${chain} on a different day.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the hedge on ${p.name} and open a fresh one the following week.`;
  if (c.includes('prediction')) return `Settle one market on ${p.name} and open another.`;
  if (c.includes('bridge')) return `Bridge a small amount back through ${p.name} so the address shows two-way use.`;
  return `Vote in ${p.name}'s governance or community poll when one is open, or use a second feature of its app.`;
}

/** The second chain a protocol names, or null when it runs on one chain only. */
function secondChainOf(p: SnapshotProtocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}

/**
 * The chain step: a protocol live on more than one chain earns its farm on a second chain too,
 * so the wallet's activity is not confined to one network; a single-chain protocol gets a deeper
 * position on the chain it runs on instead.
 */
function chainStepFor(p: SnapshotProtocol, capital: number, chain: string): FarmStep {
  const second = secondChainOf(p);
  if (second !== null) {
    const half = Math.max(10, Math.round(capital / 2));
    return {
      text: `Repeat the same position with $${half} on ${second} through ${p.name}, so the wallet shows activity on two of its ${p.chains.length} chains instead of one.`,
      cost: `$${half} of capital and about $3 of gas`,
      time: '15 minutes, on a different day',
    };
  }
  return {
    text: `Deepen the position on ${chain} with a second feature of ${p.name}, such as its other pool or vault, so the wallet shows more than one transaction type.`,
    cost: 'about $2 of gas',
    time: '10 minutes, on a different day',
  };
}

/**
 * The timing step: the snapshot's own seven-day growth says whether to move now or wait. A
 * protocol whose TVL is climbing fast is being farmed already, so the position goes in before the
 * next snapshot; a shrinking one gets a check first, not more capital; an unknown one gets the
 * smallest position until the points page proves the activity counts.
 */
function timingStepFor(p: SnapshotProtocol): FarmStep {
  const g = p.change_7d;
  if (g !== null && g >= 20) {
    return {
      text: `${p.name} grew ${g.toFixed(1)}% in seven days, so set the position up this week: fast growth is when a farm fills up, and the next snapshot counts it.`,
      cost: 'no extra fee beyond the position',
      time: 'this week',
    };
  }
  if (g !== null && g <= -20) {
    return {
      text: `${p.name} shrank ${Math.abs(g).toFixed(1)}% in seven days, so confirm its app and pools are still live before adding capital, and start with the smallest position.`,
      cost: 'no fee to check',
      time: '10 minutes before funding',
    };
  }
  if (g === null) {
    return {
      text: `The snapshot records no seven-day growth for ${p.name}, so treat the timing as unknown: fund the smallest position first and add more only after the points page shows the activity.`,
      cost: 'no fee to check',
      time: '10 minutes before funding',
    };
  }
  return {
    text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote on ${p.name}.`,
    cost: 'about $2 of gas a week',
    time: '10 minutes a week',
  };
}

/**
 * The risk step: the caution that fits the protocol's own category, because a lending position
 * fails differently from a bridge transfer and a perpetuals hedge fails differently again.
 */
function riskStepFor(p: SnapshotProtocol, capital: number, chain: string): FarmStep {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading')) {
    return {
      text: `Keep the hedge on ${name} small: a leveraged position can be liquidated, so never post more than the $${capital} margin and check the liquidation price weekly.`,
      cost: 'no fee to check',
      time: '5 minutes a week',
    };
  }
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      text: `Watch the health factor of the ${name} loan on ${chain}: if the collateral falls, top it up or repay before the position is liquidated.`,
      cost: 'no fee to check',
      time: '5 minutes a week',
    };
  }
  if (c.includes('bridge') || c.includes('canonical')) {
    return {
      text: `After bridging through ${name}, confirm the funds arrived on ${chain} before using them: a stuck bridge is checked on its own explorer, not by sending more.`,
      cost: 'no fee to check',
      time: '10 minutes',
    };
  }
  if (c.includes('yield') || c.includes('leveraged farm')) {
    return {
      text: `Check what the ${name} vault actually holds on ${chain}: a high yield that comes from a token that is falling is a loss dressed as income.`,
      cost: 'no fee to check',
      time: '10 minutes a week',
    };
  }
  if (c.includes('dex')) {
    return {
      text: `Watch impermanent loss in the ${name} pool on ${chain}: if one side of the pair moves far, the position is worth less than holding the two assets.`,
      cost: 'no fee to check',
      time: '5 minutes a week',
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      text: `Note the unstaking delay of ${name} on ${chain} before you stake: funds locked for days cannot be withdrawn if the farm changes.`,
      cost: 'no fee to check',
      time: '5 minutes',
    };
  }
  if (c.includes('prediction')) {
    return {
      text: `Only risk the $${capital} you funded on ${name}: a prediction market pays the winners from the losers, so a wrong market loses the stake.`,
      cost: `the $${capital} stake is at risk`,
      time: '5 minutes',
    };
  }
  return {
    text: `Check ${name}'s own docs on ${chain} for the one risk its category carries, and size the position so a failure costs the $${capital} and nothing more.`,
    cost: 'no fee to check',
    time: '10 minutes',
  };
}

/**
 * A protocol's farm plan: ten steps, each an action with a cost and a time, and each one read off
 * the protocol's own record — its name, category, chains, TVL, seven-day growth and age — never
 * from a hand-written list of names and never the same boilerplate for every row. The wallet and
 * the safety steps stay, because every farm needs them; the action, the second chain, the timing,
 * the hold and the caution all change with the record. Every step carries what it costs and how
 * long it takes, because a plan without either is a slogan.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const second = secondActionFor(p, chain);
  const ageNote =
    age === null
      ? 'with no listing date on record, so the hold is the cautious default'
      : age < 180
        ? `listed only ${age} days ago, so the protocol is still young`
        : `running for ${age} days with no token`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm on ${p.name}, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: second,
      cost: 'about $2 of gas',
      time: '10 minutes, on a different day',
    },
    chainStepFor(p, capital, chain),
    timingStepFor(p),
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot: ${p.name} is ${ageNote}.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    riskStepFor(p, capital, chain),
    {
      text: `Check ${p.name}'s own points or rewards page once a week and confirm the activity is recorded.`,
      cost: 'no fee to check',
      time: '5 minutes a week',
    },
    {
      text: `Before you withdraw from ${p.name}, verify the contract address on its own docs, and never pay a fee to claim.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every ${p.name} transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    multiple_source: row.model.multiple_source,
    comparable_live_n: row.model.comparable_live_n,
    comparable_median_mcap_tvl: row.model.comparable_median_mcap_tvl,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const table = comparables(snapshot, model);
  const board = buildBoard(snapshot, model, table);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    comparables: table,
    watchlist: snapshot.watchlist,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
