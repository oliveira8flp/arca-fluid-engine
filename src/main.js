import vertexShader from './interactive-fluid-gradient_vertex-shader.glsl?raw';
import fluidShader from './interactive-fluid-gradient_fluid-shader.glsl?raw';
import displayShader from './interactive-fluid-gradient_display-shader.glsl?raw';

window.initArcaFluid = async () => {

  const THREE = await import('https://esm.sh/three@0.160.0');
  const { WebGLRenderer, WebGLRenderTarget, Scene, OrthographicCamera, ShaderMaterial,
    PlaneGeometry, Mesh, TextureLoader, Color, Vector2, Vector3, Vector4, LinearFilter,
    RGBAFormat, HalfFloatType, RepeatWrapping, ClampToEdgeWrapping, SRGBColorSpace,
    ACESFilmicToneMapping } = THREE;

  // ============== Helpers ==============
  const asNumber = (v, d) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : d;
  };
  const asBoolean = (v, d = false) => {
    if (v == null) return d;
    const s = String(v).toLowerCase().trim();
    return s === '1' || s === 'true' || s === 'yes' || s === 'on';
  };
  const asColorLinear = (hexOrCss, fallbackHex = '#ffffff') => {
    let c;
    try { c = new Color(hexOrCss || fallbackHex); }
    catch { c = new Color(fallbackHex); }
    c.convertSRGBToLinear();
    return [c.r, c.g, c.b];
  };
  const getShader = (id) => document.getElementById(id).textContent;

  // ============== Root & attributes ==============
  const componentEl = document.querySelector('[fc-fluid-gradient="component"]') ||
    document
    .body;

  const guiEnabled = asBoolean(componentEl.getAttribute('fc-fluid-gradient-gui'),
    false);
  const guiPosAttr = componentEl.getAttribute('fc-fluid-gradient-gui-position') ||
    'top-right';
  const guiTitle = componentEl.getAttribute('fc-fluid-gradient-gui-title') ||
    'Fluid Controls';

  const defaults = {
    brushSize: 25.0,
    brushStrength: 0.5,
    distortionAmount: 1.5,
    fluidDecay: 0.998,
    trailLength: 0.8,
    stopDecay: 0.85,
    color1: '#8D3E2C', // Deepest Burnt Red
    color2: '#BB5B3E', // Mid Rust
    color3: '#C3754C', // Vibrant Amber
    color4: '#C58A65', // Pale Highlight
    colorIntensity: 1.5,
    softness: 1.0,
    dprMax: 2.0,
    softResetFrames: 12,
    softResetStrength: 0.15,
    flowSpeed: 1.0,
    idleSpeed: 0.1,
  };
  const attr = (name) => componentEl.getAttribute(name);

  const config = {
    brushSize: asNumber(attr('fc-fluid-gradient-brush-size'), defaults.brushSize),
    brushStrength: asNumber(attr('fc-fluid-gradient-brush-strength'), defaults
      .brushStrength),
    distortionAmount: asNumber(attr('fc-fluid-gradient-distortion-amount'), defaults
      .distortionAmount),
    fluidDecay: asNumber(attr('fc-fluid-gradient-fluid-decay'), defaults.fluidDecay),
    trailLength: asNumber(attr('fc-fluid-gradient-trail-length'), defaults
      .trailLength),
    stopDecay: asNumber(attr('fc-fluid-gradient-stop-decay'), defaults.stopDecay),
    color1: attr('fc-fluid-gradient-color-1') || defaults.color1,
    color2: attr('fc-fluid-gradient-color-2') || defaults.color2,
    color3: attr('fc-fluid-gradient-color-3') || defaults.color3,
    color4: attr('fc-fluid-gradient-color-4') || defaults.color4,
    colorIntensity: asNumber(attr('fc-fluid-gradient-color-intensity'), defaults
      .colorIntensity),
    softness: asNumber(attr('fc-fluid-gradient-softness'), defaults.softness),
    dprMax: asNumber(attr('fc-fluid-gradient-dpr-max'), defaults.dprMax),
    softResetFrames: asNumber(attr('fc-fluid-gradient-soft-reset-frames'), defaults
      .softResetFrames),
    softResetStrength: asNumber(attr('fc-fluid-gradient-soft-reset-strength'),
      defaults
      .softResetStrength),
    flowSpeed: asNumber(attr('fc-fluid-gradient-flow-speed'), defaults.flowSpeed),
    idleSpeed: asNumber(attr('fc-fluid-gradient-idle-speed'), defaults.idleSpeed),
  };

  const hoverEnabled = asBoolean(attr('fc-fluid-gradient-hover'), true);

  // ============== Renderer / Camera ==============
  const gradientCanvas = componentEl;
  const renderer = new WebGLRenderer({ antialias: true });

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setPixelRatio(
    Math.min(
      window.devicePixelRatio,
      config.dprMax
    )
  );
  gradientCanvas.appendChild(renderer.domElement);

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function getCanvasSize() {
    const r = gradientCanvas.getBoundingClientRect();
    return { width: Math.max(1, r.width), height: Math.max(1, r.height) };
  }

  // ============== Render targets ==============
  const rtOptions = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    // We use ClampToEdge to stop the tiling/horizontal lines for good
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  };
  const fluidTarget1 = new WebGLRenderTarget(1, 1, rtOptions);
  const fluidTarget2 = fluidTarget1.clone();

  let currentFluidTarget = fluidTarget1;
  let previousFluidTarget = fluidTarget2;
  fluidTarget1.texture.wrapS = THREE.RepeatWrapping;
  fluidTarget1.texture.wrapT = THREE.RepeatWrapping;
  fluidTarget2.texture.wrapS = THREE.RepeatWrapping;
  fluidTarget2.texture.wrapT = THREE.RepeatWrapping;

  // ============== Materials ==============
  const color1Linear = asColorLinear(config.color1);

  const fluidMaterial = new ShaderMaterial({
    uniforms: {
      iTime: { value: 0 },
      iResolution: { value: new Vector2(1, 1) },
      iMouse: { value: new Vector4(0, 0, 0, 0) },
      uMouseVelocity: { value: new Vector2(0, 0) }, // New velocity uniform
      iFrame: { value: 0 },
      iPreviousFrame: { value: null },
      uBrushSize: { value: config.brushSize },
      uBrushStrength: { value: config.brushStrength },
      uFluidDecay: { value: config.fluidDecay },
      uTrailLength: { value: config.trailLength },
      uStopDecay: { value: config.stopDecay },
      uSoftReset: { value: 0.0 },
      uFlowSpeed: { value: config.flowSpeed },
    },
    vertexShader,
    fragmentShader: fluidShader,
  });

  const ribTexture = new TextureLoader().load(
    'https://cdn.prod.website-files.com/69ece8b8a1767d48abb89ec1/6a18a15d7a81bf2ae29e45bf_glass-background.avif'
  );
  ribTexture.wrapS = THREE.RepeatWrapping; // Allows it to tile across the screen
  ribTexture.wrapT = THREE.RepeatWrapping;
  ribTexture.repeat.set(11.7, 1.0);;

  const displayMaterial = new ShaderMaterial({
    uniforms: {
      iTime: { value: 0 },
      iResolution: { value: new Vector2(1, 1) },
      iFluid: { value: null },
      uDistortionAmount: { value: config.distortionAmount },
      uColor1: { value: new Vector3(...asColorLinear(config.color1)) },
      uColor2: { value: new Vector3(...asColorLinear(config.color2)) },
      uColor3: { value: new Vector3(...asColorLinear(config.color3)) },
      uColor4: { value: new Vector3(...asColorLinear(config.color4)) },
      uColorIntensity: { value: config.colorIntensity },
      uSoftness: { value: config.softness },
      uIdleSpeed: { value: config.idleSpeed },
      iMouse: { value: fluidMaterial.uniforms.iMouse.value },
      uScreenX: { value: window.innerWidth },
      uRibMap: { value: ribTexture }
    },
    vertexShader,
    fragmentShader: displayShader,
    toneMapped: true,
  });

  // ============== GUI Settings ==============
  if (guiEnabled) {
    const { default: GUI } = await import(
      'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm');
    const gui = new GUI({ title: guiTitle });
    const el = gui.domElement;
    el.style.zIndex = '9999';

    const gBrush = gui.addFolder('Brush');
    gBrush.add(config, 'brushSize', 1, 200, 1).onChange(v => {
      fluidMaterial.uniforms.uBrushSize
        .value = v;
    });
    gBrush.add(config, 'brushStrength', 0.05, 3, 0.01).onChange(v => {
      fluidMaterial.uniforms
        .uBrushStrength.value = v;
    });

    const gDisp = gui.addFolder('Display');
    gDisp.add(config, 'distortionAmount', 0.0, 5.0, 0.05).onChange(v => {
      displayMaterial
        .uniforms.uDistortionAmount.value = v;
    });
    gDisp.addColor(config, 'color1').onChange(v => {
      const c = new Color(v).convertSRGBToLinear();
      displayMaterial.uniforms.uColor1.value.set(c.r, c.g, c.b);
    });
  }

  // ============== Sizing ==============
  function setRendererSize() {
    const { width, height } = getCanvasSize();

    // OVERSCAN: Make simulation 10% larger than the viewport
    // This pushes the "border clumping" off-screen
    const simWidth = Math.floor(width * 1.1);
    const simHeight = Math.floor(height * 1.1);

    renderer.setSize(width, height);

    fluidMaterial.uniforms.iResolution.value.set(simWidth, simHeight);
    displayMaterial.uniforms.iResolution.value.set(width, height);

    fluidTarget1.setSize(simWidth, simHeight);
    fluidTarget2.setSize(simWidth, simHeight);
  }
  setRendererSize();

  // ============== Scene quad ==============
  const geometry = new PlaneGeometry(2, 2);
  const fluidPlane = new Mesh(geometry, fluidMaterial);
  const displayPlane = new Mesh(geometry, displayMaterial);

  const fluidScene = new Scene();
  fluidScene.add(fluidPlane);

  const displayScene = new Scene();
  displayScene.add(displayPlane);

  // ============== Pointer input ==============

  // ============== Pointer input ==============

  const isFinePointer =
    window.matchMedia &&
    matchMedia('(pointer:fine)').matches;

  let mouseX = 0;
  let mouseY = 0;

  let prevMouseX = 0;
  let prevMouseY = 0;

  let velocityX = 0;
  let velocityY = 0;

  function updateMouseUniform(x, y) {

    prevMouseX = mouseX;
    prevMouseY = mouseY;

    mouseX = x;
    mouseY = y;

    // raw movement
    const rawVelX = mouseX - prevMouseX;
    const rawVelY = mouseY - prevMouseY;

    // smooth velocity
    velocityX += (rawVelX - velocityX) * 0.18;
    velocityY += (rawVelY - velocityY) * 0.18;

    // send mouse position
    fluidMaterial.uniforms.iMouse.value.set(
      mouseX,
      mouseY,
      1.0,
      0.0
    );

    // send velocity
    fluidMaterial.uniforms.uMouseVelocity.value.set(
      velocityX * 35.0,
      velocityY * 35.0
    );

  }

  if (isFinePointer && hoverEnabled) {

    window.addEventListener('pointermove', (e) => {

      const r =
        gradientCanvas.getBoundingClientRect();

      const x =
        (e.clientX - r.left) / r.width;

      const y =
        1.0 -
        (e.clientY - r.top) / r.height;

      updateMouseUniform(x, y);
    });

    window.addEventListener('pointerleave', () => {

      fluidMaterial.uniforms.iMouse.value.set(
        0,
        0,
        0,
        0
      );

      fluidMaterial.uniforms.uMouseVelocity.value.set(
        0,
        0
      );
    });
  }

  // ============== Soft reset ==============
  let softResetFramesLeft = 0;

  function requestSoftReset(frames = 12, perFrameAttenuation = 0.15) {
    softResetFramesLeft = frames;
    fluidMaterial.uniforms.uSoftReset.value = perFrameAttenuation;
  }

  // ============== Visibility Observer ==============
  let isVisible = true;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      isVisible = entry.isIntersecting;
    });
  }, { threshold: 0.1 });

  observer.observe(renderer.domElement.parentElement);

  // ============== Main loop ==============
  let frameCount = 0;

  function animate() {
    requestAnimationFrame(animate);

    // 1. Visibility Check
    if (!isVisible) return;

    // 2. Performance Throttling: Run physics at 30fps, render at 60fps
    // This is the single most effective way to reduce Total Blocking Time
    const shouldUpdatePhysics = frameCount % 2 === 0;

    const time = performance.now() * 0.001;
    fluidMaterial.uniforms.iTime.value = time;
    displayMaterial.uniforms.iTime.value = time;

    // Only perform the heavy fluid math if the gate is open
    if (shouldUpdatePhysics) {
      fluidMaterial.uniforms.iPreviousFrame.value = previousFluidTarget.texture;
      renderer.setRenderTarget(currentFluidTarget);
      renderer.render(fluidScene, camera);

      // Swap targets only when we update physics
      let temp = currentFluidTarget;
      currentFluidTarget = previousFluidTarget;
      previousFluidTarget = temp;
    }

    // Always render the final display to the screen
    displayMaterial.uniforms.iFluid.value = currentFluidTarget.texture;
    renderer.setRenderTarget(null);
    renderer.render(displayScene, camera);

    frameCount++;
  }

  // ============== Resize ==============
  window.addEventListener('resize', () => {
    const r = gradientCanvas.getBoundingClientRect();

    const width = Math.max(1, r.width);
    const height = Math.max(1, r.height);

    const simWidth = Math.floor(width * 1.1);
    const simHeight = Math.floor(height * 1.1);

    renderer.setSize(width, height);

    fluidMaterial.uniforms.iResolution.value.set(simWidth, simHeight);
    displayMaterial.uniforms.iResolution.value.set(width, height);

    fluidTarget1.setSize(simWidth, simHeight);
    fluidTarget2.setSize(simWidth, simHeight);
  });

  // START
  animate();
};

window.requestIdleCallback(() => {

  // Call your initialization
  if (typeof initArcaFluid === 'function') {
    window.initArcaFluid();
  }

}, { timeout: 2000 });
