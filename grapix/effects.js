/* ==========================================================================
   React Bits effects ported to vanilla JS
   BorderGlow · SplashCursor · HeroSilk
   plus the scroll-driven project rotation
   ========================================================================== */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ======================================================================
     BorderGlow — wraps every .g-card, tracks pointer angle + edge proximity
     ====================================================================== */
  function initBorderGlow() {
    const centerOf = el => { const { width, height } = el.getBoundingClientRect(); return [width / 2, height / 2]; };

    const edgeProximity = (el, x, y) => {
      const [cx, cy] = centerOf(el);
      const dx = x - cx, dy = y - cy;
      let kx = Infinity, ky = Infinity;
      if (dx !== 0) kx = cx / Math.abs(dx);
      if (dy !== 0) ky = cy / Math.abs(dy);
      return Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
    };

    const cursorAngle = (el, x, y) => {
      const [cx, cy] = centerOf(el);
      const dx = x - cx, dy = y - cy;
      if (dx === 0 && dy === 0) return 0;
      let deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      if (deg < 0) deg += 360;
      return deg;
    };

    document.querySelectorAll('.g-card').forEach(card => {
      card.classList.add('border-glow-card');
      // wrap existing children so content sits above the glow layers
      if (!card.querySelector(':scope > .border-glow-inner')) {
        const inner = document.createElement('div');
        inner.className = 'border-glow-inner';
        while (card.firstChild) inner.appendChild(card.firstChild);
        const edge = document.createElement('span');
        edge.className = 'edge-light';
        card.appendChild(edge);
        card.appendChild(inner);
      }
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        card.style.setProperty('--edge-proximity', (edgeProximity(card, x, y) * 100).toFixed(3));
        card.style.setProperty('--cursor-angle', cursorAngle(card, x, y).toFixed(3) + 'deg');
      });
    });
  }

  /* ======================================================================
     shared full-screen fragment-shader runner (replaces three / ogl)
     ====================================================================== */
  function runShader(mount, fragSrc, uniforms, opts = {}) {
    const canvas = document.createElement('canvas');
    mount.appendChild(canvas);
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: false, depth: false, stencil: false });
    if (!gl) { mount.style.display = 'none'; return null; }

    const VERT = `#version 300 es
    in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = mk(gl.VERTEX_SHADER, VERT), fs = mk(gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) { mount.style.display = 'none'; return null; }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); mount.style.display = 'none'; return null; }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = {};
    for (const k in uniforms) U[k] = gl.getUniformLocation(prog, k);

    const dpr = () => Math.min(window.devicePixelRatio || 1, opts.maxDpr || 1.5);
    function resize() {
      const w = Math.max(1, Math.floor(mount.clientWidth * dpr()));
      const h = Math.max(1, Math.floor(mount.clientHeight * dpr()));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    addEventListener('resize', resize);

    let visible = true;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 }).observe(mount);

    const t0 = performance.now();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    (function frame() {
      requestAnimationFrame(frame);
      if (!visible) return;
      resize();
      const t = (performance.now() - t0) / 1000;
      for (const k in uniforms) {
        const v = uniforms[k](t, canvas);
        if (U[k] == null) continue;
        if (typeof v === 'number') gl.uniform1f(U[k], v);
        else if (v.length === 2) gl.uniform2f(U[k], v[0], v[1]);
        else if (v.length === 3) gl.uniform3f(U[k], v[0], v[1], v[2]);
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    })();
    return canvas;
  }

  const hexToRgb = h => {
    const v = h.replace('#', '');
    return [parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255];
  };

  /* ----------------- HeroSilk — flowing red fabric + smoke ----------------- */
  const SILK_FRAG = `#version 300 es
  precision highp float;
  out vec4 fragColor;
  uniform float uTime; uniform vec2 uResolution;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
    return v;
  }
  // domain-warped field — the folds of the cloth
  float cloth(vec2 uv, float t){
    vec2 q = vec2(fbm(uv * 1.6 + vec2(0.0, t)), fbm(uv * 1.6 + vec2(5.2, 1.3 - t)));
    vec2 r = vec2(fbm(uv * 1.8 + 3.0 * q + vec2(1.7, 9.2) + t * 0.5),
                  fbm(uv * 1.8 + 3.0 * q + vec2(8.3, 2.8) - t * 0.4));
    return fbm(uv * 1.7 + 3.5 * r);
  }
  void main(){
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
    float t = uTime * 0.11;

    float f = cloth(uv, t);
    float e = 0.006;
    float dx = cloth(uv + vec2(e, 0.0), t) - f;
    float dy = cloth(uv + vec2(0.0, e), t) - f;

    vec3 n = normalize(vec3(-dx, -dy, 0.018));
    vec3 l = normalize(vec3(0.42, 0.55, 0.72));
    float diff = clamp(dot(n, l) * 0.5 + 0.5, 0.0, 1.0);
    float spec = pow(max(dot(n, l), 0.0), 26.0);

    vec3 deep = vec3(0.022, 0.003, 0.006);
    vec3 mid  = vec3(0.210, 0.013, 0.029);
    vec3 hi   = vec3(0.720, 0.105, 0.110);

    vec3 col = mix(deep, mid, smoothstep(0.30, 0.82, f));
    col = mix(col, hi, spec * 0.60);
    col *= 0.42 + 0.62 * diff;

    // drifting smoke
    float smoke = fbm(uv * 0.9 + vec2(t * 0.5, -t * 0.3));
    col += vec3(0.038, 0.011, 0.014) * smoke;

    // push the drama to the right, leave the left calm for the type
    col *= smoothstep(-0.62, 0.34, uv.x) * 0.72 + 0.28;
    col *= smoothstep(1.30, 0.16, length(uv * vec2(0.82, 1.0)));
    col = max(col, vec3(0.0));
    fragColor = vec4(col, 1.0);
  }`;

  function initHeroSilk() {
    const mount = document.getElementById('hero-fx');
    if (!mount) return;
    runShader(mount, SILK_FRAG, {
      uTime: t => t,
      uResolution: (t, c) => [c.width, c.height]
    }, { maxDpr: 1.25 });
  }

  /* ======================================================================
     SplashCursor — WebGL fluid simulation (verbatim port, React stripped)
     ====================================================================== */
  function initSplash() {
    const mount = document.getElementById('fx-splash');
    if (!mount) return;
    const canvas = document.createElement('canvas');
    mount.appendChild(canvas);

    const config = {
      SIM_RESOLUTION: 128, DYE_RESOLUTION: 1024, DENSITY_DISSIPATION: 3.5,
      VELOCITY_DISSIPATION: 2, PRESSURE: 0.1, PRESSURE_ITERATIONS: 20, CURL: 3,
      SPLAT_RADIUS: 0.2, SPLAT_FORCE: 6000, SHADING: true, COLOR_UPDATE_SPEED: 10
    };

    function Pointer() {
      this.texcoordX = 0; this.texcoordY = 0; this.prevTexcoordX = 0; this.prevTexcoordY = 0;
      this.deltaX = 0; this.deltaY = 0; this.moved = false; this.color = [0, 0, 0];
    }
    const pointers = [new Pointer()];

    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
    let gl = canvas.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (!isWebGL2) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
    if (!gl) { mount.style.display = 'none'; return; }

    let halfFloat, supportLinearFiltering;
    if (isWebGL2) {
      gl.getExtension('EXT_color_buffer_float');
      supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
      halfFloat = gl.getExtension('OES_texture_half_float');
      supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }
    gl.clearColor(0, 0, 0, 1);
    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat && halfFloat.HALF_FLOAT_OES;

    function supportRenderTextureFormat(internalFormat, format, type) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    }
    function getSupportedFormat(internalFormat, format, type) {
      if (!supportRenderTextureFormat(internalFormat, format, type)) {
        if (internalFormat === gl.R16F) return getSupportedFormat(gl.RG16F, gl.RG, type);
        if (internalFormat === gl.RG16F) return getSupportedFormat(gl.RGBA16F, gl.RGBA, type);
        return null;
      }
      return { internalFormat, format };
    }
    const ext = isWebGL2
      ? { formatRGBA: getSupportedFormat(gl.RGBA16F, gl.RGBA, halfFloatTexType),
          formatRG: getSupportedFormat(gl.RG16F, gl.RG, halfFloatTexType),
          formatR: getSupportedFormat(gl.R16F, gl.RED, halfFloatTexType), supportLinearFiltering }
      : { formatRGBA: getSupportedFormat(gl.RGBA, gl.RGBA, halfFloatTexType),
          formatRG: getSupportedFormat(gl.RGBA, gl.RGBA, halfFloatTexType),
          formatR: getSupportedFormat(gl.RGBA, gl.RGBA, halfFloatTexType), supportLinearFiltering };
    if (!ext.formatRGBA) { mount.style.display = 'none'; return; }
    if (!ext.supportLinearFiltering) { config.DYE_RESOLUTION = 256; config.SHADING = false; }

    function compile(type, source, keywords) {
      if (keywords) source = keywords.map(k => '#define ' + k + '\n').join('') + source;
      const s = gl.createShader(type);
      gl.shaderSource(s, source); gl.compileShader(s);
      return s;
    }
    function createProgram(vs, fs) {
      const p = gl.createProgram();
      gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
      return p;
    }
    function getUniforms(program) {
      const u = {};
      const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(program, i).name; u[name] = gl.getUniformLocation(program, name); }
      return u;
    }
    class Program {
      constructor(vs, fs) { this.program = createProgram(vs, fs); this.uniforms = getUniforms(this.program); }
      bind() { gl.useProgram(this.program); }
    }
    class Material {
      constructor(vs, fsSource) { this.vs = vs; this.fsSource = fsSource; this.programs = {}; this.active = null; this.uniforms = {}; }
      setKeywords(keys) {
        const hash = keys.join('|');
        let p = this.programs[hash];
        if (!p) { p = createProgram(this.vs, compile(gl.FRAGMENT_SHADER, this.fsSource, keys)); this.programs[hash] = p; }
        if (p === this.active) return;
        this.uniforms = getUniforms(p); this.active = p;
      }
      bind() { gl.useProgram(this.active); }
    }

    const baseVertex = compile(gl.VERTEX_SHADER, `
      precision highp float; attribute vec2 aPosition;
      varying vec2 vUv, vL, vR, vT, vB; uniform vec2 texelSize;
      void main(){ vUv = aPosition * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0); vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y); vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0); }`);
    const copyShader = compile(gl.FRAGMENT_SHADER, `
      precision mediump float; precision mediump sampler2D; varying highp vec2 vUv; uniform sampler2D uTexture;
      void main(){ gl_FragColor = texture2D(uTexture, vUv); }`);
    const clearShader = compile(gl.FRAGMENT_SHADER, `
      precision mediump float; precision mediump sampler2D; varying highp vec2 vUv;
      uniform sampler2D uTexture; uniform float value;
      void main(){ gl_FragColor = value * texture2D(uTexture, vUv); }`);
    const displaySource = `
      precision highp float; precision highp sampler2D;
      varying vec2 vUv, vL, vR, vT, vB; uniform sampler2D uTexture; uniform vec2 texelSize;
      void main(){ vec3 c = texture2D(uTexture, vUv).rgb;
        #ifdef SHADING
          vec3 lc = texture2D(uTexture, vL).rgb, rc = texture2D(uTexture, vR).rgb;
          vec3 tc = texture2D(uTexture, vT).rgb, bc = texture2D(uTexture, vB).rgb;
          float dx = length(rc) - length(lc), dy = length(tc) - length(bc);
          vec3 n = normalize(vec3(dx, dy, length(texelSize)));
          c *= clamp(dot(n, vec3(0.0, 0.0, 1.0)) + 0.7, 0.7, 1.0);
        #endif
        gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); }`;
    const splatShader = compile(gl.FRAGMENT_SHADER, `
      precision highp float; precision highp sampler2D; varying vec2 vUv;
      uniform sampler2D uTarget; uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius;
      void main(){ vec2 p = vUv - point.xy; p.x *= aspectRatio;
        gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + exp(-dot(p, p) / radius) * color, 1.0); }`);
    const advectionShader = compile(gl.FRAGMENT_SHADER, `
      precision highp float; precision highp sampler2D; varying vec2 vUv;
      uniform sampler2D uVelocity, uSource; uniform vec2 texelSize, dyeTexelSize; uniform float dt, dissipation;
      vec4 bilerp(sampler2D sam, vec2 uv, vec2 tsize){ vec2 st = uv / tsize - 0.5;
        vec2 iuv = floor(st), fuv = fract(st);
        vec4 a = texture2D(sam, (iuv + vec2(0.5,0.5)) * tsize), b = texture2D(sam, (iuv + vec2(1.5,0.5)) * tsize);
        vec4 c = texture2D(sam, (iuv + vec2(0.5,1.5)) * tsize), d = texture2D(sam, (iuv + vec2(1.5,1.5)) * tsize);
        return mix(mix(a,b,fuv.x), mix(c,d,fuv.x), fuv.y); }
      void main(){
        #ifdef MANUAL_FILTERING
          vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
          vec4 result = bilerp(uSource, coord, dyeTexelSize);
        #else
          vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
          vec4 result = texture2D(uSource, coord);
        #endif
        gl_FragColor = result / (1.0 + dissipation * dt); }`,
      ext.supportLinearFiltering ? null : ['MANUAL_FILTERING']);
    const divergenceShader = compile(gl.FRAGMENT_SHADER, `
      precision mediump float; precision mediump sampler2D;
      varying highp vec2 vUv, vL, vR, vT, vB; uniform sampler2D uVelocity;
      void main(){ float L = texture2D(uVelocity, vL).x, R = texture2D(uVelocity, vR).x;
        float T = texture2D(uVelocity, vT).y, B = texture2D(uVelocity, vB).y;
        vec2 C = texture2D(uVelocity, vUv).xy;
        if (vL.x < 0.0) L = -C.x; if (vR.x > 1.0) R = -C.x;
        if (vT.y > 1.0) T = -C.y; if (vB.y < 0.0) B = -C.y;
        gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0); }`);
    const curlShader = compile(gl.FRAGMENT_SHADER, `
      precision mediump float; precision mediump sampler2D;
      varying highp vec2 vUv, vL, vR, vT, vB; uniform sampler2D uVelocity;
      void main(){ float L = texture2D(uVelocity, vL).y, R = texture2D(uVelocity, vR).y;
        float T = texture2D(uVelocity, vT).x, B = texture2D(uVelocity, vB).x;
        gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0); }`);
    const vorticityShader = compile(gl.FRAGMENT_SHADER, `
      precision highp float; precision highp sampler2D;
      varying vec2 vUv, vL, vR, vT, vB; uniform sampler2D uVelocity, uCurl; uniform float curl, dt;
      void main(){ float L = texture2D(uCurl, vL).x, R = texture2D(uCurl, vR).x;
        float T = texture2D(uCurl, vT).x, B = texture2D(uCurl, vB).x, C = texture2D(uCurl, vUv).x;
        vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + 0.0001; force *= curl * C; force.y *= -1.0;
        vec2 v = texture2D(uVelocity, vUv).xy + force * dt;
        gl_FragColor = vec4(min(max(v, -1000.0), 1000.0), 0.0, 1.0); }`);
    const pressureShader = compile(gl.FRAGMENT_SHADER, `
      precision mediump float; precision mediump sampler2D;
      varying highp vec2 vUv, vL, vR, vT, vB; uniform sampler2D uPressure, uDivergence;
      void main(){ float L = texture2D(uPressure, vL).x, R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x, B = texture2D(uPressure, vB).x;
        gl_FragColor = vec4((L + R + B + T - texture2D(uDivergence, vUv).x) * 0.25, 0.0, 0.0, 1.0); }`);
    const gradientSubtractShader = compile(gl.FRAGMENT_SHADER, `
      precision mediump float; precision mediump sampler2D;
      varying highp vec2 vUv, vL, vR, vT, vB; uniform sampler2D uPressure, uVelocity;
      void main(){ float L = texture2D(uPressure, vL).x, R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x, B = texture2D(uPressure, vB).x;
        vec2 v = texture2D(uVelocity, vUv).xy; v -= vec2(R - L, T - B);
        gl_FragColor = vec4(v, 0.0, 1.0); }`);

    const blit = (() => {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);
      return (target, clear) => {
        if (!target) { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
        else { gl.viewport(0, 0, target.width, target.height); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); }
        if (clear) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      };
    })();

    let dye, velocity, divergence, curl, pressure;
    const copyProgram = new Program(baseVertex, copyShader);
    const clearProgram = new Program(baseVertex, clearShader);
    const splatProgram = new Program(baseVertex, splatShader);
    const advectionProgram = new Program(baseVertex, advectionShader);
    const divergenceProgram = new Program(baseVertex, divergenceShader);
    const curlProgram = new Program(baseVertex, curlShader);
    const vorticityProgram = new Program(baseVertex, vorticityShader);
    const pressureProgram = new Program(baseVertex, pressureShader);
    const gradienSubtractProgram = new Program(baseVertex, gradientSubtractShader);
    const displayMaterial = new Material(baseVertex, displaySource);

    function createFBO(w, h, internalFormat, format, type, param) {
      gl.activeTexture(gl.TEXTURE0);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT);
      return { texture, fbo, width: w, height: h, texelSizeX: 1 / w, texelSizeY: 1 / h,
        attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; } };
    }
    function createDoubleFBO(w, h, i, f, t, p) {
      let a = createFBO(w, h, i, f, t, p), b = createFBO(w, h, i, f, t, p);
      return { width: w, height: h, texelSizeX: a.texelSizeX, texelSizeY: a.texelSizeY,
        get read() { return a; }, set read(v) { a = v; },
        get write() { return b; }, set write(v) { b = v; },
        swap() { const t2 = a; a = b; b = t2; } };
    }
    function resizeFBO(target, w, h, i, f, t, p) {
      const n = createFBO(w, h, i, f, t, p);
      copyProgram.bind(); gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0)); blit(n);
      return n;
    }
    function resizeDoubleFBO(target, w, h, i, f, t, p) {
      if (target.width === w && target.height === h) return target;
      target.read = resizeFBO(target.read, w, h, i, f, t, p);
      target.write = createFBO(w, h, i, f, t, p);
      target.width = w; target.height = h; target.texelSizeX = 1 / w; target.texelSizeY = 1 / h;
      return target;
    }
    function getResolution(res) {
      let ar = gl.drawingBufferWidth / gl.drawingBufferHeight;
      if (ar < 1) ar = 1 / ar;
      const min = Math.round(res), max = Math.round(res * ar);
      return gl.drawingBufferWidth > gl.drawingBufferHeight ? { width: max, height: min } : { width: min, height: max };
    }
    function initFramebuffers() {
      const simRes = getResolution(config.SIM_RESOLUTION), dyeRes = getResolution(config.DYE_RESOLUTION);
      const texType = halfFloatTexType, rgba = ext.formatRGBA, rg = ext.formatRG, r = ext.formatR;
      const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
      gl.disable(gl.BLEND);
      dye = !dye ? createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering)
                 : resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
      velocity = !velocity ? createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering)
                          : resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
      divergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
      curl = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
      pressure = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    }

    displayMaterial.setKeywords(config.SHADING ? ['SHADING'] : []);
    initFramebuffers();

    const scaleByPixelRatio = v => Math.floor(v * (window.devicePixelRatio || 1));
    function resizeCanvas() {
      const w = scaleByPixelRatio(canvas.clientWidth), h = scaleByPixelRatio(canvas.clientHeight);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; return true; }
      return false;
    }
    function HSVtoRGB(h, s, v) {
      const i = Math.floor(h * 6), f = h * 6 - i;
      const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
      switch (i % 6) {
        case 0: return { r: v, g: t, b: p }; case 1: return { r: q, g: v, b: p };
        case 2: return { r: p, g: v, b: t }; case 3: return { r: p, g: q, b: v };
        case 4: return { r: t, g: p, b: v }; default: return { r: v, g: p, b: q };
      }
    }
    function generateColor() {
      const c = HSVtoRGB(Math.random(), 1, 1);
      return { r: c.r * 0.15, g: c.g * 0.15, b: c.b * 0.15 };
    }
    const correctRadius = r2 => { const ar = canvas.width / canvas.height; return ar > 1 ? r2 * ar : r2; };
    function splat(x, y, dx, dy, color) {
      splatProgram.bind();
      gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
      gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
      gl.uniform2f(splatProgram.uniforms.point, x, y);
      gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0);
      gl.uniform1f(splatProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100));
      blit(velocity.write); velocity.swap();
      gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
      gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
      blit(dye.write); dye.swap();
    }

    let lastUpdate = Date.now(), colorTimer = 0;
    function step(dt) {
      gl.disable(gl.BLEND);
      curlProgram.bind();
      gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
      blit(curl);
      vorticityProgram.bind();
      gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
      gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
      gl.uniform1f(vorticityProgram.uniforms.dt, dt);
      blit(velocity.write); velocity.swap();
      divergenceProgram.bind();
      gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
      blit(divergence);
      clearProgram.bind();
      gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
      gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
      blit(pressure.write); pressure.swap();
      pressureProgram.bind();
      gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
      for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
        blit(pressure.write); pressure.swap();
      }
      gradienSubtractProgram.bind();
      gl.uniform2f(gradienSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(gradienSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
      gl.uniform1i(gradienSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
      blit(velocity.write); velocity.swap();
      advectionProgram.bind();
      gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      if (!ext.supportLinearFiltering) gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
      const vId = velocity.read.attach(0);
      gl.uniform1i(advectionProgram.uniforms.uVelocity, vId);
      gl.uniform1i(advectionProgram.uniforms.uSource, vId);
      gl.uniform1f(advectionProgram.uniforms.dt, dt);
      gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
      blit(velocity.write); velocity.swap();
      if (!ext.supportLinearFiltering) gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
      gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
      gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
      blit(dye.write); dye.swap();
    }

    function render() {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.BLEND);
      displayMaterial.bind();
      if (config.SHADING) gl.uniform2f(displayMaterial.uniforms.texelSize, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight);
      gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
      blit(null);
    }

    (function frame() {
      const now = Date.now();
      let dt = (now - lastUpdate) / 1000;
      dt = Math.min(dt, 0.016666); lastUpdate = now;
      if (resizeCanvas()) initFramebuffers();
      colorTimer += dt * config.COLOR_UPDATE_SPEED;
      if (colorTimer >= 1) { colorTimer = colorTimer % 1; pointers.forEach(p => { p.color = generateColor(); }); }
      pointers.forEach(p => {
        if (p.moved) { p.moved = false;
          splat(p.texcoordX, p.texcoordY, p.deltaX * config.SPLAT_FORCE, p.deltaY * config.SPLAT_FORCE, p.color); }
      });
      step(dt); render();
      requestAnimationFrame(frame);
    })();

    const correctDeltaX = d => { const ar = canvas.width / canvas.height; return ar < 1 ? d * ar : d; };
    const correctDeltaY = d => { const ar = canvas.width / canvas.height; return ar > 1 ? d / ar : d; };
    let firstMove = false;
    addEventListener('mousemove', e => {
      const p = pointers[0];
      const posX = scaleByPixelRatio(e.clientX), posY = scaleByPixelRatio(e.clientY);
      p.prevTexcoordX = p.texcoordX; p.prevTexcoordY = p.texcoordY;
      p.texcoordX = posX / canvas.width; p.texcoordY = 1 - posY / canvas.height;
      p.deltaX = correctDeltaX(p.texcoordX - p.prevTexcoordX);
      p.deltaY = correctDeltaY(p.texcoordY - p.prevTexcoordY);
      p.moved = Math.abs(p.deltaX) > 0 || Math.abs(p.deltaY) > 0;
      if (!firstMove) { p.color = generateColor(); firstMove = true; }
    });
    addEventListener('mousedown', e => {
      const p = pointers[0];
      const posX = scaleByPixelRatio(e.clientX), posY = scaleByPixelRatio(e.clientY);
      p.texcoordX = posX / canvas.width; p.texcoordY = 1 - posY / canvas.height;
      p.prevTexcoordX = p.texcoordX; p.prevTexcoordY = p.texcoordY;
      const c = generateColor(); c.r *= 10; c.g *= 10; c.b *= 10;
      splat(p.texcoordX, p.texcoordY, 10 * (Math.random() - 0.5), 30 * (Math.random() - 0.5), c);
    });
    addEventListener('touchmove', e => {
      const p = pointers[0], t = e.targetTouches[0];
      if (!t) return;
      const posX = scaleByPixelRatio(t.clientX), posY = scaleByPixelRatio(t.clientY);
      p.prevTexcoordX = p.texcoordX; p.prevTexcoordY = p.texcoordY;
      p.texcoordX = posX / canvas.width; p.texcoordY = 1 - posY / canvas.height;
      p.deltaX = correctDeltaX(p.texcoordX - p.prevTexcoordX);
      p.deltaY = correctDeltaY(p.texcoordY - p.prevTexcoordY);
      p.moved = true;
    }, { passive: true });
  }

  /* ======================================================================
     scroll-driven project rotation
     ====================================================================== */
  function initWorkRotation() {
    const track = document.getElementById('work-track');
    const cards = [...document.querySelectorAll('#work-ring .g-card')];
    if (!track || !cards.length) return;
    const n = cards.length;
    const idxEl = document.getElementById('idx');
    const nameEl = document.getElementById('nowName');
    const ghostEl = document.getElementById('ghost');
    const names = cards.map(c => c.dataset.name || '');
    const ghosts = cards.map(c => c.dataset.ghost || '');
    let shown = -1;

    // each project gets one slot of scroll: it sits still for HOLD of that slot,
    // then rotates to the next over the remainder
    const HOLD = 0.55;
    const smooth = t => t * t * (3 - 2 * t);

    function apply() {
      const r = track.getBoundingClientRect();
      const span = track.offsetHeight - window.innerHeight;
      const p = span > 0 ? Math.min(Math.max(-r.top / span, 0), 1) : 0;

      const raw = p * n;                               // 0 … n, one slot per project
      const i = Math.min(Math.floor(raw), n - 1);
      const local = raw - i;
      let pos = local <= HOLD ? i : i + smooth((local - HOLD) / (1 - HOLD));
      pos = Math.min(Math.max(pos, 0), n - 1);         // last card holds to the end

      cards.forEach((card, i) => {
        const d = i - pos;                       // signed distance from the front slot
        const ad = Math.abs(d);
        const rotY = d * 38;                     // rotate around the ring
        const z = -Math.min(ad, 3) * 220;        // push back
        const x = d * 13;                        // slight lateral fan
        const op = ad > 2.2 ? 0 : 1 - Math.min(ad, 1) * 0.72;
        card.style.transform = `translate(-50%, -50%) translateX(${x}%) translateZ(${z}px) rotateY(${rotY}deg)`;
        card.style.opacity = op.toFixed(3);
        card.style.zIndex = String(100 - Math.round(ad * 10));
        card.style.pointerEvents = ad < 0.5 ? 'auto' : 'none';
      });

      const active = Math.round(pos);
      if (active !== shown) {
        shown = active;
        if (idxEl) idxEl.textContent = String(active + 1).padStart(2, '0');
        if (nameEl) nameEl.textContent = names[active];
        if (ghostEl) ghostEl.textContent = ghosts[active];
      }
    }
    addEventListener('scroll', apply, { passive: true });
    addEventListener('resize', apply);
    apply();
  }

  /* ---------------------------------------------------------------- boot */
  function boot() {
    initBorderGlow();
    initWorkRotation();
    if (reduced) return;
    initSplash();
    initHeroSilk();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
