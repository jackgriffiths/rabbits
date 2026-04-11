const fs = require('fs');
const path = require('path');

// Simple YAML parser for our specific format
function parseYaml(text) {
  const entries = [];
  let current = null;

  for (const line of text.split('\n')) {
    const monthMatch = line.match(/^\s*-\s*month:\s*"(.+)"/);
    if (monthMatch) {
      current = { month: monthMatch[1], winners: [] };
      entries.push(current);
      continue;
    }

    const winnersMatch = line.match(/^\s*winners:\s*\[(.+)\]/);
    if (winnersMatch && current) {
      current.winners = winnersMatch[1].split(',').map(w => w.trim());
    }
  }

  return entries;
}

function parseRules(text) {
  const foundingMatch = text.match(/^founding_rule:\s*(.+)$/m);
  const foundingRule = foundingMatch ? foundingMatch[1] : '';

  const amendments = [];
  let current = null;
  for (const line of text.split('\n')) {
    const numMatch = line.match(/^\s*-\s*number:\s*(\d+)/);
    if (numMatch) {
      current = { number: parseInt(numMatch[1]), date: '', rule: '' };
      amendments.push(current);
      continue;
    }
    const dateMatch = line.match(/^\s*date:\s*"(.+)"/);
    if (dateMatch && current) { current.date = dateMatch[1]; continue; }
    const ruleMatch = line.match(/^\s*rule:\s*(.+)/);
    if (ruleMatch && current) { current.rule = ruleMatch[1]; continue; }
    const repealedMatch = line.match(/^\s*repealed_by:\s*(\d+)/);
    if (repealedMatch && current) { current.repealed_by = parseInt(repealedMatch[1]); }
  }

  return { foundingRule, amendments };
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatMonth(monthStr) {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return {
    monthName: date.toLocaleDateString('en-GB', { month: 'long' }),
    year: year
  };
}

function toRoman(n) {
  const numerals = [
    [1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],
    [100,'C'],[90,'XC'],[50,'L'],[40,'XL'],
    [10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']
  ];
  let result = '';
  for (const [value, numeral] of numerals) {
    while (n >= value) { result += numeral; n -= value; }
  }
  return result;
}

// Read and parse data
const entries = parseYaml(fs.readFileSync('winners.yaml', 'utf8'));
const rules = parseRules(fs.readFileSync('rules.yaml', 'utf8'));

// Compute leaderboard
const wins = {};
for (const entry of entries) {
  const share = 1 / entry.winners.length;
  for (const winner of entry.winners) {
    wins[winner] = (wins[winner] || 0) + share;
  }
}
const leaderboard = Object.entries(wins).sort((a, b) => b[1] - a[1]);

// Build repealed map from repealed_by prop
const repealedMap = {};
for (const a of rules.amendments) {
  if (a.repealed_by) {
    repealedMap[a.number] = a.repealed_by;
  }
}

// Build leaderboard HTML
const leaderboardHtml = leaderboard.map(([name, count], i) => {
  const rank = i + 1;
  const rankClass = rank <= 3 ? ` rank-${rank}` : '';
  const roman = toRoman(rank);
  const winsDisplay = count % 1 ? count : count.toFixed(0);
  return `          <div class="leaderboard-entry${rankClass}">
            <span class="leaderboard-rank">${roman}</span>
            <span class="leaderboard-name">${name}</span>
            <span class="leaderboard-wins">${winsDisplay}<span class="wins-label">wins</span></span>
          </div>`;
}).join('\n');

// Build founding rule HTML
const foundingRuleHtml = rules.foundingRule.replace(/rabbits/, '<em>rabbits</em>').replace(/\.$/, '');

// Build amendments HTML
const amendmentsHtml = rules.amendments.map(a => {
  const isRepealed = repealedMap[a.number] !== undefined;
  const repealedClass = isRepealed ? ' repealed' : '';
  const repealNote = isRepealed
    ? ` <em style="font-size:0.75rem;opacity:0.7;text-decoration:none;display:inline">&mdash;&nbsp;Repealed by Amend. ${toRoman(repealedMap[a.number])}</em>`
    : '';
  return `        <div class="amendment${repealedClass}">
          <span class="amendment-number">Amend. ${toRoman(a.number)}</span>
          <div class="amendment-body">
            <span class="amendment-text">${a.rule}${repealNote}</span>
            <span class="amendment-date">${formatDate(a.date)}</span>
          </div>
        </div>`;
}).join('\n\n');

// Build history HTML grouped by year
const reversed = [...entries].reverse();
let historyHtml = '';
let currentYear = null;

for (const e of reversed) {
  const { monthName, year } = formatMonth(e.month);
  if (year !== currentYear) {
    currentYear = year;
    historyHtml += `              <tr class="year-divider"><td colspan="2">${year}</td></tr>\n`;
  }
  historyHtml += `              <tr><td class="month-cell">${monthName}</td><td class="winner-cell">${e.winners.join(' & ')}</td></tr>\n`;
}

// Build last updated timestamp in Europe/London
const lastUpdated = new Date().toLocaleString('en-GB', {
  timeZone: 'Europe/London',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short'
});

// Read template, replace placeholders, write output
const template = fs.readFileSync('template.html', 'utf8');

const html = template
  .replace('{{LAST_UPDATED}}', lastUpdated)
  .replace('{{LEADERBOARD}}', leaderboardHtml)
  .replace('{{FOUNDING_RULE}}', foundingRuleHtml)
  .replace('{{AMENDMENTS}}', amendmentsHtml)
  .replace('{{HISTORY}}', historyHtml);

fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync(path.join('dist', 'index.html'), html);

const assets = [
  'favicon.svg',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'og-image.jpg',
  'manifest.webmanifest',
];
for (const asset of assets) {
  if (fs.existsSync(asset)) {
    fs.copyFileSync(asset, path.join('dist', asset));
  }
}

console.log(`Generated dist/index.html with ${entries.length} months and ${leaderboard.length} players.`);
