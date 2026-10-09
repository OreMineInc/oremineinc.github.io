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
let renderer, scene, camera, controls, content, player, generation = 0, ready = false;
let thumbnailRenderer, thumbnailScene, thumbnailCamera, thumbnailQueue = [], thumbnailBusy = false;
const thumbnails = new Map();
const status = message => { $('status').textContent = message; $('status').hidden = !message; };
const normalize = value => value.toLowerCase().replaceAll('ё', 'е').trim();
const packName = item => catalog.packs[item.pack]?.name || item.pack;

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
  if (entry.helmetModel) {
    const helmet = await library.item(entry); applyDisplay(helmet, 'head');
    const anchor = new THREE.Group(); anchor.scale.setScalar(.625); anchor.add(helmet);
    parts.head.add(anchor);
    return;
  }
  const layers = entry.equipment?.[entry.kind === 'LEGGINGS' ? 'humanoid_leggings' : 'humanoid'];
  if (!layers?.length) throw new Error('Текстура надетой брони отсутствует');
  for (const layer of layers) {
    const tex = await library.texture(layer.texture);
    const add = (part, w, h, d, x, y, inflate, mirror = false) => parts[part].add(playerBox(w, h, d, x, y, tex, inflate, mirror));
    if (entry.kind === 'HELMET') add('head', 8, 8, 8, 0, 0, 1);
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
    const name = document.createElement('span'); name.textContent = label;
    const value = document.createElement('strong'); value.textContent = item ? item.name : 'Не выбрано';
    button.append(name, value);
    button.title = item ? `${label}: ${item.name}. Нажмите, чтобы снять.` : label;
    button.disabled = !item;
    button.addEventListener('click', () => { loadout[slot] = null; renderLoadout(); renderPreview(); });
    $('loadout').append(button);
  }
}

function selectItem(item, equip = true) {
  selected = item;
  $('selected-pack').textContent = packName(item);
  $('selected-name').textContent = item.name;
  $('selected-kind').textContent = kinds[item.kind] || item.kind;
  $('selected-price').textContent = `${money(item.price)} космиков`;
  const armor = armorKinds.includes(item.kind);
  const wearable = item.helmetModel || item.equipment?.humanoid?.length;
  $('selected-note').textContent = !item.available ? 'Товар указан в настройках магазина, но его 3D-модель отсутствует в переданных файлах ресурс-пака.' : armor && !wearable ? 'Предмет можно рассмотреть отдельно и в руке. Текстура надетой брони отсутствует в ресурс-паке.' : armor ? 'Скин надет на персонажа. Примерьте весь комплект или сочетайте его с другими наборами.' : 'Предмет добавлен в выбранную руку. Можно сочетать его с любой бронёй и посмотреть от первого лица.';
  const members = catalog.items.filter(i => i.pack === item.pack);
  const total = members.reduce((sum, i) => sum + i.price, 0);
  $('pack-price').replaceChildren();
  const label = document.createElement('div'); label.textContent = `${packName(item)} · ${members.length} скинов`;
  const price = document.createElement('strong'); price.textContent = `Весь набор: ${money(Math.floor(total * (1 - catalog.packDiscount / 100)))} космиков`;
  const note = document.createElement('div'); note.textContent = `Скидка ${catalog.packDiscount}%. По отдельности: ${money(total)}.`;
  $('pack-price').append(label, price, note);
  $('equip-pack').disabled = !members.some(i => armorKinds.includes(i.kind) && i.available && (i.helmetModel || i.equipment?.humanoid?.length));
  if (equip && item.available) {
    if (armor && wearable) loadout[item.kind] = item;
    else if (!armor) {
      if (item.kind === 'SHIELD') $('hand').value = 'left';
      loadout[$('hand').value] = item;
    }
  }
  app.querySelectorAll('.cosmetic-card').forEach(card => card.setAttribute('aria-pressed', String(card.dataset.item === item.nx_id)));
  renderLoadout(); renderPreview(view === 'item');
}

function filteredItems() {
  const query = normalize($('search').value);
  const terms = query.split(/\s+/).filter(Boolean);
  const list = catalog.items.filter(item => {
    const haystack = normalize(`${item.name} ${packName(item)} ${kinds[item.kind]} ${item.nx_id}`);
    return (!category || category === 'all' || categories[category].includes(item.kind)) && (!$('pack').value || item.pack === $('pack').value) && (!$('kind').value || item.kind === $('kind').value) && terms.every(term => haystack.includes(term));
  });
  const sort = $('sort').value;
  list.sort((a, b) => sort === 'price-asc' ? a.price - b.price : sort === 'price-desc' ? b.price - a.price : sort === 'name' ? a.name.localeCompare(b.name) : packName(a).localeCompare(packName(b)) || a.name.localeCompare(b.name));
  return list;
}

function renderCatalog() {
  const items = filteredItems();
  $('count').textContent = `${items.length} из ${catalog.items.length} скинов · ${Object.keys(catalog.packs).length} наборов`;
  $('grid').replaceChildren(); thumbnailQueue = [];
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
    card.append(thumb, info); card.addEventListener('click', () => selectItem(item)); $('grid').append(card);
    if (ready && item.available) thumbnailQueue.push({ item, element: thumb });
  }
  $('empty').hidden = items.length > 0; $('more').hidden = limit >= items.length;
  processThumbnails();
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
      const { item, element } = thumbnailQueue.shift();
      if (!element.isConnected) continue;
      let url = thumbnails.get(item.nx_id);
      if (!url) {
        try {
          const object = await library.item(item);
          applyDisplay(object, 'gui');
          thumbnailScene.add(object);
          const bounds = new THREE.Box3().setFromObject(object), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
          const dist = Math.max(size.x / thumbnailCamera.aspect, size.y, size.z) * 2.2;
          thumbnailCamera.position.copy(center).add(new THREE.Vector3(0, 0, Math.max(12, dist)));
          thumbnailCamera.lookAt(center);
          thumbnailRenderer.render(thumbnailScene, thumbnailCamera);
          url = thumbnailRenderer.domElement.toDataURL('image/png'); thumbnails.set(item.nx_id, url);
          thumbnailScene.remove(object);
        } catch { element.textContent = 'Нет превью'; continue; }
      }
      if (element.isConnected) { const image = new Image(); image.alt = ''; image.src = url; element.replaceChildren(image); }
      await new Promise(resolve => setTimeout(resolve, 12));
    }
  } finally { thumbnailBusy = false; }
}

function bindControls() {
  app.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    view = button.dataset.view;
    app.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    renderPreview(true);
  }));
  app.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
    category = button.dataset.category; limit = 24;
    app.querySelectorAll('[data-category]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    renderCatalog();
  }));
  for (const id of ['search', 'pack', 'kind', 'sort']) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { limit = 24; renderCatalog(); });
  $('more').addEventListener('click', () => { limit += 24; renderCatalog(); });
  $('reset-camera').addEventListener('click', resetCamera);
  $('rotate').addEventListener('click', () => { const active = $('rotate').getAttribute('aria-pressed') !== 'true'; $('rotate').setAttribute('aria-pressed', String(active)); controls.autoRotate = active; });
  $('clear').addEventListener('click', () => { Object.keys(loadout).forEach(key => loadout[key] = null); renderLoadout(); renderPreview(); });
  $('equip-pack').addEventListener('click', () => {
    for (const kind of armorKinds) loadout[kind] = catalog.items.find(item => item.pack === selected.pack && item.kind === kind && item.available && (item.helmetModel || item.equipment?.humanoid?.length)) || null;
    view = 'player'; app.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
    renderLoadout(); renderPreview(true);
  });
  $('hand').addEventListener('change', () => {
    if (selected?.available && !armorKinds.includes(selected.kind)) {
      for (const key of ['left', 'right']) if (loadout[key] === selected) loadout[key] = null;
      loadout[$('hand').value] = selected;
    }
    renderLoadout(); renderPreview(view === 'hand');
  });
  $('slim').addEventListener('change', () => renderPreview());
  $('skin').addEventListener('change', async () => {
    const file = $('skin').files[0]; if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      if (header.join(',') !== '137,80,78,71,13,10,26,10') throw new Error('Загрузите скин в формате PNG.');
      const image = new Image(); image.src = url; await image.decode();
      if (image.width !== 64 || ![32, 64].includes(image.height)) throw new Error('Нужен PNG-скин размером 64 × 64 или 64 × 32.');
      const nextSkin = new THREE.Texture(image); nextSkin.colorSpace = THREE.SRGBColorSpace;
      nextSkin.minFilter = nextSkin.magFilter = THREE.NearestFilter; nextSkin.generateMipmaps = false; nextSkin.needsUpdate = true;
      if (skin.userData.uploaded) skin.dispose();
      nextSkin.userData.uploaded = true; skin = nextSkin;
      $('skin-note').textContent = `Скин загружен: ${file.name}. Он остаётся в вашем браузере.`;
      await renderPreview();
    } catch (error) { $('skin-note').textContent = error.message; }
    finally { URL.revokeObjectURL(url); }
  });
  $('reset-skin').addEventListener('click', async () => {
    if (skin.userData.uploaded) skin.dispose();
    skin = await library.texture('default-skin.png'); $('skin').value = ''; $('slim').checked = false;
    $('skin-note').textContent = 'PNG 64 × 64 или 64 × 32. Скин остаётся в вашем браузере.'; renderPreview();
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
      for (const selector of ['[data-view]', '#cosmetic-reset-camera', '#cosmetic-rotate', '#cosmetic-skin', '#cosmetic-reset-skin', '#cosmetic-slim']) app.querySelectorAll(selector).forEach(control => control.disabled = true);
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
