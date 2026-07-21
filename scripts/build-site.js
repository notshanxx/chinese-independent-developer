#!/usr/bin/env node

/**
 * build-site.js
 * Parses Chinese README files and generates projects.json for the website.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const README_FILES = [
  { file: 'README.md', board: 'main' },
  { file: 'pages/README-Programmer-Edition.md', board: 'programmer' },
  { file: 'pages/README-Game.md', board: 'game' },
  { file: 'pages/README-2018-2020.md', board: 'archive' },
];

const STATUS_MAP = {
  'white_check_mark': 'live',
  'clock8': 'dev',
  'x': 'closed',
};

function padMonth(m) {
  return m.toString().padStart(2, '0');
}

function parseDate(header) {
  // Chinese: "### 2026 年 7 月 20 号添加" or "### 2026 年 01 月 05 号添加"
  let m = header.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*号/);
  if (m) return `${m[1]}-${padMonth(m[2])}-${padMonth(m[3])}`;

  // With dashes: "### 2024年4月10日添加"
  m = header.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (m) return `${m[1]}-${padMonth(m[2])}-${padMonth(m[3])}`;

  return null;
}

function parseMarkdownUrl(text) {
  // Extract [label](url) and return { label, url }
  const m = text.match(/\[([^\]]*)\]\(([^)]*)\)/);
  return m ? { label: m[1], url: m[2] } : null;
}

function parseProductLine(line) {
  // Detect status
  let status = 'live';
  if (line.includes(':clock8:')) status = 'dev';
  else if (line.includes(':x:')) status = 'closed';

  // Match: * :status: [Name](url)：description - [More info](url)
  // Or:   - :status: [Name](url)：description
  const productMatch = line.match(/^[*\-]\s+:\w+:\s+\[([^\]]+)\]\(([^)]*)\)(.*)/);
  if (!productMatch) return null;

  const name = productMatch[1].trim();
  const url = productMatch[2].trim();
  let rest = productMatch[3].trim();

  // Remove leading ：if present
  if (rest.startsWith('：')) rest = rest.slice(1).trim();

  // Extract trailing link: - [更多介绍](url) or - [软件首页](url) etc.
  let moreInfoUrl = '';
  let moreInfoLabel = '';
  const linkMatch = rest.match(/\s*-\s*\[([^\]]+)\]\(([^)]+)\)\s*$/);
  if (linkMatch) {
    moreInfoLabel = linkMatch[1];
    moreInfoUrl = linkMatch[2];
    rest = rest.slice(0, rest.lastIndexOf(linkMatch[0])).trim();
  }

  return {
    name,
    url,
    description: rest,
    status,
    moreInfoUrl,
    moreInfoLabel,
  };
}

function parseAuthorLine(line) {
  // Match: #### AuthorName(City) - [Github](url), [Blog](url)
  // Or:    #### AuthorName - [Github](url)
  // Or:    #### AuthorName(城市)
  const authorMatch = line.match(/^#{3,4}\s+(.+?)$/);
  if (!authorMatch) return null;

  let raw = authorMatch[1].trim();
  const result = { name: '', city: '', github: '', blog: '', extra: '' };

  // Split on " - " to separate name/city from links
  const dashIdx = raw.indexOf(' - ');
  let namePart = dashIdx !== -1 ? raw.slice(0, dashIdx).trim() : raw;
  let linksPart = dashIdx !== -1 ? raw.slice(dashIdx + 3).trim() : '';

  // Extract city from name part: Name(City)
  const cityMatch = namePart.match(/^(.+?)\(([^)]+)\)\s*$/);
  if (cityMatch) {
    result.name = cityMatch[1].trim();
    result.city = cityMatch[2].trim();
  } else {
    result.name = namePart;
  }

  // Parse all [Label](url) links from linksPart
  const links = [...linksPart.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
  for (const link of links) {
    const label = link[1].toLowerCase();
    const url = link[2];
    if (label.includes('github')) result.github = url;
    else if (label.includes('博客') || label === 'blog') result.blog = url;
    else result.extra += `[${link[1]}](${url}) `;
  }

  return result;
}

function parseReadme(filePath, board) {
  const fullPath = path.join(ROOT, filePath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`File not found: ${filePath}`);
    return [];
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');
  const projects = [];

  let currentDate = null;
  let currentAuthor = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Date header: ### YYYY 年 M 月 D 号添加
    if (/^###\s+/.test(trimmed) && /\d{4}\s*年/.test(trimmed)) {
      currentDate = parseDate(trimmed);
      currentAuthor = null;
      continue;
    }

    // Skip non-date ### headers (like ### 子版面)
    if (/^###\s+/.test(trimmed) && !/\d{4}\s*年/.test(trimmed)) {
      // Exception: ### authorname anomaly in Programmer Edition
      if (/^###\s+\w+\s*$/.test(trimmed) && !trimmed.includes('版面') && !trimmed.includes('区别')) {
        const author = parseAuthorLine(trimmed.replace(/^###/, '####'));
        if (author && author.name) {
          currentAuthor = author;
        }
      }
      continue;
    }

    // Author header: #### Name...
    if (/^#{4}\s+/.test(trimmed)) {
      const author = parseAuthorLine(trimmed);
      if (author && author.name) {
        currentAuthor = author;
      }
      continue;
    }

    // Product line: * :status: [Name](url)：description
    if (/^[*\-]\s+:(white_check_mark|clock8|x):/.test(trimmed)) {
      const product = parseProductLine(trimmed);
      if (product && product.name) {
        projects.push({
          ...product,
          board,
          date: currentDate,
          author: currentAuthor ? { ...currentAuthor } : { name: '', city: '', github: '', blog: '' },
        });
      }
      continue;
    }
  }

  return projects;
}

function build() {
  console.log('Building projects.json...\n');

  let allProjects = [];

  for (const { file, board } of README_FILES) {
    console.log(`Parsing ${file} (${board})...`);
    const projects = parseReadme(file, board);
    console.log(`  Found ${projects.length} projects`);
    allProjects = allProjects.concat(projects);
  }

  // Sort by date descending (newest first)
  allProjects.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  const data = {
    generatedAt: new Date().toISOString(),
    totalProjects: allProjects.length,
    stats: {
      live: allProjects.filter(p => p.status === 'live').length,
      dev: allProjects.filter(p => p.status === 'dev').length,
      closed: allProjects.filter(p => p.status === 'closed').length,
    },
    boards: {
      main: allProjects.filter(p => p.board === 'main').length,
      programmer: allProjects.filter(p => p.board === 'programmer').length,
      game: allProjects.filter(p => p.board === 'game').length,
      archive: allProjects.filter(p => p.board === 'archive').length,
    },
    projects: allProjects,
  };

  const outPath = path.join(ROOT, 'docs', 'data', 'projects.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');

  console.log(`\nDone! ${allProjects.length} projects written to docs/data/projects.json`);
  console.log(`  Live: ${data.stats.live} | Dev: ${data.stats.dev} | Closed: ${data.stats.closed}`);
  console.log(`  Main: ${data.boards.main} | Programmer: ${data.boards.programmer} | Game: ${data.boards.game} | Archive: ${data.boards.archive}`);
}

build();
