import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// npm dependencies live outside the Jekyll checkout; only the static output is published.
const require = createRequire(path.resolve(process.env.COSMETICS_TOOLS || '../work/cosmetics-tools/package.json'));
const YAML = require('yaml');
const [cosmeticDir, nexoDir, compiledDir, ...fallbackDirs] = process.argv.slice(2);
if (!compiledDir) throw new Error('Usage: node tools/import-cosmetics.mjs OreCosmetic Nexo extracted-pack [archived-Nexo ...]');
const output = path.resolve('assets/cosmetics');
fs.mkdirSync(output, { recursive: true });
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const definitions = {};
for (const file of walk(path.join(nexoDir, 'items')).filter(f => /\.ya?ml$/i.test(f))) {
  Object.assign(definitions, YAML.parse(fs.readFileSync(file, 'utf8')));
}
const skins = readJSON(path.join(cosmeticDir, 'skins.json'));
const packs = readJSON(path.join(cosmeticDir, 'packs.json'));
const config = fs.readFileSync(path.join(cosmeticDir, 'config.json'), 'utf8');
const setting = (key, fallback) => Number(config.match(new RegExp(`\\b${key}:\\s*(\\d+)`))?.[1] || fallback);
const packRoots = (dir) => {
  const result = [path.join(dir, 'pack/assets')];
  const external = path.join(dir, 'pack/external_packs');
  if (fs.existsSync(external)) for (const entry of fs.readdirSync(external, { withFileTypes: true })) {
    if (entry.isDirectory() && fs.existsSync(path.join(external, entry.name, 'assets'))) result.push(path.join(external, entry.name, 'assets'));
  }
  return result;
};
const primaryRoots = [path.join(compiledDir, 'assets'), ...packRoots(nexoDir)];
// Archives only fill missing files; current-wipe assets and shop definitions always win.
const roots = [...primaryRoots, ...fallbackDirs.flatMap(packRoots)];
const recoveredModels = new Set();
const within = (root, file) => {
  const relative = path.relative(root, file);
  return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep);
};
const splitRef = (ref, defaultNamespace = 'minecraft') => ref.includes(':') ? ref.split(':') : [defaultNamespace, ref];
const locate = (ref, folder, ext) => {
  ref = ref.replace(new RegExp(`${ext.replace('.', '\\.')}$$`), '');
  const [ns, name] = splitRef(ref);
  for (const root of roots) {
    const file = path.join(root, ns, folder, name + ext);
    if (fs.existsSync(file)) return file;
  }
  return null;
};
const issues = [];
const copied = new Set();
const animationInfo = {};
const texture = (ref, folder = 'textures') => {
  const file = locate(ref, folder, '.png');
  if (!file) { issues.push(`Missing texture: ${ref}`); return null; }
  const [ns, name] = splitRef(ref);
  const relative = `textures/${ns}/${name}.png`;
  const target = path.join(output, relative);
  if (!copied.has(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file, target);
    if (fs.existsSync(file + '.mcmeta')) fs.copyFileSync(file + '.mcmeta', target + '.mcmeta');
    if (fs.existsSync(file + '.mcmeta')) {
      const meta = readJSON(file + '.mcmeta');
      if (meta.animation) animationInfo[relative] = meta.animation;
    }
    copied.add(target);
  }
  return relative;
};
const modelCache = new Map();
const model = (ref, seen = new Set()) => {
  if (modelCache.has(ref)) return modelCache.get(ref);
  if (seen.has(ref)) throw new Error(`Model inheritance cycle: ${ref}`);
  const file = locate(ref, 'models', '.json');
  const fallback = path.resolve('tools/vanilla-models', ref.replace(/^minecraft:/, '').replace(/^item\//, '') + '.json');
  if (!file && !fs.existsSync(fallback)) return null;
  if (file && !primaryRoots.some(root => within(root, file))) recoveredModels.add(ref);
  const raw = readJSON(file || fallback);
  seen.add(ref);
  const parent = raw.parent ? model(raw.parent, seen) : null;
  const merged = { ...parent, ...raw, textures: { ...parent?.textures, ...raw.textures }, display: { ...parent?.display, ...raw.display } };
  delete merged.overrides;
  delete merged.groups;
  delete merged.mcmodels;
  modelCache.set(ref, merged);
  return merged;
};
const normalizedModel = (raw) => {
  const result = { ...raw, textures: {} };
  const resolveTexture = (value, seen = new Set()) => {
    if (!value?.startsWith('#')) return value;
    if (seen.has(value)) return null;
    seen.add(value);
    return resolveTexture(raw.textures[value.slice(1)], seen);
  };
  for (const [key, value] of Object.entries(raw.textures || {})) {
    if (key === 'particle') continue;
    const ref = resolveTexture(value);
    if (ref) result.textures[key] = texture(ref);
  }
  return result;
};
const legacyEquipment = (ref, type) => {
  const [ns] = splitRef(ref);
  const number = type === 'humanoid_leggings' ? '2' : '1';
  for (const root of roots) {
    const dir = path.join(root, ns, 'textures');
    if (!fs.existsSync(dir)) continue;
    const found = walk(dir).find(file => new RegExp(`(?:armor_)?layer_?${number}\\.png$`).test(file));
    if (found) return texture(`${ns}:${path.relative(dir, found).replaceAll('\\', '/').replace(/\.png$/, '')}`);
  }
  return null;
};
const equipment = (ref) => {
  const file = locate(ref, 'equipment', '.json') || locate(ref, 'models/equipment', '.json');
  const raw = file ? readJSON(file) : {};
  const result = {};
  for (const type of ['humanoid', 'humanoid_leggings']) {
    result[type] = (raw.layers?.[type] || []).map(layer => {
      const [ns, name] = splitRef(layer.texture);
      const texRef = `${ns}:entity/equipment/${type}/${name}`;
      return { ...layer, texture: locate(texRef, 'textures', '.png') ? texture(texRef) : legacyEquipment(ref, type) };
    }).filter(layer => layer.texture);
    if (!result[type].length) {
      const fallback = legacyEquipment(ref, type);
      if (fallback) result[type] = [{ texture: fallback }];
    }
  }
  return result.humanoid.length ? result : null;
};
const items = skins.map((skin) => {
  const def = definitions[skin.nx_id];
  if (!def) { issues.push(`Missing Nexo item: ${skin.nx_id}`); return { ...skin, available: false }; }
  const pack = def.Pack || {};
  let raw = pack.model ? model(pack.model) : null;
  if (!raw && pack.texture) raw = { parent: pack.parent_model || 'item/generated', textures: { layer0: pack.texture } };
  if (raw?.parent && !raw.elements?.length) {
    const parent = model(raw.parent);
    raw = { ...parent, ...raw, textures: { ...parent?.textures, ...raw.textures }, display: { ...parent?.display, ...raw.display } };
  }
  // Nexo also writes generated item models to the compiled resource pack.
  if (!raw) raw = model(`minecraft:item/${skin.nx_id}`) || model(`nexo:item/${skin.nx_id}`);
  const entry = { ...skin, material: def.material, available: Boolean(raw) };
  if (raw) {
    const data = normalizedModel(raw);
    const file = `models/${skin.nx_id}.json`;
    fs.mkdirSync(path.join(output, 'models'), { recursive: true });
    fs.writeFileSync(path.join(output, file), JSON.stringify(data));
    entry.model = file;
    entry.icon = data.textures.layer0 || Object.values(data.textures).find(Boolean);
    if (!raw.elements?.length && !entry.icon) { entry.available = false; issues.push(`No model geometry or texture: ${skin.nx_id}`); }
  } else issues.push(`Missing model: ${skin.nx_id}`);
  const equippable = def.Components?.equippable;
  if (equippable?.asset_id) entry.equipment = equipment(equippable.asset_id);
  else if (def.trim_pattern) entry.equipment = equipment(def.trim_pattern);
  entry.helmetModel = skin.kind === 'HELMET' && Boolean(raw?.elements?.length) && !entry.equipment?.humanoid?.length;
  if (['CHESTPLATE', 'LEGGINGS', 'BOOTS', 'HELMET'].includes(skin.kind) && !entry.helmetModel && !entry.equipment?.humanoid?.length) {
    issues.push(`Missing wearable equipment: ${skin.nx_id}`);
  }
  return entry;
});
const catalog = {
  skinDays: setting('skin_days', 30), cooldownMinutes: setting('apply_cooldown_minutes', 30),
  packDiscount: setting('pack_discount_percent', 20), packs, items,
};
fs.writeFileSync(path.join(output, 'catalog.json'), JSON.stringify(catalog));
fs.writeFileSync(path.join(output, 'texture-animation.json'), JSON.stringify(animationInfo));
const report = {
  items: items.length, packs: Object.keys(packs).length, available: items.filter(i => i.available).length,
  copiedTextures: copied.size,
  recoveredItems: items.filter(item => recoveredModels.has(definitions[item.nx_id]?.Pack?.model)).map(item => item.nx_id),
  recoveredModels: [...recoveredModels], issues: [...new Set(issues)],
};
fs.writeFileSync(path.join(output, 'import-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
// Vendor browser dependencies locally, retaining their licenses.
for (const [source, dest] of [['three/build/three.module.min.js', 'three.module.min.js'], ['three/build/three.core.min.js', 'three.core.min.js'], ['three/examples/jsm/controls/OrbitControls.js', 'OrbitControls.js'], ['three/LICENSE', 'THREE-LICENSE.txt']]) {
  const root = path.dirname(path.dirname(require.resolve('three')));
  const target = path.resolve('assets/js/vendor', dest);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, source.replace(/^three\//, '')), target);
}
