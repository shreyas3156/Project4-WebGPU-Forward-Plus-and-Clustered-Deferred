// TODO-2: implement the light clustering compute shader

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

// Determines if a sphere / light overlaps an AABB
fn sphereAABBOverlap(sphereCenter: vec3f, boxMin: vec3f, boxMax: vec3f) -> bool {
    let nearest = clamp(sphereCenter, boxMin, boxMax);
    let d = nearest - sphereCenter;
    return dot(d, d) <= ${lightRadius ** 2};
}

@compute
@workgroup_size(${clusterWorkgroupSize})
fn main(@builtin(global_invocation_id) idx: vec3u) {
    let numClusters = clusterSet.numClusters;
    if (any(idx >= numClusters)) {
        return;
    }
    let clusterIdx = idx.x + idx.y * numClusters.x + idx.z * numClusters.x * numClusters.y;
    
    // Compute exponential depth split ratio for this cluster slice
    let zNear = cameraUniforms.screenDims[0];
    let zFar  = cameraUniforms.screenDims[1];
    let logZ  = zFar / zNear;

    // Cluster's depth range in *view* space
    let zViewMin = -zNear * pow(logZ, f32(idx.z) / f32(clusterSet.numClusters.z));
    let zViewMax = -zNear * pow(logZ, f32(idx.z + 1) / f32(clusterSet.numClusters.z));

    // Calculate perspective division "w" for this cluster slice
    let wClipMin = zViewMin * cameraUniforms.projMat[2][3];
    let wClipMax = zViewMax * cameraUniforms.projMat[2][3];

    // NDC (Normalized Device Coordinates) in XY for this cluster's screen rect
    let minX_NDC = 2.0 * f32(idx.x)     / f32(clusterSet.numClusters.x) - 1.0;
    let maxX_NDC = 2.0 * f32(idx.x + 1) / f32(clusterSet.numClusters.x) - 1.0;
    let minY_NDC = 2.0 * f32(idx.y)     / f32(clusterSet.numClusters.y) - 1.0;
    let maxY_NDC = 2.0 * f32(idx.y + 1) / f32(clusterSet.numClusters.y) - 1.0;

    // Reverse projection for each NDC corner to get bounds in clip space
    var minX_clip: f32;
    var maxX_clip: f32;
    var minY_clip: f32;
    var maxY_clip: f32;
    
    if (minX_NDC < 0.0) { minX_clip = minX_NDC * wClipMax; } else { minX_clip = minX_NDC * wClipMin; }
    if (maxX_NDC < 0.0) { maxX_clip = maxX_NDC * wClipMin; } else { maxX_clip = maxX_NDC * wClipMax; }
    if (minY_NDC < 0.0) { minY_clip = minY_NDC * wClipMax; } else { minY_clip = minY_NDC * wClipMin; }
    if (maxY_NDC < 0.0) { maxY_clip = maxY_NDC * wClipMin; } else { maxY_clip = maxY_NDC * wClipMax; }

    // Move from clip to view space using inverse of projection diagonal
    let invProjXY = vec2f(1.0 / cameraUniforms.projMat[0][0], 1.0 / cameraUniforms.projMat[1][1]);
    let minXY_view = vec2f(minX_clip, minY_clip) * invProjXY;
    let maxXY_view = vec2f(maxX_clip, maxY_clip) * invProjXY;

    // Now get cluster's min/max bounds in view space coordinates
    let aabbMin = vec3f(minXY_view, zViewMax);
    let aabbMax = vec3f(maxXY_view, zViewMin);

    // Save AABB bounds in cluster buffer for later light assignment
    let cluster = &clusterSet.clusters[clusterIdx];

    // Reset the light count for this cluster
    var numLightsInCluster: u32 = 0u;

    // Scan all lights and test if they're inside this cluster's bounds
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        let light = &lightSet.lights[lightIdx];
        let lightPosView = cameraUniforms.viewMat * vec4<f32>((*light).pos, 1.0);
        if (sphereAABBOverlap(lightPosView.xyz, aabbMin, aabbMax)) {
            (*cluster).lightIndices[numLightsInCluster] = lightIdx;
            numLightsInCluster += 1u;
            if (numLightsInCluster >= ${maxLightsPerCluster}) { break; }
        }
    }
    (*cluster).numLights = numLightsInCluster;
}