import { PX_TO_WORLD, TILE } from './constants.js';

let sceneryGroup = null;

// ── Tree builders ───────────────────────────────────────────────────────────

function buildSpruce() {
  const group = new THREE.Group();

  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1.2, 5);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.6;
  trunk.castShadow = true;
  group.add(trunk);

  const foliageMat = new THREE.MeshLambertMaterial({ color: 0x228833 });

  const bottom = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.2, 5), foliageMat);
  bottom.position.y = 1.6;
  bottom.castShadow = true;
  group.add(bottom);

  const top = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.9, 5), foliageMat);
  top.position.y = 2.4;
  top.castShadow = true;
  group.add(top);

  return group;
}

function buildPine() {
  // Tall, narrow conifer (alpine feel).
  const group = new THREE.Group();

  const trunkGeo = new THREE.CylinderGeometry(0.08, 0.14, 1.6, 5);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a1f });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.8;
  trunk.castShadow = true;
  group.add(trunk);

  const foliageMat = new THREE.MeshLambertMaterial({ color: 0x1b5c2f });
  const foliage = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.0, 5), foliageMat);
  foliage.position.y = 2.8;
  foliage.castShadow = true;
  group.add(foliage);

  return group;
}

function buildPalm() {
  // Tropical palm with 3D arched fronds. Each frond is a drooping strip of
  // triangles that narrows toward the tip — reads like a real palm from any
  // camera angle (the old crossed-planes version looked flat at close range).
  const group = new THREE.Group();

  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x886a3a });
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.16, 2.8, 6),
    trunkMat,
  );
  trunk.position.y = 1.4;
  trunk.castShadow = true;
  group.add(trunk);

  // Trunk rings (substitute for bark texture)
  const ringMat = new THREE.MeshLambertMaterial({ color: 0x5a4528 });
  for (let i = 0; i < 6; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.1, 0.02, 4, 8),
      ringMat,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3 + i * 0.4;
    group.add(ring);
  }

  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2a9a42, side: THREE.DoubleSide });
  const FRONDS = 9;
  const SEGS = 4;
  const FRONDLEN = 1.3;
  for (let i = 0; i < FRONDS; i++) {
    const a = (i / FRONDS) * Math.PI * 2;
    const yaw = new THREE.Matrix4().makeRotationY(a);

    const verts = [];
    for (let s = 0; s <= SEGS; s++) {
      const t = s / SEGS;
      const r = t * FRONDLEN;
      // Arc: droops downward with quadratic falloff, narrows toward tip.
      const y = 2.8 + 0.2 - t * t * 1.2;
      const halfW = 0.2 * (1 - t * 0.7);
      verts.push(new THREE.Vector3(r, y, -halfW).applyMatrix4(yaw));
      verts.push(new THREE.Vector3(r, y,  halfW).applyMatrix4(yaw));
    }
    const geo = new THREE.BufferGeometry();
    const pos = [];
    const idx = [];
    for (const v of verts) pos.push(v.x, v.y, v.z);
    for (let s = 0; s < SEGS; s++) {
      const a0 = s * 2, a1 = a0 + 1, a2 = a0 + 2, a3 = a0 + 3;
      idx.push(a0, a1, a2, a1, a3, a2);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, frondMat);
    m.castShadow = true;
    group.add(m);
  }

  const cocoMat = new THREE.MeshLambertMaterial({ color: 0x3a2a18 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), cocoMat);
    c.position.set(Math.cos(a) * 0.16, 2.75, Math.sin(a) * 0.16);
    group.add(c);
  }

  return group;
}

function buildBroadleaf() {
  // Round deciduous tree — clustered icosahedron "blobs" form a puffy crown.
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.22, 1.2, 6),
    new THREE.MeshLambertMaterial({ color: 0x5a3a1a }),
  );
  trunk.position.y = 0.6;
  trunk.castShadow = true;
  group.add(trunk);

  const fol = new THREE.MeshLambertMaterial({ color: 0x3ba046 });
  const blobs = [
    { y: 1.75, r: 0.95, x: 0,     z: 0     },
    { y: 2.05, r: 0.75, x: 0.35,  z: 0     },
    { y: 2.05, r: 0.75, x: -0.35, z: 0     },
    { y: 2.05, r: 0.75, x: 0,     z: 0.4   },
    { y: 2.3,  r: 0.65, x: 0,     z: -0.25 },
    { y: 2.5,  r: 0.55, x: 0.15,  z: 0.15  },
  ];
  for (const b of blobs) {
    const sphere = new THREE.Mesh(
      new THREE.IcosahedronGeometry(b.r, 0),
      fol,
    );
    sphere.position.set(b.x, b.y, b.z);
    sphere.castShadow = true;
    group.add(sphere);
  }
  return group;
}

function buildCactus() {
  // Saguaro cactus — three-arm silhouette with ribbed trunk.
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x3a7a3a });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2c5a2c });

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.32, 2.6, 8),
    mat,
  );
  trunk.position.y = 1.3;
  trunk.castShadow = true;
  group.add(trunk);

  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    mat,
  );
  cap.position.y = 2.6;
  group.add(cap);

  // Left arm (horizontal elbow + vertical limb + cap)
  const armLh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.5, 8), mat);
  armLh.rotation.z = Math.PI / 2;
  armLh.position.set(-0.35, 1.4, 0);
  group.add(armLh);
  const armLv = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 1.1, 8), mat);
  armLv.position.set(-0.65, 1.9, 0);
  armLv.castShadow = true;
  group.add(armLv);
  const armLc = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    mat,
  );
  armLc.position.set(-0.65, 2.45, 0);
  group.add(armLc);

  // Right arm (shorter)
  const armRh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.45, 8), mat);
  armRh.rotation.z = -Math.PI / 2;
  armRh.position.set(0.33, 1.7, 0);
  group.add(armRh);
  const armRv = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.7, 8), mat);
  armRv.position.set(0.58, 2.1, 0);
  armRv.castShadow = true;
  group.add(armRv);
  const armRc = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    mat,
  );
  armRc.position.set(0.58, 2.45, 0);
  group.add(armRc);

  // Vertical ribs around trunk
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.5, 0.02), darkMat);
    rib.position.set(Math.cos(a) * 0.3, 1.3, Math.sin(a) * 0.3);
    group.add(rib);
  }
  return group;
}

function buildBirch() {
  // Tall slender birch — white trunk with black dashes, sparse light-green crown.
  const group = new THREE.Group();

  const trunkMat = new THREE.MeshLambertMaterial({ color: 0xf0ece2 });
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.11, 2.4, 6),
    trunkMat,
  );
  trunk.position.y = 1.2;
  trunk.castShadow = true;
  group.add(trunk);

  // Black dashes on the trunk (birch marks)
  const markMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  for (let i = 0; i < 8; i++) {
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.02), markMat);
    const a = Math.random() * Math.PI * 2;
    mark.position.set(Math.cos(a) * 0.105, 0.3 + i * 0.28, Math.sin(a) * 0.105);
    mark.rotation.y = a;
    group.add(mark);
  }

  const fol = new THREE.MeshLambertMaterial({ color: 0x9ac93a });
  const blobs = [
    { y: 2.4, r: 0.55, x: 0,    z: 0    },
    { y: 2.65, r: 0.4, x: 0.25, z: 0.1  },
    { y: 2.65, r: 0.4, x: -0.2, z: -0.1 },
    { y: 2.85, r: 0.35, x: 0.05, z: 0.15 },
  ];
  for (const b of blobs) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(b.r, 0), fol);
    s.position.set(b.x, b.y, b.z);
    s.castShadow = true;
    group.add(s);
  }
  return group;
}

function buildCherryBlossom() {
  // Round pink crown (spring theme).
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.16, 1.0, 6),
    new THREE.MeshLambertMaterial({ color: 0x4a3020 }),
  );
  trunk.position.y = 0.5;
  trunk.castShadow = true;
  group.add(trunk);

  const pink = new THREE.MeshLambertMaterial({ color: 0xf5a9c3 });
  const pinkDeep = new THREE.MeshLambertMaterial({ color: 0xe77fa8 });
  const blobs = [
    { y: 1.5,  r: 0.85, x: 0,     z: 0,     mat: pink     },
    { y: 1.75, r: 0.7,  x: 0.4,   z: 0.05,  mat: pinkDeep },
    { y: 1.75, r: 0.7,  x: -0.4,  z: -0.05, mat: pink     },
    { y: 1.8,  r: 0.65, x: 0.05,  z: 0.45,  mat: pinkDeep },
    { y: 1.95, r: 0.55, x: 0,     z: -0.3,  mat: pink     },
    { y: 2.1,  r: 0.45, x: 0.15,  z: 0.1,   mat: pinkDeep },
  ];
  for (const b of blobs) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(b.r, 0), b.mat);
    s.position.set(b.x, b.y, b.z);
    s.castShadow = true;
    group.add(s);
  }
  return group;
}

function buildAutumnMaple() {
  // Round orange/red crown (autumn theme).
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.2, 1.1, 6),
    new THREE.MeshLambertMaterial({ color: 0x4a2e14 }),
  );
  trunk.position.y = 0.55;
  trunk.castShadow = true;
  group.add(trunk);

  const red = new THREE.MeshLambertMaterial({ color: 0xd9481f });
  const orange = new THREE.MeshLambertMaterial({ color: 0xe88020 });
  const yellow = new THREE.MeshLambertMaterial({ color: 0xedb24b });
  const blobs = [
    { y: 1.65, r: 0.95, x: 0,     z: 0,     mat: red    },
    { y: 1.95, r: 0.75, x: 0.4,   z: 0.0,   mat: orange },
    { y: 1.95, r: 0.75, x: -0.4,  z: 0.0,   mat: orange },
    { y: 1.95, r: 0.75, x: 0.0,   z: 0.45,  mat: yellow },
    { y: 2.15, r: 0.6,  x: 0.05,  z: -0.3,  mat: red    },
    { y: 2.4,  r: 0.5,  x: 0.15,  z: 0.1,   mat: orange },
  ];
  for (const b of blobs) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(b.r, 0), b.mat);
    s.position.set(b.x, b.y, b.z);
    s.castShadow = true;
    group.add(s);
  }
  return group;
}

function buildBamboo() {
  // Cluster of 5-7 tall thin vertical stalks.
  const group = new THREE.Group();

  const stalkMat = new THREE.MeshLambertMaterial({ color: 0x5a9a3a });
  const jointMat = new THREE.MeshLambertMaterial({ color: 0x3a7a28 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x88c050, side: THREE.DoubleSide });

  const STALKS = 6;
  for (let i = 0; i < STALKS; i++) {
    const a = (i / STALKS) * Math.PI * 2 + Math.random() * 0.3;
    const r = 0.15 + Math.random() * 0.25;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const height = 2.4 + Math.random() * 1.2;

    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.07, height, 5),
      stalkMat,
    );
    stalk.position.set(x, height / 2, z);
    stalk.castShadow = true;
    group.add(stalk);

    // Joint rings along the stalk
    const joints = Math.floor(height / 0.5);
    for (let j = 1; j <= joints; j++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.075, 0.015, 4, 8),
        jointMat,
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, j * 0.5, z);
      group.add(ring);
    }

    // Leaf tufts near the top
    for (let l = 0; l < 3; l++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.08), leafMat);
      const la = Math.random() * Math.PI * 2;
      leaf.position.set(x + Math.cos(la) * 0.12, height - 0.2 - l * 0.25, z + Math.sin(la) * 0.12);
      leaf.rotation.y = la;
      leaf.rotation.z = -0.2;
      group.add(leaf);
    }
  }
  return group;
}

function buildDeadTree() {
  // Bare-branch spooky tree — no foliage, gnarled grey silhouette.
  // Branches use a pivot-group rooted at the trunk-top connection point:
  // the cylinder is offset +len/2 in local Y so its base sits on the pivot
  // and rotations fan out from the trunk rather than the cylinder center.
  const group = new THREE.Group();
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x5a4838 });

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.24, 1.6, 6),
    woodMat,
  );
  trunk.position.y = 0.8;
  trunk.castShadow = true;
  group.add(trunk);

  const MAIN = 5;
  for (let i = 0; i < MAIN; i++) {
    const a = (i / MAIN) * Math.PI * 2;
    const len = 0.9 + Math.random() * 0.4;
    const tilt = 0.5 + Math.random() * 0.3;

    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * 0.1, 1.55, Math.sin(a) * 0.1);
    pivot.rotateY(-a);   // yaw toward angle a (XZ plane)
    pivot.rotateZ(-tilt); // then tilt outward (local +Y bends toward world +X)

    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.09, len, 5),
      woodMat,
    );
    branch.position.y = len / 2;
    branch.castShadow = true;
    pivot.add(branch);

    // Sub-twig off branch tip
    if (Math.random() < 0.7) {
      const twigLen = 0.3 + Math.random() * 0.3;
      const twigTilt = -0.3 + Math.random() * 0.6;
      const twigPivot = new THREE.Group();
      twigPivot.position.y = len;
      twigPivot.rotateZ(twigTilt);
      const twig = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.04, twigLen, 4),
        woodMat,
      );
      twig.position.y = twigLen / 2;
      twigPivot.add(twig);
      pivot.add(twigPivot);
    }

    group.add(pivot);
  }
  return group;
}

function buildWillow() {
  // Drooping teardrop canopy with hanging strands (kept close to trunk).
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.2, 1.0, 6),
    new THREE.MeshLambertMaterial({ color: 0x4e3620 }),
  );
  trunk.position.y = 0.5;
  trunk.castShadow = true;
  group.add(trunk);

  const leafMat = new THREE.MeshLambertMaterial({ color: 0x86a63a });
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 10, 8),
    leafMat,
  );
  canopy.position.y = 1.6;
  canopy.scale.set(1.0, 0.9, 1.0);
  canopy.castShadow = true;
  group.add(canopy);

  const strandMat = new THREE.MeshLambertMaterial({ color: 0x96b04a });
  const STRANDS = 18;
  for (let i = 0; i < STRANDS; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.15 + Math.random() * 0.35; // pulled in from 0.65-0.9
    const len = 0.6 + Math.random() * 0.7;
    const strand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.02, len, 4),
      strandMat,
    );
    strand.position.set(
      Math.cos(a) * r,
      1.6 - len / 2 + 0.1,
      Math.sin(a) * r,
    );
    group.add(strand);
  }
  return group;
}

function buildBaobab() {
  // Fat swollen trunk, sparse high branches with tiny sphere leaves.
  // Pivot pattern: each branch's base is anchored at the trunk top.
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x9a7844 });

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.75, 2.0, 8),
    trunkMat,
  );
  trunk.position.y = 1.0;
  trunk.castShadow = true;
  group.add(trunk);

  const base = new THREE.Mesh(
    new THREE.SphereGeometry(0.75, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    trunkMat,
  );
  base.position.y = 0.3;
  base.scale.set(1, 0.4, 1);
  group.add(base);

  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4a6a32 });
  const BRANCHES = 5;
  const branchLen = 0.6;
  for (let i = 0; i < BRANCHES; i++) {
    const a = (i / BRANCHES) * Math.PI * 2;
    const tilt = 0.9; // fairly horizontal

    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * 0.3, 2.0, Math.sin(a) * 0.3);
    pivot.rotateY(-a);
    pivot.rotateZ(-tilt);

    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.09, branchLen, 5),
      trunkMat,
    );
    branch.position.y = branchLen / 2;
    pivot.add(branch);

    const leaves = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.32, 0),
      leafMat,
    );
    leaves.position.y = branchLen + 0.18;
    pivot.add(leaves);

    group.add(pivot);
  }
  return group;
}

function buildRedwood() {
  // Very tall columnar evergreen — towering silhouette.
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.24, 3.2, 7),
    new THREE.MeshLambertMaterial({ color: 0x7a3a20 }),
  );
  trunk.position.y = 1.6;
  trunk.castShadow = true;
  group.add(trunk);

  // Stacked narrow cones for the canopy — 3 layers to suggest tiered foliage.
  const fol = new THREE.MeshLambertMaterial({ color: 0x1e4a2a });
  const cones = [
    { h: 2.0, r: 0.9, y: 3.2 },
    { h: 1.6, r: 0.7, y: 4.1 },
    { h: 1.2, r: 0.5, y: 4.85 },
  ];
  for (const c of cones) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(c.r, c.h, 6),
      fol,
    );
    cone.position.y = c.y;
    cone.castShadow = true;
    group.add(cone);
  }
  return group;
}

function buildJoshuaTree() {
  // Branching desert silhouette with spiky needle tufts at branch tips.
  // Pivot pattern so each branch's base anchors at the trunk column.
  const group = new THREE.Group();
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x6a4a28 });
  const needleMat = new THREE.MeshLambertMaterial({ color: 0x4a5f28 });

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.24, 1.3, 6),
    woodMat,
  );
  trunk.position.y = 0.65;
  trunk.castShadow = true;
  group.add(trunk);

  function spikyTuft() {
    const tuft = new THREE.Group();
    const NEEDLES = 10;
    for (let i = 0; i < NEEDLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const pitch = Math.random() * Math.PI * 0.6;
      const needle = new THREE.Mesh(
        new THREE.ConeGeometry(0.04, 0.22, 4),
        needleMat,
      );
      needle.position.set(
        Math.cos(a) * Math.sin(pitch) * 0.1,
        Math.cos(pitch) * 0.1,
        Math.sin(a) * Math.sin(pitch) * 0.1,
      );
      needle.rotation.z = Math.cos(a) * pitch;
      needle.rotation.x = -Math.sin(a) * pitch;
      tuft.add(needle);
    }
    return tuft;
  }

  const branches = [
    { a: 0.3, tilt: 0.9, len: 0.9, yStart: 1.2 },
    { a: 2.5, tilt: 0.7, len: 1.1, yStart: 1.1 },
    { a: 4.5, tilt: 0.8, len: 0.8, yStart: 1.25 },
  ];
  for (const b of branches) {
    const pivot = new THREE.Group();
    pivot.position.set(0, b.yStart, 0);
    pivot.rotateY(-b.a);
    pivot.rotateZ(-b.tilt);

    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.11, b.len, 5),
      woodMat,
    );
    branch.position.y = b.len / 2;
    branch.castShadow = true;
    pivot.add(branch);

    const tuft = spikyTuft();
    tuft.position.y = b.len + 0.08;
    pivot.add(tuft);

    group.add(pivot);
  }

  // Top tuft at the trunk apex
  const topTuft = spikyTuft();
  topTuft.position.y = 1.4;
  group.add(topTuft);

  return group;
}

const TREE_BUILDERS = [
  buildSpruce, buildPine, buildPalm, buildBroadleaf, buildCactus,
  buildBirch, buildCherryBlossom, buildAutumnMaple, buildBamboo,
  buildDeadTree, buildWillow, buildBaobab, buildRedwood, buildJoshuaTree,
];

// ── Decor builders ─────────────────────────────────────────────────────────
// Small roadside objects placed alongside trees. Universal: rocks + grass.
// Seed picks ONE "featured" extra (bush, hay, mushroom) per track.

function buildSmallRock() {
  const rock = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.25, 0),
    new THREE.MeshLambertMaterial({ color: 0x777777, flatShading: true }),
  );
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  rock.castShadow = true;
  return rock;
}

function buildMediumRock() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.45, 0),
    new THREE.MeshLambertMaterial({ color: 0x6a6a6a, flatShading: true }),
  );
  base.rotation.set(Math.random(), Math.random(), Math.random());
  base.scale.set(1, 0.7, 1);
  base.castShadow = true;
  group.add(base);
  if (Math.random() < 0.5) {
    const top = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.2, 0),
      new THREE.MeshLambertMaterial({ color: 0x7a7a7a, flatShading: true }),
    );
    top.position.set(0.1, 0.32, 0.05);
    top.rotation.set(Math.random(), Math.random(), Math.random());
    group.add(top);
  }
  return group;
}

function buildGrassTuft() {
  // Cluster of 5 small blades as vertical planes
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({
    color: 0x66a02a,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.12;
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.2), mat);
    blade.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
    blade.rotation.y = Math.random() * Math.PI * 2;
    blade.rotation.z = (Math.random() - 0.5) * 0.3;
    group.add(blade);
  }
  return group;
}

function buildBush() {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x4a8a2a });
  const blobs = [
    { y: 0.22, r: 0.25, x: 0,     z: 0     },
    { y: 0.32, r: 0.2,  x: 0.15,  z: 0.05  },
    { y: 0.3,  r: 0.22, x: -0.12, z: 0.1   },
    { y: 0.28, r: 0.18, x: 0.05,  z: -0.12 },
  ];
  for (const b of blobs) {
    const sphere = new THREE.Mesh(
      new THREE.IcosahedronGeometry(b.r, 0),
      mat,
    );
    sphere.position.set(b.x, b.y, b.z);
    sphere.castShadow = true;
    group.add(sphere);
  }
  return group;
}

function buildMushroom() {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 0.25, 5),
    new THREE.MeshLambertMaterial({ color: 0xf0ead2 }),
  );
  stem.position.y = 0.125;
  group.add(stem);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0xd02828 }),
  );
  cap.position.y = 0.25;
  cap.castShadow = true;
  group.add(cap);
  const spotMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.05 + Math.random() * 0.1;
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), spotMat);
    spot.position.set(Math.cos(a) * r, 0.34, Math.sin(a) * r);
    group.add(spot);
  }
  return group;
}

const UNIVERSAL_DECOR = [buildSmallRock, buildMediumRock, buildGrassTuft];
const FEATURED_DECOR  = [buildBush, buildMushroom];

// Seed-derived PRNG (mulberry32) for deterministic per-track tree mix.
function mulberry32(seed) {
  let a = (seed | 0) >>> 0;
  return function() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── buildScenery ────────────────────────────────────────────────────────────

/**
 * Place trees along both sides of the track. Each track picks a single
 * tree type (seed-deterministic); individual trees get randomized
 * per-instance scale + non-uniform height/width stretch so no two look
 * identical.
 */
export function buildScenery(scene, centerLine, walls, track, seed) {
  if (sceneryGroup) disposeScenery();

  sceneryGroup = new THREE.Group();
  scene.add(sceneryGroup);

  const rng = mulberry32(typeof seed === 'number' ? seed : (Math.random() * 0xffffffff) | 0);
  const treeBuilder = TREE_BUILDERS[Math.floor(rng() * TREE_BUILDERS.length)];
  // Universal rocks + grass everywhere; plus ONE seed-picked featured decor.
  const featured = FEATURED_DECOR[Math.floor(rng() * FEATURED_DECOR.length)];
  const decorBuilders = [...UNIVERSAL_DECOR, featured];

  const occupied = new Set();
  if (track && track.tiles) {
    for (const tile of track.tiles) {
      if (tile.cells) {
        for (const cell of tile.cells) {
          occupied.add(cell.x + ',' + cell.y);
        }
      }
    }
  }

  function worldToGridCell(wx, wz) {
    const px = wx / PX_TO_WORLD;
    const py = wz / PX_TO_WORLD;
    return { x: Math.floor(px / TILE), y: Math.floor(py / TILE) };
  }

  function isInTrack(wx, wz) {
    const cell = worldToGridCell(wx, wz);
    return occupied.has(cell.x + ',' + cell.y);
  }

  function tryPlaceTree(wx, wz) {
    if (isInTrack(wx, wz)) return;
    const tree = treeBuilder();
    tree.position.x = wx;
    tree.position.z = wz;
    tree.rotation.y = rng() * Math.PI * 2;

    // Non-uniform scale: base * per-axis jitter so heights + widths vary
    // independently. Trees end up visibly different even within one theme.
    const base = 0.6 + rng() * 1.0;           // 0.6 – 1.6
    const heightJitter = 0.8 + rng() * 0.6;   // 0.8 – 1.4 vertical stretch
    const widthJitter  = 0.85 + rng() * 0.3;  // 0.85 – 1.15 horizontal
    tree.scale.set(base * widthJitter, base * heightJitter, base * widthJitter);
    sceneryGroup.add(tree);
  }

  const n = centerLine.length;
  const step = 8;
  for (let i = 0; i < n; i += step) {
    if (rng() > 0.6) continue;
    const li = Math.min(i, walls.left.length - 1);
    const ri = Math.min(i, walls.right.length - 1);
    const ci = centerLine[i];
    const lw = walls.left[li];
    const rw = walls.right[ri];

    const ldx = (lw.x - ci.x) * PX_TO_WORLD;
    const ldz = (lw.y - ci.y) * PX_TO_WORLD;
    const lLen = Math.sqrt(ldx * ldx + ldz * ldz) || 1;
    const lNx = ldx / lLen;
    const lNz = ldz / lLen;

    const rdx = (rw.x - ci.x) * PX_TO_WORLD;
    const rdz = (rw.y - ci.y) * PX_TO_WORLD;
    const rLen = Math.sqrt(rdx * rdx + rdz * rdz) || 1;
    const rNx = rdx / rLen;
    const rNz = rdz / rLen;

    const d1 = 2 + rng() * 6;
    tryPlaceTree(lw.x * PX_TO_WORLD + lNx * d1, lw.y * PX_TO_WORLD + lNz * d1);
    const d2 = 2 + rng() * 6;
    tryPlaceTree(rw.x * PX_TO_WORLD + rNx * d2, rw.y * PX_TO_WORLD + rNz * d2);
  }

  // ── Roadside decor (rocks, grass, featured extra) ──────────────────────
  // Tighter step than trees; placed close to the wall on either side.
  function tryPlaceDecor(wx, wz) {
    if (isInTrack(wx, wz)) return;
    const builder = decorBuilders[Math.floor(rng() * decorBuilders.length)];
    const decor = builder();
    decor.position.set(wx, 0, wz);
    decor.rotation.y = rng() * Math.PI * 2;
    const s = 0.7 + rng() * 0.6;
    decor.scale.set(s, s, s);
    sceneryGroup.add(decor);
  }

  const decorStep = 4;
  for (let i = 0; i < n; i += decorStep) {
    if (rng() > 0.55) continue;

    const li = Math.min(i, walls.left.length - 1);
    const ri = Math.min(i, walls.right.length - 1);
    const ci = centerLine[i];
    const lw = walls.left[li];
    const rw = walls.right[ri];
    if (!lw || !rw) continue;

    const useLeft = rng() < 0.5;
    const wall = useLeft ? lw : rw;

    const ndx = (wall.x - ci.x) * PX_TO_WORLD;
    const ndz = (wall.y - ci.y) * PX_TO_WORLD;
    const len = Math.sqrt(ndx * ndx + ndz * ndz) || 1;
    const nx = ndx / len;
    const nz = ndz / len;

    const offset = 1 + rng() * 4; // 1-5 world units past the wall
    const wx = wall.x * PX_TO_WORLD + nx * offset;
    const wz = wall.y * PX_TO_WORLD + nz * offset;
    tryPlaceDecor(wx, wz);
  }

  // ── Grandstands on long straights ─────────────────────────────────────
  buildGrandstands(centerLine, walls, isInTrack, rng);
}

// ── Grandstand builder + placement ──────────────────────────────────────────

function buildGrandstand(length, rng) {
  const group = new THREE.Group();
  const structureMat = new THREE.MeshLambertMaterial({ color: 0x5a6470 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2a3340 });

  const TIERS = 5;
  const TIER_H = 0.4;
  const TIER_D = 0.45;

  for (let i = 0; i < TIERS; i++) {
    const tier = new THREE.Mesh(
      new THREE.BoxGeometry(length, TIER_H, TIER_D),
      structureMat,
    );
    tier.position.set(0, TIER_H / 2 + i * TIER_H, -i * TIER_D);
    tier.castShadow = true;
    tier.receiveShadow = true;
    group.add(tier);
  }

  const crowdColors = [0xff5722, 0xffeb3b, 0x4caf50, 0x2196f3, 0xe91e63, 0xffffff, 0x9c27b0];
  for (let i = 0; i < TIERS; i++) {
    const rowY = TIER_H + i * TIER_H + 0.12;
    const rowZ = -i * TIER_D;
    const heads = Math.floor(length / 0.25);
    for (let h = 0; h < heads; h++) {
      if (rng() < 0.2) continue;
      const color = crowdColors[Math.floor(rng() * crowdColors.length)];
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.22, 0.12),
        new THREE.MeshLambertMaterial({ color }),
      );
      head.position.set(-length / 2 + 0.15 + h * 0.25, rowY, rowZ + TIER_D / 2 - 0.02);
      group.add(head);
    }
  }

  const totalDepth = TIERS * TIER_D + 0.2;
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.1, totalDepth),
    roofMat,
  );
  roof.position.set(0, TIERS * TIER_H + 0.8, -totalDepth / 2 + 0.4);
  roof.castShadow = true;
  group.add(roof);

  const postMat = new THREE.MeshLambertMaterial({ color: 0x3a434f });
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, TIERS * TIER_H + 0.8, 0.1),
      postMat,
    );
    post.position.set(sx * (length / 2 - 0.1), (TIERS * TIER_H + 0.8) / 2, -totalDepth + 0.4);
    group.add(post);
  }

  return group;
}

function buildGrandstands(centerLine, walls, isInTrack, rng) {
  const n = centerLine.length;
  const STAND_MIN_LEN = 30;
  const STAND_CURV_MAX = 0.25;
  const STAND_SPACING = 40;

  let runStart = 0;
  let runCurv = 0;
  let lastStandIdx = -STAND_SPACING;

  function placeGrandstand(startIdx, endIdx) {
    if (endIdx - startIdx < STAND_MIN_LEN) return;
    if (startIdx - lastStandIdx < STAND_SPACING) return;

    const mid = Math.floor((startIdx + endIdx) / 2);
    const lw = walls.left[Math.min(mid, walls.left.length - 1)];
    const rw = walls.right[Math.min(mid, walls.right.length - 1)];
    if (!lw || !rw) return;

    const useLeft = rng() < 0.5;
    const wall = useLeft ? lw : rw;
    const other = useLeft ? rw : lw;

    const dx = wall.x - other.x;
    const dy = wall.y - other.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len, ny = dy / len;
    const OFFSET_PX = 120;

    const wx = (wall.x + nx * OFFSET_PX) * PX_TO_WORLD;
    const wz = (wall.y + ny * OFFSET_PX) * PX_TO_WORLD;
    if (isInTrack(wx, wz)) return;

    const aPt = centerLine[startIdx];
    const bPt = centerLine[endIdx];
    const trackAng = Math.atan2(bPt.y - aPt.y, bPt.x - aPt.x);

    const lengthPx = Math.hypot(bPt.x - aPt.x, bPt.y - aPt.y);
    const lengthWorld = Math.min(lengthPx * PX_TO_WORLD * 0.6, 12);

    const stand = buildGrandstand(Math.max(6, lengthWorld), rng);
    stand.position.set(wx, 0, wz);
    const faceAng = -trackAng + (useLeft ? Math.PI : 0);
    stand.rotation.y = faceAng;
    sceneryGroup.add(stand);
    lastStandIdx = endIdx;
  }

  for (let i = 1; i < n; i++) {
    const a = centerLine[i - 1];
    const b = centerLine[i];
    const c = centerLine[Math.min(i + 1, n - 1)];
    const ang1 = Math.atan2(b.y - a.y, b.x - a.x);
    const ang2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = ang2 - ang1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    runCurv += Math.abs(d);

    if (runCurv > STAND_CURV_MAX) {
      placeGrandstand(runStart, i - 1);
      runStart = i;
      runCurv = 0;
    }
  }
  placeGrandstand(runStart, n - 1);
}

export function disposeScenery() {
  if (!sceneryGroup) return;
  sceneryGroup.traverse((child) => {
    if (child.isMesh) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
  });
  if (sceneryGroup.parent) sceneryGroup.parent.remove(sceneryGroup);
  sceneryGroup = null;
}
