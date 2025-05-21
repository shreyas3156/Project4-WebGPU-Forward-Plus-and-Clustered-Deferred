// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct FragmentOutput {
    @location(0) pos: vec4f,
    @location(1) alb: vec4f,
    @location(2) nor: vec4f,
}

@fragment
fn main(in: FragmentInput) -> FragmentOutput {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    // Get albedo from texture

    return FragmentOutput(
        vec4f(in.pos, 1.0),
        vec4f(diffuseColor.rgb, 1.0),
        vec4f(in.nor, 1.0)
    );
}