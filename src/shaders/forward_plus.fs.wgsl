// TODO-2: implement the Forward+ fragment shader

// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

// ------------------------------------
// Shading process:
// ------------------------------------
// Determine which cluster contains the current fragment.
// Retrieve the number of lights that affect the current fragment from the cluster’s data.
// Initialize a variable to accumulate the total light contribution for the fragment.
// For each light in the cluster:
//     Access the light's properties using its index.
//     Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
//     Add the calculated contribution to the total light accumulation.
// Multiply the fragment’s diffuse color by the accumulated light contribution.
// Return the final color, ensuring that the alpha component is set appropriately (typically to 1).

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // Find the cluster for this fragment
    let numClusters = clusterSet.numClusters; 

    // Compute exponential depth split ratio for this cluster slice
    let zNear = cameraUniforms.screenDims[0];
    let zFar  = cameraUniforms.screenDims[1];
    let logZ  = zFar / zNear;

    let viewPosition = cameraUniforms.viewMat * vec4<f32>(in.pos, 1.0);
    // Transform to clip space, then to normalized device coordinates
    let clipPosition = cameraUniforms.viewProjMat * vec4<f32>(in.pos, 1.0);
    let ndcPosition = (clipPosition.xy / clipPosition.w) * 0.5 + 0.5;

    // Compute cluster Z slice using logarithmic depth partitioning
    let clusterZ : u32 = u32((log(-viewPosition.z/ zNear) * f32(numClusters.z)) / log(zFar / zNear));
    let clusterX : u32 = u32(ndcPosition.x * f32(numClusters.x));
    let clusterY : u32 = u32(ndcPosition.y * f32(numClusters.y));
    let clusterIdx = clusterX + clusterY * numClusters.x + clusterZ * numClusters.x * numClusters.y;

    let currentCluster = &clusterSet.clusters[clusterIdx];
    let numActiveLights: u32 = (*currentCluster).numLights;
    
    // Accumulate lighting
    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < numActiveLights; i++) {
        let lightIdx = (*currentCluster).lightIndices[i];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, in.pos, normalize(in.nor));
    }

    var outColor = diffuseColor.rgb * totalLightContrib;
    return vec4(outColor, 1);
}
