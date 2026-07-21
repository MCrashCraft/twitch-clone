/* Weather Emergency Platform — WebGPU radar/HRRR renderer.
 *
 * Renders a radar or HRRR reflectivity frame through a WebGPU pipeline:
 * the source frame is uploaded as a texture, a WGSL fragment shader maps its
 * intensity through a reflectivity colormap (NWS-style dBZ ramp), and the
 * result is composited over the map with adjustable opacity.
 *
 * Usage (plain):
 *   const r = new RadarWebGPU();
 *   await r.init(canvas);                    // throws if WebGPU unavailable
 *   await r.setFrame(imageBitmap);           // radar/HRRR frame (any ImageBitmapSource)
 *   r.render({ opacity: 0.8, useColormap: true });
 *
 * Usage (Leaflet overlay): see LeafletWebGPULayer at the bottom, and
 * integration notes in PLATFORM.md. Feature-detect with RadarWebGPU.supported()
 * and keep the existing raster path as fallback.
 */
"use strict";

const RADAR_WGSL = /* wgsl */ `
struct Uniforms {
  opacity : f32,
  useColormap : f32,   // 1 = map luminance through dBZ ramp, 0 = pass through
  _pad0 : f32,
  _pad1 : f32,
};

@group(0) @binding(0) var frameSampler : sampler;
@group(0) @binding(1) var frameTex : texture_2d<f32>;
@group(0) @binding(2) var<uniform> u : Uniforms;

struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

// Fullscreen triangle — no vertex buffer needed.
@vertex
fn vs_main(@builtin(vertex_index) i : u32) -> VSOut {
  var out : VSOut;
  let x = f32((i << 1u) & 2u);
  let y = f32(i & 2u);
  out.uv = vec2<f32>(x, 1.0 - y);
  out.pos = vec4<f32>(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
  return out;
}

// NWS-style reflectivity ramp: transparent -> cyan -> blue -> green -> yellow
// -> orange -> red -> magenta -> white, keyed on normalized intensity (~dBZ/75).
fn reflectivity_color(t : f32) -> vec4<f32> {
  if (t < 0.04) { return vec4<f32>(0.0, 0.0, 0.0, 0.0); }
  let stops = array<vec4<f32>, 8>(
    vec4<f32>(0.31, 0.90, 0.96, 0.35),  // light returns
    vec4<f32>(0.13, 0.55, 0.95, 0.55),
    vec4<f32>(0.10, 0.80, 0.25, 0.75),  // rain
    vec4<f32>(1.00, 0.93, 0.10, 0.85),
    vec4<f32>(1.00, 0.55, 0.05, 0.92),  // heavy
    vec4<f32>(0.90, 0.10, 0.10, 0.96),
    vec4<f32>(0.85, 0.10, 0.85, 1.00),  // extreme / hail
    vec4<f32>(1.00, 1.00, 1.00, 1.00)
  );
  let x = clamp((t - 0.04) / 0.96, 0.0, 0.9999) * 7.0;
  let i = u32(floor(x));
  let f = fract(x);
  return mix(stops[i], stops[min(i + 1u, 7u)], f);
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4<f32> {
  let src = textureSample(frameTex, frameSampler, in.uv);
  var color : vec4<f32>;
  if (u.useColormap > 0.5) {
    // Luminance of the source drives the ramp; source alpha gates coverage.
    let lum = dot(src.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    color = reflectivity_color(lum);
    color.a = color.a * src.a;
  } else {
    color = src; // already-colored frames (e.g. RainViewer tiles) pass through
  }
  color.a = color.a * u.opacity;
  return vec4<f32>(color.rgb * color.a, color.a); // premultiplied for blending
}
`;

class RadarWebGPU {
  static supported() {
    return typeof navigator !== "undefined" && !!navigator.gpu;
  }

  /** Initialize device, context and pipeline on the given canvas. */
  async init(canvas) {
    if (!RadarWebGPU.supported()) throw new Error("WebGPU not available in this browser");
    this.canvas = canvas;
    this.adapter = await navigator.gpu.requestAdapter();
    if (!this.adapter) throw new Error("No WebGPU adapter");
    this.device = await this.adapter.requestDevice();
    this.context = canvas.getContext("webgpu");
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "premultiplied", // composite over the basemap beneath the canvas
    });

    const module = this.device.createShaderModule({ code: RADAR_WGSL });
    this.pipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vs_main" },
      fragment: {
        module, entryPoint: "fs_main",
        targets: [{
          format: this.format,
          blend: { // premultiplied source-over
            color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
          },
        }],
      },
      primitive: { topology: "triangle-list" },
    });

    this.sampler = this.device.createSampler({ magFilter: "linear", minFilter: "linear" });
    this.uniformBuf = this.device.createBuffer({
      size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.texture = null;
    this.bindGroup = null;
    return this;
  }

  /** Upload a radar/HRRR frame. Accepts ImageBitmap/HTMLImageElement/canvas. */
  async setFrame(source) {
    const bitmap = source instanceof ImageBitmap ? source : await createImageBitmap(source);
    if (!this.texture || this.texture.width !== bitmap.width || this.texture.height !== bitmap.height) {
      if (this.texture) this.texture.destroy();
      this.texture = this.device.createTexture({
        size: [bitmap.width, bitmap.height],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.bindGroup = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: this.texture.createView() },
          { binding: 2, resource: { buffer: this.uniformBuf } },
        ],
      });
    }
    this.device.queue.copyExternalImageToTexture(
      { source: bitmap }, { texture: this.texture }, [bitmap.width, bitmap.height]);
  }

  /** Draw the current frame. opts: {opacity: 0..1, useColormap: bool} */
  render(opts) {
    if (!this.texture) return;
    const o = opts || {};
    this.device.queue.writeBuffer(this.uniformBuf, 0, new Float32Array([
      o.opacity == null ? 1 : o.opacity, o.useColormap ? 1 : 0, 0, 0,
    ]));
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: "clear", storeOp: "store",
      }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3); // fullscreen triangle
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  destroy() {
    if (this.texture) this.texture.destroy();
    if (this.device) this.device.destroy();
  }
}

/* ---------------------------------------------------------------------------
 * Leaflet integration: a canvas overlay pinned to fixed geographic bounds
 * (e.g. one composited radar/HRRR frame image). The canvas is repositioned by
 * Leaflet's ImageOverlay machinery; WebGPU redraws the pixels inside it.
 *
 *   const layer = new LeafletWebGPULayer(frameUrl, [[24,-125],[50,-66]],
 *                                        { opacity: 0.8, useColormap: true });
 *   await layer.addToMap(map);           // falls back to L.imageOverlay if no WebGPU
 *   await layer.setFrameUrl(nextUrl);    // swap frames (animation)
 * ------------------------------------------------------------------------ */
class LeafletWebGPULayer {
  constructor(frameUrl, bounds, opts) {
    this.frameUrl = frameUrl;
    this.bounds = bounds;
    this.opts = opts || {};
  }

  async addToMap(map) {
    if (!RadarWebGPU.supported()) {
      // Graceful fallback: plain image overlay, identical placement
      this.fallback = L.imageOverlay(this.frameUrl, this.bounds,
        { opacity: this.opts.opacity == null ? 1 : this.opts.opacity }).addTo(map);
      return this;
    }
    const canvas = document.createElement("canvas");
    canvas.width = this.opts.width || 1024;
    canvas.height = this.opts.height || 512;
    this.renderer = await new RadarWebGPU().init(canvas);
    await this._load(this.frameUrl);
    // Wrap the WebGPU canvas in an ImageOverlay so Leaflet handles geo-placement
    this.overlay = L.imageOverlay(canvas.toDataURL(), this.bounds).addTo(map);
    // Live canvas variant: replace the overlay's <img> with our canvas element
    const img = this.overlay.getElement();
    if (img && img.parentNode) {
      canvas.className = img.className;
      canvas.style.cssText = img.style.cssText;
      img.parentNode.replaceChild(canvas, img);
      this.overlay._image = canvas;
    }
    return this;
  }

  async _load(url) {
    const resp = await fetch(url);
    const bitmap = await createImageBitmap(await resp.blob());
    await this.renderer.setFrame(bitmap);
    this.renderer.render({ opacity: this.opts.opacity, useColormap: this.opts.useColormap });
  }

  async setFrameUrl(url) {
    this.frameUrl = url;
    if (this.fallback) { this.fallback.setUrl(url); return; }
    await this._load(url);
  }

  setOpacity(opacity) {
    this.opts.opacity = opacity;
    if (this.fallback) { this.fallback.setOpacity(opacity); return; }
    this.renderer.render({ opacity, useColormap: this.opts.useColormap });
  }

  remove(map) {
    if (this.fallback) map.removeLayer(this.fallback);
    if (this.overlay) map.removeLayer(this.overlay);
    if (this.renderer) this.renderer.destroy();
  }
}

if (typeof module !== "undefined") module.exports = { RadarWebGPU, LeafletWebGPULayer };
