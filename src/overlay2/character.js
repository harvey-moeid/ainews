import * as THREE from "three";

// All details share the animated head's coordinate system; no external assets.
export function createCharacterDetails(appearance) {
  const details = new THREE.Group();
  details.name = "character-details";
  if (appearance.hairStyle !== "none") {
    const hair = new THREE.Group();
    hair.name = "hair";
    const color = new THREE.Color(appearance.hairColor);
    const material = new THREE.MeshPhongMaterial({
      color,
      emissive: color.clone().multiplyScalar(0.12),
      specular: 0x8199bb,
      shininess: 40,
      side: THREE.DoubleSide,
    });
    if (appearance.hairStyle === "mohawk") {
      const geometry = new THREE.ConeGeometry(0.23, 0.65, 4);
      for (let i = 0; i < 7; i++) {
        const z = -0.72 + i * 0.23;
        const spike = new THREE.Mesh(geometry, material);
        spike.scale.set(0.7, 1, 1.25);
        spike.position.set(0, 1.96 - z * z * 0.65, z);
        hair.add(spike);
      }
    } else {
      const positions = [],
        indices = [],
        cols = 48,
        rows = 20;
      for (let row = 0; row <= rows; row++) {
        for (let col = 0; col <= cols; col++) {
          const phi = (col / cols) * Math.PI * 2;
          const front = Math.max(0, Math.cos(phi));
          const fringe = THREE.MathUtils.smoothstep(front, 0.55, 0.92);
          const bottom =
            appearance.hairStyle === "bob"
              ? THREE.MathUtils.lerp(-1.15, 1.0, fringe)
              : THREE.MathUtils.lerp(0.45, 1.05, front);
          const theta = (row / rows) * Math.acos((bottom - 0.12) / 1.83);
          const radius = Math.sin(theta);
          positions.push(
            1.2 * radius * Math.sin(phi),
            0.12 + 1.83 * Math.cos(theta),
            1.0 * radius * Math.cos(phi),
          );
        }
      }
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const a = row * (cols + 1) + col,
            b = a + cols + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      hair.add(new THREE.Mesh(geometry, material));
      hair.add(
        new THREE.LineSegments(
          new THREE.WireframeGeometry(geometry),
          new THREE.LineBasicMaterial({
            color: color.clone().lerp(new THREE.Color(0xffffff), 0.3),
            transparent: true,
            opacity: 0.2,
          }),
        ),
      );
    }
    details.add(hair);
  }
  if (appearance.accessory !== "none") {
    const accessory = new THREE.Group();
    accessory.name = "accessory";
    const material = new THREE.MeshPhongMaterial({
      color: new THREE.Color(appearance.faceColor).lerp(
        new THREE.Color(0xffffff),
        0.55,
      ),
      shininess: 75,
    });
    const tube = (points, radius) =>
      new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(
            points.map((p) => new THREE.Vector3(...p)),
          ),
          32,
          radius,
          8,
          false,
        ),
        material,
      );
    if (appearance.accessory === "glasses") {
      const frame = new THREE.TorusGeometry(0.25, 0.026, 8, 40);
      for (const side of [-1, 1]) {
        const lens = new THREE.Mesh(frame, material);
        lens.position.set(side * 0.46, 0.38, 1.02);
        lens.scale.y = 0.72;
        accessory.add(lens);
        accessory.add(
          tube(
            [
              [side * 0.71, 0.38, 1.02],
              [side * 1.02, 0.37, 0.65],
              [side * 1.12, 0.3, -0.04],
            ],
            0.02,
          ),
        );
      }
      accessory.add(
        tube(
          [
            [-0.21, 0.38, 1.02],
            [0, 0.45, 1.12],
            [0.21, 0.38, 1.02],
          ],
          0.023,
        ),
      );
    } else if (appearance.accessory === "headset") {
      accessory.add(
        tube(
          [
            [-1.24, 0.05, -0.05],
            [-1.19, 1.04, -0.05],
            [0, 2.04, -0.05],
            [1.19, 1.04, -0.05],
            [1.24, 0.05, -0.05],
          ],
          0.065,
        ),
      );
      const cushion = new THREE.SphereGeometry(1, 16, 16);
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(cushion, material);
        ear.scale.set(0.2, 0.36, 0.26);
        ear.position.set(side * 1.23, 0.03, -0.04);
        accessory.add(ear);
      }
      accessory.add(
        tube(
          [
            [1.36, -0.1, 0.1],
            [1.1, -0.5, 0.6],
            [0.45, -0.65, 1.03],
          ],
          0.032,
        ),
      );
      const mic = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 12, 12),
        material,
      );
      mic.position.set(0.45, -0.65, 1.03);
      accessory.add(mic);
    }
    details.add(accessory);
  }
  return details;
}

export function disposeCharacterDetails(group) {
  const geometries = new Set(),
    materials = new Set();
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (Array.isArray(object.material))
      object.material.forEach((material) => materials.add(material));
    else if (object.material) materials.add(object.material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
