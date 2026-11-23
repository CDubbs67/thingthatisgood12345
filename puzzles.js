// Shape-Based 3D Interlocking Disassembly Puzzle Generator
// Generates puzzles formed into clean 3D geometric shapes:
// - Square / Cube
// - Triangle / Pyramid
// - Rectangle / Cuboid
// - Circle / Sphere
// Every puzzle partitions the exact 3D shape with 100% zero overlap and guaranteed solvability.

class ShapePuzzleGenerator {
  constructor() {
    this.DIRECTIONS = [
      { vec: [1, 0, 0], axis: 'x', sign: 1, name: '+X' },
      { vec: [-1, 0, 0], axis: 'x', sign: -1, name: '-X' },
      { vec: [0, 1, 0], axis: 'y', sign: 1, name: '+Y' },
      { vec: [0, -1, 0], axis: 'y', sign: -1, name: '-Y' },
      { vec: [0, 0, 1], axis: 'z', sign: 1, name: '+Z' },
      { vec: [0, 0, -1], axis: 'z', sign: -1, name: '-Z' }
    ];

    this.SHAPES = [
      { id: 'square', name: 'Square (Cube)', icon: '🟩', desc: 'Solid 3×3×3 geometric cube' },
      { id: 'triangle', name: 'Triangle (Pyramid)', icon: '🔺', desc: 'Stepped 3D triangular pyramid' },
      { id: 'rectangle', name: 'Rectangle (Prism)', icon: '🟦', desc: 'Long rectangular block' },
      { id: 'circle', name: 'Circle (Sphere)', icon: '⚪', desc: 'Curved 3D voxel sphere' }
    ];

    this.PALETTES = [
      // Wood Tones
      [0xd97736, 0x3d70b2, 0xc89666, 0x6e432b, 0x2b5b84, 0xa25238, 0x5a7d5a, 0xdeb887, 0x8a624a, 0xb85d19, 0x3d7b80, 0x7c4d79, 0xa0522d, 0xcd853f],
      // Polished Brass & Metal
      [0xdaa520, 0x708090, 0xcd853f, 0x4682b4, 0xb8860b, 0x5f9ea0, 0xd2691e, 0x2e8b57, 0x8b4513, 0x20b2aa, 0x9370db, 0x3cb371, 0xb0c4de, 0xdc143c],
      // Jewel Tones
      [0x38d39f, 0x58a6ff, 0xff7b72, 0xd29922, 0xbc8cff, 0xf0883e, 0x56d364, 0x79c0ff, 0xffa657, 0xe3b341, 0xd2a8ff, 0x7ee787, 0x48d1cc, 0xff69b4]
    ];
  }

  k(x, y, z) {
    return `${x},${y},${z}`;
  }

  parse(str) {
    return str.split(',').map(Number);
  }

  // Get full solid voxel set for a given geometric shape
  getShapeVoxels(shapeId) {
    const voxels = [];
    if (shapeId === 'square') {
      // 3x3x3 Solid Cube (27 voxels)
      for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
          for (let z = -1; z <= 1; z++) {
            voxels.push([x, y, z]);
          }
        }
      }
    } else if (shapeId === 'triangle') {
      // 3D Stepped Pyramid: Apex at top, widening downwards (35 voxels)
      for (let y = -1; y <= 1; y++) {
        const r = 1 - y; // y=1: r=0 (1 voxel), y=0: r=1 (9 voxels), y=-1: r=2 (25 voxels)
        for (let x = -r; x <= r; x++) {
          for (let z = -r; z <= r; z++) {
            voxels.push([x, y, z]);
          }
        }
      }
    } else if (shapeId === 'rectangle') {
      // 5x3x2 Rectangular Solid Prism (30 voxels)
      for (let x = -2; x <= 2; x++) {
        for (let y = -1; y <= 1; y++) {
          for (let z = -1; z <= 0; z++) {
            voxels.push([x, y, z]);
          }
        }
      }
    } else { // 'circle' / sphere
      // 3D Voxel Sphere (33 voxels)
      for (let x = -2; x <= 2; x++) {
        for (let y = -2; y <= 2; y++) {
          for (let z = -2; z <= 2; z++) {
            if (x * x + y * y + z * z <= 4.2) {
              voxels.push([x, y, z]);
            }
          }
        }
      }
    }
    return voxels;
  }

  // Generate an interlocking puzzle conforming exactly to the chosen shape
  generateShapePuzzle(shapeId = 'square', seed = Date.now()) {
    let s = Math.abs(seed) % 2147483647;
    const random = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    const randInt = (min, max) => Math.floor(random() * (max - min + 1)) + min;
    const choice = (arr) => arr[Math.floor(random() * arr.length)];

    const allVoxels = this.getShapeVoxels(shapeId);
    const S = new Set(allVoxels.map(v => this.k(v[0], v[1], v[2])));
    const rawPieces = [];

    // Carve pieces from outside in:
    // At each step, choose a surface cluster of voxels that can escape along a direction `dir`
    while (S.size > 0) {
      const dirs = [...this.DIRECTIONS].sort(() => random() - 0.5);
      let pieceFound = null;
      let chosenDir = null;

      for (const dir of dirs) {
        // Collect surface voxels that have an open ray in +dir
        const surfaceVoxels = [];
        for (const vStr of S) {
          const [x, y, z] = this.parse(vStr);
          let clear = true;
          for (let dist = 1; dist <= 6; dist++) {
            const rx = x + dir.vec[0] * dist;
            const ry = y + dir.vec[1] * dist;
            const rz = z + dir.vec[2] * dist;
            if (S.has(this.k(rx, ry, rz))) {
              clear = false;
              break;
            }
          }
          if (clear) surfaceVoxels.push([x, y, z]);
        }

        if (surfaceVoxels.length === 0) continue;

        // Group 2 to 4 adjacent surface voxels into a single connected piece
        const seedVoxel = choice(surfaceVoxels);
        const pieceVoxels = [seedVoxel];
        const targetSize = Math.min(S.size, randInt(2, 3));

        for (let step = 1; step < targetSize; step++) {
          const neighbor = surfaceVoxels.find(sv =>
            !pieceVoxels.some(pv => pv[0] === sv[0] && pv[1] === sv[1] && pv[2] === sv[2]) &&
            pieceVoxels.some(pv => Math.abs(pv[0] - sv[0]) + Math.abs(pv[1] - sv[1]) + Math.abs(pv[2] - sv[2]) === 1)
          );
          if (neighbor) {
            pieceVoxels.push(neighbor);
          }
        }

        pieceFound = pieceVoxels;
        chosenDir = dir;
        break;
      }

      if (!pieceFound) {
        const first = this.parse([...S][0]);
        pieceFound = [first];
        chosenDir = dirs[0];
      }

      // Remove carved voxels from S
      for (const v of pieceFound) {
        S.delete(this.k(v[0], v[1], v[2]));
      }

      rawPieces.push({
        voxels: pieceFound,
        dir: chosenDir,
        axis: chosenDir.axis
      });
    }

    // Assign colors and metadata
    const palette = choice(this.PALETTES);
    const shapeDef = this.SHAPES.find(s => s.id === shapeId) || this.SHAPES[0];

    const pieces = rawPieces.map((p, idx) => ({
      id: `piece_${idx + 1}`,
      name: `${shapeDef.name} Piece ${idx + 1}`,
      color: palette[idx % palette.length],
      voxels: p.voxels,
      allowedAxis: p.axis,
      escapeDir: p.dir,
      freeDistance: 4.8
    }));

    return {
      id: `shape_${shapeId}_${seed}`,
      shapeId: shapeId,
      shapeDef: shapeDef,
      name: `${shapeDef.name} Puzzle`,
      pieceCount: pieces.length,
      pieces: pieces
    };
  }
}

window.shapePuzzleGenerator = new ShapePuzzleGenerator();
