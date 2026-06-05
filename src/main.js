// main.js

const vertexShaderSource = `
precision highp float;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`; // Use backticks (`) for multi-line strings!

// Do the same for your other two shaders
const fluidShaderSource = `precision highp float;

uniform float iTime;
uniform sampler2D iPreviousFrame;

uniform vec4 iMouse;
uniform vec2 uMouseVelocity;

uniform float uFluidDecay;
uniform float uFlowSpeed;

varying vec2 vUv;

// =========================================================
// ORGANIC FLOW FIELD
// =========================================================

vec2 curl(vec2 p, float t) {

    float x =
        sin(p.y * 2.6 + t * 0.35) +
        sin(p.y * 5.4 - t * 0.22) * 0.45 +
        sin(p.y * 10.0 + t * 0.12) * 0.14;

    float y =
        cos(p.x * 2.8 - t * 0.32) +
        cos(p.x * 5.8 + t * 0.18) * 0.42 +
        cos(p.x * 9.5 - t * 0.08) * 0.12;

    return vec2(x, y);
}

void main() {

    vec4 me = texture2D(iPreviousFrame, vUv);

    float t = iTime * 0.42 * uFlowSpeed;

    // =========================================================
    // FLUID ADVECTION
    // =========================================================

    vec2 c = curl(vUv * 3.4, t);

    vec2 velocity =
        me.xy * 0.90 +
        c * 0.040;

    velocity += uMouseVelocity * 0.020;

    vec2 advectUv =
        vUv -
        velocity * 0.030;

    advectUv = clamp(advectUv, 0.001, 0.999);

    me = texture2D(iPreviousFrame, advectUv);

    // =========================================================
    // ENERGY FIELD
    // =========================================================

    float field = 0.0;

    field += sin(vUv.x * 4.8 + t * 0.45);
    field += cos(vUv.y * 4.2 - t * 0.35);

    field += sin(
        (vUv.x * 6.0 + vUv.y * 2.4) +
        t * 0.22
    ) * 0.55;

    float breakup = 0.0;

    breakup += sin(vUv.x * 12.0 - t * 0.18);
    breakup += cos(vUv.y * 11.0 + t * 0.16);

    breakup += sin(
        (vUv.x + vUv.y) * 15.0 +
        t * 0.12
    ) * 0.45;

    breakup *= 0.5;

    field -= breakup * 0.36;

    field += sin(
        vUv.x * 20.0 +
        vUv.y * 4.0 +
        t * 0.28
    ) * 0.05;

    field *= 0.5;

    // =========================================================
    // DENSITY
    // =========================================================

    float density =
        smoothstep(
            0.50,
            0.80,
            field + 0.08
        );

    // DARKER / LESS OVEREXPOSED CORE
    float coreDensity =
        smoothstep(
            0.70,
            0.98,
            field + 0.08
        );

    // reduced core accumulation
    density += coreDensity * 0.14;

    // gentle compression to avoid blown center
    density = pow(density, 1.08);

    density *= smoothstep(0.0, 5.0, iTime);

    // =========================================================
    // TEMPORAL PERSISTENCE
    // =========================================================

    me.w = mix(
        me.w,
        density,
        0.038
    );

    // =========================================================
    // MOUSE INTERACTION
    // =========================================================

    vec2 mousePos = iMouse.xy;

    float mouseField =
        exp(
            -distance(vUv, mousePos) * 5.0
        );

    vec2 mouseDrag =
        uMouseVelocity *
        mouseField *
        0.15;

    vec2 mouseCurl =
        vec2(
            -(vUv.y - mousePos.y),
             (vUv.x - mousePos.x)
        );

    mouseCurl *= mouseField * 0.020;

    me.xy += mouseDrag;
    me.xy += mouseCurl;

    me.w += mouseField * 0.018;

    // =========================================================
    // VORTICITY
    // =========================================================

    vec2 force =
        vec2(c.y, -c.x);

    me.xy = mix(
        me.xy,
        force * 0.008,
        0.055
    );

    // =========================================================
    // DIRECTIONAL DRIFT
    // =========================================================

    me.xy += vec2(
        0.0008,
        -0.00018
    );

    // =========================================================
    // DECAY
    // =========================================================

    me.xy *= 0.988;

    me.w *= 0.986;

    // preserve black background
    me.w = max(me.w - 0.0016, 0.0);

    gl_FragColor = me;
}`;


const displayShaderSource = `precision highp float;

uniform sampler2D iFluid;
uniform sampler2D uRibMap;

uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;

uniform float uColorIntensity;
uniform float iTime;

varying vec2 vUv;

void main() {

    // =========================================================
    // UV SPACE
    // =========================================================

    vec2 uv = vUv;

    // overscan crop
    vec2 croppedUv =
        uv * 0.84 + 0.08;

    // =========================================================
    // FLUID SAMPLING
    // =========================================================

    float off = 0.0024;

    float d =
        texture2D(iFluid, croppedUv).w;

    float dx =
        texture2D(
            iFluid,
            croppedUv + vec2(off, 0.0)
        ).w - d;

    float dy =
        texture2D(
            iFluid,
            croppedUv + vec2(0.0, off)
        ).w - d;

    // thicker liquid normals
    vec3 fluidNormal =
        normalize(vec3(-dx, -dy, 0.18));

    // =========================================================
    // RIBBED GLASS
    // =========================================================

    vec2 ribUv = uv;

    ribUv.x += 0.0;

    vec4 ribData =
        texture2D(uRibMap, ribUv);

    vec3 ribNormal =
        ribData.rgb * 2.0 - 1.0;

    // controlled rib distortion
    vec3 finalNormal =
        normalize(
            fluidNormal +
            ribNormal * 0.055
        );

    // =========================================================
    // REFRACTION
    // =========================================================

    vec2 refractUv =
        croppedUv +
        finalNormal.xy * 0.012;

    refractUv =
        clamp(refractUv, 0.001, 0.999);

    float fluidDensity =
        texture2D(iFluid, refractUv).w;

    // =========================================================
    // TRUE BLACK BACKGROUND
    // =========================================================

    float presence =
        smoothstep(
            0.02,
            0.16,
            fluidDensity
        );

    // =========================================================
    // DIRECTIONAL LIGHTING
    // =========================================================

    vec3 lightDir =
        normalize(vec3(0.48, 0.24, 1.0));

    float light =
        max(dot(finalNormal, lightDir), 0.0);

    float directional =
        smoothstep(
            0.05,
            0.95,
            light
        );

    // =========================================================
    // COLOR RAMP
    // =========================================================

    vec3 ramp = mix(
        uColor1,
        uColor2,
        smoothstep(
            0.08,
            0.32,
            fluidDensity
        )
    );

    ramp = mix(
        ramp,
        uColor3,
        smoothstep(
            0.28,
            0.62,
            fluidDensity
        )
    );

    ramp = mix(
        ramp,
        uColor4,
        smoothstep(
            0.70,
            0.96,
            fluidDensity
        )
    );

    // =========================================================
    // SHADOW-SIDE ABSORPTION
    // =========================================================

    ramp *= mix(
        0.22,
        1.0,
        directional
    );

    // warm internal darkness
    ramp +=
        vec3(0.015, 0.003, 0.001) *
        (1.0 - directional) *
        presence;

    // =========================================================
    // LARGE-SCALE HALO
    // =========================================================

    float halo =
        smoothstep(
            0.16,
            0.58,
            fluidDensity
        );

    halo *=
        1.0 -
        smoothstep(
            0.72,
            1.0,
            fluidDensity
        );

    // broad gaussian softness
    halo *= 0.55;

    vec3 haloColor =
        vec3(1.0, 0.34, 0.06) *
        halo;

    // =========================================================
    // CORE ENERGY
    // =========================================================

    float core =
        smoothstep(
            0.76,
            0.98,
            fluidDensity
        );

    // near-white warm center
    vec3 coreColor =
        vec3(1.15, 0.52, 0.12) *
        core *
        1.4;

    // =========================================================
    // INTERNAL STRUCTURE
    // =========================================================

    float vein =
        sin(
            refractUv.x * 22.0 +
            fluidDensity * 11.0 +
            iTime * 0.15
        );

    vein =
        smoothstep(
            0.55,
            1.0,
            vein
        );

    vec3 veinColor =
        vec3(1.0, 0.42, 0.08) *
        vein *
        fluidDensity *
        0.05;

    // =========================================================
    // GLASS REFLECTION
    // =========================================================

    float ribSpec =
        smoothstep(
            0.86,
            0.99,
            max(
                dot(
                    finalNormal,
                    normalize(vec3(0.42, 0.32, 1.0))
                ),
                0.0
            )
        );

    vec3 ribColor =
        vec3(1.0, 0.45, 0.10) *
        ribSpec *
        ribData.r *
        0.22;

    // =========================================================
    // FRESNEL EDGE
    // =========================================================

    float fresnel =
        pow(
            1.0 -
            max(
                dot(
                    finalNormal,
                    vec3(0.0, 0.0, 1.0)
                ),
                0.0
            ),
            2.4
        );

    vec3 fresnelColor =
        vec3(1.0, 0.28, 0.05) *
        fresnel *
        0.05;

    // =========================================================
    // FINAL COMPOSITION
    // =========================================================

    // Convert #151515 to 0-1 range (15/255 ≈ 0.0588)
    vec3 baseColor = vec3(0.0588, 0.0588, 0.0588);

    // 1. Start with your specific background color instead of vec3(0.0)
    vec3 col = baseColor; 

    // 2. Add the fluid energy on top using additive blending
    col += ramp * presence;
    col += haloColor * presence;
    col += coreColor * presence;
    col += veinColor * presence;
    col += ribColor * presence;
    col += fresnelColor * presence;

    // 3. Optional: Subtle fade-out at the very bottom 
    // This creates that "dissolve" effect we talked about earlier
    float fade = smoothstep(1.0, 0.8, vUv.y);
    col = mix(baseColor, col, fade);

    // =========================================================
    // LOCAL CONTRAST
    // =========================================================

    col *= mix(
        0.85, // Lifted from 0.75 to be less aggressive in shadows
        1.2,  // Reduced from 1.3 to prevent over-blown highlights
        smoothstep(0.28, 0.90, fluidDensity)
    );

    // =========================================================
    // CINEMATIC CURVE
    // =========================================================

    col = pow(
        col,
        vec3(0.96)
    );

    col *= uColorIntensity;

    // =========================================================
    // FILMIC COMPRESSION
    // =========================================================

    col =
        col /
        (1.0 + col * 0.18);

    // preserve saturation
    float luminance =
        dot(
            col,
            vec3(0.2126, 0.7152, 0.0722)
        );

    col = mix(
        vec3(luminance),
        col,
        1.12
    );
    
    gl_FragColor =
        vec4(col, 1.0);
}`;


window.initArcaFluid = async () => {
    if (window.isArcaInitialized) {
    console.warn("Arca Fluid already initialized, skipping.");
    return;
  }
  window.isArcaInitialized = true;

    const componentEl = document.querySelector('[fc-fluid-gradient="component"]') ||
    document
    .body;
    
  if (componentEl.querySelector('canvas')) {
    console.warn("Arca Fluid already initialized, skipping.");
    return;
  }

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
    vertexShader: vertexShaderSource,
    fragmentShader: fluidShaderSource,
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
    vertexShader: vertexShaderSource,
    fragmentShader: displayShaderSource,
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
