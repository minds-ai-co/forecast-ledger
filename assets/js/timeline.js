// The timeline reads only the same public, verified export as the scorecard.
const PAGE_SIZE = 6;
const percent = value => `${(value * 100).toFixed(1)}%`;
const number = value => Number.isFinite(value);
const date = value => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) + ' UTC'
  : 'Not recorded';

export function orderedTargets(targets) {
  return [...targets].sort((a, b) => (Date.parse(b.first_lock_utc) || 0) - (Date.parse(a.first_lock_utc) || 0)
    || a.target_id.localeCompare(b.target_id));
}

export function defaultVariant(target, primary) {
  return target.variants.includes(primary) ? primary : target.variants.includes('pure') ? 'pure' : [...target.variants].sort()[0];
}

export function distribution(values, options) {
  return Array.isArray(values) && options.length > 0 && values.length === options.length
    && values.every(v => number(v) && v >= 0 && v <= 1)
    && Math.abs(values.reduce((a, b) => a + b, 0) - 1) < 0.02;
}

export function matchedEntries(forecast, results, variant) {
  if (forecast.disclosure !== 'full' || forecast.variant !== variant) return [];
  const scores = new Map((results?.items || []).filter(s => s.counted === true && s.variant === variant)
    .map(s => [`${s.entry_id}:${s.entry_sha256}`, s]));
  return forecast.entries.flatMap(entry => {
    const score = scores.get(`${entry.entry_id}:${entry.entry_sha256}`);
    if (!score || score.question_id !== entry.question?.id || score.group_id !== entry.group?.id) return [];
    return [{ entry, score }];
  }).sort((a, b) => Number(b.entry.group.id === 'overall') - Number(a.entry.group.id === 'overall'));
}

export function humanValues(results, score, options) {
  // A numeric outcome is not a population response distribution, even if scored as a bin.
  return results?.released_values_public === true && !score.numeric && score.status === 'scored'
    && distribution(score.released, options) ? score.released : null;
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function link(text, href) {
  const node = el('a', '', text);
  try {
    const url = new URL(href, document.baseURI);
    if (['https:', 'http:'].includes(url.protocol)) { node.href = url.href; node.rel = 'noopener'; }
  } catch { /* Invalid links remain plain text. */ }
  return node;
}
function button(text, action, cls = 'ft-button') {
  const node = el('button', cls, text); node.type = 'button'; node.addEventListener('click', action); return node;
}
function select(label, values, value, change) {
  const wrap = el('label', 'ft-field'); wrap.append(el('span', '', label));
  const input = el('select');
  for (const [id, name] of values) { const option = el('option', '', name); option.value = id; input.append(option); }
  input.value = value; input.addEventListener('change', () => change(input.value)); wrap.append(input); return wrap;
}

function chart(title, subtitle, options, values, kind) {
  const figure = el('figure', `ft-chart ft-${kind}`);
  const caption = el('figcaption'); caption.append(el('strong', '', title), el('span', 'ft-muted', subtitle));
  figure.append(caption);
  const scale = el('div', 'ft-scale'); scale.setAttribute('aria-hidden', 'true');
  scale.append(el('span', '', '0%'), el('span', '', '50%'), el('span', '', '100%')); figure.append(scale);
  const list = el('ul', 'ft-bars');
  options.forEach((option, i) => {
    const row = el('li', 'ft-bar-row');
    const label = el('div', 'ft-bar-label'); label.append(el('span', '', option), el('strong', '', percent(values[i])));
    const track = el('div', 'ft-track'); track.setAttribute('aria-hidden', 'true');
    const bar = el('div', 'ft-bar'); bar.style.width = `${values[i] * 100}%`; track.append(bar);
    row.append(label, track); list.append(row);
  });
  figure.append(list); return figure;
}
function unavailable(title, message) {
  const panel = el('div', 'ft-unavailable'); panel.append(el('strong', '', title), el('p', '', message)); return panel;
}

const cache = new Map();
async function getJSON(path) {
  if (!/^(index\.json|(?:forecasts|results)\/[a-zA-Z0-9_./-]+\.json)$/.test(path) || path.includes('..')) throw new Error('Invalid data path');
  if (!cache.has(path)) {
    const promise = fetch(new URL(path, document.baseURI), { signal: AbortSignal.timeout(20000) })
      .then(r => { if (!r.ok) throw new Error('Data unavailable'); return r.json(); })
      .catch(error => { cache.delete(path); throw error; });
    cache.set(path, promise);
  }
  return cache.get(path);
}

async function resultCard(target, index, card, results) {
  let variant = defaultVariant(target, index.primary_variant), generation = 0;
  const controls = el('div', 'ft-controls'), body = el('div', 'ft-card-body');
  card.append(controls, body);
  const variantLabel = tag => tag === index.primary_variant ? `Minds Mosaic · ${tag}` : `Research forecast · ${tag}`;
  const variantField = select('Forecast version', target.variants.map(v => [v, variantLabel(v)]), variant, v => { variant = v; load(); });
  controls.append(variantField);
  let questionField;
  async function load() {
    const turn = ++generation;
    questionField?.remove(); body.replaceChildren(el('p', 'ft-muted', 'Loading responses…'));
    body.setAttribute('aria-busy', 'true');
    try {
      const [forecast, scores] = await Promise.all([getJSON(target.forecasts[variant]), results ? Promise.resolve(results) : getJSON(target.results)]);
      if (turn !== generation) return;
      if (forecast.target_id !== target.target_id || scores.target_id !== target.target_id) throw new Error('Data mismatch');
      const matches = matchedEntries(forecast, scores, variant);
      if (!matches.length) { body.replaceChildren(unavailable('No scored response available', 'This version has no counted question matching the published result. See the source files below.')); return; }
      questionField = select('Question / audience', matches.map(({ entry }, i) => [String(i), `${entry.question.text.slice(0,150)} · ${entry.group.label || entry.group.id}`]), '0', v => show(matches[Number(v)], scores));
      controls.append(questionField); show(matches[0], scores);
    } catch {
      if (turn !== generation) return;
      body.replaceChildren(unavailable('Responses could not be loaded', 'The published scorecard below is still available.'), button('Try again', load));
    } finally { if (turn === generation) body.removeAttribute('aria-busy'); }
  }
  function show({ entry, score }, scores) {
    body.replaceChildren();
    const question = el('details', 'ft-question');
    const questionText = entry.question.text;
    const summary = el('summary', '', questionText.length > 260 ? questionText.slice(0, 257) + '… (full question)' : questionText);
    question.append(summary, el('p', '', questionText));
    body.append(question, el('p', 'ft-audience', `Audience: ${entry.group.label || entry.group.id}`));
    const options = entry.question.options, human = humanValues(scores, score, options);
    const behavior = score.evidence_type === 'behaviour';
    const grid = el('div', 'ft-chart-grid');
    if (human) grid.append(chart(behavior ? 'Observed outcomes' : 'Human responses', 'Published result · share of each answer', options, human, 'human'));
    else if (score.numeric && scores.released_values_public === true && number(score.numeric.actual)) {
      const actual = unavailable('Published outcome', `${score.numeric.actual} ${score.numeric.unit || ''}`);
      actual.append(el('p', 'ft-muted', 'A single measured value, rather than response shares.')); grid.append(actual);
    } else grid.append(unavailable(behavior ? 'Observed outcomes' : 'Human responses', scores.released_values_public
      ? 'A comparable response distribution is not available for this question.'
      : 'These result values are not cleared for republication here. Use the publisher link below to view the original release.'));
    if (distribution(entry.forecast, options)) grid.append(chart('Minds responses', score.numeric ? 'Forecast probability by outcome range' : 'Locked forecast · share of each answer', options, entry.forecast, 'minds'));
    else grid.append(unavailable('Minds responses', 'No valid response distribution is available for this question.'));
    body.append(grid);
    const metrics = el('div', 'ft-metrics');
    if (number(score.mae_pp) && !score.numeric) metrics.append(el('span', '', `Average miss: ${score.mae_pp.toFixed(2)} pp`));
    if (number(score.tvd) && !score.numeric) metrics.append(el('span', '', `Distribution error (TVD): ${score.tvd.toFixed(3)}`));
    if (score.numeric && number(score.numeric.point)) metrics.append(el('span', '', `Minds estimate: ${score.numeric.point} ${score.numeric.unit || ''}`));
    if (score.numeric && number(score.numeric.abs_error)) metrics.append(el('span', '', `Absolute error: ${score.numeric.abs_error} ${score.numeric.unit || ''}`));
    if (!['scored', 'scored_numeric'].includes(score.status)) metrics.append(el('span', '', 'Not scoreable: ' + (score.reason || score.status || 'result unavailable')));
    body.append(metrics, el('p', 'ft-muted ft-small', `Selected forecast locked ${date(entry.locked_at)} · Result released ${date(target.released_at)}`));
    const sources = el('div', 'ft-links');
    if (target.publication_url) sources.append(link('Publisher’s release ↗', target.publication_url));
    sources.append(link('Forecast data ↗', target.forecasts[variant]), link('Scored result ↗', target.results));
    const batch = target.batches.find(b => b.batch_id === entry.batch_id);
    if (batch) sources.append(link('Timestamp proof ↗', batch.manifest));
    body.append(sources);
    if (human || (score.numeric && scores.released_values_public)) {
      const credit = el('p', 'ft-credit', scores.licence_note);
      if (target.target_id.includes('-ec-')) { credit.append(' ', link('Reuse terms', 'https://commission.europa.eu/legal-notice_en'), ' · ', link('CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/')); }
      body.append(credit);
    }
  }
  await load();
}

export async function mount(root) {
  root.replaceChildren(el('h2', '', 'From prediction to reality'), el('p', 'ft-muted', 'Loading the latest forecasts…'));
  try {
    const index = await getJSON('index.json');
    const targets = orderedTargets(index.targets);
    const results = new Map();
    // Failed releases remain visible and retryable; one failed request never hides the timeline.
    await Promise.all(targets.filter(t => t.disclosure === 'full' && t.results).map(async t => {
      try { results.set(t.target_id, await getJSON(t.results)); } catch { /* Retry when its card opens. */ }
    }));
    const hasHuman = t => {
      const r = results.get(t.target_id);
      return r?.released_values_public === true && r.items.some(s => s.counted === true && s.status === 'scored' && !s.numeric && Array.isArray(s.released));
    };
    const modes = [
      ['results', 'With results', t => t.disclosure === 'full' && !!t.results],
      ['human', 'Human + Minds', hasHuman],
      ['pending', 'Pending', t => t.status === 'pending'],
      ['all', 'All forecasts', () => true],
    ];
    let mode = 'results', query = '', limit = PAGE_SIZE;
    root.replaceChildren();
    const heading = el('div', 'ft-heading');
    const intro = el('div'); intro.append(el('p', 'ft-eyebrow', 'THE FORECAST TIMELINE'), el('h2', '', 'From prediction to reality'),
      el('p', 'ft-intro', 'What people answered. What Minds predicted. Explore each question, audience and locked forecast.'));
    heading.append(intro); root.append(heading);
    const toolbar = el('div', 'ft-toolbar'), filters = el('div', 'ft-filters'); filters.setAttribute('aria-label', 'Filter forecasts');
    const buttons = new Map();
    for (const [id, label, predicate] of modes) {
      const control = button(`${label} (${targets.filter(predicate).length})`, () => { mode = id; limit = PAGE_SIZE; render(); }, 'ft-filter');
      control.setAttribute('aria-pressed', String(mode === id)); buttons.set(id, control); filters.append(control);
    }
    const search = el('label', 'ft-search'); search.append(el('span', 'ft-sr-only', 'Search surveys or publishers'));
    const input = el('input'); input.type = 'search'; input.placeholder = 'Find a survey or publisher…';
    input.addEventListener('input', () => { query = input.value.trim().toLowerCase(); limit = PAGE_SIZE; render(); }); search.append(input);
    toolbar.append(filters, search); root.append(toolbar);
    root.append(el('p', 'ft-context', 'Newest first, by the survey’s first forecast lock. Human + Minds shows releases with reusable human response data. Pending forecasts stay sealed until results are released.'));
    const status = el('p', 'ft-muted ft-small'); status.setAttribute('role', 'status'); root.append(status);
    const list = el('div', 'ft-list'); root.append(list);
    const more = button('Show more forecasts', () => { limit += PAGE_SIZE; render(true); }); root.append(more);
    root.append(el('p', 'ft-credit', `Record updated ${date(index.as_of)}. A status refresh does not add forecasts or results. Percentages use the same 0–100% scale; rounding may affect totals. pp = percentage points. Lower error is better.`));
    let displayed = 0;
    function render(append = false) {
      const predicate = modes.find(m => m[0] === mode)[2];
      const selected = targets.filter(t => predicate(t) && `${t.survey} ${t.publisher} ${t.target_id}`.toLowerCase().includes(query));
      buttons.forEach((b, id) => b.setAttribute('aria-pressed', String(id === mode)));
      if (!append) { list.replaceChildren(); displayed = 0; }
      const visible = selected.slice(0, limit);
      status.textContent = `${selected.length} surveys · showing ${visible.length}`;
      if (!selected.length) list.append(unavailable('No matching forecasts', 'Try another search or filter.'));
      for (const target of visible.slice(displayed)) {
        const item = el('article', 'ft-item'); item.id = 'forecast-' + target.target_id;
        const rail = el('div', 'ft-date'); rail.append(el('span', 'ft-dot'), el('span', '', 'FIRST LOCK'), el('time', '', date(target.first_lock_utc)));
        rail.querySelector('time').dateTime = target.first_lock_utc;
        const card = el('div', 'ft-card');
        const top = el('div', 'ft-card-top');
        top.append(el('span', 'ft-badge' + (target.status === 'pending' ? ' ft-pending' : ''), target.status === 'pending' ? 'Awaiting results' : target.status === 'scored' ? 'Result scored' : 'Not scoreable'),
          el('span', 'ft-muted ft-small', target.evidence_class === 'pre_fieldwork' ? 'Locked before fieldwork' : 'Locked before release'));
        card.append(top, el('h3', '', target.survey), el('p', 'ft-publisher', target.publisher));
        if (target.disclosure === 'full' && target.results) void resultCard(target, index, card, results.get(target.target_id));
        else {
          card.append(unavailable(target.status === 'pending' ? 'Responses will appear after release' : 'This release is withheld', target.disclosure_note || 'Only timestamp proofs are public for this survey.'));
          const links = el('div', 'ft-links');
          if (target.publication_url) links.append(link('Publisher ↗', target.publication_url));
          if (target.batches[0]) links.append(link('Timestamp proof ↗', target.batches[0].manifest));
          card.append(links);
        }
        item.append(rail, card); list.append(item);
      }
      const firstNew = list.children[displayed];
      displayed = visible.length;
      more.hidden = visible.length >= selected.length;
      if (append && firstNew) { firstNew.tabIndex = -1; firstNew.focus({ preventScroll: true }); }
    }
    render();
  } catch {
    root.replaceChildren(el('h2', '', 'Forecast timeline'), unavailable('The timeline could not be loaded', 'You can still read the scorecard and survey records below.'), button('Try again', () => mount(root)));
  }
}
if (typeof document !== 'undefined') {
  const root = document.getElementById('forecast-timeline');
  if (root) void mount(root);
}
