import * as THREE from "./js/threejs/three.module.js";
import { OrbitControls } from "./js/threejs/OrbitControls.js";
import { SVGRenderer } from "./js/threejs/SVGRenderer.js";
import { OBJLoader } from "./js/threejs/OBJLoader.js";

(async function() {
const fs = require("fs");
const worldsPath = bwUserPath() + "/worlds/";
const colorsFetch = await fetch("colors.json");
const colors = await colorsFetch.json();

const canvas = document.getElementById("world-canvas");

function createSvgRenderer() {
	const svg = new SVGRenderer();
	canvas.parentElement.appendChild(svg.domElement);
	svg.domElement.style.width = "100%";
	svg.domElement.style.height = "100%";
	canvas.style.display = "none";
	return svg;
}

const renderer = new THREE.WebGLRenderer({ canvas });
//const renderer = createSvgRenderer();
//renderer.shadowMap.enabled = true;
const camera = new THREE.PerspectiveCamera(70, 2, 1, 10000);
camera.position.y = 0.5;
camera.position.z = 5;

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.update();

const loader = new THREE.TextureLoader();
const objLoader = new OBJLoader();

let currentWorld = null;

function rgbToHex(array) {
	const red = Math.floor(array[0] * 255);
	const green = Math.floor(array[1] * 255);
	const blue = Math.floor(array[2] * 255);

	return (red << 16) | (green << 8) | blue;
}

function setMaterialRecursive(object, materials, matId) {
	const material = matId > materials.length - 1 ? materials[materials.length - 1] : materials[matId];
	object.material = material;
	for (const childId in object.children) {
		matId += 1;
		const child = object.children[childId];
		setMaterialRecursive(child, materials, matId);
	}
}

class TileRow {

	constructor(json) {
		this.json = json;
	}

	getGAFsWithPredicate(predicate) {
		let gafs = [];
		for (const tile of this.json) {
			const gaf = tile.gaf;
			if (gaf.predicate == predicate) {
				gafs.push(gaf);
			}
		}
		return gafs;
	}

	getFirstGafWithPredicate(predicate) {
		return getGAFsWithPredicate(predicate)[0];
	}
}

class Block {

	constructor(json) {
		this.json = json;
	}

	getTileRow(index) {
		return new TileRow(this.json[index]);
	}

	// Return the GAFs of the first row with given predicate.
	getInitialGafs(predicate) {
		return this.getTileRow(0).getGAFsWithPredicate(predicate);
	}

	getFirstInitialGaf(predicate) {
		return this.getInitialGafs(predicate)[0];
	}

	// Block.Create
	get type() {
		return this.getFirstInitialGaf("Block.Create").args[0];
	}

	// Block.MoveTo
	get position() {
		return this.getFirstInitialGaf("Block.MoveTo").args[0];
	}

	// Block.RotateTo
	get rotation() {
		return this.getFirstInitialGaf("Block.RotateTo").args[0];
	}

	// Block.ScaleTo
	get scale() {
		return this.getFirstInitialGaf("Block.ScaleTo").args[0];
	}

	// Block.PaintTo
	get paint() {
		return this.paints[0];
	}

	get paints() {
		let paints = [];
		for (const gaf of this.getInitialGafs("Block.PaintTo")) {
			const index = gaf.args.length == 1 ? 0 : gaf.args[1];
			paints[index] = gaf.args[0];
		}
		return paints;
	}

	get texture() {
		return this.json[0][5].gaf.args[0];
	}

	loadTexture(callback) {
		if (this.texture === "Plain") {
			callback(null);
		} else {
			loader.load("https://bwsecondary.ddns.net/uploads/Texture2D/" + this.texture + ".png", (texture) => {
				callback(texture);
			}, (xhr) => {},
			(error) => {
				console.warn("Unsupported texture '" + this.texture + "'", error);
				callback(null);
			});
		}
	}

	loadObj(callback) {
		if (this.type === "Cube") {
			const geometry = new THREE.BoxGeometry(1, 1, 1);
			const material = new THREE.MeshBasicMaterial( { color: 0xFFFFFF });
			callback(new THREE.Mesh(geometry, material));
		} else {
			objLoader.load("https://bwsecondary.ddns.net/uploads/Blocks/" + this.type + ".obj", (root) => {
				callback(root);
			}, (xhr) => {},
			(error) => {
				console.warn("Unsupported mesh '" + this.type + "'", error);
				const geometry = new THREE.BoxGeometry(1, 1, 1);
				const material = new THREE.MeshBasicMaterial( { color: 0xFFFFFF });
				callback(new THREE.Mesh(geometry, material));
			});
		}
	}

	loadMesh(callback) {
		if (this._mesh === undefined) {
			this.loadObj((root) => {
				this.loadTexture((texture) => {
					let materials = [];
					for (let i = this.paints.length; i > 0; i--) {
						const paint = this.paints[i-1];
						let color = colors[paint] === undefined ? 0xFFFFFF : rgbToHex(colors[paint]);
						if (colors[paint] === undefined) {
							console.warn("Unsupported paint '" + paint + "'");
						}
						let material = null;
						if (texture === null) {
							material = new THREE.MeshStandardMaterial({ color: color });
						} else {
							if (this.type === "Sky UV") {
								texture.wrapS = THREE.RepeatWrapping;
								texture.wrapT = THREE.RepeatWrapping;
								color = 0x8888DD;
							}
							material = new THREE.MeshStandardMaterial({ color: color, map: texture });
						}
						materials.push(material);
					}
					setMaterialRecursive(root, materials, 0);
					root.position.copy(this.position);
					root.scale.copy(this.scale);
					root.receiveShadow = true;
					root.castShadow = true;
					const rot = this.rotation;
					root.rotation.set(
						THREE.MathUtils.degToRad(rot.x),
						THREE.MathUtils.degToRad(rot.y),
						THREE.MathUtils.degToRad(rot.z),
					);
					this._mesh = root;
					callback(this._mesh);
				});
			});
			return;
		}
		callback(this._mesh);
	}

};

class World {

	constructor(buffer) {
		this.json = JSON.parse(buffer.toString("utf8"));
		console.log(this.json);
	}

	get blocks() {
		if (this._blocks === undefined) {
			var blocks = [];
			for (const blockJson of this.json.blocks) {
				const block = new Block(blockJson["tile-rows"]);
				blocks.push(block);
			}
			this._blocks = blocks;
		}
		return this._blocks;
	}

	get scene() {
		if (this._scene === undefined) {
			this._scene = new THREE.Scene();

			const light = new THREE.DirectionalLight(0xFFFFFF, 1);
			light.castShadow = true;
			light.position.set(20, 20, 20);
			this._scene.add(light);

			for (const block of this.blocks) {
				block.loadMesh((mesh) => {
					this._scene.add(mesh);
					requestRender();
				});
			}
		}
		return this._scene;
	}
}

window["loadWorld"] = function(localId) {
	const meta = JSON.parse(fs.readFileSync(worldsPath + localId + "/metadata.json"));
	const encrypted = fs.readFileSync(worldsPath + localId + "/source.bw").slice(2);
	var decrypted = Buffer.alloc(encrypted.length);
	if (meta["author_id"] === 0) {
		meta["author_id"] = 1; // todo: prompt user id
	}
	const key = "bw-source +cipher" + meta["author_id"];
	console.log("Decrypting world " + meta.id + " with key " + key);

	var i = 0;
	while (i < decrypted.length) {
		decrypted[i] = encrypted[i] ^ key.charCodeAt(i % key.length);
		i += 1;
	}

	currentWorld = new World(decrypted);

	const cameraPos = currentWorld.json.camera.position;
	controls.target.copy(cameraPos);
	controls.update();
}

let renderRequested = false;
function render(time) {
	renderRequested = false;
	if (isActivated("worlds")) {
		const canvas = renderer.domElement;
		if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
			camera.aspect = canvas.clientWidth / canvas.clientHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
		}

		if (currentWorld !== null) {
			renderer.render(currentWorld.scene, camera);
		}
	}
	controls.update();
	//requestAnimationFrame(render);
}

function requestRender() {
	if (!renderRequested) {
		renderRequested = true;
		requestAnimationFrame(render);
	}
}

requestAnimationFrame(render);
controls.addEventListener("change", requestRender);
window.addEventListener("resize", requestRender);

fs.readdir(worldsPath, (err, files) => {
	if (err) {
		throw err;
	}

	let list = document.getElementById("world-list");
	files.forEach(file => {
		const world = JSON.parse(fs.readFileSync(worldsPath + file + "/metadata.json"));
		let element = document.createElement("a");
		let elementText = document.createTextNode(
			world.title.length == 0 ? "Untitled ": world.title);

		element.appendChild(elementText);
		element.href = "javascript:loadWorld(\"" + file + "\")";
		element.id = "world-item-" + world.id;
		element.classList.add("list-group-item");
		element.classList.add("list-group-item-action");
		list.appendChild(element);
	});
});
})();
