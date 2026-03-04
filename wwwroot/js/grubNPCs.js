window.grubNPCs = {
    scene: null,
    waiters: [],
    waitingLine: [],
    cashier: null,
    activeOrderWaiter: null,
    playerAvatar: null,

    init: function (scene) {
        this.scene = scene;

        // Register animation for wandering waiters
        this.scene.onBeforeRenderObservable.add(() => {
            this.updateNPCs();
        });
    },

    // Generates a simple voxel humanoid
    spawnNPC: function (name, shirtHex, pantsHex, position, rotY = 0) {
        if (!this.scene) return null;

        const npcRoot = new BABYLON.TransformNode("npc_" + name, this.scene);
        npcRoot.position = position.clone();
        npcRoot.rotation.y = rotY;

        // Materials
        const skinMat = new BABYLON.StandardMaterial("skinMat_" + name, this.scene);
        skinMat.diffuseColor = new BABYLON.Color3(1.0, 0.8, 0.6); // Generic skin tone
        skinMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

        const shirtMat = new BABYLON.StandardMaterial("shirtMat_" + name, this.scene);
        shirtMat.diffuseColor = BABYLON.Color3.FromHexString(shirtHex);
        shirtMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

        const pantsMat = new BABYLON.StandardMaterial("pantsMat_" + name, this.scene);
        pantsMat.diffuseColor = BABYLON.Color3.FromHexString(pantsHex);
        pantsMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

        // Core Body Parts (Scaled down slightly from TSFamilyFun to fit Restaurant)
        const scale = 0.8;

        // Torso
        const torso = BABYLON.MeshBuilder.CreateBox("torso_" + name, { width: 0.6 * scale, height: 0.8 * scale, depth: 0.3 * scale }, this.scene);
        torso.parent = npcRoot;
        torso.position.y = 1.1 * scale;
        torso.material = shirtMat;

        // Head
        const head = BABYLON.MeshBuilder.CreateBox("head_" + name, { size: 0.4 * scale }, this.scene);
        head.parent = npcRoot;
        head.position.y = 1.7 * scale;
        head.material = skinMat;

        // Simple Face (Eyes)
        const eyeMat = new BABYLON.StandardMaterial("eyeMat_" + name, this.scene);
        eyeMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);

        const eyeL = BABYLON.MeshBuilder.CreateBox("eyeL", { width: 0.05 * scale, height: 0.05 * scale, depth: 0.02 * scale }, this.scene);
        eyeL.parent = head;
        eyeL.position.set(-0.1 * scale, 0.05 * scale, 0.21 * scale);
        eyeL.material = eyeMat;

        const eyeR = BABYLON.MeshBuilder.CreateBox("eyeR", { width: 0.05 * scale, height: 0.05 * scale, depth: 0.02 * scale }, this.scene);
        eyeR.parent = head;
        eyeR.position.set(0.1 * scale, 0.05 * scale, 0.21 * scale);
        eyeR.material = eyeMat;

        // Arms
        const armSize = { width: 0.2 * scale, height: 0.4 * scale, depth: 0.2 * scale };

        const armL = BABYLON.MeshBuilder.CreateBox("armL_" + name, armSize, this.scene);
        armL.parent = torso;
        armL.position.set(-0.4 * scale, 0, 0);
        armL.material = shirtMat;

        const armR = BABYLON.MeshBuilder.CreateBox("armR_" + name, armSize, this.scene);
        armR.parent = torso;
        armR.position.set(0.4 * scale, 0, 0);
        armR.material = shirtMat;

        // Legs
        const legSize = { width: 0.25 * scale, height: 0.7 * scale, depth: 0.25 * scale };

        const legL = BABYLON.MeshBuilder.CreateBox("legL_" + name, legSize, this.scene);
        legL.parent = npcRoot;
        legL.position.set(-0.15 * scale, 0.35 * scale, 0);
        legL.material = pantsMat;

        const legR = BABYLON.MeshBuilder.CreateBox("legR_" + name, legSize, this.scene);
        legR.parent = npcRoot;
        legR.position.set(0.15 * scale, 0.35 * scale, 0);
        legR.material = pantsMat;

        // Name Tag
        const plane = BABYLON.MeshBuilder.CreatePlane("nameTag_" + name, { width: 2, height: 0.5 }, this.scene);
        plane.parent = npcRoot;
        plane.position.y = 2.0 * scale;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

        const advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(plane, 512, 128);
        const textBlock = new BABYLON.GUI.TextBlock();
        textBlock.text = name;
        textBlock.color = "white";
        textBlock.fontSize = 40;
        textBlock.fontWeight = "bold";
        textBlock.outlineColor = "black";
        textBlock.outlineWidth = 4;
        advancedTexture.addControl(textBlock);

        // State for wandering logic
        npcRoot.targetPos = null;
        npcRoot.speed = 0.03 + (Math.random() * 0.02);
        npcRoot.isWalking = false;
        npcRoot.isTakingOrder = false;

        return npcRoot;
    },

    clearNPCs: function () {
        if (this.cashier) {
            this.cashier.dispose();
            this.cashier = null;
        }

        if (this.playerAvatar) {
            this.playerAvatar.dispose();
            this.playerAvatar = null;
        }

        this.waiters.forEach(w => w.dispose());
        this.waiters = [];

        this.waitingLine.forEach(w => w.dispose());
        this.waitingLine = [];
    },

    spawnCashier: function (counterMesh) {
        if (!counterMesh) return;

        // Try to position the cashier slightly behind the center of the counter
        // We use the rotation of the counter to determine which way is "behind"
        const rotY = counterMesh.rotation.y;

        // Counter is roughly 3 units long, 1 unit deep. Let's place cashier 1 unit behind local origin
        let offsetX = Math.sin(rotY) * 1.5;
        let offsetZ = Math.cos(rotY) * 1.5;

        const pos = new BABYLON.Vector3(counterMesh.position.x - offsetX, 0, counterMesh.position.z - offsetZ);

        // Hometown Grub uniform: red shirt, black pants
        this.cashier = this.spawnNPC("Cashier", "#C0392B", "#2C3E50", pos, rotY);
    },

    spawnWaitingLine: function () {
        // Spawn 3 people near the entrance waiting area
        const baseX = -8;
        const baseZ = -20;

        this.waitingLine.push(this.spawnNPC("Customer 1", "#3498DB", "#bdc3c7", new BABYLON.Vector3(baseX, 0, baseZ), 0));
        this.waitingLine.push(this.spawnNPC("Customer 2", "#9B59B6", "#2C3E50", new BABYLON.Vector3(baseX + 1.5, 0, baseZ - 1), Math.PI / 8));
        this.waitingLine.push(this.spawnNPC("Customer 3", "#2ECC71", "#7f8c8d", new BABYLON.Vector3(baseX - 1.5, 0, baseZ - 0.5), -Math.PI / 4));
    },

    spawnWaiters: function () {
        // Hometown Grub uniform: red shirt, black pants
        this.waiters.push(this.spawnNPC("Waiter Bob", "#C0392B", "#2C3E50", new BABYLON.Vector3(5, 0, 5), 0));
        this.waiters.push(this.spawnNPC("Waiter Alice", "#C0392B", "#2C3E50", new BABYLON.Vector3(-5, 0, 10), 0));

        // Start wandering
        this.waiters.forEach(w => this.pickNewWanderTarget(w));
    },

    pickNewWanderTarget: function (npc) {
        // Pick a random spot roughly inside the restaurant bounds (-20 to 20)
        let tx = (Math.random() * 40) - 20;
        let tz = (Math.random() * 40) - 20;

        npc.targetPos = new BABYLON.Vector3(tx, 0, tz);

        // Rotate NPC to face target
        const dx = tx - npc.position.x;
        const dz = tz - npc.position.z;
        npc.rotation.y = Math.atan2(dx, dz);
        npc.isWalking = true;
    },

    updateNPCs: function () {
        // Wander logic for waiters
        this.waiters.forEach(npc => {
            if (npc.isWalking && npc.targetPos) {
                const dist = BABYLON.Vector3.Distance(npc.position, npc.targetPos);

                if (dist < 0.5) {
                    // Reached target
                    npc.isWalking = false;

                    if (!npc.isTakingOrder) {
                        // Pause then pick new if not locked in an order
                        setTimeout(() => {
                            if (!npc.isTakingOrder) {
                                this.pickNewWanderTarget(npc);
                            }
                        }, 2000 + (Math.random() * 3000));
                    }
                } else {
                    // Move forward
                    const dir = npc.targetPos.subtract(npc.position).normalize();
                    npc.position.addInPlace(dir.scale(npc.speed));
                }
            }
        });
    },

    seatPlayerAt: function (targetMesh) {
        if (this.playerAvatar) {
            this.playerAvatar.dispose();
            this.playerAvatar = null;
        }

        if (!targetMesh) return;

        // Position avatar roughly at the clicked mesh (using world coordinates)
        const pos = targetMesh.getAbsolutePosition().clone();

        // Face the same general direction
        let rotY = (targetMesh.rotation && targetMesh.rotation.y) ? targetMesh.rotation.y : (targetMesh.parentRotY || 0);
        const type = targetMesh.parentAssetType;

        // Apply a seating offset so the avatar doesn't spawn directly inside the table
        if (type === "table_standard") {
            // Standard tables: sit 1 unit back (like a chair)
            // If rotY is 0, back is -Z
            pos.x -= Math.sin(rotY) * 1.2;
            pos.z -= Math.cos(rotY) * 1.2;
            // Face the table
            rotY += Math.PI;
        } else if (type === "booth") {
            // Booths: the table is in the middle, seats are on the sides (usually X axis relative)
            pos.x -= Math.cos(rotY) * 0.8;
            pos.z += Math.sin(rotY) * 0.8;
            // Face the center of the booth table
            rotY += Math.PI / 2;
        } else if (type === "chair_wooden" || type === "checkout_counter") {
            // Fallback for chairs and counters
            pos.x -= Math.sin(rotY) * 0.5;
            pos.z -= Math.cos(rotY) * 0.5;
        }

        // Spawn player with a distinct blue shirt and khakis
        this.playerAvatar = this.spawnNPC("Owner", "#2980B9", "#F5DEB3", pos, rotY);

        // Sink the avatar down to make it look like they are sitting
        this.playerAvatar.position.y -= 0.6;

        // Optional: remove legs or rotate them, but sinking them into the object is a good enough v1 illusion

        // The player just sat down, physically dispatch a waiter to them
        // Send waiter to the table's absolute origin, not the offset seat
        this.dispatchWaiterToTable(targetMesh.getAbsolutePosition());
    },

    dispatchWaiterToTable: function (tablePos) {
        if (!this.waiters || this.waiters.length === 0 || !tablePos) return;

        // Pick a random waiter to be the active one
        const waiter = this.waiters[Math.floor(Math.random() * this.waiters.length)];
        this.activeOrderWaiter = waiter;
        waiter.isTakingOrder = true;

        // We want the waiter to stand near the table, but not directly on top of the player
        // Assuming the player sits at -Z relative to the table, we'll send the waiter to +Z or +X
        let tx = tablePos.x + 1.5;
        let tz = tablePos.z + 1.5;
        const targetPos = new BABYLON.Vector3(tx, 0, tz);

        waiter.targetPos = targetPos;

        // Rotate NPC to face the center of the table directly
        const dx = tablePos.x - targetPos.x;
        const dz = tablePos.z - targetPos.z;
        waiter.rotation.y = Math.atan2(dx, dz);

        waiter.isWalking = true;
    },

    dismissWaiter: function () {
        if (this.activeOrderWaiter) {
            this.activeOrderWaiter.isTakingOrder = false;
            this.pickNewWanderTarget(this.activeOrderWaiter);
            this.activeOrderWaiter = null;
        }
    }
};
