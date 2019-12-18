'use strict';
var Cesium = require('cesium');
var defaultValue = Cesium.defaultValue;

module.exports = Material;

/**
 * A material that is applied to a mesh.
 *
 * @param {Object} [options] An object with the following properties:
 * @param {Array|String} [options.baseColorFactor] The base color or base color texture path.
 * @param {Array|String} [options.roughnessFactor] The base color or base color texture path.
 * @param {Number} [options.metallicFactor] The base color or base color texture path.
 * @param {Object} options.gltf The base color or base color texture path.
 * @param {Number} options.sourceIndex The base color or base color texture path.
 * @param {Number} options.samplerIndex The base color or base color texture path.
 * @constructor
 */
function Material(options) {
    options = defaultValue(options, defaultValue.EMPTY_OBJECT);
    // this.baseColor = defaultValue(options.baseColor, [0.5, 0.5, 0.5, 1.0]);
    this.baseColorFactor = defaultValue(options.baseColorFactor, [1.0, 1.0, 1.0, 1.0]);
    this.roughnessFactor = defaultValue(options.roughnessFactor, 1.0);
    this.metallicFactor = defaultValue(options.metallicFactor, 0.0);
    this.doubleSided = this.baseColorFactor[3] < 1.0;
    this.alphaMode = this.doubleSided ? 'BLEND' : 'OPAQUE';
    this.baseColorTexture = {};
}

//load the material according to gltf specification
Material.getValue = function (material) {
    return {
        pbrMetallicRoughness: {
            baseColorFactor: material.baseColorFactor,
            roughnessFactor: material.roughnessFactor,
            metallicFactor: material.metallicFactor,
            baseColorTexture: material.baseColorTexture
        },
        alphaMode: material.alphaMode,
        doubleSided: material.doubleSided
    };
};

/**
 * Creates a Material from a glTF material. This utility is extended to support meterial.
 *
 * @param {Object} material The glTF material.
 * @returns {Material} The material.
 */
Material.fromGltf = function(gltf, materialIndex) {
    try {
        var material = gltf.materials[materialIndex],
            doubleSided = false,
            alphaMode = doubleSided ? 'BLEND' : 'OPAQUE';
        if(material.pbrMetallicRoughness.baseColorTexture){
            var textureIndex = material.pbrMetallicRoughness.baseColorTexture.index,
                sourceIndex = gltf.textures[textureIndex].source,
                samplerIndex = gltf.textures[textureIndex].sampler,
                image = gltf.images[sourceIndex],
                sampler = gltf.samplers[samplerIndex];

            return {
                pbrMetallicRoughness: {
                    roughnessFactor: defaultValue(material.pbrMetallicRoughness.roughnessFactor, 1.0),
                    metallicFactor: defaultValue(material.pbrMetallicRoughness.metallicFactor, 0.0),
                    baseColorTexture: {
                        source: image,
                        sampler: sampler
                    }
                },
                alphaMode: alphaMode,
                doubleSided: doubleSided
            };
        }

        return {
            pbrMetallicRoughness: {
                baseColorFactor: defaultValue(material.pbrMetallicRoughness.baseColorFactor, [1.0, 1.0, 1.0, 1.0]),
                roughnessFactor: defaultValue(material.pbrMetallicRoughness.roughnessFactor, 1.0),
                metallicFactor: defaultValue(material.pbrMetallicRoughness.metallicFactor, 0.0),
            },
            alphaMode: alphaMode,
            doubleSided: doubleSided
        };
    } catch (error) {
        console.error(error);
    }
};
