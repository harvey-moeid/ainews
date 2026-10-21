import * as THREE from "three";

export class VirtualFace {
  constructor(canvas, { preview = false } = {}) {
    this.canvas = canvas;
    this.level = 0;
    this.speaking = false;
    this.preview = preview;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(31, 1, 0.1, 30);
    this.camera.position.set(0, 0.12, 8.5);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.setClearColor(0x000000, 0);
    this.head = new THREE.Group();
    this.scene.add(this.head);
    this.scene.add(new THREE.AmbientLight(0x647acb, 0.8));
    const light = new THREE.DirectionalLight(0x7397ff, 2.2);
    light.position.set(-3, 4, 6);
    this.scene.add(light);
    this.meshes = [];
    this.buildHead();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    this.tick(0);
  }

  buildHead() {
    const cols = 76,
      rows = 72,
      vertices = [],
      indices = [];
    const gauss = (x, y, cx, cy, sx, sy) =>
      Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
    for (let row = 0; row <= rows; row++) {
      const v = row / rows;
      const y = 1.78 - v * 3.35;
      // A rounded skull tapering into cheekbones, jaw and chin.
      const skull = Math.sqrt(Math.max(0.0004, 1 - ((y - 0.12) / 1.69) ** 2));
      const jaw = y < -0.45 ? 1 - 0.24 * Math.min(1, (-y - 0.45) / 1.05) : 1;
      const width = 1.12 * skull * jaw;
      for (let col = 0; col <= cols; col++) {
        const theta =
          ((col + (col > 0 && col < cols ? (row % 2) * 0.5 : 0)) / cols) *
          Math.PI *
          2;
        const x = width * Math.sin(theta);
        const front = Math.max(0, Math.cos(theta));
        let z = 0.91 * skull * Math.cos(theta);
        if (front > 0) {
          let relief = 0.12 * gauss(x, y, 0, 0.4, 0.18, 0.7); // bridge
          relief += 0.51 * gauss(x, y, 0, -0.1, 0.16, 0.3); // nose
          relief +=
            0.13 * gauss(x, y, 0.17, -0.22, 0.12, 0.1) +
            0.13 * gauss(x, y, -0.17, -0.22, 0.12, 0.1);
          relief -=
            0.15 * gauss(x, y, 0.47, 0.38, 0.27, 0.2) +
            0.15 * gauss(x, y, -0.47, 0.38, 0.27, 0.2); // sockets
          relief +=
            0.08 * gauss(x, y, 0.48, 0.64, 0.33, 0.09) +
            0.08 * gauss(x, y, -0.48, 0.64, 0.33, 0.09); // brow
          relief +=
            0.12 * gauss(x, y, 0.59, -0.17, 0.3, 0.32) +
            0.12 * gauss(x, y, -0.59, -0.17, 0.3, 0.32); // cheeks
          relief +=
            0.1 * gauss(x, y, 0, -0.63, 0.35, 0.09) +
            0.12 * gauss(x, y, 0, -0.82, 0.34, 0.09); // lips
          relief += 0.18 * gauss(x, y, 0, -1.16, 0.37, 0.23); // chin
          z += relief * front ** 2;
        }
        vertices.push(x, y, z);
      }
    }
    const hole = (index) => {
      const x = vertices[index * 3],
        y = vertices[index * 3 + 1],
        z = vertices[index * 3 + 2];
      if (z < 0.3) return false;
      const eye =
        ((Math.abs(x) - 0.46) / 0.255) ** 2 + ((y - 0.38) / 0.105) ** 2;
      const mouth = (x / 0.32) ** 2 + ((y + 0.725) / 0.067) ** 2;
      return eye < 1 || mouth < 1;
    };
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c,
          b = a + 1,
          d = a + cols + 1,
          e = d + 1;
        for (const tri of r % 2
          ? [
              [a, d, b],
              [b, d, e],
            ]
          : [
              [a, d, e],
              [a, e, b],
            ]) {
          if (!tri.some(hole)) indices.push(...tri);
        }
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.base = Float32Array.from(vertices);
    this.geometry = geometry;
    this.head.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshPhongMaterial({
          color: 0x070f2b,
          specular: 0x243565,
          shininess: 22,
          side: THREE.DoubleSide,
        }),
      ),
    );
    this.head.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: 0x5363ca,
          wireframe: true,
          transparent: true,
          opacity: 0.48,
        }),
      ),
    );
    this.eyes = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(side * 0.46, 0.38, 0.837);
      const shape = new THREE.Shape();
      shape.moveTo(-0.265, 0);
      shape.quadraticCurveTo(0, 0.18, 0.265, 0);
      shape.quadraticCurveTo(0, -0.13, -0.265, 0);
      eye.add(
        new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          new THREE.MeshBasicMaterial({
            color: 0x010208,
            side: THREE.DoubleSide,
          }),
        ),
      );
      const iris = new THREE.Mesh(
        new THREE.CircleGeometry(0.088, 32),
        new THREE.MeshBasicMaterial({ color: 0xff720e }),
      );
      iris.position.z = 0.014;
      eye.add(iris);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.071, 0.09, 32),
        new THREE.MeshBasicMaterial({
          color: 0xa63606,
          side: THREE.DoubleSide,
        }),
      );
      ring.position.z = 0.016;
      eye.add(ring);
      const pupil = new THREE.Mesh(
        new THREE.CircleGeometry(0.035, 24),
        new THREE.MeshBasicMaterial({ color: 0x713007 }),
      );
      pupil.position.z = 0.018;
      eye.add(pupil);
      const glint = new THREE.Mesh(
        new THREE.CircleGeometry(0.014, 16),
        new THREE.MeshBasicMaterial({ color: 0xffe8a8 }),
      );
      glint.position.set(-0.025, 0.034, 0.022);
      eye.add(glint);
      this.head.add(eye);
      this.eyes.push(eye);
      const ear = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 12, 16),
        new THREE.MeshBasicMaterial({
          color: 0x354792,
          wireframe: true,
          transparent: true,
          opacity: 0.45,
        }),
      );
      ear.scale.set(0.55, 1.8, 0.65);
      ear.position.set(side * 1.09, -0.03, -0.05);
      this.head.add(ear);
    }
    const mouth = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({ color: 0x010208, side: THREE.DoubleSide }),
    );
    mouth.position.set(0, -0.725, 0.87);
    mouth.scale.set(0.32, 0.053, 1);
    this.head.add(mouth);
    this.mouth = mouth;
  }

  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.position.z = this.camera.aspect < 0.7 ? 9.7 : 8.0;
    this.camera.updateProjectionMatrix();
  }
  setAudio(level, speaking) {
    this.level = Math.max(0, Math.min(1, level));
    this.speaking = speaking;
  }
  tick(time) {
    this.frame = requestAnimationFrame((t) => this.tick(t));
    if (document.hidden || (this.lastFrame && time - this.lastFrame < 32))
      return;
    this.lastFrame = time;
    const t = time / 1000;
    const target = this.speaking ? Math.max(0.035, this.level) * 0.32 : 0;
    this.jaw = (this.jaw || 0) * 0.65 + target * 0.35;
    const p = this.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = this.base[i * 3 + 1],
        z = this.base[i * 3 + 2];
      const weight = z > 0.2 ? Math.max(0, Math.min(1, (-y - 0.62) / 0.55)) : 0;
      p.array[i * 3 + 1] = y - this.jaw * weight;
    }
    p.needsUpdate = true;
    this.mouth.scale.y = 0.053 + this.jaw * 0.37;
    this.mouth.position.y = -0.725 - this.jaw * 0.3;
    const blink = this.reduced ? 1 : t % 5.4 > 5.23 ? 0.12 : 1;
    this.eyes.forEach((eye) => (eye.scale.y = blink));
    this.head.rotation.y = this.reduced
      ? -0.26
      : -0.26 + Math.sin(t * 0.34) * 0.08;
    this.head.rotation.z = this.reduced ? 0 : Math.sin(t * 0.27) * 0.017;
    this.head.position.y = this.reduced ? 0 : Math.sin(t * 0.7) * 0.018;
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    this.renderer.dispose();
  }
}
