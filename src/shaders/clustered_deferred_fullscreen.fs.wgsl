// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
// This shader should only store G-buffer information and should not do any shading.
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(1) @binding(0) var positionTexture: texture_storage_2d<rgba16float, read>;
@group(1) @binding(1) var albedoTexture: texture_2d<f32>;
@group(1) @binding(2) var normalTexture: texture_storage_2d<rgba16float, read>;

@fragment
fn main(@builtin(position) screenPos : vec4f) -> @location(0) vec4f {
    let position = textureLoad(positionTexture, vec2i(floor(screenPos.xy))).rgb;
    let albedo   = textureLoad(albedoTexture, vec2i(floor(screenPos.xy)), 0).rgb;
    let normal   = textureLoad(normalTexture, vec2i(floor(screenPos.xy))).rgb;
    // Find the cluster for this fragment
    let numClusters = clusterSet.numClusters; 

    // Compute exponential depth split ratio for this cluster slice
    let zNear = cameraUniforms.screenDims[0];
    let zFar  = cameraUniforms.screenDims[1];
    let logZ  = zFar / zNear;

    let viewPosition = cameraUniforms.viewMat * vec4<f32>(position, 1.0);
    // Transform to clip space, then to normalized device coordinates
    let clipPosition = cameraUniforms.viewProjMat * vec4<f32>(position, 1.0);
    let ndcPosition = (clipPosition.xy / clipPosition.w) * 0.5 + 0.5;

    // Compute cluster Z slice using logarithmic depth partitioning
    let clusterZ : u32 = u32((log(-viewPosition.z/ zNear) * f32(numClusters.z)) / log(zFar / zNear));
    let clusterX : u32 = u32(ndcPosition.x * f32(numClusters.x));
    let clusterY : u32 = u32(ndcPosition.y * f32(numClusters.y));
    let clusterIdx = clusterX + clusterY * numClusters.x + clusterZ * numClusters.x * numClusters.y;

    let cluster = &clusterSet.clusters[clusterIdx];
    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < (*cluster).numLights; i++) {
        let lightIdx = (*cluster).lightIndices[i];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, position, normal);
    }

    let finalColor = albedo * totalLightContrib;
    return vec4f(finalColor, 1);
}