// Interlock 3D - Shape-Based Disassembly Engine
(function() {
  'use strict';

  // Game Progression State
  const SHAPES = ['square', 'triangle', 'rectangle', 'circle'];
  let currentShapeIdx = 0;
  let currentShape = SHAPES[currentShapeIdx];
  let currentSeed = Date.now();
  let currentPuzzle = null;
  let activePieces = [];
  let freedPieces = [];
  let moveCount = 0;
  let timerSeconds = 0;
  let timerInterval = null;
  let isLevelComplete = false;
  let materialTheme = 'wood'; // 'wood', 'brass', 'neon'

  // Three.js Globals
  let scene, camera, renderer;
  let puzzleGroup, particlesGroup, guidesGroup;
  let raycaster, mouse;
  let hoveredPiece = null;
  let draggedPiece = null;
  let dragPlane = null;
  let dragOffset = new THREE.Vector3();
  let dragStartPos = new THREE.Vector3();
  let lastSlideTickTime = 0;

  // Camera Orbit State
  let isOrbiting = false;
  let prevMousePos = { x: 0, y: 0 };
  let cameraTarget = new THREE.Vector3(0, 0, 0);
  let spherical = {
    radius: 13.5,
    theta: Math.PI / 4,
    phi: Math.PI / 3.2
  };
  let targetSpherical = { ...spherical };

  // DOM Elements
  const canvas = document.getElementById('three-canvas');
  const shapeSelect = document.getElementById('shape-select');
  const btnRandomize = document.getElementById('btn-randomize');

  const piecesCountEl = document.getElementById('pieces-count');
  const movesCountEl = document.getElementById('moves-count');
  const timerDisplayEl = document.getElementById('timer-display');
  const btnHint = document.getElementById('btn-hint');
  const btnReset = document.getElementById('btn-reset');
  const btnSound = document.getElementById('btn-sound');
  const soundIcon = document.getElementById('sound-icon');
  const btnTheme = document.getElementById('btn-theme');
  const btnHelp = document.getElementById('btn-help');
  const helpModal = document.getElementById('help-modal');
  const btnCloseHelp = document.getElementById('btn-close-help');

  const victoryModal = document.getElementById('victory-modal');
  const vicHeaderEl = document.getElementById('vic-header');
  const vicSubtitleEl = document.getElementById('vic-subtitle');
  const btnReplay = document.getElementById('btn-replay');
  const btnNextShape = document.getElementById('btn-next-shape');
  const vicTimeEl = document.getElementById('vic-time');
  const vicMovesEl = document.getElementById('vic-moves');

  // Procedural Wood Textures
  function createWoodTexture(baseColorHex, grainContrast = 0.16) {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');

    const col = new THREE.Color(baseColorHex);
    ctx.fillStyle = col.getStyle();
    ctx.fillRect(0, 0, size, size);

    // Subtle grain rings
    ctx.globalAlpha = grainContrast;
    for (let i = 0; i < size; i += 2) {
      const shade = Math.sin(i * 0.09 + Math.sin(i * 0.03) * 3) * 0.5 + 0.5;
      ctx.fillStyle = shade > 0.5 ? '#ffffff' : '#000000';
      ctx.fillRect(0, i, size, 1.5);
    }
    // Fine fibers
    ctx.globalAlpha = 0.08;
    for (let j = 0; j < 2500; j++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#fff' : '#000';
      ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 8 + Math.random() * 18);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // Initialize Three.js Engine
  function initEngine() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x12151b);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    updateCameraPosition();

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    puzzleGroup = new THREE.Group();
    scene.add(puzzleGroup);

    particlesGroup = new THREE.Group();
    scene.add(particlesGroup);

    guidesGroup = new THREE.Group();
    scene.add(guidesGroup);

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xfff3e0, 1.25);
    dirLight1.position.set(8, 14, 10);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 1024;
    dirLight1.shadow.mapSize.height = 1024;
    dirLight1.shadow.camera.near = 0.5;
    dirLight1.shadow.camera.far = 35;
    dirLight1.shadow.camera.left = -8;
    dirLight1.shadow.camera.right = 8;
    dirLight1.shadow.camera.top = 8;
    dirLight1.shadow.camera.bottom = -8;
    dirLight1.shadow.bias = -0.0005;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x82b1ff, 0.55);
    dirLight2.position.set(-10, -5, -8);
    scene.add(dirLight2);

    // Floor Pedestal with glowing ring
    const floorGeo = new THREE.CylinderGeometry(7.5, 8.2, 0.4, 48);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x181e26,
      roughness: 0.85,
      metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -3.8;
    floor.receiveShadow = true;
    scene.add(floor);

    const ringGeo = new THREE.TorusGeometry(7.4, 0.05, 16, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38d39f });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -3.6;
    scene.add(ring);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    dragPlane = new THREE.Plane();

    setupEventListeners();
    loadShapePuzzle('square', currentSeed);
    animate();
  }

  function updateCameraPosition() {
    spherical.phi = Math.max(0.12, Math.min(Math.PI / 2 - 0.04, spherical.phi));
    spherical.radius = Math.max(5.0, Math.min(26, spherical.radius));

    const x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
    const y = spherical.radius * Math.cos(spherical.phi);
    const z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);

    camera.position.set(x, y, z);
    camera.lookAt(cameraTarget);
  }

  // Create Voxel Geometry tailored to the shape
  // For 'circle', outer vertices are spherified to form a completely smooth sphere
  // For 'triangle', outer vertices are sloped to form a smooth triangular pyramid
  function createVoxelGeometry(vx, vy, vz, shapeId) {
    if (shapeId === 'circle') {
      const geo = new THREE.BoxGeometry(0.96, 0.96, 0.96, 6, 6, 6);
      const pos = geo.attributes.position;
      const R = 2.52;
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i) + vx;
        let y = pos.getY(i) + vy;
        let z = pos.getZ(i) + vz;
        const d = Math.hypot(x, y, z);
        if (d > 1.35) {
          const factor = Math.min(1.0, (d - 1.35) / 0.9);
          const targetX = x * (R / d);
          const targetY = y * (R / d);
          const targetZ = z * (R / d);
          x = x * (1 - factor) + targetX * factor;
          y = y * (1 - factor) + targetY * factor;
          z = z * (1 - factor) + targetZ * factor;
        }
        pos.setXYZ(i, x - vx, y - vy, z - vz);
      }
      geo.computeVertexNormals();
      return geo;
    } else if (shapeId === 'triangle') {
      const geo = new THREE.BoxGeometry(0.96, 0.96, 0.96, 6, 6, 6);
      const pos = geo.attributes.position;
      const apexY = 1.85;
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i) + vx;
        let y = pos.getY(i) + vy;
        let z = pos.getZ(i) + vz;
        
        const maxR = Math.max(0.04, (apexY - y) * 0.92);
        if (Math.abs(x) > maxR - 0.25 || Math.abs(z) > maxR - 0.25) {
          const factorX = Math.min(1.0, Math.max(0, (Math.abs(x) - (maxR - 0.25)) / 0.35));
          const factorZ = Math.min(1.0, Math.max(0, (Math.abs(z) - (maxR - 0.25)) / 0.35));
          const signX = Math.sign(x) || 1;
          const signZ = Math.sign(z) || 1;
          
          x = x * (1 - factorX) + (signX * Math.min(Math.abs(x), maxR)) * factorX;
          z = z * (1 - factorZ) + (signZ * Math.min(Math.abs(z), maxR)) * factorZ;
        }
        pos.setXYZ(i, x - vx, y - vy, z - vz);
      }
      geo.computeVertexNormals();
      return geo;
    } else {
      // Clean beveled boxes for Square and Rectangle
      return new THREE.BoxGeometry(0.96, 0.96, 0.96);
    }
  }

  function createPieceMesh(pieceDef) {
    const group = new THREE.Group();
    group.name = pieceDef.id;

    let mat;
    if (materialTheme === 'wood') {
      const woodTex = createWoodTexture(pieceDef.color);
      mat = new THREE.MeshStandardMaterial({
        color: pieceDef.color,
        roughness: 0.65,
        metalness: 0.05,
        map: woodTex
      });
    } else if (materialTheme === 'brass') {
      mat = new THREE.MeshStandardMaterial({
        color: pieceDef.color,
        roughness: 0.22,
        metalness: 0.88
      });
    } else { // neon cyber
      mat = new THREE.MeshStandardMaterial({
        color: pieceDef.color,
        roughness: 0.35,
        metalness: 0.2,
        emissive: pieceDef.color,
        emissiveIntensity: 0.2
      });
    }

    pieceDef.voxels.forEach(v => {
      const voxelGeo = createVoxelGeometry(v[0], v[1], v[2], currentShape);
      const subMesh = new THREE.Mesh(voxelGeo, mat);
      subMesh.position.set(v[0], v[1], v[2]);
      subMesh.castShadow = true;
      subMesh.receiveShadow = true;
      group.add(subMesh);
    });

    return {
      group: group,
      material: mat,
      def: pieceDef,
      offset: new THREE.Vector3(0, 0, 0),
      isFreed: false
    };
  }

  // Load a Shape-Based Puzzle
  function loadShapePuzzle(shapeId = 'square', seed = Date.now()) {
    currentShape = shapeId;
    currentShapeIdx = SHAPES.indexOf(shapeId);
    if (currentShapeIdx === -1) currentShapeIdx = 0;
    currentSeed = seed;

    if (shapeSelect.value !== shapeId) {
      shapeSelect.value = shapeId;
    }

    currentPuzzle = window.shapePuzzleGenerator.generateShapePuzzle(shapeId, currentSeed);

    // Clear previous
    while (puzzleGroup.children.length > 0) {
      const obj = puzzleGroup.children[0];
      puzzleGroup.remove(obj);
    }
    clearGuides();

    activePieces = [];
    freedPieces = [];
    moveCount = 0;
    isLevelComplete = false;
    movesCountEl.textContent = '0';
    updatePiecesHUD();

    // Adjust camera for shape
    spherical.radius = shapeId === 'rectangle' ? 14.5 : 13.0;
    spherical.theta = Math.PI / 4;
    spherical.phi = Math.PI / 3.2;
    targetSpherical = { ...spherical };
    updateCameraPosition();

    // Build Pieces
    currentPuzzle.pieces.forEach(pDef => {
      const pieceObj = createPieceMesh(pDef);
      activePieces.push(pieceObj);
      puzzleGroup.add(pieceObj.group);
    });

    // Reset Timer
    clearInterval(timerInterval);
    timerSeconds = 0;
    timerDisplayEl.textContent = "00:00";
    timerInterval = setInterval(() => {
      if (!isLevelComplete) {
        timerSeconds++;
        const mins = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
        const secs = String(timerSeconds % 60).padStart(2, '0');
        timerDisplayEl.textContent = `${mins}:${secs}`;
      }
    }, 1000);

    victoryModal.classList.remove('active');
  }

  function updatePiecesHUD() {
    const total = currentPuzzle ? currentPuzzle.pieces.length : 0;
    const remaining = activePieces.filter(p => !p.isFreed).length;
    piecesCountEl.textContent = `${remaining} / ${total}`;
  }

  function showSlideGuides(piece) {
    clearGuides();
    if (!piece || piece.isFreed) return;

    const axis = piece.def.allowedAxis;
    const bounds = computeSlideLimits(piece, axis);

    const dirVector = new THREE.Vector3(
      axis === 'x' ? 1 : 0,
      axis === 'y' ? 1 : 0,
      axis === 'z' ? 1 : 0
    );

    const railCenter = (bounds.min + bounds.max) / 2;
    const railPos = piece.group.position.clone();
    railPos[axis] = railCenter;

    const linePoints = [];
    const p1 = railPos.clone();
    p1[axis] = bounds.min - 0.5;
    const p2 = railPos.clone();
    p2[axis] = bounds.max + 0.5;
    linePoints.push(p1, p2);

    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
    const lineMat = new THREE.LineDashedMaterial({
      color: 0x58a6ff,
      dashSize: 0.3,
      gapSize: 0.15,
      linewidth: 2
    });
    const line = new THREE.Line(lineGeo, lineMat);
    line.computeLineDistances();
    guidesGroup.add(line);

    // Glowing Arrow indicators
    const arrowHelperPos = new THREE.ArrowHelper(dirVector, railPos, 1.2, 0x38d39f, 0.4, 0.25);
    const arrowHelperNeg = new THREE.ArrowHelper(dirVector.clone().negate(), railPos, 1.2, 0x38d39f, 0.4, 0.25);
    guidesGroup.add(arrowHelperPos);
    guidesGroup.add(arrowHelperNeg);
  }

  function clearGuides() {
    while (guidesGroup.children.length > 0) {
      guidesGroup.remove(guidesGroup.children[0]);
    }
  }

  // 3D Collision Detection
  function computeSlideLimits(piece, axis) {
    const currentOffset = piece.offset[axis];
    let minLimit = -7.0;
    let maxLimit = 7.0;

    const otherPieces = activePieces.filter(p => p !== piece && !p.isFreed);

    for (const v1 of piece.def.voxels) {
      const v1World = [
        v1[0] + (axis === 'x' ? 0 : piece.offset.x),
        v1[1] + (axis === 'y' ? 0 : piece.offset.y),
        v1[2] + (axis === 'z' ? 0 : piece.offset.z)
      ];

      for (const other of otherPieces) {
        for (const v2 of other.def.voxels) {
          const v2World = [
            v2[0] + other.offset.x,
            v2[1] + other.offset.y,
            v2[2] + other.offset.z
          ];

          let overlapOtherAxes = true;
          if (axis === 'x') {
            if (Math.abs(v1World[1] - v2World[1]) >= 0.94 || Math.abs(v1World[2] - v2World[2]) >= 0.94) {
              overlapOtherAxes = false;
            }
          } else if (axis === 'y') {
            if (Math.abs(v1World[0] - v2World[0]) >= 0.94 || Math.abs(v1World[2] - v2World[2]) >= 0.94) {
              overlapOtherAxes = false;
            }
          } else if (axis === 'z') {
            if (Math.abs(v1World[0] - v2World[0]) >= 0.94 || Math.abs(v1World[1] - v2World[1]) >= 0.94) {
              overlapOtherAxes = false;
            }
          }

          if (overlapOtherAxes) {
            const axisIdx = axis === 'x' ? 0 : (axis === 'y' ? 1 : 2);
            const dist = v2World[axisIdx] - v1[axisIdx];

            if (dist > currentOffset) {
              const allowedMax = dist - 0.98;
              if (allowedMax < maxLimit) maxLimit = allowedMax;
            } else if (dist < currentOffset) {
              const allowedMin = dist + 0.98;
              if (allowedMin > minLimit) minLimit = allowedMin;
            }
          }
        }
      }
    }

    return { min: minLimit, max: maxLimit };
  }

  function spawnDisassemblyParticles(position, colorHex) {
    const count = 35;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x + (Math.random() - 0.5) * 1.5;
      positions[i * 3 + 1] = position.y + (Math.random() - 0.5) * 1.5;
      positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 1.5;

      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 0.12,
        Math.random() * 0.1 + 0.05,
        (Math.random() - 0.5) * 0.12
      ));
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: colorHex,
      size: 0.18,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending
    });

    const pSystem = new THREE.Points(geo, mat);
    particlesGroup.add(pSystem);

    let life = 60;
    const pAnim = () => {
      life--;
      const posAttr = pSystem.geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        posAttr.array[i * 3] += velocities[i].x;
        posAttr.array[i * 3 + 1] += velocities[i].y;
        posAttr.array[i * 3 + 2] += velocities[i].z;
        velocities[i].y -= 0.002;
      }
      posAttr.needsUpdate = true;
      mat.opacity = life / 60;

      if (life > 0) {
        requestAnimationFrame(pAnim);
      } else {
        particlesGroup.remove(pSystem);
        geo.dispose();
        mat.dispose();
      }
    };
    pAnim();
  }

  function freePiece(piece) {
    if (piece.isFreed) return;
    piece.isFreed = true;
    freedPieces.push(piece);

    window.puzzleAudio.playFreed();
    spawnDisassemblyParticles(piece.group.position, piece.def.color);
    clearGuides();

    const startPos = piece.group.position.clone();
    const flightAxis = piece.def.allowedAxis;
    const direction = piece.offset[flightAxis] >= 0 ? 1 : -1;
    const targetFlight = startPos.clone();
    targetFlight[flightAxis] += direction * 7.5;
    targetFlight.y += 2.0;

    let step = 0;
    const animFlight = () => {
      step += 0.04;
      piece.group.position.lerp(targetFlight, 0.08);
      piece.group.rotation.x += 0.04;
      piece.group.rotation.y += 0.05;

      piece.group.traverse(child => {
        if (child.isMesh) {
          child.material.transparent = true;
          child.material.opacity = Math.max(0, 1 - step);
        }
      });

      if (step < 1.0) {
        requestAnimationFrame(animFlight);
      } else {
        puzzleGroup.remove(piece.group);
      }
    };
    animFlight();

    updatePiecesHUD();

    const remaining = activePieces.filter(p => !p.isFreed);
    if (remaining.length <= 1) {
      triggerVictory();
    }
  }

  function triggerVictory() {
    if (isLevelComplete) return;
    isLevelComplete = true;

    const remaining = activePieces.filter(p => !p.isFreed);
    if (remaining.length === 1) {
      freePiece(remaining[0]);
    }

    window.puzzleAudio.playVictory();

    const shapeName = currentPuzzle ? currentPuzzle.shapeDef.name : 'SHAPE';
    vicHeaderEl.textContent = `${shapeName.toUpperCase()} SOLVED!`;
    vicSubtitleEl.textContent = `All interlocking pieces disassembled without collision.`;

    vicTimeEl.textContent = timerDisplayEl.textContent;
    vicMovesEl.textContent = movesCountEl.textContent;

    setTimeout(() => {
      victoryModal.classList.add('active');
    }, 750);
  }

  function setupEventListeners() {
    window.addEventListener('resize', onWindowResize);

    canvas.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);

    shapeSelect.addEventListener('change', (e) => {
      loadShapePuzzle(e.target.value, Date.now());
    });

    btnRandomize.addEventListener('click', () => {
      loadShapePuzzle(currentShape, Date.now());
    });

    btnReset.addEventListener('click', () => {
      loadShapePuzzle(currentShape, currentSeed);
    });

    btnHint.addEventListener('click', () => {
      giveHint();
    });

    btnSound.addEventListener('click', () => {
      const isMuted = window.puzzleAudio.toggleMute();
      soundIcon.textContent = isMuted ? '🔇' : '🔊';
    });

    btnTheme.addEventListener('click', () => {
      const themes = ['wood', 'brass', 'neon'];
      const nextIdx = (themes.indexOf(materialTheme) + 1) % themes.length;
      materialTheme = themes[nextIdx];
      loadShapePuzzle(currentShape, currentSeed);
    });

    btnHelp.addEventListener('click', () => {
      helpModal.classList.add('active');
    });

    btnCloseHelp.addEventListener('click', () => {
      helpModal.classList.remove('active');
    });

    btnReplay.addEventListener('click', () => {
      loadShapePuzzle(currentShape, currentSeed);
    });

    btnNextShape.addEventListener('click', () => {
      currentShapeIdx = (currentShapeIdx + 1) % SHAPES.length;
      loadShapePuzzle(SHAPES[currentShapeIdx], Date.now());
    });
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function getRaycastPiece(pointerCoords) {
    mouse.x = (pointerCoords.x / window.innerWidth) * 2 - 1;
    mouse.y = -(pointerCoords.y / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(puzzleGroup.children, true);

    if (intersects.length > 0) {
      let root = intersects[0].object;
      while (root.parent && root.parent !== puzzleGroup) {
        root = root.parent;
      }
      return activePieces.find(p => p.group === root && !p.isFreed) || null;
    }
    return null;
  }

  function onPointerDown(e) {
    window.puzzleAudio.ensureContext();

    if (e.button === 2) {
      isOrbiting = true;
      prevMousePos = { x: e.clientX, y: e.clientY };
      return;
    }

    const clickedPiece = getRaycastPiece({ x: e.clientX, y: e.clientY });

    if (clickedPiece) {
      draggedPiece = clickedPiece;
      dragStartPos.copy(draggedPiece.group.position);

      const normal = new THREE.Vector3();
      camera.getWorldDirection(normal).negate();
      dragPlane.setFromNormalAndCoplanarPoint(normal, draggedPiece.group.position);

      const hitPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane, hitPoint);
      dragOffset.subVectors(draggedPiece.group.position, hitPoint);

      showSlideGuides(draggedPiece);
      window.puzzleAudio.playGrab();
    } else {
      isOrbiting = true;
      prevMousePos = { x: e.clientX, y: e.clientY };
    }
  }

  function onPointerMove(e) {
    if (isOrbiting) {
      const dx = e.clientX - prevMousePos.x;
      const dy = e.clientY - prevMousePos.y;

      targetSpherical.theta -= dx * 0.008;
      targetSpherical.phi -= dy * 0.008;

      prevMousePos = { x: e.clientX, y: e.clientY };
      return;
    }

    if (draggedPiece) {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const intersectionPoint = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(dragPlane, intersectionPoint)) {
        const targetWorldPos = intersectionPoint.add(dragOffset);
        const axis = draggedPiece.def.allowedAxis;

        const candidateDelta = targetWorldPos[axis] - dragStartPos[axis];
        const limits = computeSlideLimits(draggedPiece, axis);

        const targetOffset = THREE.MathUtils.clamp(candidateDelta, limits.min, limits.max);

        if ((candidateDelta > limits.max + 0.3 || candidateDelta < limits.min - 0.3) && Math.abs(candidateDelta) > 0.4) {
          const now = performance.now();
          if (now - lastSlideTickTime > 250) {
            window.puzzleAudio.playBlocked();
            lastSlideTickTime = now;
          }
        }

        draggedPiece.offset[axis] = targetOffset;
        draggedPiece.group.position[axis] = targetOffset;

        const now = performance.now();
        if (Math.abs(targetOffset) > 0.1 && now - lastSlideTickTime > 120) {
          window.puzzleAudio.playSlideTick();
          lastSlideTickTime = now;
        }

        if (Math.abs(targetOffset) >= draggedPiece.def.freeDistance) {
          freePiece(draggedPiece);
          draggedPiece = null;
          moveCount++;
          movesCountEl.textContent = String(moveCount);
          return;
        }
      }
      return;
    }

    // Hover Highlight
    const hovered = getRaycastPiece({ x: e.clientX, y: e.clientY });
    if (hovered !== hoveredPiece) {
      if (hoveredPiece && !hoveredPiece.isFreed) {
        setPieceEmissive(hoveredPiece, 0x000000);
      }
      hoveredPiece = hovered;
      if (hoveredPiece) {
        setPieceEmissive(hoveredPiece, 0x333333);
        canvas.style.cursor = 'grab';
      } else {
        canvas.style.cursor = 'default';
      }
    }
  }

  function onPointerUp(e) {
    if (isOrbiting) {
      isOrbiting = false;
    }

    if (draggedPiece) {
      canvas.style.cursor = 'grab';
      const axis = draggedPiece.def.allowedAxis;
      const movedDist = Math.abs(draggedPiece.group.position[axis] - dragStartPos[axis]);

      if (movedDist > 0.25) {
        moveCount++;
        movesCountEl.textContent = String(moveCount);
      }

      draggedPiece = null;
      clearGuides();
    }
  }

  function onWheel(e) {
    e.preventDefault();
    targetSpherical.radius += e.deltaY * 0.012;
  }

  // Touch Handlers
  let touchStartDist = 0;
  function onTouchStart(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      onPointerDown({
        clientX: touch.clientX,
        clientY: touch.clientY,
        button: 0
      });
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartDist = Math.hypot(dx, dy);
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      onPointerMove({
        clientX: touch.clientX,
        clientY: touch.clientY
      });
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const delta = touchStartDist - dist;
      targetSpherical.radius += delta * 0.02;
      touchStartDist = dist;
    }
  }

  function onTouchEnd(e) {
    onPointerUp(e);
  }

  function setPieceEmissive(piece, colorHex) {
    if (!piece || !piece.group) return;
    piece.group.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.emissive.setHex(colorHex);
      }
    });
  }

  function giveHint() {
    const unfree = activePieces.filter(p => !p.isFreed);
    let bestPiece = null;
    let maxRange = -1;

    for (const p of unfree) {
      const lim = computeSlideLimits(p, p.def.allowedAxis);
      const range = lim.max - lim.min;
      if (range > maxRange && (lim.max > 0.8 || lim.min < -0.8)) {
        maxRange = range;
        bestPiece = p;
      }
    }

    if (!bestPiece && unfree.length > 0) {
      bestPiece = unfree[0];
    }

    if (bestPiece) {
      showSlideGuides(bestPiece);
      let pulseCount = 0;
      const pulseInterval = setInterval(() => {
        pulseCount++;
        const val = pulseCount % 2 === 1 ? 0x665522 : 0x000000;
        setPieceEmissive(bestPiece, val);
        if (pulseCount >= 6) {
          clearInterval(pulseInterval);
          setPieceEmissive(bestPiece, 0x000000);
        }
      }, 160);
    }
  }

  function animate() {
    requestAnimationFrame(animate);

    spherical.theta += (targetSpherical.theta - spherical.theta) * 0.12;
    spherical.phi += (targetSpherical.phi - spherical.phi) * 0.12;
    spherical.radius += (targetSpherical.radius - spherical.radius) * 0.12;
    updateCameraPosition();

    if (!isOrbiting && !draggedPiece && !isLevelComplete) {
      puzzleGroup.position.y = Math.sin(performance.now() * 0.0015) * 0.1;
    }

    renderer.render(scene, camera);
  }

  window.addEventListener('DOMContentLoaded', () => {
    initEngine();
  });

})();
