precision highp float;

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

    // subtle optical instability
    uv.x +=
        sin(uv.y * 4.0 + iTime * 0.08) * 0.003;

    uv.y +=
        cos(uv.x * 3.0 - iTime * 0.06) * 0.002;

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

    ribUv.x +=
        sin(uv.y * 6.0 + iTime * 0.10) * 0.003;

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

    vec3 col = vec3(0.0);

    // preserve black background
    col += ramp * presence;

    col += haloColor * presence;
    col += coreColor * presence;
    col += veinColor * presence;

    col += ribColor * presence;
    col += fresnelColor * presence;

    // =========================================================
    // LOCAL CONTRAST
    // =========================================================

    col *= mix(
        0.75,
        1.3,
        smoothstep(
            0.28,
            0.90,
            fluidDensity
        )
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
}