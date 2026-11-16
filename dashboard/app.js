// Token Radar dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail view with the model's own
// inputs and the protocol's farm plan, and the live-token set kept apart. No network: every byte
// it shows is in data.js. The page recomputes each row from the snapshot figures, so the code
// and board.json visibly run the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, watchlistOnly: false, minTvl: 0 };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // radar-2, as in lib/model.ts: base = 1.31 x tvl^0.92; growth clamped and asymmetric; maturity
  // on an exponential curve by age; breadth from the chain count. No name is special-cased.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var weight = growth >= 0 ? model.growth_weight_up : model.growth_weight_down;
    var growthMult = 1 + (growth / 100) * weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + model.maturity_range * (1 - Math.exp(-Math.max(0, age) / model.maturity_half_life_days));
    var extra = Math.min(Math.max((row.chains || []).length - 1, 0), model.breadth_max_chains - 1);
    var breadth = 1 + extra * model.breadth_per_chain;
    return Math.max(1, Math.round(model.base_coefficient * Math.pow(Math.max(0, row.tvl_usd), model.tvl_exponent) * growthMult * maturity * breadth));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and
  // age decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield aggregator') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Deposit $' + capital + " into " + name + "'s highest-yield vault on " + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('canonical') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('staking pool') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trading') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk curator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('oracle') >= 0) return 'Use $' + capital + ' of ' + name + ' data by opening a position that reads its feed on ' + chain + '.';
    if (c.indexOf('gaming') >= 0 || c.indexOf('game') >= 0) return 'Spend $' + capital + ' inside ' + name + "'s game on " + chain + ' and keep the account active.';
    if (c.indexOf('social') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and use its social features weekly.';
    if (c.indexOf('ai') >= 0 || c.indexOf('infrastructure') >= 0) return 'Spend $' + capital + ' on ' + name + "'s service on " + chain + ' and keep the usage going.';
    if (c.indexOf('payment') >= 0 || c.indexOf('pay') >= 0) return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' and keep the account active.';
    if (c.indexOf('chain') >= 0) return 'Use $' + capital + ' on ' + name + "'s chain and keep the address active.";
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Borrow a small amount against the deposit on ' + p.name + ' and repay it the same week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) return 'Swap a small amount in ' + p.name + "'s main pool on " + chain + ' on a different day.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close the hedge on ' + p.name + ' and open a fresh one the following week.';
    if (c.indexOf('prediction') >= 0) return 'Settle one market on ' + p.name + ' and open another.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a small amount back through ' + p.name + ' so the address shows two-way use.';
    return "Vote in " + p.name + "'s governance or community poll when one is open, or use a second feature of its app.";
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function secondChainOf(p) { return p.chains && p.chains.length > 1 ? p.chains[1] : null; }
  function chainStepFor(p, capital, chain) {
    var second = secondChainOf(p);
    if (second !== null) {
      var half = Math.max(10, Math.round(capital / 2));
      return { text: 'Repeat the same position with $' + half + ' on ' + second + ' through ' + p.name + ", so the wallet shows activity on two of its " + p.chains.length + ' chains instead of one.', cost: '$' + half + ' of capital and about $3 of gas', time: '15 minutes, on a different day' };
    }
    return { text: 'Deepen the position on ' + chain + ' with a second feature of ' + p.name + ', such as its other pool or vault, so the wallet shows more than one transaction type.', cost: 'about $2 of gas', time: '10 minutes, on a different day' };
  }
  function timingStepFor(p) {
    var g = p.change_7d;
    if (g !== null && g !== undefined && g >= 20) {
      return { text: p.name + ' grew ' + g.toFixed(1) + '% in seven days, so set the position up this week: fast growth is when a farm fills up, and the next snapshot counts it.', cost: 'no extra fee beyond the position', time: 'this week' };
    }
    if (g !== null && g !== undefined && g <= -20) {
      return { text: p.name + ' shrank ' + Math.abs(g).toFixed(1) + '% in seven days, so confirm its app and pools are still live before adding capital, and start with the smallest position.', cost: 'no fee to check', time: '10 minutes before funding' };
    }
    if (g === null || g === undefined) {
      return { text: 'The snapshot records no seven-day growth for ' + p.name + ', so treat the timing as unknown: fund the smallest position first and add more only after the points page shows the activity.', cost: 'no fee to check', time: '10 minutes before funding' };
    }
    return { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote on ' + p.name + '.', cost: 'about $2 of gas a week', time: '10 minutes a week' };
  }
  function riskStepFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trading') >= 0) {
      return { text: 'Keep the hedge on ' + name + ' small: a leveraged position can be liquidated, so never post more than the $' + capital + ' margin and check the liquidation price weekly.', cost: 'no fee to check', time: '5 minutes a week' };
    }
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) {
      return { text: 'Watch the health factor of the ' + name + ' loan on ' + chain + ': if the collateral falls, top it up or repay before the position is liquidated.', cost: 'no fee to check', time: '5 minutes a week' };
    }
    if (c.indexOf('bridge') >= 0 || c.indexOf('canonical') >= 0) {
      return { text: 'After bridging through ' + name + ', confirm the funds arrived on ' + chain + ' before using them: a stuck bridge is checked on its own explorer, not by sending more.', cost: 'no fee to check', time: '10 minutes' };
    }
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) {
      return { text: "Check what the " + name + ' vault actually holds on ' + chain + ': a high yield that comes from a token that is falling is a loss dressed as income.', cost: 'no fee to check', time: '10 minutes a week' };
    }
    if (c.indexOf('dex') >= 0) {
      return { text: 'Watch impermanent loss in the ' + name + ' pool on ' + chain + ': if one side of the pair moves far, the position is worth less than holding the two assets.', cost: 'no fee to check', time: '5 minutes a week' };
    }
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) {
      return { text: 'Note the unstaking delay of ' + name + ' on ' + chain + ' before you stake: funds locked for days cannot be withdrawn if the farm changes.', cost: 'no fee to check', time: '5 minutes' };
    }
    if (c.indexOf('prediction') >= 0) {
      return { text: 'Only risk the $' + capital + ' you funded on ' + name + ': a prediction market pays the winners from the losers, so a wrong market loses the stake.', cost: 'the $' + capital + ' stake is at risk', time: '5 minutes' };
    }
    return { text: "Check " + name + "'s own docs on " + chain + ' for the one risk its category carries, and size the position so a failure costs the $' + capital + ' and nothing more.', cost: 'no fee to check', time: '10 minutes' };
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var age = p.age_days;
    var ageNote = age === null || age === undefined
      ? 'with no listing date on record, so the hold is the cautious default'
      : age < 180
        ? 'listed only ' + age + ' days ago, so the protocol is still young'
        : 'running for ' + age + ' days with no token';
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm on ' + p.name + ', and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, chain), cost: 'about $2 of gas', time: '10 minutes, on a different day' },
      chainStepFor(p, capital, chain),
      timingStepFor(p),
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot: ' + p.name + ' is ' + ageNote + '.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      riskStepFor(p, capital, chain),
      { text: "Check " + p.name + "'s own points or rewards page once a week and confirm the activity is recorded.", cost: 'no fee to check', time: '5 minutes a week' },
      { text: 'Before you withdraw from ' + p.name + ", verify the contract address on its own docs, and never pay a fee to claim.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every ' + p.name + ' transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // The watchlist set, for the badge and the watchlist-only filter.
  var WATCHLIST = {};
  (DATA.watchlist || []).forEach(function (s) { WATCHLIST[s] = true; });
  function isWatchlist(r) { return !!WATCHLIST[r.slug]; }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('wl') === '1') state.watchlistOnly = true;
    if (params.get('mintvl')) state.minTvl = parseInt(params.get('mintvl'), 10) || 0;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.watchlistOnly) params.set('wl', '1');
    if (state.minTvl) params.set('mintvl', String(state.minTvl));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlistOnly && !isWatchlist(r)) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  // A null sorts last in either direction: an unknown age is not the oldest protocol, and an
  // unknown seven-day growth is not the worst one. Without this, sorting by age put every
  // unlisted protocol at the top, ahead of the protocols the snapshot actually dates.
  // The Live token view runs the same filters as the board: search, category, chain and minimum
  // TVL all apply, and the watchlist-only box leaves it empty, because a live-token protocol is
  // by definition not on the pre-token watchlist. Before this, the tab ignored every control and
  // always showed the same 24 rows whatever the reader had picked.
  function liveRows() {
    var q = state.q.trim().toLowerCase();
    if (state.watchlistOnly) return [];
    return DATA.live.filter(function (r) {
      if (r.tvl_usd < state.minTvl) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv, aNull, bNull;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); aNull = false; bNull = false; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; aNull = false; bNull = false; }
      else if (key === 'growth') { aNull = a.change_7d === null || a.change_7d === undefined; bNull = b.change_7d === null || b.change_7d === undefined; av = aNull ? 0 : a.change_7d; bv = bNull ? 0 : b.change_7d; }
      else if (key === 'age') { aNull = a.age_days === null || a.age_days === undefined; bNull = b.age_days === null || b.age_days === undefined; av = aNull ? 0 : a.age_days; bv = bNull ? 0 : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; aNull = false; bNull = false; }
      if (aNull && !bNull) return 1;
      if (bNull && !aNull) return -1;
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { class: 'chip' }, el('span', { text: 'Snapshot ' }), el('b', { text: DATA.as_of })),
        el('span', { class: 'chip' }, el('span', { text: 'DefiLlama protocol index' })),
        el('span', { class: 'chip' }, el('span', { text: 'Model ' }), el('b', { text: DATA.model_version }))
      )
    );
  }

  function lede() {
    var total = DATA.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
    // Coverage is counted from the board, not assumed: the tile used to print the watchlist size
    // over itself, so it always read "covered" even if the board had dropped a watchlist row.
    var covered = DATA.rows.filter(function (r) { return isWatchlist(r); }).length;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' rankable pre-token protocols outside the watchlist — every one that could still launch a token, not a top-N cut. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: covered + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(total) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    // The filter lists cover both tabs, so a category or chain that only exists in the live set
    // can still be picked while the Live tab is open.
    var categories = Array.from(new Set(DATA.rows.concat(DATA.live).map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.concat(DATA.live).reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var chain = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chain.addEventListener('change', function () { state.chain = chain.value; writeHash(); render(); });
    var tvl = el('select', { id: 'mintvl', 'aria-label': 'Minimum TVL' },
      el('option', { value: '0', text: 'Any TVL' }),
      el('option', { value: '50000000', text: 'TVL $50M+', selected: state.minTvl === 50000000 ? 'selected' : null }),
      el('option', { value: '100000000', text: 'TVL $100M+', selected: state.minTvl === 100000000 ? 'selected' : null }),
      el('option', { value: '500000000', text: 'TVL $500M+', selected: state.minTvl === 500000000 ? 'selected' : null })
    );
    tvl.addEventListener('change', function () { state.minTvl = parseInt(tvl.value, 10) || 0; writeHash(); render(); });
    var wl = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.watchlistOnly ? 'checked' : null }),
      'Watchlist only'
    );
    wl.querySelector('input').addEventListener('change', function (e) { state.watchlistOnly = e.target.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field grow' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
      el('div', { class: 'field' }, el('label', { for: 'mintvl', text: 'Min TVL' }), tvl),
      wl,
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : liveRows().length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; state.minTvl = 0; writeHash(); render(); } })
      ));
    }
    // The bar scale is the strongest implied value among the rows actually shown, not the first
    // row of the list: when the table is sorted by name, TVL or age the first row is not the
    // strongest, and scaling by it would push bars past 100% and break the chart.
    var max = list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var badge = isWatchlist(r)
        ? el('span', { class: 'badge wl', text: 'WATCHLIST' })
        : el('span', { class: 'badge early', text: 'EARLY' });
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', null, el('span', { text: r.name }), badge),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.min(100, Math.round((r.implied_value_usd / max) * 100))) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status pre', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var list = liveRows();
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No live-token protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the live set again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; state.minTvl = 0; writeHash(); render(); } })
      ));
    }
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( 1.31 x tvl_usd^0.92 x growth x maturity x breadth )\n' +
        'growth   = 1 + clamp(change_7d, -50, 150) / 100 x 0.6 (up) or 0.4 (down)\n' +
        'maturity = 0.55 + 0.45 x (1 - e^(-age_days / 400))   age unknown: 365 days\n' +
        'breadth  = 1 + 0.02 x min(chains - 1, 4)'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token. Size has diminishing returns, growth is rewarded more than decline is punished, and a protocol live on more chains reaches more users.' })
    );
  }

  function methodPanel() {
    return el('section', { class: 'panel method' },
      el('h2', { text: 'How the radar is built' }),
      el('ol', null,
        el('li', null, el('b', { text: 'Watchlist first. ' }), 'Every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record is on the board. That is the floor, never the ceiling.'),
        el('li', null, el('b', { text: 'Early radar next. ' }), 'Every rankable pre-token protocol outside the watchlist is added too — ' + DATA.early_size + ' of them — so the board holds every protocol that could still launch a token, not a top-N cut.'),
        el('li', null, el('b', { text: 'Wrapped products out. ' }), 'A versioned pool, a bridge, a liquid-staking receipt or an exchange product is not a token waiting to launch, so the watchlist rule keeps them off the board.'),
        el('li', null, el('b', { text: 'Live tokens set aside. ' }), 'Protocols whose token already trades are shown with their market cap, a fact, never mixed into the ranking.'),
        el('li', null, el('b', { text: 'Farm plans from the record. ' }), 'Each plan follows from the protocol’s category, chains, TVL and age, with what each step costs and how long it takes.')
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (isWatchlist(row) ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String((row.chains || []).length) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Breadth multiplier' }), el('b', { class: 'num', text: String(row.breadth_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price, and it says nothing about whether or when a token is issued.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      el('p', { class: 'note', html: '<b>Read this first.</b> A protocol on this board records no token — that is not a promise it will issue one. Never pay to claim an airdrop, and only use links the protocol itself publishes.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') {
      shell.appendChild(modelPanel());
      shell.appendChild(methodPanel());
    }
    shell.appendChild(el('footer', { class: 'foot', text: 'Source: ' + DATA.source + '. Snapshot as of ' + DATA.as_of + '. Implied values are this radar’s model, not make.fun’s, and never a prediction that a token will be issued.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
