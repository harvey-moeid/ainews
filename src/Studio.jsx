import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
export default function Studio({
  speaking = false,
  glb = null,
  quality = "high",
  camera = "auto",
  onStatus,
}) {
  const ref = useRef(null),
    talk = useRef(speaking),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    talk.current = speaking;
  }, [speaking]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let renderer,
      frame,
      disposed = false,
      resize;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: quality !== "low",
        alpha: false,
      });
      renderer.setPixelRatio(
        Math.min(devicePixelRatio, quality === "high" ? 2 : 1),
      );
      renderer.shadowMap.enabled = quality !== "low";
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.3;
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#07131c");
      scene.fog = new THREE.Fog("#07131c", 7, 16);
      const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
      cam.position.set(0, 1.9, camera === "wide" ? 6.6 : 5.6);
      cam.lookAt(0, 1.62, 0);
      scene.add(new THREE.HemisphereLight(0xb1e4ff, 0x11131b, 2));
      const light = new THREE.DirectionalLight(0xffe5d1, 4);
      light.position.set(2, 5, 5);
      light.castShadow = true;
      scene.add(light);
      const rim = new THREE.PointLight(0x33caff, 24, 12);
      rim.position.set(-2, 3, -1);
      scene.add(rim);
      const red = new THREE.PointLight(0xff2946, 12, 9);
      red.position.set(2, 1, -2);
      scene.add(red);
      const mat = (c, roughness = 0.6, metalness = 0.1) =>
        new THREE.MeshStandardMaterial({ color: c, roughness, metalness });
      const navy = mat("#132336"),
        skin = mat("#bd8c73", 0.72, 0),
        hair = mat("#211916", 0.8, 0),
        white = mat("#d8e0e8"),
        metal = mat("#182630", 0.25, 0.7),
        black = mat("#121b26");
      const mesh = (g, m, x = 0, y = 0, z = 0, parent = scene) => {
        const o = new THREE.Mesh(g, m);
        o.position.set(x, y, z);
        o.castShadow = true;
        o.receiveShadow = true;
        parent.add(o);
        return o;
      };
      const box = (w, h, d, m, x, y, z, parent) =>
        mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, parent);
      const sphere = (sx, sy, sz, m, x, y, z, parent) => {
        const a = mesh(new THREE.SphereGeometry(1, 40, 32), m, x, y, z, parent);
        a.scale.set(sx, sy, sz);
        return a;
      };
      const glow = (c) => new THREE.MeshBasicMaterial({ color: c });
      mesh(
        new THREE.PlaneGeometry(30, 30),
        mat("#0c1720", 0.22, 0.45),
        0,
        0,
        0,
      ).rotation.x = -Math.PI / 2;
      box(9, 6, 0.2, mat("#0d1c28"), 0, 2.8, -2.9);
      for (let i = -5; i <= 5; i++) {
        box(0.025, 5, 0.06, mat("#253c4d"), i * 0.68, 2.5, -2.75);
      }
      box(10, 0.025, 0.02, glow("#3ac8ed"), 0, 1.1, -2.7);
      box(10, 0.015, 0.02, glow("#184e67"), 0, 3.6, -2.7);
      for (const x of [-2.5, 2.5]) {
        box(0.4, 5, 0.6, metal, x, 2.4, -1.9);
        box(
          0.025,
          4.8,
          0.03,
          glow(x < 0 ? "#27c1e8" : "#ed3b4a"),
          x + (x < 0 ? 0.21 : -0.21),
          2.4,
          -1.56,
        );
      }
      const texcanvas = document.createElement("canvas");
      texcanvas.width = 1024;
      texcanvas.height = 600;
      const ctx = texcanvas.getContext("2d");
      ctx.fillStyle = "#102532";
      ctx.fillRect(0, 0, 1024, 600);
      ctx.strokeStyle = "#1b4759";
      ctx.lineWidth = 1;
      for (let i = 0; i < 1024; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 600);
        ctx.stroke();
      }
      for (let i = 0; i < 600; i += 50) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(1024, i);
        ctx.stroke();
      }
      ctx.strokeStyle = "#3c6878";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(80, 450);
      ctx.bezierCurveTo(300, 50, 600, 650, 950, 180);
      ctx.stroke();
      ctx.fillStyle = "#edf5f6";
      ctx.textAlign = "center";
      ctx.font = "700 105px Arial";
      ctx.fillText("PASURUAN", 512, 240);
      ctx.fillStyle = "#a5c0cf";
      ctx.font = "500 42px Arial";
      ctx.fillText("AI NEWS TV", 512, 310);
      ctx.fillStyle = "#ec3441";
      ctx.fillRect(405, 350, 214, 6);
      const texture = new THREE.CanvasTexture(texcanvas);
      box(3.8, 2.25, 0.12, black, 0, 2.65, -2.6);
      mesh(
        new THREE.PlaneGeometry(3.7, 2.17),
        new THREE.MeshBasicMaterial({ map: texture }),
        0,
        2.65,
        -2.53,
      );
      const avatar = new THREE.Group();
      scene.add(avatar);
      const head = new THREE.Group();
      head.position.set(0, 2.47, 0);
      avatar.add(head);
      sphere(0.335, 0.435, 0.28, hair, 0, 0.03, -0.065, head);
      sphere(0.278, 0.35, 0.245, skin, 0, -0.005, 0.025, head);
      sphere(0.295, 0.18, 0.26, hair, 0, 0.27, 0.015, head);
      sphere(0.095, 0.31, 0.12, hair, -0.247, 0.02, -0.005, head);
      sphere(0.095, 0.36, 0.13, hair, 0.247, -0.01, -0.005, head);
      sphere(0.27, 0.33, 0.1, hair, 0, -0.08, -0.205, head);
      const eyes = [];
      for (const x of [-0.103, 0.103]) {
        sphere(0.054, 0.023, 0.018, white, x, 0.025, 0.249, head);
        const eye = sphere(0.022, 0.025, 0.012, black, x, 0.025, 0.265, head);
        eyes.push(eye);
        const brow = box(0.095, 0.012, 0.015, hair, x, 0.083, 0.252, head);
        brow.rotation.z = x < 0 ? 0.08 : -0.08;
        sphere(
          0.012,
          0.035,
          0.012,
          mat("#d4b581", 0.25, 0.7),
          x < 0 ? -0.278 : 0.278,
          -0.08,
          0.025,
          head,
        );
      }
      sphere(0.028, 0.064, 0.037, skin, 0, -0.04, 0.267, head);
      const mouth = sphere(
        0.066,
        0.014,
        0.015,
        mat("#7c3d39", 0.9, 0),
        0,
        -0.145,
        0.247,
        head,
      );
      sphere(0.09, 0.018, 0.025, skin, 0, -0.22, 0.19, head);
      mesh(
        new THREE.CylinderGeometry(0.09, 0.12, 0.27, 32),
        skin,
        0,
        2.08,
        0,
        avatar,
      );
      const torso = mesh(
        new THREE.CylinderGeometry(0.25, 0.37, 0.81, 5),
        navy,
        0,
        1.65,
        0,
        avatar,
      );
      torso.rotation.y = Math.PI / 5;
      box(0.2, 0.48, 0.035, white, 0, 1.82, 0.248, avatar);
      for (const sign of [-1, 1]) {
        const lapel = box(
          0.13,
          0.54,
          0.05,
          navy,
          sign * 0.16,
          1.83,
          0.263,
          avatar,
        );
        lapel.rotation.z = -sign * 0.22;
        const arm = mesh(
          new THREE.CapsuleGeometry(0.105, 0.53, 8, 20),
          navy,
          sign * 0.38,
          1.66,
          0.04,
          avatar,
        );
        arm.rotation.z = sign * 0.15;
        const forearm = mesh(
          new THREE.CapsuleGeometry(0.09, 0.36, 8, 20),
          navy,
          sign * 0.3,
          1.3,
          0.24,
          avatar,
        );
        forearm.rotation.z = sign * 0.8;
        forearm.rotation.x = 0.7;
        sphere(0.12, 0.06, 0.09, skin, sign * 0.13, 1.19, 0.4, avatar);
      }
      mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.008, 20),
        mat("#dca26f", 0.3, 0.6),
        -0.19,
        1.99,
        0.285,
        avatar,
      ).rotation.x = Math.PI / 2;
      const desk = new THREE.Group();
      scene.add(desk);
      mesh(
        new THREE.CylinderGeometry(0.94, 0.73, 0.1, 64),
        metal,
        0,
        1.13,
        0.33,
        desk,
      );
      mesh(
        new THREE.CylinderGeometry(0.91, 0.91, 0.025, 64),
        glow("#bc273c"),
        0,
        1.1,
        0.33,
        desk,
      );
      mesh(
        new THREE.CylinderGeometry(0.48, 0.39, 1.04, 64),
        mat("#102130", 0.35, 0.45),
        0,
        0.55,
        0.3,
        desk,
      );
      box(0.5, 0.025, 0.32, mat("#26394a"), 0, 1.195, 0.48, desk);
      const laptop = box(0.39, 0.24, 0.02, black, 0.1, 1.3, 0.36, desk);
      laptop.rotation.x = -0.2;
      let mixer, model;
      const clock = new THREE.Clock();
      if (glb) {
        new GLTFLoader().load(
          glb,
          (g) => {
            if (disposed) return;
            avatar.visible = false;
            model = g.scene;
            const bounds = new THREE.Box3().setFromObject(model);
            const size = bounds.getSize(new THREE.Vector3());
            model.scale.setScalar(2.7 / Math.max(size.y, 0.01));
            const b2 = new THREE.Box3().setFromObject(model);
            model.position.y = -b2.min.y;
            scene.add(model);
            if (g.animations.length) {
              mixer = new THREE.AnimationMixer(model);
              mixer.clipAction(g.animations[0]).play();
            }
            let morph = false;
            model.traverse((o) => {
              if (
                o.morphTargetDictionary &&
                (o.morphTargetDictionary.jawOpen !== undefined ||
                  o.morphTargetDictionary.viseme_aa !== undefined)
              )
                morph = true;
            });
            onStatus?.(
              morph
                ? "GLB siap · morph mulut tersedia"
                : "GLB siap · gerak mulut adaptif tidak tersedia",
            );
          },
          undefined,
          () => onStatus?.("GLB gagal dimuat · presenter bawaan aktif"),
        );
      }
      const res = () => {
        const w = el.clientWidth,
          h = el.clientHeight;
        renderer.setSize(w, h);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      };
      res();
      resize = new ResizeObserver(res);
      resize.observe(el);
      let t = 0;
      const animate = () => {
        if (disposed) return;
        frame = requestAnimationFrame(animate);
        const delta = clock.getDelta();
        t += delta;
        head.rotation.y = Math.sin(t * 0.6) * 0.045;
        head.rotation.z = Math.sin(t * 0.8) * 0.018;
        avatar.position.y = Math.sin(t * 1.4) * 0.006;
        mouth.scale.y =
          0.014 * (talk.current ? 1.1 + Math.abs(Math.sin(t * 15)) * 3.4 : 1);
        eyes.forEach((e) => (e.scale.y = 0.025 * (t % 4.6 > 4.45 ? 0.1 : 1)));
        if (camera === "auto") cam.position.x = Math.sin(t * 0.07) * 0.12;
        cam.lookAt(0, 1.65, 0);
        mixer?.update(delta);
        model?.traverse((o) => {
          if (o.morphTargetDictionary) {
            const idx =
              o.morphTargetDictionary.jawOpen ??
              o.morphTargetDictionary.viseme_aa;
            if (idx !== undefined)
              o.morphTargetInfluences[idx] = talk.current
                ? Math.abs(Math.sin(t * 12)) * 0.6
                : 0;
          }
        });
        renderer.render(scene, cam);
      };
      animate();
      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        resize?.disconnect();
        scene.traverse((o) => {
          o.geometry?.dispose();
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => {
              m.map?.dispose();
              m.dispose();
            });
          }
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
    } catch {
      setFailed(true);
      renderer?.dispose();
      onStatus?.("WebGL indisponibel · mode visual cadangan");
    }
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize?.disconnect();
    };
  }, [glb, quality, camera]);
  return (
    <div className="studio-canvas" ref={ref}>
      {failed && (
        <div className="studio-fallback">
          <div className="fallback-orbit" />
          <b>PASURUAN</b>
          <span>AI NEWS TV</span>
          <small>Studio standby · WebGL tidak tersedia</small>
        </div>
      )}
    </div>
  );
}
