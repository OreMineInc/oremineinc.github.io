const root = document.documentElement;
const sidebar = document.querySelector('#sidebar');
const backdrop = document.querySelector('#backdrop');
const menuButton = document.querySelector('#menu-button');
const search = document.querySelector('#nav-search');

function toggleMenu(force) {
  const open = force ?? !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', open);
  backdrop.classList.toggle('open', open);
}

menuButton?.addEventListener('click', () => toggleMenu());
backdrop?.addEventListener('click', () => toggleMenu(false));

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    search?.focus();
  }
  if (event.key === 'Escape') toggleMenu(false);
});

search?.addEventListener('input', () => {
  const query = search.value.trim().toLowerCase();
  document.querySelectorAll('#navigation a').forEach((link) => {
    link.style.display = !query || link.textContent.toLowerCase().includes(query) ? '' : 'none';
  });
  document.querySelectorAll('#navigation details').forEach((group) => {
    if (query) group.open = true;
  });
});

const savedTheme = localStorage.getItem('oremine-theme');
if (savedTheme) root.dataset.theme = savedTheme;
document.querySelector('#theme-button')?.addEventListener('click', () => {
  const next = root.dataset.theme === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  localStorage.setItem('oremine-theme', next);
});
