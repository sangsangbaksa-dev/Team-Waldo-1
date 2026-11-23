// Read-only GitHub pull-request overlap report for Team Waldo coordinators.
// Usage: node tools/coordination-report.mjs --repo=owner/name --target=feat/shared-menu-rails
// Set GITHUB_TOKEN for higher API limits. Never writes GitHub data or deploys.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const GAME_DIRS = [
  ['LAST CITY', ['src/city/', 'tests/city/']],
  ['SPEED RUSH', ['src/race/', 'tests/race/']],
  ['FRONTLINE', ['src/rts/', 'tests/rts/']],
  ['ZERO ZONE', ['src/shooter/', 'tests/shooter/']],
  ['OUTLAW CITY', ['src/outlaw/', 'tests/outlaw/']],
  ['HUSTLE', ['src/tycoon/', 'tests/tycoon/']],
  ['SKY WAR', ['src/sky/', 'tests/sky/']],
  ['SQUAD CLASH', ['src/squad/', 'tests/squad/']],
  ['SLACK OFF', ['src/slack/', 'tests/slack/']],
  ['ROOM TONE', ['src/room-tone/', 'room-tone/', 'tests/room-tone/']],
];

export function gameForPath(filename) {
  for (const [game, roots] of GAME_DIRS) if (roots.some(root => filename.startsWith(root))) return game;
  return null;
}

export function analyzePullRequests(prs, options = {}) {
  const target = options.target ?? 'feat/shared-menu-rails';
  const now = options.now ?? Date.now();
  const freshMinutes = options.freshMinutes ?? 10;
  const normalized = prs.map(pr => ({
    number: pr.number,
    title: pr.title ?? '',
    base: typeof pr.base === 'string' ? pr.base : pr.base?.ref ?? '',
    head: typeof pr.head === 'string' ? pr.head : pr.head?.ref ?? '',
    // A passing check on a previous commit must never be treated as evidence
    // for the current head of a frequently updated game PR.
    headSha: pr.head?.sha ?? pr.head_sha ?? '',
    updated: pr.updated_at ?? pr.updated ?? '',
    draft: !!pr.draft,
    files: [...new Set((pr.files ?? []).map(f => typeof f === 'string' ? f : f.filename).filter(Boolean))].sort(),
  })).sort((a, b) => a.number - b.number);
  const byHead = new Map(normalized.filter(pr => pr.head).map(pr => [pr.head, pr]));
  const parentEdges = normalized.flatMap(pr => {
    const parent = byHead.get(pr.base);
    return parent && parent.number !== pr.number ? [{ parent: parent.number, child: pr.number, branch: pr.base }] : [];
  });
  const byFile = new Map();
  for (const pr of normalized) {
    for (const filename of pr.files) {
      if (!byFile.has(filename)) byFile.set(filename, []);
      byFile.get(filename).push(pr.number);
    }
  }
  const exactFileCollisions = [...byFile].filter(([, owners]) => owners.length > 1)
    .map(([filename, owners]) => ({ filename, prs: owners.sort((a, b) => a - b) }))
    .sort((a, b) => a.filename.localeCompare(b.filename));
  const pairs = new Map();
  for (const row of exactFileCollisions) for (let i = 0; i < row.prs.length; i++) {
    for (let j = i + 1; j < row.prs.length; j++) {
      const first = row.prs[i], second = row.prs[j], key = first + ':' + second;
      if (!pairs.has(key)) pairs.set(key, { first, second, files: [] });
      pairs.get(key).files.push(row.filename);
    }
  }
  // A child PR inherits its parent's diff. Overlapping filenames inside the
  // same PR stack are expected and should not be presented as independent edits.
  const parents = new Map(parentEdges.map(edge => [edge.child, edge.parent]));
  const isAncestor = (ancestor, descendant) => {
    const visited = new Set();
    let current = descendant;
    while (parents.has(current) && !visited.has(current)) {
      visited.add(current);
      current = parents.get(current);
      if (current === ancestor) return true;
    }
    return false;
  };
  const collisionPairs = [...pairs.values()].map(pair => ({
    ...pair,
    relationship: isAncestor(pair.first, pair.second) || isAncestor(pair.second, pair.first)
      ? 'stacked' : 'independent',
  })).sort((a, b) =>
    (a.relationship === b.relationship ? 0 : a.relationship === 'independent' ? -1 : 1) ||
    b.files.length - a.files.length || a.first - b.first || a.second - b.second);
  const multipleGames = normalized.map(pr => ({
    number: pr.number,
    games: [...new Set(pr.files.map(gameForPath).filter(Boolean))].sort(),
  })).filter(pr => pr.games.length > 1);
  const foreignBases = normalized.filter(pr => pr.base !== target).map(pr => ({
    number: pr.number, base: pr.base, stackedOn: byHead.get(pr.base)?.number ?? null,
  }));
  const recentlyUpdated = normalized.filter(pr => {
    const date = Date.parse(pr.updated);
    return Number.isFinite(date) && now >= date && now - date < freshMinutes * 60_000;
  }).map(pr => pr.number);
  return { target, freshMinutes, total: normalized.length, prs: normalized, parentEdges, exactFileCollisions, collisionPairs, multipleGames, foreignBases, recentlyUpdated,
    missingFileLists: normalized.filter(pr => !pr.files.length).map(pr => pr.number) };
}

const escapeText = text => String(text ?? '').replace(/[|\r\n]/g, ' ').replace(/\\/g, '\\\\');
const refLink = (repo, number) => '[#' + number + '](https://github.com/' + repo + '/pull/' + number + ')';

export function renderMarkdown(report, repo = 'sangsangbaksa-dev/Team-Waldo-1') {
  const lines = [
    '# Team Waldo PR conflict snapshot',
    '',
    '> GitHub 상태를 읽어서 생성한 보고서입니다. 정확한 파일명이 같다는 사실만 찾으며 병합 가능성·코드 품질을 판정하지 않습니다.',
    '',
    '- 통합 기준: \`' + report.target + '\`',
    '- 열린 PR 분석: ' + report.total + '개',
    '- 정확한 파일 중복: ' + report.exactFileCollisions.length + '개 파일 / ' + report.collisionPairs.length + '개 PR 쌍',
  ];
  lines.push('', '## 열린 PR 현재 HEAD (CI 대조용)', '| PR | HEAD SHA | Base | 범위 |', '| --- | --- | --- | --- |');
  const latest = [...report.prs].sort((a, b) =>
    (Date.parse(b.updated) || 0) - (Date.parse(a.updated) || 0) || b.number - a.number);
  for (const pr of latest) {
    const games = [...new Set(pr.files.map(gameForPath).filter(Boolean))].sort();
    const scope = games.length ? games.join(', ') : '공용 · 도구 · 문서 또는 미확인';
    lines.push('| ' + refLink(repo, pr.number) + ' | \`' +
      escapeText(pr.headSha ? pr.headSha.slice(0, 10) : '미확인') + '\` | \`' +
      escapeText(pr.base) + '\` | ' + escapeText(scope) + ' |');
  }
  lines.push('', '## 선행 PR 의존 관계');
  if (!report.parentEdges.length) lines.push('없음');
  else for (const edge of report.parentEdges) lines.push('- ' + refLink(repo, edge.parent) + ' → ' + refLink(repo, edge.child) + ' (base: \`' + escapeText(edge.branch) + '\`)');
  lines.push('', '## 파일 변경이 겹치는 PR');
  if (!report.collisionPairs.length) lines.push('없음');
  else for (const pair of report.collisionPairs) {
    const files = pair.files.slice(0, 8).map(filename => '\`' + escapeText(filename) + '\`').join(', ');
    const suffix = pair.files.length > 8 ? ' 외 ' + (pair.files.length - 8) + '개' : '';
    const relation = pair.relationship === 'stacked' ? '[선행 PR 상속; 기대되는 중복]' : '[독립 PR; 충돌 검토]';
    lines.push('- ' + relation + ' ' + refLink(repo, pair.first) + ' ↔ ' + refLink(repo, pair.second) + ': ' + pair.files.length + '개 — ' + files + suffix);
  }
  lines.push('', '## 대상 브랜치 불일치');
  if (!report.foreignBases.length) lines.push('없음');
  else for (const item of report.foreignBases) lines.push('- ' + refLink(repo, item.number) + ' base \`' + escapeText(item.base) + '\`' + (item.stackedOn ? ' (parent: ' + refLink(repo, item.stackedOn) + ')' : ''));
  lines.push('', '## 한 PR에서 여러 게임을 변경');
  if (!report.multipleGames.length) lines.push('없음');
  else for (const row of report.multipleGames) lines.push('- ' + refLink(repo, row.number) + ': ' + row.games.join(', '));
  lines.push('', '## 최근 ' + report.freshMinutes + '분 이내 갱신된 PR', report.recentlyUpdated.length ? report.recentlyUpdated.map(n => refLink(repo, n)).join(', ') : '없음');
  if (report.missingFileLists.length) lines.push('', '주의: 변경 파일 목록이 비어 있는 PR: ' + report.missingFileLists.join(', '));
  lines.push('', '병합 전에 실제 diff, 운영 HEAD, CI 결과를 개별적으로 확인하세요.');
  return lines.join('\n') + '\n';
}

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) throw new Error('Unknown argument: ' + token);
    const eq = token.indexOf('=');
    args[token.slice(2, eq < 0 ? undefined : eq)] = eq < 0 ? true : token.slice(eq + 1);
  }
  const repo = args.repo ?? 'sangsangbaksa-dev/Team-Waldo-1';
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('Invalid repo, expected owner/name');
  const limit = Number(args.limit ?? 40);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('--limit must be 1..100');
  if (args.json !== undefined && args.json !== true) throw new Error('--json takes no value');
  return { repo, limit, json: !!args.json, target: args.target ?? 'feat/shared-menu-rails', input: args.input ?? null };
}

async function getJSON(url) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'team-waldo-coordination-report' };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    throw new Error('GitHub API ' + response.status + ' (' + url.split('?')[0] + ')' + (remaining === '0' ? ': rate limited; set GITHUB_TOKEN' : ''));
  }
  return response.json();
}

async function mapConcurrent(items, concurrency, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]);
    }
  }));
  return out;
}

async function loadFromGitHub(repo, limit) {
  const base = 'https://api.github.com/repos/' + repo;
  const list = await getJSON(base + '/pulls?state=open&per_page=100');
  const selected = list.slice(0, limit);
  if (list.length > limit) process.stderr.write('Note: only newest ' + limit + ' of ' + list.length + ' open PRs are included.\n');
  return mapConcurrent(selected, 4, async pr => {
    const files = [];
    for (let page = 1; page <= 30; page++) {
      const chunk = await getJSON(base + '/pulls/' + pr.number + '/files?per_page=100&page=' + page);
      files.push(...chunk.map(file => file.filename));
      if (chunk.length < 100) break;
    }
    return { ...pr, files };
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let prs;
  if (opts.input) {
    const json = JSON.parse(await readFile(opts.input, 'utf8'));
    prs = Array.isArray(json) ? json : json.prs;
    if (!Array.isArray(prs)) throw new Error('Input must be PR array or { prs: [...] }');
  } else prs = await loadFromGitHub(opts.repo, opts.limit);
  const report = analyzePullRequests(prs, { target: opts.target });
  process.stdout.write(opts.json ? JSON.stringify(report, null, 2) + '\n' : renderMarkdown(report, opts.repo));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { process.stderr.write('coordination-report: ' + error.message + '\n'); process.exitCode = 1; });
}
