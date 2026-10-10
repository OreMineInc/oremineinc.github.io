import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { ModelLibrary, buildPlayer, playerBox, applyDisplay, releaseGeometry } from './cosmetic-models.js';

const app = document.querySelector('#cosmetic-app');
const $ = id => document.getElementById('cosmetic-' + id);
const base = app.dataset.assets;
const library = new ModelLibrary(base);
const kinds = { HELMET: 'Шлем', CHESTPLATE: 'Нагрудник', LEGGINGS: 'Поножи', BOOTS: 'Ботинки', SHIELD: 'Щит', SWORD: 'Меч', AXE: 'Топор', MACE: 'Булава', PICKAXE: 'Кирка', SHOVEL: 'Лопата', HOE: 'Мотыга', ROD: 'Удочка', BOW: 'Лук', CROSSBOW: 'Арбалет', TRIDENT: 'Трезубец' };
const armorKinds = ['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS'];
const categories = { armor: [...armorKinds, 'SHIELD'], weapon: ['SWORD', 'AXE', 'MACE'], tools: ['PICKAXE', 'SHOVEL', 'HOE', 'ROD'], ranged: ['BOW', 'CROSSBOW', 'TRIDENT'] };
const slots = { HELMET: 'Шлем', CHESTPLATE: 'Нагрудник', LEGGINGS: 'Поножи', BOOTS: 'Ботинки', right: 'Правая рука', left: 'Левая рука' };
const loadout = Object.fromEntries(Object.keys(slots).map(key => [key, null]));
const money = number => new Intl.NumberFormat('ru-RU').format(number);
let catalog, selected, skin, view = 'player', category = 'all', limit = 24;
let browsingSlot = null, savedLoadout = null, pendingHandItem = null, openedPack = null;
let skinRequest = 0, skinController = null;
let renderer, scene, camera, controls, content, player, generation = 0, ready = false;
let thumbnailRenderer, thumbnailScene, thumbnailCamera, thumbnailQueue = [], thumbnailBusy = false;
const thumbnails = new Map();
const status = message => { $('status').textContent = message; $('status').hidden = !message; };
const normalize = value => value.toLowerCase().replaceAll('ё', 'е').trim();
const packName = item => catalog.packs[item.pack]?.name || item.pack;
const canWear = item => Boolean(item.helmetModel || item.wearModel || item.equipment?.[item.kind === 'LEGGINGS' ? 'humanoid_leggings' : 'humanoid']?.length);
const packMembers = id => catalog.items.filter(item => item.pack === id);
const packPrice = members => Math.floor(members.reduce((sum, item) => sum + item.price, 0) * (1 - catalog.packDiscount / 100));

function packLoadout(id) {
  const members = packMembers(id);
  const outfit = Object.fromEntries(armorKinds.map(kind => [kind, members.find(item => item.kind === kind && item.available && canWear(item)) || null]));
  const swords = members.filter(item => item.kind === 'SWORD' && item.available);
  outfit.right = swords.find(item => /sword/i.test(item.nx_id)) || swords[0] || null;
  outfit.left = members.find(item => item.kind === 'SHIELD' && item.available) || null;
  return outfit;
}

function packDefaults(id) {
  const outfit = packLoadout(id);
  const armor = armorKinds.filter(kind => outfit[kind]);
  const parts = [];
  if (armor.length) parts.push(armor.length === 4 ? 'Вся броня' : armor.map(kind => kinds[kind]).join(', '));
  if (outfit.right) parts.push('меч — в правую руку');
  if (outfit.left) parts.push('щит — в левую руку');
  const empty = Object.values(outfit).some(item => !item) ? ' Остальные слоты будут пустыми.' : '';
  return parts.length ? `${parts.join(' · ')}.${empty}` : 'В наборе нет брони, меча или щита для автоматической примерки. Выбирайте его предметы отдельно.';
}

function updateCategoryButtons() {
  app.querySelectorAll('[data-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === category)));
}

function showPackIndex() {
  category = 'packs'; openedPack = null; browsingSlot = null; limit = 24;
  $('search').value = ''; $('pack').value = ''; $('kind').value = '';
  $('pack-equipped').textContent = '';
  updateCategoryButtons(); renderLoadout(); renderCatalog();
}

function openPack(id) {
  category = 'packs'; openedPack = id; browsingSlot = null; limit = 24;
  $('pack').value = id; $('kind').value = ''; $('search').value = '';
  $('pack-equipped').textContent = '';
  updateCategoryButtons(); renderLoadout(); renderCatalog();
  $('pack-detail').focus({ preventScroll: true });
  $('pack-detail').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}

function equipPack(id) {
  if (!id) return;
  const outfit = packLoadout(id);
  const focusItem = outfit.right || outfit.HELMET || Object.values(outfit).find(Boolean);
  if (!focusItem) return;
  Object.assign(loadout, outfit);
  $('hand').value = 'right'; setView('player');
  selectItem(focusItem, false, true);
  if (openedPack === id) $('pack-equipped').textContent = `Набор ${catalog.packs[id].name} надет. Можно заменить отдельные предметы или собрать свой образ.`;
  $('stage').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}

function setView(next) {
  view = next;
  app.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
}

function updateSelectionNote() {
  if (!selected) return;
  const item = selected;
  if (!item.available) $('selected-note').textContent = 'Товар указан в настройках магазина, но его 3D-модель отсутствует в переданных файлах ресурс-пака.';
  else if (armorKinds.includes(item.kind)) {
    $('selected-note').textContent = !canWear(item) ? 'Предмет можно рассмотреть отдельно и в руке. Текстура надетой брони отсутствует в ресурс-паке.' : loadout[item.kind] === item ? 'Скин надет на персонажа. Примерьте весь комплект или сочетайте его с другими наборами.' : 'Скин сейчас не надет. Нажмите на его карточку в каталоге, чтобы примерить.';
  } else {
    const hands = ['left', 'right'].filter(hand => loadout[hand] === item);
    const where = hands.length === 2 ? 'обе руки' : hands[0] === 'left' ? 'левую руку' : 'правую руку';
    $('selected-note').textContent = hands.length ? `Предмет добавлен в ${where}. Можно сочетать его с любой бронёй и посмотреть от первого лица.` : 'Нажмите на карточку предмета и выберите руку, чтобы примерить его с вашей бронёй.';
  }
}

function showSlotCatalog(slot) {
  browsingSlot = slot;
  category = 'all'; openedPack = null; limit = 24;
  $('search').value = ''; $('pack').value = ''; $('kind').value = armorKinds.includes(slot) ? slot : ''; $('sort').value = 'name';
  updateCategoryButtons();
  renderLoadout(); renderCatalog();
  if (view !== 'player') { setView('player'); renderPreview(true); }
  $('slot-filter').focus({ preventScroll: true });
  $('slot-filter').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}

function chooseCatalogItem(item) {
  if (item.available && !armorKinds.includes(item.kind)) {
    pendingHandItem = item;
    $('hand-dialog-item').textContent = `${item.name} · ${packName(item)}`;
    $('hand-dialog').showModal();
    const preferred = ['left', 'right'].includes(browsingSlot) ? browsingSlot : $('hand').value;
    app.querySelector(`[data-equip-hand="${preferred}"]`).focus();
  } else selectItem(item);
}

function initRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas: $('canvas'), antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe9f3ff, 0x70839a, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2.2); light.position.set(-20, 40, 35); scene.add(light);
  const fill = new THREE.DirectionalLight(0x9ab9ff, .9); fill.position.set(25, 15, -25); scene.add(fill);
  camera = new THREE.PerspectiveCamera(40, 1, .1, 600);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .08; controls.enablePan = false;
  controls.minDistance = 24; controls.maxDistance = 140;
  controls.maxPolarAngle = Math.PI * .88;
  content = new THREE.Group(); scene.add(content);
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, .7, 64), new THREE.MeshLambertMaterial({ color: 0x263a50 }));
  platform.position.y = -.7; platform.name = 'platform'; scene.add(platform);
  const grid = new THREE.GridHelper(80, 20, 0x48647c, 0x283b50); grid.position.y = -1.1; grid.name = 'floor'; scene.add(grid);
  const resize = () => {
    const width = $('stage').clientWidth, height = $('stage').clientHeight;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    window.dispatchEvent(new Event('cosmetic-preview-change'));
  };
  new ResizeObserver(resize).observe($('stage')); resize();
  $('canvas').addEventListener('webglcontextlost', event => { event.preventDefault(); status('3D-просмотр остановлен браузером. Обновите страницу, чтобы продолжить.'); ready = false; });
  let last = performance.now(), lastFrame = 0, dirty = true;
  controls.addEventListener('change', () => dirty = true);
  window.addEventListener('cosmetic-preview-change', () => dirty = true);
  renderer.setAnimationLoop(time => {
    const delta = Math.min((time - last) / 1000, .1); last = time;
    if (!document.hidden) {
      library.animate(delta); controls.update(delta);
      if (time - lastFrame < 1000 / 30) return;
      const animatedTextures = new Set(library.animations.map(anim => anim.tex));
      let animated = false;
      content.traverse(object => { if (animatedTextures.has(object.material?.map)) animated = true; });
      if (dirty || controls.autoRotate || animated) { renderer.render(scene, camera); dirty = false; lastFrame = time; }
    }
  });
  ready = true;
}

function resetCamera() {
  camera.fov = view === 'hand' ? 70 : 40; camera.updateProjectionMatrix();
  controls.enabled = view !== 'hand';
  controls.autoRotate = $('rotate').getAttribute('aria-pressed') === 'true' && view !== 'hand';
  $('rotate').disabled = view === 'hand';
  if (view === 'player') { controls.target.set(0, 17, 0); camera.position.set(-35, 28, 64); }
  else if (view === 'item') {
    const bounds = new THREE.Box3().setFromObject(content);
    const size = bounds.getSize(new THREE.Vector3());
    const target = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
    controls.target.copy(target);
    const distance = Math.max(26, Math.max(size.x, size.y, size.z) * 2.2);
    controls.minDistance = distance * .4; controls.maxDistance = distance * 3;
    camera.position.copy(target).add(new THREE.Vector3(-distance * .5, distance * .3, distance));
  } else { camera.position.set(0, 0, 0); controls.target.set(0, 0, -30); camera.lookAt(0, 0, -30); }
  if (view === 'player') { controls.minDistance = 24; controls.maxDistance = 140; }
  controls.update();
}

async function addArmor(avatar, entry) {
  const parts = avatar.userData.parts;
  if (entry.helmetModel || entry.wearModel) {
    const helmet = await library.item(entry.wearModel ? { ...entry, model: entry.wearModel } : entry); applyDisplay(helmet, 'head');
    const anchor = new THREE.Group(); anchor.scale.setScalar(.625); anchor.add(helmet);
    parts.head.add(anchor);
    return;
  }
  const layers = entry.equipment?.[entry.kind === 'LEGGINGS' ? 'humanoid_leggings' : 'humanoid'];
  if (!layers?.length) throw new Error('Текстура надетой брони отсутствует');
  for (const layer of layers) {
    const tex = await library.texture(layer.texture);
    const add = (part, w, h, d, x, y, inflate, mirror = false) => parts[part].add(playerBox(w, h, d, x, y, tex, inflate, mirror));
    if (entry.kind === 'HELMET') {
      add('head', 8, 8, 8, 0, 0, 1);
      // Humanoid equipment may put crowns/masks in the hat UVs, not the base head.
      // Keep both shells: Wither and Zero Armor 09/10 use the outer head layer.
      add('head', 8, 8, 8, 32, 0, 1.5);
    }
    if (entry.kind === 'CHESTPLATE') {
      add('body', 8, 12, 4, 16, 16, 1);
      add('rightArm', 4, 12, 4, 40, 16, 1);
      add('leftArm', 4, 12, 4, 40, 16, 1, true);
    }
    if (entry.kind === 'LEGGINGS') {
      add('body', 8, 12, 4, 16, 16, .5);
      add('rightLeg', 4, 12, 4, 0, 16, .5); add('leftLeg', 4, 12, 4, 0, 16, .5, true);
    }
    if (entry.kind === 'BOOTS') { add('rightLeg', 4, 12, 4, 0, 16, 1); add('leftLeg', 4, 12, 4, 0, 16, 1, true); }
  }
}

async function heldItem(avatar, entry, hand) {
  const object = await library.item(entry);
  const part = avatar.userData.parts[hand === 'right' ? 'rightArm' : 'leftArm'];
  // Minecraft's third-person item transform: rotate the item -90° around X and 180° around Y,
  // then use the grip near the bottom of the arm. Display coordinates are in model pixels.
  const grip = new THREE.Group(); grip.position.set(0, -4, 1);
  grip.rotation.set(Math.PI / 2, Math.PI, 0);
  applyDisplay(object, `thirdperson_${hand}hand`);
  grip.add(object); part.add(grip);
}

async function firstPerson(target, entry, hand) {
  if (!entry?.available) throw new Error('Для этого предмета 3D-модель отсутствует в переданных файлах.');
  const sign = hand === 'right' ? 1 : -1;
  const object = await library.item(entry);
  const anchor = new THREE.Group();
  // Resting, fully equipped Minecraft hand pose; resource-pack coordinates use 16 pixels per block.
  // At zero swing the two vanilla Y rotations cancel. A held item does not render a separate skin arm.
  anchor.position.set(sign * .56 * 16, -.52 * 16, -.72 * 16);
  // ModelLibrary reflects Z for the front-facing character/item views. Undo that reflection here
  // so the game's FIRST_PERSON display transform uses the original camera-space coordinates.
  anchor.scale.z = -1;
  applyDisplay(object, `firstperson_${hand}hand`);
  anchor.add(object); target.add(anchor);
}

async function renderPreview(reframe = false) {
  if (!ready) return;
  const token = ++generation;
  const currentView = view;
  app.dataset.view = currentView;
  app.dataset.previewReady = 'false';
  status('Загружаем примерку…');
  const next = new THREE.Group();
  try {
    if (currentView === 'player') {
      const avatar = buildPlayer(skin, $('slim').checked);
      await Promise.all(Object.entries(loadout).filter(([, item]) => item?.available).map(async ([slot, item]) => {
        if (armorKinds.includes(slot)) await addArmor(avatar, item); else await heldItem(avatar, item, slot);
      }));
      next.add(avatar); player = avatar;
    } else if (currentView === 'item') {
      if (!selected?.available) throw new Error('Для этого предмета 3D-модель отсутствует в переданных файлах.');
      const item = await library.item(selected); next.add(item);
    } else if (currentView === 'hand') {
      await firstPerson(next, selected, $('hand').value);
    }
    if (token !== generation) { releaseGeometry(next); return; }
    const old = content;
    scene.remove(old); content = next; scene.add(content); releaseGeometry(old);
    scene.getObjectByName('platform').visible = view === 'player';
    scene.getObjectByName('floor').visible = view === 'player';
    $('crosshair').hidden = view !== 'hand';
    $('stage-label').textContent = view === 'player' ? 'Ваш образ' : view === 'hand' ? 'Вид от первого лица' : selected.name;
    app.querySelector('.cosmetic-hint').textContent = view === 'hand' ? 'Ракурс от первого лица фиксирован. Выберите предмет и руку, чтобы сравнить его вид.' : 'Перетаскивайте, чтобы повернуть · колесо или жест двумя пальцами — приблизить.';
    if (reframe) resetCamera();
    window.dispatchEvent(new Event('cosmetic-preview-change'));
    status('');
    app.dataset.previewReady = 'true';
  } catch (error) {
    if (token === generation) { status(error.message); app.dataset.previewReady = 'false'; }
    releaseGeometry(next);
    console.error('Cosmetic preview:', error);
  }
}

function renderLoadout() {
  $('loadout').replaceChildren();
  for (const [slot, label] of Object.entries(slots)) {
    const item = loadout[slot];
    const button = document.createElement('button'); button.type = 'button'; button.className = 'cosmetic-slot';
    button.dataset.slot = slot; button.dataset.item = item?.nx_id || ''; button.dataset.browsing = String(browsingSlot === slot);
    const name = document.createElement('span'); name.textContent = label;
    const value = document.createElement('strong'); value.textContent = item ? item.name : 'Не выбрано';
    button.append(name, value);
    button.title = item ? `${label}: ${item.name}. Нажмите, чтобы снять.` : `${label}: показать подходящую косметику в каталоге.`;
    button.setAttribute('aria-controls', 'cosmetic-grid');
    button.addEventListener('click', () => {
      if (item) { loadout[slot] = null; renderLoadout(); app.querySelector(`.cosmetic-slot[data-slot="${slot}"]`).focus({ preventScroll: true }); renderPreview(); }
      else showSlotCatalog(slot);
    });
    $('loadout').append(button);
  }
  $('clear').textContent = savedLoadout ? 'Вернуть комплект' : 'Снять всё';
  $('clear').disabled = !savedLoadout && !Object.values(loadout).some(Boolean);
  $('clear').title = savedLoadout ? 'Вернуть экипировку, которая была до нажатия «Снять всё».' : 'Снять экипировку. Повторное нажатие вернёт этот комплект.';
  updateSelectionNote();
}

function selectItem(item, equip = true, reframe = view === 'item') {
  selected = item;
  $('selected-pack').textContent = packName(item);
  $('selected-name').textContent = item.name;
  $('selected-kind').textContent = kinds[item.kind] || item.kind;
  $('selected-price').textContent = `${money(item.price)} космиков`;
  const armor = armorKinds.includes(item.kind);
  const wearable = canWear(item);
  const members = packMembers(item.pack);
  const total = members.reduce((sum, i) => sum + i.price, 0);
  $('pack-price').replaceChildren();
  const label = document.createElement('div'); label.textContent = `${packName(item)} · ${members.length} скинов`;
  const price = document.createElement('strong'); price.textContent = `Весь набор: ${money(packPrice(members))} космиков`;
  const note = document.createElement('div'); note.textContent = `Скидка ${catalog.packDiscount}%. По отдельности: ${money(total)}.`;
  $('pack-price').append(label, price, note);
  $('equip-pack').disabled = !Object.values(packLoadout(item.pack)).some(Boolean);
  $('equip-pack').title = packDefaults(item.pack);
  if (equip && item.available) {
    if (armor && wearable) loadout[item.kind] = item;
    else if (!armor) {
      loadout[$('hand').value] = item;
    }
  }
  app.querySelectorAll('.cosmetic-card').forEach(card => card.setAttribute('aria-pressed', String(card.dataset.item === item.nx_id)));
  renderLoadout(); renderPreview(reframe);
}

function filteredItems() {
  const query = normalize($('search').value);
  const terms = query.split(/\s+/).filter(Boolean);
  const list = catalog.items.filter(item => {
    const haystack = normalize(`${item.name} ${packName(item)} ${kinds[item.kind]} ${item.nx_id}`);
    const matchesSlot = !browsingSlot || (armorKinds.includes(browsingSlot) ? item.kind === browsingSlot && item.available && canWear(item) : !armorKinds.includes(item.kind) && item.available);
    return matchesSlot && (category === 'all' || category === 'packs' || categories[category]?.includes(item.kind)) && (!$('pack').value || item.pack === $('pack').value) && (!$('kind').value || item.kind === $('kind').value) && terms.every(term => haystack.includes(term));
  });
  const sort = $('sort').value;
  list.sort((a, b) => sort === 'price-asc' ? a.price - b.price : sort === 'price-desc' ? b.price - a.price : sort === 'name' ? a.name.localeCompare(b.name) : packName(a).localeCompare(packName(b)) || a.name.localeCompare(b.name));
  return list;
}

function renderCatalog() {
  const items = filteredItems();
  const packIndex = category === 'packs' && !openedPack;
  $('kind').parentElement.hidden = packIndex;
  $('pack-detail').hidden = !openedPack;
  if (openedPack) {
    const members = packMembers(openedPack);
    $('pack-title').textContent = catalog.packs[openedPack].name;
    $('pack-summary').textContent = `${members.length} скинов · ${catalog.skinDays} дней · ${money(packPrice(members))} космиков за весь набор со скидкой ${catalog.packDiscount}%`;
    $('pack-defaults').textContent = packDefaults(openedPack);
    $('equip-opened-pack').disabled = !Object.values(packLoadout(openedPack)).some(Boolean);
  }
  $('slot-filter').hidden = !browsingSlot;
  $('slot-filter-label').textContent = browsingSlot ? `${slots[browsingSlot]}: подходящие предметы` : '';
  $('count').textContent = `${items.length} из ${catalog.items.length} скинов · ${Object.keys(catalog.packs).length} наборов`;
  $('grid').replaceChildren(); thumbnailQueue = [];
  if (packIndex) { renderPacks(items); return; }
  for (const item of items.slice(0, limit)) {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'cosmetic-card'; card.dataset.item = item.nx_id;
    card.setAttribute('aria-pressed', String(item.nx_id === selected?.nx_id));
    const thumb = document.createElement('span'); thumb.className = 'cosmetic-thumbnail'; thumb.textContent = item.available ? '3D' : 'Нет модели';
    const info = document.createElement('span'); info.className = 'cosmetic-card-info';
    const title = document.createElement('strong'); title.textContent = item.name;
    const sub = document.createElement('small'); sub.textContent = `${packName(item)} · ${kinds[item.kind]}`;
    const bottom = document.createElement('span'); bottom.className = 'cosmetic-card-bottom';
    const price = document.createElement('span'); price.className = 'cosmetic-card-price'; price.textContent = `${money(item.price)} космиков`;
    bottom.append(price); info.append(title, sub, bottom);
    if (!item.available) { const badge = document.createElement('span'); badge.className = 'cosmetic-card-unavailable'; badge.textContent = 'Примерка недоступна'; info.append(badge); }
    card.append(thumb, info); card.addEventListener('click', () => chooseCatalogItem(item)); $('grid').append(card);
    if (ready && item.available) thumbnailQueue.push({ item, element: thumb });
  }
  $('empty').hidden = items.length > 0; $('more').hidden = limit >= items.length;
  processThumbnails();
}

function renderPacks(items) {
  const ids = [...new Set(items.map(item => item.pack))];
  const sort = $('sort').value;
  ids.sort((a, b) => sort === 'price-asc' ? packPrice(packMembers(a)) - packPrice(packMembers(b)) : sort === 'price-desc' ? packPrice(packMembers(b)) - packPrice(packMembers(a)) : catalog.packs[a].name.localeCompare(catalog.packs[b].name, 'ru', { numeric: true }));
  $('count').textContent = `${ids.length} из ${Object.keys(catalog.packs).length} наборов`;
  for (const id of ids.slice(0, limit)) {
    const members = packMembers(id);
    const card = document.createElement('button'); card.type = 'button'; card.className = 'cosmetic-card cosmetic-pack-card'; card.dataset.pack = id;
    card.setAttribute('aria-label', `Открыть набор ${catalog.packs[id].name}`);
    const thumb = document.createElement('span'); thumb.className = 'cosmetic-thumbnail'; thumb.textContent = '3D';
    const info = document.createElement('span'); info.className = 'cosmetic-card-info';
    const title = document.createElement('strong'); title.textContent = catalog.packs[id].name;
    const sub = document.createElement('small'); sub.textContent = `${members.length} скинов · ${catalog.skinDays} дней`;
    const bottom = document.createElement('span'); bottom.className = 'cosmetic-card-bottom';
    const price = document.createElement('span'); price.className = 'cosmetic-card-price'; price.textContent = `${money(packPrice(members))} космиков`;
    const action = document.createElement('span'); action.className = 'cosmetic-pack-open'; action.textContent = 'Смотреть набор →';
    bottom.append(price, action); info.append(title, sub, bottom); card.append(thumb, info);
    card.addEventListener('click', () => openPack(id)); $('grid').append(card);
    if (ready) thumbnailQueue.push({ pack: id, element: thumb });
  }
  $('empty').hidden = ids.length > 0; $('more').hidden = limit >= ids.length;
  processThumbnails();
}

async function packThumbnail(id) {
  const outfit = packLoadout(id);
  if (armorKinds.some(kind => outfit[kind])) {
    const avatar = buildPlayer(await library.texture('default-skin.png'), false);
    try {
      await Promise.all(Object.entries(outfit).filter(([, item]) => item).map(async ([slot, item]) => armorKinds.includes(slot) ? addArmor(avatar, item) : heldItem(avatar, item, slot)));
      return avatar;
    } catch (error) { releaseGeometry(avatar); throw error; }
  }
  const members = packMembers(id);
  const item = members.find(item => item.nx_id === catalog.packs[id].nx_id && item.available) || members.find(item => item.available);
  const object = await library.item(item); applyDisplay(object, 'gui');
  return object;
}

async function processThumbnails() {
  if (thumbnailBusy || !ready) return;
  thumbnailBusy = true;
  if (!thumbnailRenderer) {
    thumbnailRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    thumbnailRenderer.setSize(192, 144); thumbnailRenderer.outputColorSpace = THREE.SRGBColorSpace;
    thumbnailScene = new THREE.Scene();
    thumbnailScene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(-20, 40, 30); thumbnailScene.add(light);
    thumbnailCamera = new THREE.PerspectiveCamera(35, 192 / 144, .1, 1000);
  }
  try {
    while (thumbnailQueue.length) {
      const { item, pack, element } = thumbnailQueue.shift();
      if (!element.isConnected) continue;
      const key = pack ? `pack:${pack}` : item.nx_id;
      let url = thumbnails.get(key);
      if (!url) {
        let object;
        try {
          thumbnailRenderer.setSize(192, pack ? 192 : 144);
          thumbnailCamera.aspect = pack ? 1 : 192 / 144; thumbnailCamera.updateProjectionMatrix();
          object = pack ? await packThumbnail(pack) : await library.item(item);
          if (!pack) applyDisplay(object, 'gui');
          thumbnailScene.add(object);
          const bounds = new THREE.Box3().setFromObject(object), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
          const dist = Math.max(size.x / thumbnailCamera.aspect, size.y, size.z) * 2.2;
          const distance = Math.max(12, dist);
          thumbnailCamera.position.copy(center).add(pack && armorKinds.some(kind => packLoadout(pack)[kind]) ? new THREE.Vector3(-distance * .4, distance * .15, distance) : new THREE.Vector3(0, 0, distance));
          thumbnailCamera.lookAt(center);
          thumbnailRenderer.render(thumbnailScene, thumbnailCamera);
          url = thumbnailRenderer.domElement.toDataURL('image/png'); thumbnails.set(key, url);
        } catch { element.textContent = 'Нет превью'; continue; }
        finally { if (object) { thumbnailScene.remove(object); releaseGeometry(object); } }
      }
      if (element.isConnected) { const image = new Image(); image.alt = ''; image.src = url; element.replaceChildren(image); }
      await new Promise(resolve => setTimeout(resolve, 12));
    }
  } finally { thumbnailBusy = false; }
}

function cancelSkinRequest() {
  skinRequest++;
  skinController?.abort(); skinController = null;
  $('skin-name-load').disabled = !ready; $('skin-name-load').textContent = 'Применить скин';
  return skinRequest;
}

async function applySkinBlob(blob, token, message) {
  if (!blob.size || blob.size > 1024 * 1024) throw new Error('Скин должен быть PNG-файлом размером не более 1 МБ.');
  const header = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if (header.join(',') !== '137,80,78,71,13,10,26,10') throw new Error('Не получен PNG-скин. Попробуйте загрузить файл вручную.');
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image(); image.src = url; await image.decode();
    if (image.width !== 64 || ![32, 64].includes(image.height)) throw new Error('Нужен PNG-скин размером 64 × 64 или 64 × 32.');
    if (token !== skinRequest) return;
    const nextSkin = new THREE.Texture(image); nextSkin.colorSpace = THREE.SRGBColorSpace;
    nextSkin.minFilter = nextSkin.magFilter = THREE.NearestFilter; nextSkin.generateMipmaps = false; nextSkin.needsUpdate = true;
    nextSkin.userData.custom = true;
    const previous = skin; skin = nextSkin;
    $('skin-note').textContent = message;
    await renderPreview();
    if (previous?.userData.custom) previous.dispose();
  } finally { URL.revokeObjectURL(url); }
}

async function loadNicknameSkin() {
  const token = cancelSkinRequest();
  const nickname = $('skin-name').value.trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(nickname)) {
    $('skin-note').textContent = 'Введите Minecraft-ник: от 3 до 16 латинских букв, цифр или символов подчёркивания.';
    return;
  }
  const controller = new AbortController(); skinController = controller;
  $('skin-name-load').disabled = true; $('skin-name-load').textContent = 'Загружаем…';
  $('skin-note').textContent = `Ищем скин игрока ${nickname}…`;
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`https://mc-heads.net/skin/${encodeURIComponent(nickname)}`, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(response.status === 404 ? 'Скин по этому нику не найден. Проверьте ник или загрузите PNG.' : 'Сервис скинов временно недоступен. Попробуйте ещё раз или загрузите PNG.');
    await applySkinBlob(await response.blob(), token, `Скин загружен по нику ${nickname}. Можно примерять косметику; PNG на сервер вики не отправляется.`);
    if (token === skinRequest) $('skin').value = '';
  } catch (error) {
    if (token === skinRequest) $('skin-note').textContent = error.name === 'AbortError' ? 'Сервис скинов не ответил вовремя. Попробуйте ещё раз или загрузите PNG.' : error instanceof TypeError ? 'Не удалось связаться с сервисом скинов. Проверьте интернет или загрузите PNG.' : error.message;
  } finally {
    clearTimeout(timeout);
    if (token === skinRequest) { skinController = null; $('skin-name-load').disabled = !ready; $('skin-name-load').textContent = 'Применить скин'; }
  }
}

function bindControls() {
  app.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    setView(button.dataset.view);
    renderPreview(true);
  }));
  app.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.category === 'packs') { showPackIndex(); return; }
    if (openedPack) $('pack').value = '';
    openedPack = null;
    category = button.dataset.category; limit = 24; browsingSlot = null; $('kind').value = '';
    updateCategoryButtons();
    renderLoadout(); renderCatalog();
  }));
  for (const id of ['search', 'pack', 'kind', 'sort']) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => {
    limit = 24;
    if (id === 'kind') { browsingSlot = null; renderLoadout(); }
    if (id === 'pack' && openedPack) { openedPack = $('pack').value || null; $('pack-equipped').textContent = ''; }
    renderCatalog();
  });
  $('slot-filter-clear').addEventListener('click', () => {
    browsingSlot = null; openedPack = null; category = 'all'; limit = 24;
    $('kind').value = ''; $('pack').value = ''; $('search').value = '';
    updateCategoryButtons();
    renderLoadout(); renderCatalog();
  });
  app.querySelectorAll('[data-equip-hand]').forEach(button => button.addEventListener('click', () => {
    const item = pendingHandItem;
    if (!item) return;
    $('hand').value = button.dataset.equipHand;
    pendingHandItem = null; $('hand-dialog').close();
    selectItem(item);
  }));
  $('hand-cancel').addEventListener('click', () => $('hand-dialog').close());
  $('hand-dialog').addEventListener('close', () => { if (!$('hand-dialog').open) pendingHandItem = null; });
  $('more').addEventListener('click', () => { limit += 24; renderCatalog(); });
  $('reset-camera').addEventListener('click', resetCamera);
  $('rotate').addEventListener('click', () => { const active = $('rotate').getAttribute('aria-pressed') !== 'true'; $('rotate').setAttribute('aria-pressed', String(active)); controls.autoRotate = active; });
  $('clear').addEventListener('click', () => {
    if (savedLoadout) { Object.assign(loadout, savedLoadout); savedLoadout = null; }
    else if (Object.values(loadout).some(Boolean)) { savedLoadout = { ...loadout }; Object.keys(loadout).forEach(key => loadout[key] = null); }
    const reframe = view !== 'player'; setView('player');
    renderLoadout(); renderPreview(reframe);
  });
  $('equip-pack').addEventListener('click', () => equipPack(selected?.pack));
  $('equip-opened-pack').addEventListener('click', () => equipPack(openedPack));
  $('back-packs').addEventListener('click', () => { showPackIndex(); app.querySelector('[data-category="packs"]').focus({ preventScroll: true }); });
  $('hand').addEventListener('change', () => {
    if (selected?.available && !armorKinds.includes(selected.kind)) {
      for (const key of ['left', 'right']) if (loadout[key] === selected) loadout[key] = null;
      loadout[$('hand').value] = selected;
    }
    renderLoadout(); renderPreview(view === 'hand');
  });
  $('slim').addEventListener('change', () => renderPreview());
  $('skin-name-form').addEventListener('submit', event => { event.preventDefault(); loadNicknameSkin(); });
  $('skin').addEventListener('change', async () => {
    const file = $('skin').files[0]; if (!file) return;
    const token = cancelSkinRequest();
    try {
      await applySkinBlob(file, token, `Скин загружен: ${file.name}. Он остаётся в вашем браузере.`);
      if (token === skinRequest) $('skin-name').value = '';
    } catch (error) { if (token === skinRequest) $('skin-note').textContent = error.message; }
  });
  $('reset-skin').addEventListener('click', async () => {
    const token = cancelSkinRequest();
    const defaultSkin = await library.texture('default-skin.png');
    if (token !== skinRequest) return;
    const previous = skin; skin = defaultSkin;
    $('skin').value = ''; $('skin-name').value = ''; $('slim').checked = false;
    $('skin-note').textContent = 'PNG 64 × 64 или 64 × 32. Скин остаётся в вашем браузере.';
    await renderPreview();
    if (previous?.userData.custom) previous.dispose();
  });
}

async function start() {
  try {
    const response = await fetch(base + 'catalog.json');
    if (!response.ok) throw new Error('Не удалось загрузить каталог. Обновите страницу.');
    catalog = await response.json();
    for (const [id, pack] of Object.entries(catalog.packs).sort((a, b) => a[1].name.localeCompare(b[1].name))) { const option = new Option(pack.name, id); $('pack').add(option); }
    for (const [kind, name] of Object.entries(kinds)) $('kind').add(new Option(name, kind));
    try { initRenderer(); skin = await library.texture('default-skin.png'); }
    catch (error) {
      ready = false;
      status('Браузер не запустил 3D-просмотр. Включите аппаратное ускорение или попробуйте другой браузер. Каталог доступен ниже.');
      for (const selector of ['[data-view]', '#cosmetic-reset-camera', '#cosmetic-rotate', '#cosmetic-skin', '#cosmetic-reset-skin', '#cosmetic-slim', '#cosmetic-skin-name', '#cosmetic-skin-name-load']) app.querySelectorAll(selector).forEach(control => control.disabled = true);
      console.error(error);
    }
    bindControls(); renderCatalog();
    const initial = catalog.items.find(i => i.nx_id === 'amethyst_sword2') || catalog.items.find(i => i.available);
    selectItem(initial);
    if (ready) {
      for (const kind of armorKinds) loadout[kind] = catalog.items.find(i => i.pack === initial.pack && i.kind === kind && i.available);
      renderLoadout(); await renderPreview(true);
    }
    app.dataset.catalogReady = 'true';
  } catch (error) { status(error.message); console.error(error); }
}
start();
