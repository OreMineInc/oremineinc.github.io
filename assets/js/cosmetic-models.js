import * as THREE from 'three';

const radians = THREE.MathUtils.degToRad;
const faces = {
  north: (a, b) => [[b[0], b[1], a[2]], [a[0], b[1], a[2]], [a[0], a[1], a[2]], [b[0], a[1], a[2]]],
  south: (a, b) => [[a[0], b[1], b[2]], [b[0], b[1], b[2]], [b[0], a[1], b[2]], [a[0], a[1], b[2]]],
  east: (a, b) => [[b[0], b[1], b[2]], [b[0], b[1], a[2]], [b[0], a[1], a[2]], [b[0], a[1], b[2]]],
  west: (a, b) => [[a[0], b[1], a[2]], [a[0], b[1], b[2]], [a[0], a[1], b[2]], [a[0], a[1], a[2]]],
  up: (a, b) => [[a[0], b[1], b[2]], [b[0], b[1], b[2]], [b[0], b[1], a[2]], [a[0], b[1], a[2]]],
  down: (a, b) => [[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], a[1], b[2]], [a[0], a[1], b[2]]],
};

const quad = (buffer, vertices, uv, rotation = 0, reverseWinding = false) => {
  const [u1, v1, u2, v2] = uv;
  const coords = [[u1, 1 - v1], [u2, 1 - v1], [u2, 1 - v2], [u1, 1 - v2]];
  const shift = (rotation / 90) % 4;
  for (const i of reverseWinding ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) {
    buffer.positions.push(...vertices[i]);
    buffer.uvs.push(...coords[(i + shift + 4) % 4]);
  }
};
const geometry = (buffer, reverseWinding = false) => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buffer.positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(buffer.uvs, 2));
  if (reverseWinding) {
    const indices = [];
    for (let i = 0; i < buffer.positions.length / 3; i += 3) indices.push(i, i + 2, i + 1);
    geo.setIndex(indices);
  }
  geo.computeVertexNormals();
  return geo;
};
// Resource packs contain inward-facing shells as well as outer faces. Rendering both
// sides makes those shells cover the intended texture (notably the Ender set).
const material = (map) => new THREE.MeshLambertMaterial({ map, transparent: false, alphaTest: .05, side: THREE.FrontSide });

export class ModelLibrary {
  constructor(base) {
    this.base = base; this.textures = new Map(); this.models = new Map(); this.animations = [];
    this.animationInfo = fetch(base + 'texture-animation.json').then(response => {
      if (!response.ok) throw new Error('Не удалось загрузить данные анимации');
      return response.json();
    });
  }

  async texture(relative) {
    if (!relative) throw new Error('У предмета нет текстуры');
    if (!this.textures.has(relative)) {
      this.textures.set(relative, (async () => {
        const tex = await new THREE.TextureLoader().loadAsync(this.base + relative);
        tex.magFilter = tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        // Animated Minecraft textures are vertical/horizontal atlases. Do not stretch the whole strip.
        {
            const animation = (await this.animationInfo)[relative];
            if (animation) {
              const width = animation.width || Math.min(tex.image.width, tex.image.height);
              const height = animation.height || width;
              const cols = tex.image.width / width;
              const rows = tex.image.height / height;
              const frames = animation.frames || Array.from({ length: cols * rows }, (_, i) => i);
              tex.repeat.set(1 / cols, 1 / rows);
              const anim = { tex, cols, rows, frames, frameTime: animation.frametime || 1, elapsed: 0, index: 0 };
              this.animations.push(anim);
              this.setAnimationFrame(anim);
            }
        }
        return tex;
      })());
    }
    return this.textures.get(relative);
  }

  setAnimationFrame(anim) {
    const entry = anim.frames[anim.index];
    const frame = typeof entry === 'number' ? entry : entry.index;
    anim.tex.offset.set((frame % anim.cols) / anim.cols, 1 - (Math.floor(frame / anim.cols) + 1) / anim.rows);
  }

  animate(delta) {
    for (const anim of this.animations) {
      anim.elapsed += delta * 20;
      let entry = anim.frames[anim.index];
      let duration = (typeof entry === 'object' ? entry.time : null) || anim.frameTime;
      while (anim.elapsed >= duration) {
        anim.elapsed -= duration;
        anim.index = (anim.index + 1) % anim.frames.length;
        entry = anim.frames[anim.index];
        duration = (typeof entry === 'object' ? entry.time : null) || anim.frameTime;
        this.setAnimationFrame(anim);
      }
    }
  }

  async item(entry) {
    if (!entry?.available || !entry.model) throw new Error('3D-модель отсутствует в исходном ресурс-паке');
    if (!this.models.has(entry.model)) this.models.set(entry.model, this.buildItem(entry));
    const template = await this.models.get(entry.model);
    return template.clone(true);
  }

  async buildItem(entry) {
    const response = await fetch(this.base + entry.model);
    if (!response.ok) throw new Error('Не удалось загрузить 3D-модель');
    const raw = await response.json();
    const group = new THREE.Group();
    group.userData.display = raw.display || {};
    group.userData.name = entry.nx_id;
    if (raw.elements?.length) {
      const buffers = new Map();
      for (const element of raw.elements) {
        for (const [direction, face] of Object.entries(element.faces || {})) {
          const key = face.texture.replace(/^#/, '');
          const texPath = raw.textures[key];
          if (!texPath || !faces[direction]) continue;
          if (!buffers.has(texPath)) buffers.set(texPath, { positions: [], uvs: [] });
          let vertices = faces[direction](element.from, element.to).map(v => new THREE.Vector3(...v));
          if (element.rotation?.angle) {
            const { origin, axis, angle, rescale } = element.rotation;
            const pivot = new THREE.Vector3(...origin);
            const vector = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
            vertices = vertices.map(v => {
              v.sub(pivot);
              if (rescale) for (const k of ['x', 'y', 'z']) if (k !== axis) v[k] /= Math.cos(radians(angle));
              return v.applyAxisAngle(vector, radians(angle)).add(pivot);
            });
          }
          // Convert Minecraft's model coordinates to a centred model facing the viewer.
          const xyz = vertices.map(v => [v.x - 8, v.y - 8, 8 - v.z]);
          let uv = face.uv;
          if (!uv) {
            const a = element.from, b = element.to;
            if (direction === 'north' || direction === 'south') uv = [a[0], 16 - b[1], b[0], 16 - a[1]];
            else if (direction === 'east' || direction === 'west') uv = [a[2], 16 - b[1], b[2], 16 - a[1]];
            else uv = [a[0], a[2], b[0], b[2]];
          }
          quad(buffers.get(texPath), xyz, uv.map(n => n / 16), face.rotation, direction === 'up' || direction === 'down');
        }
      }
      for (const [texPath, buffer] of buffers) group.add(new THREE.Mesh(geometry(buffer), material(await this.texture(texPath))));
    } else {
      for (const [key, texPath] of Object.entries(raw.textures || {})) {
        if (!key.startsWith('layer') || !texPath) continue;
        const tex = await this.texture(texPath);
        group.add(this.sprite(tex, Number(key.slice(5)) || 0));
      }
    }
    if (!group.children.length) throw new Error('Модель не содержит геометрии');
    group.traverse(object => { if (object.isMesh) object.userData.cached = true; });
    return group;
  }

  sprite(tex, layer) {
    const canvas = document.createElement('canvas');
    const image = tex.image;
    const width = Math.round(image.width * tex.repeat.x), height = Math.round(image.height * tex.repeat.y);
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    const solid = (x, y) => x >= 0 && y >= 0 && x < width && y < height && pixels[(y * width + x) * 4 + 3] > 16;
    const buffer = { positions: [], uvs: [] };
    const front = .5 + layer * .03, back = -.5 + layer * .03;
    quad(buffer, [[-8, 8, front], [8, 8, front], [8, -8, front], [-8, -8, front]], [0, 0, 1, 1]);
    quad(buffer, [[8, 8, back], [-8, 8, back], [-8, -8, back], [8, -8, back]], [1, 0, 0, 1]);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (!solid(x, y)) continue;
      const a = [x / width * 16 - 8, 8 - (y + 1) / height * 16, back];
      const b = [(x + 1) / width * 16 - 8, 8 - y / height * 16, front];
      const uv = [(x + .25) / width, (y + .25) / height, (x + .75) / width, (y + .75) / height];
      if (!solid(x - 1, y)) quad(buffer, faces.west(a, b), uv);
      if (!solid(x + 1, y)) quad(buffer, faces.east(a, b), uv);
      if (!solid(x, y - 1)) quad(buffer, faces.up(a, b), uv, 0, true);
      if (!solid(x, y + 1)) quad(buffer, faces.down(a, b), uv, 0, true);
    }
    // Sprites are built directly in viewer coordinates, unlike the Z-reflected cuboids.
    return new THREE.Mesh(geometry(buffer, true), material(tex));
  }
}

// Minecraft cube UV layout, shared by player skins and equipment textures.
export function playerBox(width, height, depth, uvX, uvY, tex, inflate = 0, mirror = false) {
  const a = [-width / 2 - inflate, -height / 2 - inflate, -depth / 2 - inflate];
  const b = [width / 2 + inflate, height / 2 + inflate, depth / 2 + inflate];
  const rects = {
    north: [uvX + depth, uvY + depth, uvX + depth + width, uvY + depth + height],
    south: [uvX + 2 * depth + width, uvY + depth, uvX + 2 * depth + 2 * width, uvY + depth + height],
    east: [uvX, uvY + depth, uvX + depth, uvY + depth + height],
    west: [uvX + depth + width, uvY + depth, uvX + 2 * depth + width, uvY + depth + height],
    up: [uvX + depth, uvY, uvX + depth + width, uvY + depth],
    down: [uvX + depth + width, uvY, uvX + depth + 2 * width, uvY + depth],
  };
  const buffer = { positions: [], uvs: [] };
  for (const [name, rect] of Object.entries(rects)) {
    // Player front is +Z, while item north is -Z.
    const vertices = faces[name](a, b).map(([x, y, z]) => [mirror ? -x : x, y, -z]);
    const uvHeight = tex.image.height / tex.image.width * 64;
    quad(buffer, vertices, [rect[0] / 64, rect[1] / uvHeight, rect[2] / 64, rect[3] / uvHeight], 0, (name === 'up' || name === 'down') !== mirror);
  }
  return new THREE.Mesh(geometry(buffer), material(tex));
}

export function buildPlayer(skin, slim = false) {
  const group = new THREE.Group();
  const w = slim ? 3 : 4;
  const legacy = skin.image.height === 32;
  const specs = [
    ['head', 8, 8, 8, 0, 0, 0, 28, 0],
    ['body', 8, 12, 4, 16, 16, 0, 18, 0],
    ['rightArm', w, 12, 4, 40, 16, -(4 + w / 2), 18, 0],
    ['leftArm', w, 12, 4, legacy ? 40 : 32, legacy ? 16 : 48, 4 + w / 2, 18, 0],
    ['rightLeg', 4, 12, 4, 0, 16, -2, 6, 0],
    ['leftLeg', 4, 12, 4, legacy ? 0 : 16, legacy ? 16 : 48, 2, 6, 0],
  ];
  const parts = {};
  for (const [name, width, height, depth, ux, uy, x, y, z] of specs) {
    const part = new THREE.Group();
    part.position.set(x, y, z);
    part.add(playerBox(width, height, depth, ux, uy, skin, 0, legacy && name.startsWith('left')));
    group.add(part); parts[name] = part;
  }
  parts.head.add(playerBox(8, 8, 8, 32, 0, skin, .25));
  if (!legacy) {
    parts.body.add(playerBox(8, 12, 4, 16, 32, skin, .25));
    parts.rightArm.add(playerBox(w, 12, 4, 40, 32, skin, .25));
    parts.leftArm.add(playerBox(w, 12, 4, 48, 48, skin, .25));
    parts.rightLeg.add(playerBox(4, 12, 4, 0, 32, skin, .25));
    parts.leftLeg.add(playerBox(4, 12, 4, 0, 48, skin, .25));
  }
  group.userData.parts = parts;
  return group;
}

export function applyDisplay(object, context) {
  const all = object.userData.display || {};
  const display = all[context] || (context.endsWith('lefthand') ? all[context.replace('lefthand', 'righthand')] : null) || {};
  const defaults = context.startsWith('thirdperson') ? { rotation: [0, 0, 0], scale: [1, 1, 1] } : {};
  const rot = display.rotation || defaults.rotation || [0, 0, 0];
  const handSign = context.endsWith('lefthand') ? -1 : 1;
  // Reflect Minecraft model Z and rotation handedness consistently.
  object.rotation.set(-radians(rot[0]), -radians(rot[1]) * handSign, radians(rot[2]) * handSign, 'XYZ');
  const pos = display.translation || [0, 0, 0];
  object.position.set(pos[0] * handSign, pos[1], -pos[2]);
  object.scale.fromArray(display.scale || defaults.scale || [1, 1, 1]);
}

export function releaseGeometry(group) {
  group?.traverse(object => {
    // Item meshes share cached geometry/materials. Only dispose the rebuilt player/armor geometry.
    if (object.isMesh && !object.userData.cached) { object.geometry.dispose(); object.material.dispose(); }
  });
}
