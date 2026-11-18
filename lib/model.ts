// Token Radar, model radar-3: one sealed snapshot in, one ranked board out.
//
// The board is the whole pre-token universe the snapshot can see: every watchlist protocol
// plus every other protocol that records no token and is not a wrapped, staked or bridged
// product of a token that already trades. The watchlist is the floor, never the ceiling, so
// a protocol above the floor that the watchlist leaves out still earns a row, and a protocol
// below the floor earns one too. Live-token protocols are never ranked: they are set aside
// and shown with the market's own numbers, never mixed into the ranking.
//
// Implied value is built only from the snapshot's own figures, never from a name. radar-3
// prices size off the market itself: for each category, the median market-cap-to-TVL ratio
// of the live tokens in that category, when at least five of them carry a market cap above
// zero; thinner categories fall back to the median over all live tokens. The multiple is
// clamped to [0.05, 0.65] so one rich category cannot set the board's scale. Then:
//
//   size     = tvl_usd x multiple
//   growth   = clamp(change_7d, -50, 150); unknown growth counts as 0
//   growth x = 1 + growth/100 x 0.6 when growth is up, x 0.4 when it is down
//              (a shrinking protocol is discounted, not punished)
//   age      = days since listed_at, or 365 when the snapshot carries no date
//   maturity = 0.55 + 0.45 x (1 - e^(-age/400))
//              (a protocol that has run for years with no token has proven staying power;
//               a young one is discounted for being unproven, and the curve flattens)
//   breadth  = 1 + 0.02 x min(chains - 1, 4)
//   implied  = max(1, round(size x growth x maturity x breadth))
//
// The dashboard recomputes each row from the same figures, so the page and board.json
// visibly agree, and it prints the comparables table the multiples come from, so a reader
// can check every multiple against the live protocols that anchor it.

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

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const MS_PER_DAY = 86_400_000;

/** A finite number, else `fallback`. */
function asFinite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Round to four decimals: the precision the board prints multipliers at. */
function round4dp(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** The upper median of numbers already sorted ascending; null when the list is empty. */
function upperMedian(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const asOfMs = Date.parse(`${asOf}T00:00:00Z`);
  const listedMs = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(asOfMs) || !Number.isFinite(listedMs)) return null;
  return Math.max(0, Math.floor((asOfMs - listedMs) / MS_PER_DAY));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSION_MARK = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist rule treats as a wrapped, staked or bridged product. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a protocol may not begin with: it is the exchange's own product. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A whole word wrapped, staked or staking anywhere in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** The first reason a pre-token protocol still cannot launch a token of its own, or null. */
function exclusionReason(p: SnapshotProtocol): string | null {
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return 'wrapped product category';
  if (VERSION_MARK.test(p.name)) return 'versioned pool';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped or staked name';
  if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return 'exchange product';
  return null;
}

/**
 * Whether a protocol could still launch a token of its own: pre-token and not a wrapped, staked
 * or bridged product of a token that already trades, under the watchlist's own rule.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && exclusionReason(p) === null;
}

/** A live protocol whose market cap is a price: it has a token, a category that is not a CEX
 * record, TVL above zero, and a market cap recorded above zero. A token with no quoted price
 * is not a price, so it never anchors a multiple. */
function hasLivePrice(p: SnapshotProtocol): boolean {
  return !isPreToken(p) && p.category !== 'CEX' && p.tvl_usd > 0 && p.mcap_usd !== null && p.mcap_usd > 0;
}

/** A multiple kept inside the model's band, so one rich category cannot set the board's scale. */
function clampMultiple(v: number, model: ModelConstants): number {
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, v));
}

/** Strongest multiple first, then the deeper category, then the name, so the order is fixed. */
function compareComparables(a: Comparable, b: Comparable): number {
  return b.multiple - a.multiple || b.live_n - a.live_n || (a.category < b.category ? -1 : 1);
}

/** The comparables table, read off the snapshot's own live-token protocols: for every category
 * with at least `min_live_for_category` live protocols carrying a market cap above zero, the
 * median market-cap-to-TVL ratio of those protocols; every other category falls back to the
 * median over all live protocols. The table is sorted by multiple, strongest first, so the
 * dashboard can print it as the market's own ranking of what a token is worth per dollar
 * of TVL. */
export function comparables(snapshot: Snapshot, model: ModelConstants = MODEL): Comparables {
  const priced = snapshot.protocols.filter(hasLivePrice);
  const ratiosOf = (p: SnapshotProtocol): number => p.mcap_usd! / p.tvl_usd;
  const overall = upperMedian(priced.map(ratiosOf).sort((a, b) => a - b)) ?? 0;
  const byCategory = new Map<string, number[]>();
  for (const p of priced) {
    const key = p.category ?? 'Other';
    const bucket = byCategory.get(key);
    if (bucket === undefined) byCategory.set(key, [ratiosOf(p)]);
    else bucket.push(ratiosOf(p));
  }
  const rows: Comparable[] = [];
  for (const [category, ratios] of byCategory) {
    const median = upperMedian(ratios.sort((a, b) => a - b)) ?? overall;
    const anchored = ratios.length >= model.min_live_for_category;
    rows.push({
      category,
      live_n: ratios.length,
      median_mcap_tvl: round4dp(median),
      multiple: round4dp(clampMultiple(anchored ? median : overall, model)),
      source: anchored ? 'category' : 'overall',
    });
  }
  rows.sort(compareComparables);
  return { overall_median_mcap_tvl: round4dp(overall), overall_live_n: priced.length, rows };
}

/** The multiple one category's rows are scored with: its own median when the category has
 * enough live protocols to anchor one, else the overall median, clamped to the model's band. */
export function multipleFor(category: string | null, table: Comparables, model: ModelConstants = MODEL): Comparable {
  const row = table.rows.find((r) => r.category === (category ?? 'Other'));
  if (row !== undefined && row.source === 'category') return row;
  return {
    category: category ?? 'Other',
    live_n: table.overall_live_n,
    median_mcap_tvl: table.overall_median_mcap_tvl,
    multiple: round4dp(clampMultiple(table.overall_median_mcap_tvl, model)),
    source: 'overall',
  };
}

/** The growth term: clamped growth, rewarded when positive, discounted when negative. */
export function growthMultiplier(change7d: number | null, model: ModelConstants): { pct: number; mult: number } {
  const pct = Math.min(model.growth_cap, Math.max(model.growth_floor, asFinite(change7d, 0)));
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
  const size = protocol.tvl_usd * multiple.multiple;
  const growth = growthMultiplier(protocol.change_7d, model);
  const maturity = maturityMultiplier(age, model);
  const breadth = breadthMultiplier(protocol.chains, model);
  const implied = Math.max(1, Math.round(size * growth.mult * maturity * breadth));
  return { implied, base: Math.round(size), growthPct: growth.pct, growthMult: growth.mult, maturityMult: maturity, breadthMult: breadth, age };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let line = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (line.length > 600) line = `${line.slice(0, 596)}...`;
  if (line.length < 20) line = `${line} Hold the position and check the protocol's own page.`;
  return line;
}

/** The first chain a protocol names, or a neutral phrase. */
function firstChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
const CAPITAL_TIERS: Array<readonly [number, number]> = [
  [5_000_000_000, 250],
  [1_000_000_000, 150],
  [100_000_000, 100],
];

function capitalFor(p: SnapshotProtocol): number {
  for (const [floor, capital] of CAPITAL_TIERS) {
    if (p.tvl_usd >= floor) return capital;
  }
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  for (const [under, days] of [[180, 60], [365, 45]] as const) {
    if (age < under) return days;
  }
  return 30;
}

/**
 * A category rule: the first rule whose keyword appears in the protocol's category wins, so
 * the order of the table is the order the old if-chain checked in. A rule's writer gets the
 * protocol's name, the position's capital and its chain, and returns the step's action in the
 * words a farmer can follow. No protocol name is ever special-cased: the category alone
 * decides the action.
 */
type ActionRule = {
  keys: string[];
  write: (name: string, capital: number, chain: string) => string;
};

const ACTION_RULES: ActionRule[] = [
  { keys: ['lend', 'cdp', 'collateral'], write: (name, capital, chain) => `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.` },
  { keys: ['dex', 'yield aggregator'], write: (name, capital, chain) => `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.` },
  { keys: ['yield', 'leveraged farm'], write: (name, capital, chain) => `Deposit $${capital} into ${name}'s highest-yield vault on ${chain} and keep the shares.` },
  { keys: ['bridge', 'canonical'], write: (name, capital, chain) => `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.` },
  { keys: ['staking', 'restak', 'staking pool'], write: (name, capital, chain) => `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.` },
  { keys: ['perpetual', 'derivative', 'basis trading'], write: (name, capital, chain) => `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.` },
  { keys: ['prediction'], write: (name, capital) => `Fund $${capital} and place one market position on ${name}.` },
  { keys: ['curator', 'allocator', 'risk curator'], write: (name, capital, chain) => `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.` },
  { keys: ['stable'], write: (name, capital, chain) => `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.` },
  { keys: ['rwa'], write: (name, capital, chain) => `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.` },
  { keys: ['insurance'], write: (name, capital, chain) => `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.` },
  { keys: ['oracle'], write: (name, capital, chain) => `Use $${capital} of ${name} data by opening a position that reads its feed on ${chain}.` },
  { keys: ['gaming', 'game'], write: (name, capital, chain) => `Spend $${capital} inside ${name}'s game on ${chain} and keep the account active.` },
  { keys: ['social'], write: (name, capital, chain) => `Deposit $${capital} into ${name} on ${chain} and use its social features weekly.` },
  { keys: ['ai', 'infrastructure'], write: (name, capital, chain) => `Spend $${capital} on ${name}'s service on ${chain} and keep the usage going.` },
  { keys: ['payment', 'pay'], write: (name, capital, chain) => `Route $${capital} of payments through ${name} on ${chain} and keep the account active.` },
  { keys: ['chain'], write: (name, capital, chain) => `Use $${capital} on ${name}'s chain and keep the address active.` },
];

function pickAction(category: string, name: string, capital: number, chain: string): string {
  const c = category.toLowerCase();
  for (const rule of ACTION_RULES) {
    if (rule.keys.some((k) => c.includes(k))) return rule.write(name, capital, chain);
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second qualifying action, different from the first, so the activity is not one transaction. */
const SECOND_ACTION_RULES: ActionRule[] = [
  { keys: ['lend', 'cdp'], write: (name) => `Borrow a small amount against the deposit on ${name} and repay it the same week.` },
  { keys: ['dex', 'yield'], write: (name, _capital, chain) => `Swap a small amount in ${name}'s main pool on ${chain} on a different day.` },
  { keys: ['perpetual', 'derivative'], write: (name) => `Close the hedge on ${name} and open a fresh one the following week.` },
  { keys: ['prediction'], write: (name) => `Settle one market on ${name} and open another.` },
  { keys: ['bridge'], write: (name) => `Bridge a small amount back through ${name} so the address shows two-way use.` },
];

function pickSecondAction(category: string, name: string, chain: string): string {
  const c = category.toLowerCase();
  for (const rule of SECOND_ACTION_RULES) {
    if (rule.keys.some((k) => c.includes(k))) return rule.write(name, 0, chain);
  }
  return `Vote in ${name}'s governance or community poll when one is open, or use a second feature of its app.`;
}

/**
 * The chain step: a protocol live on more than one chain earns its farm on a second chain too,
 * so the wallet's activity is not confined to one network; a single-chain protocol gets a deeper
 * position on the chain it runs on instead.
 */
function chainStepFor(p: SnapshotProtocol, capital: number, chain: string): FarmStep {
  const second = p.chains.length > 1 ? p.chains[1]! : null;
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
 * protocol whose TVL is climbing fast is being farmed already, so the position goes in before
 * the next snapshot; a shrinking one gets a check first, not more capital; an unknown one gets
 * the smallest position until the points page proves the activity counts.
 */
function timingStepFor(p: SnapshotProtocol): FarmStep {
  const g = p.change_7d;
  if (g === null) {
    return {
      text: `The snapshot records no seven-day growth for ${p.name}, so treat the timing as unknown: fund the smallest position first and add more only after the points page shows the activity.`,
      cost: 'no fee to check',
      time: '10 minutes before funding',
    };
  }
  if (g >= 20) {
    return {
      text: `${p.name} grew ${g.toFixed(1)}% in seven days, so set the position up this week: fast growth is when a farm fills up, and the next snapshot counts it.`,
      cost: 'no extra fee beyond the position',
      time: 'this week',
    };
  }
  if (g <= -20) {
    return {
      text: `${p.name} shrank ${Math.abs(g).toFixed(1)}% in seven days, so confirm its app and pools are still live before adding capital, and start with the smallest position.`,
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
type RiskRule = {
  keys: string[];
  write: (name: string, capital: number, chain: string) => FarmStep;
};

const RISK_RULES: RiskRule[] = [
  {
    keys: ['perpetual', 'derivative', 'basis trading'],
    write: (name, capital) => ({
      text: `Keep the hedge on ${name} small: a leveraged position can be liquidated, so never post more than the $${capital} margin and check the liquidation price weekly.`,
      cost: 'no fee to check',
      time: '5 minutes a week',
    }),
  },
  {
    keys: ['lend', 'cdp', 'collateral'],
    write: (name, _capital, chain) => ({
      text: `Watch the health factor of the ${name} loan on ${chain}: if the collateral falls, top it up or repay before the position is liquidated.`,
      cost: 'no fee to check',
      time: '5 minutes a week',
    }),
  },
  {
    keys: ['bridge', 'canonical'],
    write: (name, _capital, chain) => ({
      text: `After bridging through ${name}, confirm the funds arrived on ${chain} before using them: a stuck bridge is checked on its own explorer, not by sending more.`,
      cost: 'no fee to check',
      time: '10 minutes',
    }),
  },
  {
    keys: ['yield', 'leveraged farm'],
    write: (name, _capital, chain) => ({
      text: `Check what the ${name} vault actually holds on ${chain}: a high yield that comes from a token that is falling is a loss dressed as income.`,
      cost: 'no fee to check',
      time: '10 minutes a week',
    }),
  },
  {
    keys: ['dex'],
    write: (name, _capital, chain) => ({
      text: `Watch impermanent loss in the ${name} pool on ${chain}: if one side of the pair moves far, the position is worth less than holding the two assets.`,
      cost: 'no fee to check',
      time: '5 minutes a week',
    }),
  },
  {
    keys: ['staking', 'restak'],
    write: (name, _capital, chain) => ({
      text: `Note the unstaking delay of ${name} on ${chain} before you stake: funds locked for days cannot be withdrawn if the farm changes.`,
      cost: 'no fee to check',
      time: '5 minutes',
    }),
  },
  {
    keys: ['prediction'],
    write: (name, capital) => ({
      text: `Only risk the $${capital} you funded on ${name}: a prediction market pays the winners from the losers, so a wrong market loses the stake.`,
      cost: `the $${capital} stake is at risk`,
      time: '5 minutes',
    }),
  },
];

function pickRiskStep(category: string, name: string, capital: number, chain: string): FarmStep {
  const c = category.toLowerCase();
  for (const rule of RISK_RULES) {
    if (rule.keys.some((k) => c.includes(k))) return rule.write(name, capital, chain);
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
  const chain = firstChain(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const category = p.category ?? '';
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
      text: pickAction(category, p.name, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: pickSecondAction(category, p.name, chain),
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
    pickRiskStep(category, p.name, capital, chain),
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

/** One scored candidate: the protocol, the multiple it was scored with, and its score. */
interface ScoredEntry {
  protocol: SnapshotProtocol;
  multiple: Comparable;
  score: ReturnType<typeof scoreProtocol>;
}

/** Strongest implied value first; ties break on TVL, then slug, so the order is deterministic. */
function compareScored(a: ScoredEntry, b: ScoredEntry): number {
  return (
    b.score.implied - a.score.implied ||
    b.protocol.tvl_usd - a.protocol.tvl_usd ||
    (a.protocol.slug < b.protocol.slug ? -1 : a.protocol.slug > b.protocol.slug ? 1 : 0)
  );
}

/** A scored candidate as a board row, with its rank and its farm plan. */
function toBoardRow(entry: ScoredEntry, rank: number): BoardRow {
  const p = entry.protocol;
  const s = entry.score;
  const m = entry.multiple;
  return {
    rank,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_usd: s.base,
      multiple: m.multiple,
      multiple_source: m.source,
      comparable_live_n: m.live_n,
      comparable_median_mcap_tvl: m.median_mcap_tvl,
      growth_pct: s.growthPct,
      growth_multiplier: round4dp(s.growthMult),
      maturity_multiplier: round4dp(s.maturityMult),
      breadth_multiplier: round4dp(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(p, s.age).map(stepText),
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, table: Comparables = comparables(snapshot, model)): BoardRow[] {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const picked = new Map<string, SnapshotProtocol>();
  const take = (p: SnapshotProtocol | undefined): void => {
    if (p !== undefined) picked.set(p.slug, p);
  };
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot,
  // but the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) take(bySlug.get(slug));
  // The early radar: every rankable pre-token protocol the watchlist does not name, at any TVL.
  // The floor is the watchlist's own cut, not the board's: a rankable protocol above the floor
  // that the watchlist missed is still a protocol that could launch a token, so no cut by TVL
  // and no hand-picked list — if it could launch a token, it is on the board.
  for (const p of snapshot.protocols) {
    if (!picked.has(p.slug) && isRankable(p)) picked.set(p.slug, p);
  }
  const scored: ScoredEntry[] = [...picked.values()].map((p) => {
    const multiple = multipleFor(p.category, table, model);
    return { protocol: p, multiple, score: scoreProtocol(p, snapshot.as_of, model, multiple) };
  });
  scored.sort(compareScored);
  return scored.map((entry, i) => toBoardRow(entry, i + 1));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.category !== 'CEX');
  live.sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd);
  return live.slice(0, LIVE_ROWS).map((p) => ({
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
  const m = row.model;
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
    multiple: m.multiple,
    multiple_source: m.multiple_source,
    comparable_live_n: m.comparable_live_n,
    comparable_median_mcap_tvl: m.comparable_median_mcap_tvl,
    growth_multiplier: m.growth_multiplier,
    maturity_multiplier: m.maturity_multiplier,
    breadth_multiplier: m.breadth_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const table = comparables(snapshot, model);
  const board = buildBoard(snapshot, model, table);
  const live = liveRows(snapshot);
  const onWatchlist = new Set(snapshot.watchlist);
  const early = board.reduce((n, r) => n + (onWatchlist.has(r.slug) ? 0 : 1), 0);
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

/** A number field of a protocol record, or null when it is absent or not a finite number. */
function optNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** One protocol record out of its JSON value, refused unless it carries a slug, a name and a TVL. */
function parseProtocol(v: unknown, i: number): SnapshotProtocol {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
  }
  const p = v as Record<string, unknown>;
  const slug = typeof p.slug === 'string' ? p.slug : null;
  const name = typeof p.name === 'string' ? p.name : null;
  const tvl = typeof p.tvl_usd === 'number' && Number.isFinite(p.tvl_usd) ? p.tvl_usd : null;
  if (slug === null || name === null || tvl === null) {
    throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
  }
  return {
    slug,
    name,
    category: typeof p.category === 'string' ? p.category : null,
    chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
    tvl_usd: tvl,
    change_7d: optNumber(p.change_7d),
    mcap_usd: optNumber(p.mcap_usd),
    listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
    gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
    symbol: typeof p.symbol === 'string' ? p.symbol : null,
  };
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
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols: o.protocols.map(parseProtocol),
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const checks: Array<() => string | null> = [
    () => {
      const slugs = new Set(board.map((r) => r.slug));
      const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
      if (missing.length === 0) return null;
      return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
    },
    () => {
      const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
      for (let i = 0; i < ranks.length; i++) {
        if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
      }
      return null;
    },
    () => {
      for (let i = 1; i < board.length; i++) {
        if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
      }
      if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
        return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
      }
      return null;
    },
    () => {
      for (const r of board) {
        if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
        for (const s of r.farm_steps) {
          if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
        }
        if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
      }
      return null;
    },
  ];
  for (const check of checks) {
    const issue = check();
    if (issue !== null) return issue;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
