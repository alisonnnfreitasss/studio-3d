// A soft studio for image-based lighting, baked once through PMREM. Unlike three's RoomEnvironment
// (emitters at 17 to 100), every panel here is broad and moderate (at most 4), so glossy paint and
// glass show wide soft highlights instead of pinpoint hot spots that bloom into blobs.
// Warm key panel on one side, cool strip on the other, a big soft ceiling, a darker warm floor.
import * as THREE from "three";

export function softStudio() {
  const scene = new THREE.Scene();
  const basic = (hex, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.BackSide });
  const panel = (hex, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide });

  // the room: walls light warm grey, floor darker and warmer (the garage floor and the bench)
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 20, 40), [
    basic(0xd9d2c8, 0.55), basic(0xd9d2c8, 0.55), // +x, -x
    basic(0xf2efe8, 0.8),                          // +y ceiling
    basic(0x6b5a48, 0.22),                         // -y floor
    basic(0xd9d2c8, 0.5), basic(0xd9d2c8, 0.5),   // +z, -z
  ]);
  room.position.y = 6;
  scene.add(room);

  const add = (w, h, mat, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    scene.add(m);
  };
  // big soft ceiling box (the top light that gives the toy look its gentle top-down falloff)
  add(18, 18, panel(0xfff6ea, 3.2), [0, 15.5, 0], [Math.PI / 2, 0, 0]);
  // warm key panel, front left (matches the sun's side): a tall strip, the main highlight on glass
  add(5, 12, panel(0xffe2bf, 4.0), [-18, 6, 8], [0, Math.PI / 2.6, 0]);
  // cool strip, back right: the second, thinner streak on glass and the rim on paint
  add(2.2, 12, panel(0xcfe0ff, 3.0), [17, 6, -10], [0, -Math.PI / 3, 0]);
  // a low fill card in front, so faces toward the camera are not dark in reflections
  add(14, 5, panel(0xffffff, 1.2), [0, 2.5, 19], [0, Math.PI, 0]);
  return scene;
}
