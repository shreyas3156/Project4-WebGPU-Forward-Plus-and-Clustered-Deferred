import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    fullscreenPipeline: GPURenderPipeline;
    gBuffer: { position: GPUTexture, albedo: GPUTexture, normal: GPUTexture };
    gBufferTextureView: { position: GPUTextureView, albedo: GPUTextureView, normal: GPUTextureView };
    gBufferPipeline: GPURenderPipeline;
    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass

        const canvasWidth = renderer.canvas.width;
        const canvasHeight = renderer.canvas.height;

        this.gBuffer = {
            position: renderer.device.createTexture({
                size: [canvasWidth, canvasHeight],
                format: 'rgba16float',
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.STORAGE_BINDING,
            }),
            albedo: renderer.device.createTexture({
                size: [canvasWidth, canvasHeight],
                format: 'bgra8unorm',
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            }),
            normal: renderer.device.createTexture({
                size: [canvasWidth, canvasHeight],
                format: 'rgba16float',
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.STORAGE_BINDING,
            }),
        };

        this.gBufferTextureView = {
            position: this.gBuffer.position.createView(),
            albedo: this.gBuffer.albedo.createView(),
            normal: this.gBuffer.normal.createView(),
        };

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });

        this.depthTextureView = this.depthTexture.createView();

        this.sceneUniformsLayout = renderer.device.createBindGroupLayout({
            label: "Clustered Deferred Scene Uniforms BindGroup Layout",
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
        // G-buffer textures bind group layout and bind group
        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "G-buffer bind group layout",
            entries: [
                {
                    binding: 0, 
                    visibility: GPUShaderStage.FRAGMENT, 
                    storageTexture: {
                        access: "read-only",
                        format: "rgba16float",
                    }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: "unfilterable-float"
                    }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    storageTexture: {
                        access: "read-only",
                        format: "rgba16float",
                    }
                },
            ],
        });
        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "G-buffer bind group",
            layout: this.gBufferBindGroupLayout,
            entries: [
                {
                    binding: 0, resource: this.gBuffer.position.createView()
                },
                {
                    binding: 1, resource: this.gBuffer.albedo.createView()
                },
                {
                    binding: 2, resource: this.gBuffer.normal.createView()
                },
            ],
        });

        // G-buffer pipeline
        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "gBuffer pass pipeline layout",
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
                    label: "gBuffer pass vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "gBuffer pass frag shader",
                    code: shaders.clusteredDeferredFragSrc
                }),
                entryPoint: "main",
                targets: [
                    {
                        format: "rgba16float",
                    },
                    {
                        format: "bgra8unorm",
                    },
                    {
                        format: "rgba16float",
                    }
                ]
            }
        });

        // Fullscreen pipeline
        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "fullscreen pass pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsLayout,
                    this.gBufferBindGroupLayout,
                ],
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen pass vertex shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc,
                }),
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen pass fragment shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    },
                ],
            },
            primitive: {
                topology: "triangle-strip"
            }
        });
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        this.lights.doLightClustering(encoder);
        const gBufferRenderPass = encoder.beginRenderPass({
            label: "G-buffer render pass",
            colorAttachments: [
                {
                    view: this.gBufferTextureView.position,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
                {
                    view: this.gBufferTextureView.albedo,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
                {
                    view: this.gBufferTextureView.normal,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });
        gBufferRenderPass.setPipeline(this.gBufferPipeline);
        gBufferRenderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        this.scene.iterate(
            node => {
                gBufferRenderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
            },
            material => {
                gBufferRenderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
            },
            primitive => {
                gBufferRenderPass.setVertexBuffer(0, primitive.vertexBuffer);
                gBufferRenderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
                gBufferRenderPass.drawIndexed(primitive.numIndices);
            }
        );
        gBufferRenderPass.end();
        const fullscreenPass = encoder.beginRenderPass({
            label: "fullscreen render pass",
            colorAttachments: [{
                view: canvasTextureView,
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store"
            }]
        });
        fullscreenPass.setPipeline(this.fullscreenPipeline);
        fullscreenPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        fullscreenPass.setBindGroup(1, this.gBufferBindGroup);
        fullscreenPass.draw(4);
        fullscreenPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
