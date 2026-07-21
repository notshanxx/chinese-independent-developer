let allProjects = [];
let filteredProjects = [];
let currentBoard = 'all';
let currentStatus = 'all';
let searchQuery = '';

const STATUS_LABELS = { live: 'Live', dev: 'In Dev', closed: 'Closed' };
const BOARD_LABELS = { main: 'Main', programmer: 'Programmer', game: 'Game', archive: 'Archive' };

// --- Load Data ---

async function loadData() {
  try {
    const res = await fetch('data/projects.json');
    const data = await res.json();
    allProjects = data.projects;

    document.getElementById('stats').textContent =
      `${data.totalProjects} projects | ${data.stats.live} live, ${data.stats.dev} in dev, ${data.stats.closed} closed`;

    document.getElementById('loading').classList.add('hidden');
    applyFilters();
  } catch (err) {
    document.getElementById('loading').textContent = 'Failed to load data.';
  }
}

// --- Filtering ---

function applyFilters() {
  filteredProjects = allProjects.filter(p => {
    if (currentBoard !== 'all' && p.board !== currentBoard) return false;
    if (currentStatus !== 'all' && p.status !== currentStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchDesc = p.description.toLowerCase().includes(q);
      const matchAuthor = p.author.name.toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchAuthor) return false;
    }
    return true;
  });

  renderGrid();
}

// --- Rendering ---

function renderGrid() {
  const grid = document.getElementById('project-grid');
  const info = document.getElementById('results-info');

  info.textContent = `${filteredProjects.length} project${filteredProjects.length !== 1 ? 's' : ''} found`;

  if (filteredProjects.length === 0) {
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#888;padding:2rem;">No projects match your filters.</p>';
    return;
  }

  // Render first 60 immediately, rest lazily
  const initial = filteredProjects.slice(0, 60);
  const rest = filteredProjects.slice(60);

  grid.innerHTML = initial.map(cardHTML).join('');

  if (rest.length > 0) {
    const sentinel = document.createElement('div');
    sentinel.id = 'load-more';
    sentinel.style.gridColumn = '1/-1';
    sentinel.style.textAlign = 'center';
    sentinel.style.padding = '1rem';
    sentinel.style.color = '#888';
    sentinel.textContent = `Loading ${rest.length} more...`;
    grid.appendChild(sentinel);

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        sentinel.remove();
        grid.insertAdjacentHTML('beforeend', rest.map(cardHTML).join(''));
        observer.disconnect();
      }
    });
    observer.observe(sentinel);
  }
}

function cardHTML(p) {
  const nameLink = p.url
    ? `<a href="${escHTML(p.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${escHTML(p.name)}</a>`
    : escHTML(p.name);

  const desc = p.description || 'No description';
  const authorText = p.author.name || 'Unknown';
  const dateText = p.date || '';

  return `
    <div class="card" onclick="showDetail(${JSON.stringify(p).replace(/"/g, '&quot;').replace(/'/g, '&#39;')})">
      <div class="card-header">
        <span class="card-name">${nameLink}</span>
        <span class="status-badge status-${p.status}">${STATUS_LABELS[p.status] || p.status}</span>
      </div>
      <div class="card-desc">${escHTML(desc)}</div>
      <div class="card-meta">
        <span class="card-author">${escHTML(authorText)}${p.author.city ? ' (' + escHTML(p.author.city) + ')' : ''}</span>
        <span class="card-board">${BOARD_LABELS[p.board] || p.board}</span>
      </div>
    </div>
  `;
}

function escHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Detail Modal ---

function showDetail(p) {
  const content = document.getElementById('modal-content');

  const nameLink = p.url
    ? `<a href="${escHTML(p.url)}" target="_blank" rel="noopener">${escHTML(p.name)}</a>`
    : escHTML(p.name);

  let html = `
    <h2>${nameLink}</h2>
    <div class="modal-status">
      <span class="status-badge status-${p.status}">${STATUS_LABELS[p.status] || p.status}</span>
      <span class="card-board" style="margin-left:0.5rem">${BOARD_LABELS[p.board] || p.board}</span>
    </div>
    <div class="modal-desc">${escHTML(p.description || 'No description')}</div>
    <div class="modal-info">
      <p><strong>Author:</strong> ${escHTML(p.author.name || 'Unknown')}${p.author.city ? ' (' + escHTML(p.author.city) + ')' : ''}</p>
  `;

  if (p.author.github) {
    html += `<p><strong>GitHub:</strong> <a href="${escHTML(p.author.github)}" target="_blank" rel="noopener">${escHTML(p.author.github)}</a></p>`;
  }
  if (p.author.blog) {
    html += `<p><strong>Blog:</strong> <a href="${escHTML(p.author.blog)}" target="_blank" rel="noopener">${escHTML(p.author.blog)}</a></p>`;
  }
  if (p.moreInfoUrl) {
    html += `<p><strong>${escHTML(p.moreInfoLabel || 'More info')}:</strong> <a href="${escHTML(p.moreInfoUrl)}" target="_blank" rel="noopener">${escHTML(p.moreInfoUrl)}</a></p>`;
  }
  if (p.date) {
    html += `<p><strong>Date added:</strong> ${escHTML(p.date)}</p>`;
  }

  html += '</div>';
  content.innerHTML = html;
  document.getElementById('modal-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  document.body.style.overflow = '';
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {
  loadData();

  // Search
  let debounce;
  document.getElementById('search').addEventListener('input', (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      searchQuery = e.target.value.trim();
      applyFilters();
    }, 200);
  });

  // Board filters
  document.getElementById('board-filters').addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    currentBoard = e.target.dataset.board;
    document.querySelectorAll('#board-filters button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    applyFilters();
  });

  // Status filters
  document.getElementById('status-filters').addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    currentStatus = e.target.dataset.status;
    document.querySelectorAll('#status-filters button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    applyFilters();
  });

  // Modal close
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
});
