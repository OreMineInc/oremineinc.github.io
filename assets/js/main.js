const root = document.documentElement;
const sidebar = document.querySelector('#sidebar');
const backdrop = document.querySelector('#backdrop');
const menuButton = document.querySelector('#menu-button');
const search = document.querySelector('#nav-search');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

document.querySelectorAll('.lottie-icon[data-lottie-path]').forEach((icon) => {
  const navTrigger = icon.closest('#navigation .nav-link, #navigation summary');
  const isTitleIcon = icon.classList.contains('page-title-icon');
  const hoverOnly = icon.dataset.animate === 'hover';
  const trigger = navTrigger || (isTitleIcon ? icon : icon.closest('a, .donate-hero, .account-link-card')) || icon;
  const isCurrentSection = () => navTrigger?.classList.contains('active')
    || navTrigger?.parentElement?.classList.contains('nav-section-active');
  let hovering = false;
  let focused = false;
  let playing = false;

  if (typeof window.lottie?.loadAnimation !== 'function') return;

  const animation = window.lottie.loadAnimation({
    container: icon,
    renderer: 'svg',
    loop: Boolean(navTrigger),
    autoplay: false,
    path: icon.dataset.lottiePath,
    rendererSettings: {
      preserveAspectRatio: 'xMidYMid meet',
      progressiveLoad: true,
      focusable: false,
    },
  });

  const shouldAnimate = () => !reducedMotion.matches
    && (hoverOnly ? hovering || focused : isCurrentSection() || hovering || focused);

  const updateAnimation = () => {
    if (!icon.classList.contains('is-ready')) return;
    if (shouldAnimate()) {
      if (!playing) animation.goToAndPlay(0, true);
      playing = true;
    } else {
      animation.goToAndStop(0, true);
      playing = false;
    }
  };

  animation.addEventListener('DOMLoaded', () => {
    icon.classList.add('is-ready');
    animation.goToAndStop(0, true);
    if (isTitleIcon && !hoverOnly && !reducedMotion.matches) {
      animation.goToAndPlay(0, true);
      playing = true;
    } else {
      updateAnimation();
    }
  });
  animation.addEventListener('complete', () => {
    playing = false;
    animation.goToAndStop(0, true);
  });
  animation.addEventListener('data_failed', () => icon.classList.add('is-error'));

  trigger.addEventListener('mouseenter', () => {
    hovering = true;
    updateAnimation();
  });
  trigger.addEventListener('mouseleave', () => {
    hovering = false;
    updateAnimation();
  });
  trigger.addEventListener('focusin', () => {
    focused = true;
    updateAnimation();
  });
  trigger.addEventListener('focusout', (event) => {
    focused = trigger.contains(event.relatedTarget);
    updateAnimation();
  });
  reducedMotion.addEventListener?.('change', updateAnimation);
});

document.querySelectorAll('a[href^="http"]').forEach((link) => {
  const target = new URL(link.href, window.location.href);
  if (target.origin !== window.location.origin) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
});

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

document.querySelectorAll('#article-content table').forEach((table) => {
  if (table.parentElement?.classList.contains('table-scroll')) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'table-scroll';
  table.parentNode.insertBefore(wrapper, table);
  wrapper.appendChild(table);
});

const article = document.querySelector('#article-content');
const toc = document.querySelector('#page-toc');
const tocLinks = document.querySelector('#page-toc-links');
const headings = [...(article?.querySelectorAll('h2, h3') ?? [])];

if (headings.length < 3) {
  if (toc) toc.hidden = true;
} else {
  const usedIds = new Set();
  headings.forEach((heading, index) => {
    let id = heading.id || heading.textContent
      .toLowerCase()
      .trim()
      .replace(/[^a-zа-яё0-9]+/gi, '-')
      .replace(/^-|-$/g, '') || `section-${index + 1}`;
    const base = id;
    let suffix = 2;
    while (usedIds.has(id)) id = `${base}-${suffix++}`;
    usedIds.add(id);
    heading.id = id;

    const link = document.createElement('a');
    link.href = `#${id}`;
    link.textContent = heading.textContent;
    if (heading.tagName === 'H3') link.classList.add('sub');
    tocLinks?.appendChild(link);
  });

  const links = [...(tocLinks?.querySelectorAll('a') ?? [])];
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.find((entry) => entry.isIntersecting);
    if (!visible) return;
    links.forEach((link) => link.classList.toggle('active', link.hash === `#${visible.target.id}`));
  }, { rootMargin: '-20% 0px -72% 0px' });
  headings.forEach((heading) => observer.observe(heading));
}
