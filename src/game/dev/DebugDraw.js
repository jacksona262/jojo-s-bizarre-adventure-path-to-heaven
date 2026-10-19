import * as THREE from 'three';

// Developer overlay geometry (hitbox spheres, contact flashes). Pooled; costs nothing unless used.

const POOL = 48;

export class DebugDraw {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    const geo = new THREE.SphereGeometry(1, 12, 8);
    for (let i = 0; i < POOL; i += 1) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x44ff66, wireframe: true, transparent: true, depthTest: false }));
      m.visible = false;
      m.renderOrder = 999;
      scene.add(m);
      this.items.push({ m, life: 0 });
    }
    this.next = 0;
  }

  sphere(pos, r, color = 0x44ff66, life = 0.05) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % POOL;
    it.m.position.copy(pos);
    it.m.scale.setScalar(r);
    it.m.material.color.set(color);
    it.m.material.opacity = 0.9;
    it.m.visible = true;
    it.life = life;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.m.visible) continue;
      it.life -= dt;
      if (it.life <= 0) it.m.visible = false;
    }
  }
}
