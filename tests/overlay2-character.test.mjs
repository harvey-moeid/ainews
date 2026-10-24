import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  CHARACTER_DEFAULTS,
  HAIR_STYLES,
  CHARACTER_ACCESSORIES,
} from "../shared/character.js";
import { validateOverlay2 } from "../worker/overlay2.js";
import {
  createCharacterDetails,
  disposeCharacterDetails,
} from "../src/overlay2/character.js";

test("legacy settings retain the original character and invalid appearance is rejected", () => {
  const config = validateOverlay2({ name: "Host lama" });
  for (const [key, value] of Object.entries(CHARACTER_DEFAULTS))
    assert.equal(config[key], value);
  for (const key of ["hairStyle", "accessory"])
    for (const value of ["unknown", "", null, 3, {}])
      assert.throws(() => validateOverlay2({ [key]: value }), /Pilihan rambut/);
  for (const key of ["hairColor", "faceColor", "eyeColor"]) {
    assert.equal(validateOverlay2({ [key]: "#ABC123" })[key], "#ABC123");
    for (const value of ["red", "#fff", "#gggggg", "#12345600", null, 123])
      assert.throws(() => validateOverlay2({ [key]: value }), /Warna karakter/);
  }
});

test("every hair/accessory combination has finite geometry and frees shared GPU resources once", () => {
  for (const { id: hairStyle } of HAIR_STYLES) {
    for (const { id: accessory } of CHARACTER_ACCESSORIES) {
      const details = createCharacterDetails({
        ...CHARACTER_DEFAULTS,
        hairStyle,
        accessory,
      });
      assert.equal(
        Boolean(details.getObjectByName("hair")),
        hairStyle !== "none",
      );
      assert.equal(
        Boolean(details.getObjectByName("accessory")),
        accessory !== "none",
      );
      const resources = new Map();
      details.traverse((object) => {
        if (object.geometry) {
          assert.ok(
            Array.from(object.geometry.attributes.position.array).every(
              Number.isFinite,
            ),
          );
          object.geometry.computeBoundingBox();
          assert.ok(!object.geometry.boundingBox.isEmpty());
        }
        for (const resource of [object.geometry, object.material].filter(
          Boolean,
        )) {
          if (resources.has(resource)) continue;
          resources.set(resource, 0);
          resource.addEventListener("dispose", () =>
            resources.set(resource, resources.get(resource) + 1),
          );
        }
      });
      const head = new THREE.Group();
      head.add(details);
      head.remove(details);
      disposeCharacterDetails(details);
      assert.ok([...resources.values()].every((count) => count === 1));
    }
  }
});
