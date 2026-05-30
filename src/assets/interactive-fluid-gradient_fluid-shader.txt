precision highp float;

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
        0.1;

    vec2 mouseCurl =
        vec2(
            -(vUv.y - mousePos.y),
             (vUv.x - mousePos.x)
        );

    mouseCurl *= mouseField * 0.014;

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
}