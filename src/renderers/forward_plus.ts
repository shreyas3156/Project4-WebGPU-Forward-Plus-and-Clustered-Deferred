import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ForwardPlusRenderer extends renderer.Renderer {
    // Resources required for Forward+ shading: bind group layouts, pipelines, and textures
    sceneUniformsLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    forwardPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // Layout for uniforms related to camera, lights, and clustering info
        this.sceneUniformsLayout = renderer.device.createBindGroupLayout({
            label: "Scene Uniforms BindGroup Layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        // Bind group connecting buffers to the shader
        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "Scene Uniforms BindGroup",
            layout: this.sceneUniformsLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.lights.clusterLightsBuffer }
                }
            ]
        });

        // Depth texture for the render renderPass
        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        // Pipeline configuration for Forward+ rendering
        this.forwardPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "ForwardPlus Pipeline Layout",
                bindGroupLayouts: [
                    this.sceneUniformsLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "ForwardPlus Vertex Shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "ForwardPlus Fragment Shader",
                    code: shaders.forwardPlusFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });
    }

    override draw() {
        // TODO-2: run the Forward+ rendering renderPass:
        const commandEncoder = renderer.device.createCommandEncoder();

        // - run the main rendering renderPass, using the computed clusters for efficient lighting
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        // - run the clustering compute shader
        this.lights.doLightClustering(commandEncoder);

        // begin a render renderPass using the Forward+ pipeline
        const renderPass = commandEncoder.beginRenderPass({
            label: "ForwardPlus Render renderPass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });
        renderPass.setPipeline(this.forwardPipeline);

        // Bind scene-wide resources
        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        // Traverse and draw the scene
        this.scene.iterate(
            node => {
                renderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
            },
            material => {
                renderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
            },
            primitive => {
                renderPass.setVertexBuffer(0, primitive.vertexBuffer);
                renderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
                renderPass.drawIndexed(primitive.numIndices);
            }
        );

        renderPass.end();
        renderer.device.queue.submit([commandEncoder.finish()]);
    }
}
