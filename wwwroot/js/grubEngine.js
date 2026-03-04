window.grubEngine = {
    canvas: null,
    engine: null,
    scene: null,
    camera: null,
    blueprints: {},
    assetDefinitions: {},
    placedObjects: [],
    placementMode: false,
    currentPlacementType: null,
    previewMesh: null,
    previewRotation: 0,
    mousePos: { x: 0, z: 0 },
    groundMesh: null,
    wallMeshes: [],

    init: async function (canvasId) {
        if (this.engine) {
            this.engine.resize();
            return;
        }

        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.engine = new BABYLON.Engine(this.canvas, true);
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color4(0.8, 0.8, 0.8, 1);

        this.camera = new BABYLON.ArcRotateCamera("Camera", -Math.PI / 2, Math.PI / 3, 20, BABYLON.Vector3.Zero(), this.scene);
        this.camera.attachControl(this.canvas, true);
        this.camera.lowerRadiusLimit = 2;
        this.camera.upperRadiusLimit = 50;
        this.camera.wheelPrecision = 50;

        var light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), this.scene);
        light.intensity = 0.7;

        var ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, this.scene);
        this.groundMesh = ground;
        var groundMat = new BABYLON.StandardMaterial("groundMat", this.scene);
        groundMat.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
        groundMat.wireframe = true;
        ground.material = groundMat;

        await this.loadBlueprints();

        // Removed onPointerMove, handling cursor tracking in the render loop instead of events

        this.scene.onPointerDown = (evt, pickResult) => {
            if (evt.button === 0 && this.placementMode && this.previewMesh && pickResult.hit) {
                this.placeCurrentObject();
            } else if (evt.button === 2 && this.placementMode) {
                this.cancelPlacement();
            } else if (evt.button === 2 && !this.placementMode) {
                if (pickResult.hit && pickResult.pickedMesh && pickResult.pickedMesh.name !== "ground" && pickResult.pickedMesh.parentObjectKey) {
                    this.removeObject(pickResult.pickedMesh.parentObjectKey);
                }
            }
        };

        window.addEventListener("keydown", (evt) => {
            if (evt.key === 'r' || evt.key === 'R') {
                if (this.placementMode && this.previewMesh) {
                    this.previewRotation += Math.PI / 2;
                    this.previewMesh.rotation.y = this.previewRotation;
                }
            }
            if (evt.key === 'Escape') {
                this.cancelPlacement();
            }
        });

        this.engine.runRenderLoop(() => {
            if (this.placementMode && this.previewMesh) {
                const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => mesh.name === "ground");
                if (pickInfo.hit) {
                    const x = Math.round(pickInfo.pickedPoint.x * 2) / 2;
                    const z = Math.round(pickInfo.pickedPoint.z * 2) / 2;
                    this.previewMesh.position.x = x;
                    this.previewMesh.position.z = z;
                }
            }
            this.scene.render();
        });

        window.addEventListener("resize", () => {
            if (this.engine) this.engine.resize();
        });

        // Force a resize slightly after init to combat blurry canvas on UI state changes
        setTimeout(() => {
            if (this.engine) this.engine.resize();
        }, 150);

        if (window.grubNPCs) {
            window.grubNPCs.init(this.scene);
        }
    },

    loadBlueprints: async function () {
        try {
            const response = await fetch('data/assetBlueprints.json', { cache: "no-store" });
            const data = await response.json();
            for (const item of data.blueprints) {
                this.blueprints[item.id] = item;
                const defResp = await fetch(item.recipe, { cache: "no-store" });
                if (defResp.ok) {
                    const defData = await defResp.json();
                    this.assetDefinitions[item.id] = defData;
                }
            }
        } catch (e) {
            console.error("Failed to load blueprints", e);
        }
    },

    startPlacementMode: function (assetId) {
        if (!this.assetDefinitions[assetId]) return;
        this.cancelPlacement();

        this.currentPlacementType = assetId;
        this.placementMode = true;
        this.previewRotation = 0;

        this.previewMesh = this.buildProceduralMesh(assetId, true);
        this.previewMesh.position.y = 0;
    },

    cancelPlacement: function () {
        this.placementMode = false;
        this.currentPlacementType = null;
        if (this.previewMesh) {
            this.previewMesh.dispose();
            this.previewMesh = null;
        }
    },

    placeCurrentObject: function () {
        if (!this.currentPlacementType || !this.previewMesh) return;

        const x = this.previewMesh.position.x;
        const z = this.previewMesh.position.z;
        const rot = this.previewRotation;

        // Notify Blazor
        DotNet.invokeMethodAsync('HometownGrub', 'OnBuildingPlaced', this.currentPlacementType, x, 0, z, rot);

        // Let Blazor handle actual placement through loadRestaurantsBuildings
        this.cancelPlacement();
    },

    removeObject: function (key) {
        const parts = key.split('_');
        if (parts.length >= 3) {
            const x = parseFloat(parts[1]);
            const z = parseFloat(parts[2]);
            DotNet.invokeMethodAsync('HometownGrub', 'OnBuildingRemoved', x, 0, z);
        }
    },

    loadBuildings: function (buildings) {
        // Clear existing
        this.placedObjects.forEach(m => m.dispose());
        this.placedObjects = [];

        if (window.grubNPCs) {
            window.grubNPCs.clearNPCs();
        }

        for (const b of buildings) {
            const mesh = this.buildProceduralMesh(b.type, false);
            if (mesh) {
                mesh.position.x = b.x;
                mesh.position.y = b.y;
                mesh.position.z = b.z;
                mesh.rotation.y = b.rotY;
                mesh.parentObjectKey = `p_${b.x}_${b.z}`;

                // assign key to children for raycasting
                mesh.getChildMeshes().forEach(c => c.parentObjectKey = mesh.parentObjectKey);

                this.placedObjects.push(mesh);

                // Spawn cashier if this is the checkout counter
                if (b.type === 'checkout_counter' && window.grubNPCs && !window.grubNPCs.cashier) {
                    window.grubNPCs.spawnCashier(mesh);
                }
            }
        }

        // Spawn generic ambiance NPCs
        if (window.grubNPCs) {
            window.grubNPCs.spawnWaitingLine();
            window.grubNPCs.spawnWaiters();
        }
    },

    buildProceduralMesh: function (assetId, isPreview) {
        const def = this.assetDefinitions[assetId];
        if (!def) return null;

        const mainContainer = new BABYLON.TransformNode("container_" + assetId, this.scene);

        for (const part of def.Parts) {
            let partMesh;
            let options = {};

            if (part.Shape === "Box") {
                partMesh = BABYLON.MeshBuilder.CreateBox(part.Id, { size: 1 }, this.scene);
                partMesh.scaling = new BABYLON.Vector3(part.Scale[0], part.Scale[1], part.Scale[2]);
            } else if (part.Shape === "Cylinder") {
                partMesh = BABYLON.MeshBuilder.CreateCylinder(part.Id, { diameter: 1, height: 1 }, this.scene);
                partMesh.scaling = new BABYLON.Vector3(part.Scale[0], part.Scale[1], part.Scale[2]);
            }

            if (partMesh) {
                partMesh.parent = mainContainer;
                partMesh.position = new BABYLON.Vector3(part.Position[0], part.Position[1], part.Position[2]);

                // Convert rotation from degrees to radians
                partMesh.rotation = new BABYLON.Vector3(
                    part.Rotation[0] * Math.PI / 180,
                    part.Rotation[1] * Math.PI / 180,
                    part.Rotation[2] * Math.PI / 180
                );

                const mat = new BABYLON.StandardMaterial("mat_" + part.Id, this.scene);
                mat.diffuseColor = BABYLON.Color3.FromHexString(part.ColorHex);

                if (isPreview) {
                    mat.alpha = 0.6;
                    partMesh.isPickable = false;
                }

                partMesh.material = mat;
            }
        }

        return mainContainer;
    },

    setFlooring: function (type, colorHex) {
        if (!this.groundMesh) return;

        const matName = "groundMat_" + type;
        let groundMat = this.scene.getMaterialByName(matName);

        if (!groundMat) {
            groundMat = new BABYLON.StandardMaterial(matName, this.scene);

            if (type === "Concrete") {
                groundMat.diffuseColor = new BABYLON.Color3(0.6, 0.6, 0.6);
                groundMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            }
            else if (type === "Wooden") {
                const woodTex = new BABYLON.WoodProceduralTexture("woodTex", 1024, this.scene);
                woodTex.woodColor = new BABYLON.Color3(0.4, 0.2, 0.1); // Richer brown
                woodTex.uScale = 60.0; // Higher scale = tighter lines
                woodTex.vScale = 2.0;
                groundMat.diffuseTexture = woodTex;
                groundMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
            }
            else if (type === "Carpet") {
                const noiseTex = new BABYLON.NoiseProceduralTexture("carpetNoise", 512, this.scene);
                noiseTex.octaves = 8;
                noiseTex.persistence = 0.8;
                noiseTex.animationSpeedFactor = 0;
                noiseTex.uScale = 20.0;
                noiseTex.vScale = 20.0;

                groundMat.diffuseColor = new BABYLON.Color3(0.1, 0.2, 0.4); // Navy blue carpet
                groundMat.bumpTexture = noiseTex; // Add texture via normal/bump map
                groundMat.specularColor = new BABYLON.Color3(0, 0, 0); // No shine
            }
            else if (type === "Linoleum") {
                const marbleTex = new BABYLON.MarbleProceduralTexture("marbleTex", 512, this.scene);
                marbleTex.numberOfTilesHeight = 10;
                marbleTex.numberOfTilesWidth = 10;
                groundMat.diffuseTexture = marbleTex;
                groundMat.specularColor = new BABYLON.Color3(0.8, 0.8, 0.8);
            }
        }

        if (colorHex) {
            const babColor = BABYLON.Color3.FromHexString(colorHex);
            if (type === "Concrete" || type === "Carpet" || type === "Linoleum") {
                groundMat.diffuseColor = babColor;
            } else if (type === "Wooden" && groundMat.diffuseTexture) {
                groundMat.diffuseTexture.woodColor = babColor;
            }
        }

        this.groundMesh.material = groundMat;
    },

    setWalls: function (type, colorHex) {
        if (!this.scene) return;

        // Create walls if they don't exist
        if (this.wallMeshes.length === 0) {
            const wallOptions = { width: 50, height: 4, depth: 0.5 };

            // North Wall
            const northWall = BABYLON.MeshBuilder.CreateBox("northWall", wallOptions, this.scene);
            northWall.position = new BABYLON.Vector3(0, 2, 25);

            // East Wall
            const eastWall = BABYLON.MeshBuilder.CreateBox("eastWall", wallOptions, this.scene);
            eastWall.rotation.y = Math.PI / 2;
            eastWall.position = new BABYLON.Vector3(25, 2, 0);

            // West Wall
            const westWall = BABYLON.MeshBuilder.CreateBox("westWall", wallOptions, this.scene);
            westWall.rotation.y = Math.PI / 2;
            westWall.position = new BABYLON.Vector3(-25, 2, 0);

            this.wallMeshes.push(northWall, eastWall, westWall);
        }

        const matName = "wallMat_" + type;
        let wallMat = this.scene.getMaterialByName(matName);

        if (!wallMat) {
            wallMat = new BABYLON.StandardMaterial(matName, this.scene);

            if (type === "Brick") {
                const brickTex = new BABYLON.BrickProceduralTexture("brickTex", 512, this.scene);
                brickTex.numberOfBricksWidth = 30;
                brickTex.numberOfBricksHeight = 15;
                wallMat.diffuseTexture = brickTex;
                wallMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            }
            else if (type === "WoodPanel") {
                const woodTex = new BABYLON.WoodProceduralTexture("woodPanelTex", 512, this.scene);
                woodTex.woodColor = new BABYLON.Color3(0.5, 0.3, 0.15);
                woodTex.uScale = 1.0;
                woodTex.vScale = 20.0;
                wallMat.diffuseTexture = woodTex;
                wallMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            }
            else if (type === "Plaster") {
                const noiseTex = new BABYLON.NoiseProceduralTexture("plasterNoise", 512, this.scene);
                noiseTex.octaves = 4;
                noiseTex.persistence = 1.2;
                noiseTex.animationSpeedFactor = 0;
                noiseTex.uScale = 5.0;
                noiseTex.vScale = 5.0;

                wallMat.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.9);
                wallMat.bumpTexture = noiseTex;
                wallMat.specularColor = new BABYLON.Color3(0, 0, 0);
            }
            else if (type === "Paint") {
                wallMat.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.8);
                wallMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            }
        }

        // Apply Color Customizations
        if (colorHex) {
            const babColor = BABYLON.Color3.FromHexString(colorHex);
            if (type === "Paint" || type === "Plaster") {
                wallMat.diffuseColor = babColor;
            } else if (type === "WoodPanel" && wallMat.diffuseTexture) {
                wallMat.diffuseTexture.woodColor = babColor;
            } else if (type === "Brick" && wallMat.diffuseTexture) {
                // For bricks, tint the brick color specifically, keeping the mortar default
                wallMat.diffuseTexture.brickColor = babColor;
            }
        }

        // Apply material to all walls
        for (const wall of this.wallMeshes) {
            wall.material = wallMat;
        }
    }
};
