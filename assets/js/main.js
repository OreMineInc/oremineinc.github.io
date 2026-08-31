const root = document.documentElement;
const sidebar = document.querySelector('#sidebar');
const backdrop = document.querySelector('#backdrop');
const menuButton = document.querySelector('#menu-button');
const search = document.querySelector('#nav-search');
const searchWrap = document.querySelector('#search-wrap');
const searchTrigger = document.querySelector('#search-trigger');
const searchClear = document.querySelector('#search-clear');
const searchResults = document.querySelector('#search-results');
const searchResultsTitle = document.querySelector('#search-results-title');
const searchResultsList = document.querySelector('#search-results-list');
const searchResultsEmpty = document.querySelector('#search-results-empty');
const searchIndexElement = document.querySelector('#search-index');

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

const normalizeSearchText = (value) => value
  .normalize('NFKD')
  .toLocaleLowerCase('ru-RU')
  .replaceAll('ё', 'е')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const searchAliases = {
  '/': 'главная старт wiki ore mine база знаний',
  '/getting-started/': 'новичок новичкам новый новое новому начать подключиться ip адрес сервер',
  '/rules/': 'правила запреты бан можно нельзя наказание',
  '/survival/': 'выживание ресурсы база развитие мир',
  '/mechanics/': 'механики гайды игровой процесс возможности',
  '/mechanics/claims/': 'приват приваты приватить регион регионы территория дом защита база гриф',
  '/mechanics/pvp/': 'pvp пвп рейд рейды гриф гриферство бой сражение',
  '/mechanics/events/': 'ивент ивенты событие события расписание',
  '/mechanics/quests/': 'квест квесты задания специализация награды',
  '/mechanics/smuggler/': 'контрабандист торговец npc нпс товары магазин расписание',
  '/mechanics/enchants/': 'зачарования чары эффекты кастомные',
  '/mechanics/potionstack/': 'баффовар бафовар зелья potionstack стак скрещивание баффы',
  '/mechanics/crafts/': 'крафт крафты crafts рецепты предметы',
  '/mechanics/tops/': 'топ топы рейтинг рейтинги лидер лидеры warp tops',
  '/mechanics/trims/': 'отделки броня trims комплекты бонусы',
  '/mechanics/duels/': 'дуэль дуэли duel бой ставки',
  '/mechanics/cases/': 'кейс кейсы case cases коробки награды купить',
  '/mechanics/cosmetics/': 'косметика скины космики внешний вид',
  '/mechanics/ether-smith/': 'эфирный кузнец чары очистка предметы',
  '/mechanics/battlepass/': 'battlepass battle pass батлпасс боевой пропуск xp опыт уровни награды',
  '/earning/': 'экономика заработок работа работы jobs деньги монеты баланс',
  '/earning/experience/': 'опыт exp xp обмен уровни',
  '/earning/auction/': 'аукцион auction ah рынок купить продать продажа',
  '/social/clans/': 'клан кланы команда команды clan',
  '/social/friends/': 'друг друзья friend репутация отношения',
  '/social/voice/': 'голос голосовой чат войс voice discord дискорд',
  '/commands/': 'команды помощь help rtp sethome home warp jobs menu info телепорт',
  '/donate/': 'донат услуги ранг ранги привилегия привилегии купить магазин',
  '/security/': 'безопасность поддержка взлом мошенник скам telegram discord помощь',
  '/faq/': 'faq вопросы ответы помощь проблема часто',
};

const sectionNames = {
  mechanics: 'Механики',
  earning: 'Экономика',
  social: 'Сообщество',
};

const stopWords = new Set(['а', 'без', 'в', 'где', 'для', 'и', 'из', 'или', 'как', 'к', 'мне', 'можно', 'на', 'найти', 'о', 'по', 'с', 'со', 'что', 'это']);
const englishKeyboard = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";
const russianKeyboard = 'йцукенгшщзхъфывапролджэячсмитьбю';
const keyboardMap = new Map([
  ...[...englishKeyboard].map((character, index) => [character, russianKeyboard[index]]),
  ...[...russianKeyboard].map((character, index) => [character, englishKeyboard[index]]),
]);

const swapKeyboardLayout = (value) => [...value.toLocaleLowerCase('ru-RU')]
  .map((character) => keyboardMap.get(character) || character)
  .join('');

const getQueryTerms = (value) => {
  const allTerms = normalizeSearchText(value).split(' ').filter(Boolean);
  const meaningfulTerms = allTerms.filter((term) => !stopWords.has(term));
  return meaningfulTerms.length ? meaningfulTerms : allTerms;
};

const editDistance = (left, right, limit) => {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let row = 0; row <= left.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= right.length; column += 1) matrix[0][column] = column;

  for (let row = 1; row <= left.length; row += 1) {
    let rowMinimum = limit + 1;
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
      if (row > 1 && column > 1
        && left[row - 1] === right[column - 2]
        && left[row - 2] === right[column - 1]) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + cost);
      }
      rowMinimum = Math.min(rowMinimum, matrix[row][column]);
    }
    if (rowMinimum > limit) return limit + 1;
  }
  return matrix[left.length][right.length];
};

const allowedTypos = (term) => (term.length >= 8 ? 2 : term.length >= 4 ? 1 : 0);

const scoreTermInField = (term, field) => {
  if (!field) return 0;
  if (field === term) return 150;
  if (field.startsWith(`${term} `) || field.startsWith(term)) return 125;
  if (field.includes(` ${term} `) || field.endsWith(` ${term}`)) return 118;
  if (field.includes(term)) return 92;

  let bestScore = 0;
  field.split(' ').forEach((word) => {
    if (word === term) {
      bestScore = Math.max(bestScore, 120);
      return;
    }
    if (term.length >= 2 && word.startsWith(term)) {
      bestScore = Math.max(bestScore, 108 - Math.min(word.length - term.length, 18));
      return;
    }
    const typoLimit = allowedTypos(term);
    if (!typoLimit) return;
    const distance = editDistance(term, word, typoLimit);
    if (distance <= typoLimit) {
      const firstLetterPenalty = term[0] === word[0] ? 0 : 12;
      bestScore = Math.max(bestScore, 78 - distance * 14 - firstLetterPenalty);
    }
  });
  return bestScore;
};

let searchPages = [];
try {
  searchPages = JSON.parse(searchIndexElement?.textContent || '[]').map((page) => ({
    ...page,
    titleSearch: normalizeSearchText(page.title),
    descriptionSearch: normalizeSearchText(page.description),
    sectionSearch: normalizeSearchText(sectionNames[page.section] || page.section),
    aliasesSearch: normalizeSearchText(searchAliases[page.url] || ''),
  }));
} catch (error) {
  console.error('Не удалось загрузить поисковый индекс:', error);
}

const scorePage = (page, terms, normalizedQuery) => {
  let score = 0;
  let matchedTerms = 0;

  if (page.titleSearch === normalizedQuery) score += 1200;
  else if (page.titleSearch.startsWith(normalizedQuery)) score += 700;
  else if (page.titleSearch.includes(normalizedQuery)) score += 460;

  terms.forEach((term) => {
    const termScore = Math.max(
      scoreTermInField(term, page.titleSearch) * 4,
      scoreTermInField(term, page.aliasesSearch) * 2.4,
      scoreTermInField(term, page.sectionSearch) * 1.4,
      scoreTermInField(term, page.descriptionSearch),
    );
    if (termScore > 0) {
      matchedTerms += 1;
      score += termScore;
    }
  });

  return { score, matchedTerms };
};

const searchForPages = (value) => {
  const variants = [value, swapKeyboardLayout(value)]
    .map((variant) => ({ normalized: normalizeSearchText(variant), terms: getQueryTerms(variant) }))
    .filter((variant, index, list) => variant.normalized && list.findIndex((item) => item.normalized === variant.normalized) === index);

  const ranked = searchPages.map((page) => {
    const matches = variants.map((variant) => ({
      ...scorePage(page, variant.terms, variant.normalized),
      termCount: variant.terms.length,
    }));
    const best = matches.sort((left, right) => right.score - left.score)[0] || { score: 0, matchedTerms: 0, termCount: 0 };
    return { page, ...best };
  }).filter((result) => result.score > 0);

  const strict = ranked.filter((result) => result.matchedTerms === result.termCount);
  const candidates = strict.length ? strict : ranked.filter((result) => result.matchedTerms >= Math.ceil(result.termCount / 2));
  return candidates
    .sort((left, right) => right.score - left.score || left.page.title.localeCompare(right.page.title, 'ru'))
    .slice(0, 8);
};

const featuredUrls = ['/', '/getting-started/', '/rules/', '/mechanics/', '/commands/', '/faq/'];
const featuredPages = featuredUrls
  .map((url) => searchPages.find((page) => page.url === url))
  .filter(Boolean)
  .map((page) => ({ page, score: 0, matchedTerms: 0, termCount: 0 }));

let activeSearchIndex = -1;
let renderedSearchResults = [];

const appendHighlightedText = (element, text, terms) => {
  const candidates = terms.filter((term) => term.length >= 2).sort((left, right) => right.length - left.length);
  if (!candidates.length) {
    element.textContent = text;
    return;
  }
  const expression = new RegExp(`(${candidates.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'giu');
  text.split(expression).forEach((part) => {
    if (!part) return;
    const node = candidates.some((term) => normalizeSearchText(part) === term)
      ? document.createElement('mark')
      : document.createTextNode(part);
    if (node.nodeType === Node.ELEMENT_NODE) node.textContent = part;
    element.appendChild(node);
  });
};

const setActiveSearchResult = (index) => {
  const options = [...(searchResultsList?.querySelectorAll('.search-result') || [])];
  if (!options.length) return;
  activeSearchIndex = (index + options.length) % options.length;
  options.forEach((option, optionIndex) => {
    const active = optionIndex === activeSearchIndex;
    option.classList.toggle('is-active', active);
    option.setAttribute('aria-selected', String(active));
  });
  const activeOption = options[activeSearchIndex];
  search?.setAttribute('aria-activedescendant', activeOption.id);
  activeOption.scrollIntoView({ block: 'nearest' });
};

const closeSearchResults = () => {
  if (searchResults) searchResults.hidden = true;
  search?.setAttribute('aria-expanded', 'false');
  search?.removeAttribute('aria-activedescendant');
  searchWrap?.classList.remove('search-open');
  activeSearchIndex = -1;
};

const renderSearchResults = () => {
  if (!search || !searchResults || !searchResultsList || !searchResultsEmpty) return;
  const query = search.value.trim();
  const queryTerms = getQueryTerms(query);
  renderedSearchResults = query ? searchForPages(query) : featuredPages;
  activeSearchIndex = -1;
  searchResultsList.replaceChildren();
  searchResultsTitle.textContent = query
    ? `Результаты: ${renderedSearchResults.length}`
    : 'Быстрый доступ';

  renderedSearchResults.forEach(({ page }, index) => {
    const result = document.createElement('a');
    result.className = 'search-result';
    result.href = page.url;
    result.id = `search-option-${index}`;
    result.setAttribute('role', 'option');
    result.setAttribute('aria-selected', 'false');

    const title = document.createElement('strong');
    appendHighlightedText(title, page.title, queryTerms);
    const description = document.createElement('small');
    description.textContent = page.description.length > 120
      ? `${page.description.slice(0, 117).trim()}…`
      : page.description;
    const section = document.createElement('span');
    section.className = 'search-result__section';
    section.textContent = sectionNames[page.section] || 'Wiki';
    result.append(title, description, section);
    result.addEventListener('mousemove', () => setActiveSearchResult(index));
    searchResultsList.appendChild(result);
  });

  const noResults = Boolean(query) && renderedSearchResults.length === 0;
  searchResultsEmpty.hidden = !noResults;
  searchResultsEmpty.textContent = noResults
    ? `Ничего не найдено по запросу «${query}». Попробуйте название команды, механики или более короткую фразу.`
    : '';
  searchResults.hidden = false;
  search.setAttribute('aria-expanded', 'true');
  searchWrap?.classList.add('search-open');
  if (searchClear) searchClear.hidden = !query;
};

searchTrigger?.addEventListener('click', () => {
  searchWrap?.classList.add('search-open');
  search?.focus();
  renderSearchResults();
});

searchClear?.addEventListener('click', () => {
  search.value = '';
  search.focus();
  renderSearchResults();
});

search?.addEventListener('focus', renderSearchResults);
search?.addEventListener('input', renderSearchResults);
search?.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (searchResults.hidden) renderSearchResults();
    setActiveSearchResult(activeSearchIndex + 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (searchResults.hidden) renderSearchResults();
    setActiveSearchResult(activeSearchIndex - 1);
  } else if (event.key === 'Enter' && renderedSearchResults.length) {
    event.preventDefault();
    const selectedIndex = activeSearchIndex >= 0 ? activeSearchIndex : 0;
    window.location.assign(renderedSearchResults[selectedIndex].page.url);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    if (!searchResults.hidden) closeSearchResults();
    else if (search.value) {
      search.value = '';
      if (searchClear) searchClear.hidden = true;
    }
  }
});

document.addEventListener('click', (event) => {
  if (!searchWrap?.contains(event.target)) closeSearchResults();
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchWrap?.classList.add('search-open');
    search?.focus();
    renderSearchResults();
  } else if (event.key === 'Escape' && document.activeElement !== search) {
    closeSearchResults();
    toggleMenu(false);
  }
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
