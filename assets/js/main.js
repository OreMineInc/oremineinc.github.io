const root = document.documentElement;
const sidebar = document.querySelector('#sidebar');
const backdrop = document.querySelector('#backdrop');
const menuButton = document.querySelector('#menu-button');
const search = document.querySelector('#nav-search');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

document.querySelectorAll('#navigation .nav-icon[data-lottie-path]').forEach((icon) => {
  const trigger = icon.closest('.nav-link, summary');
  const animationHost = icon.querySelector('.nav-icon__animated');
  const isCurrentSection = () => trigger?.classList.contains('active')
    || trigger?.parentElement?.classList.contains('nav-section-active');
  let animation;
  let loading = false;
  let playing = false;
  let hovering = false;
  let focused = false;

  const shouldAnimate = () => !reducedMotion.matches && (isCurrentSection() || hovering || focused);

  const updateAnimation = () => {
    const play = shouldAnimate();
    icon.classList.toggle('is-animating', play);

    if (!play) {
      if (playing) animation?.stop();
      playing = false;
      return;
    }

    if (animation) {
      if (!playing) {
        animation.goToAndPlay(0, true);
        playing = true;
      }
      return;
    }

    if (loading || !animationHost || typeof window.lottie?.loadAnimation !== 'function') return;
    loading = true;
    animation = window.lottie.loadAnimation({
      container: animationHost,
      renderer: 'svg',
      loop: true,
      autoplay: false,
      path: icon.dataset.lottiePath,
      rendererSettings: {
        preserveAspectRatio: 'xMidYMid meet',
        progressiveLoad: true,
        focusable: false,
      },
    });

    animation.addEventListener('DOMLoaded', () => {
      loading = false;
      icon.classList.add('is-ready');
      if (shouldAnimate()) {
        animation.goToAndPlay(0, true);
        playing = true;
      }
    });

    animation.addEventListener('data_failed', () => {
      loading = false;
      playing = false;
      animation = undefined;
      icon.classList.remove('is-ready');
    });
  };

  trigger?.addEventListener('mouseenter', () => {
    hovering = true;
    updateAnimation();
  });
  trigger?.addEventListener('mouseleave', () => {
    hovering = false;
    updateAnimation();
  });
  trigger?.addEventListener('focusin', () => {
    focused = true;
    updateAnimation();
  });
  trigger?.addEventListener('focusout', (event) => {
    focused = trigger.contains(event.relatedTarget);
    updateAnimation();
  });
  reducedMotion.addEventListener?.('change', updateAnimation);

  updateAnimation();
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
