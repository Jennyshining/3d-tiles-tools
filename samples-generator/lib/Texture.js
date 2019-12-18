'use strict';

module.exports = Texture;

/**
 * A texture that is applied to a mesh.
 *
 * @param {Object} [options] An object with the following properties:
 * @param {Array|String} [options.baseColor] The base color or base color texture path.
 *
 * @constructor
 */
function Texture(options) {
    this.source = options.source;
    this.sampler = options.sampler;
}

/**
 * Creates a Texture from a glTF texture. This utility is designed only for simple glTFs like those in the data folder.
 *
 * @param {Object} texture The glTF texture.
 * @returns {Texture} The texture.
 */
Texture.fromGltf = function(gltf, sourceIndex, samplerIndex) {
    return new Texture({
        source: gltf.images[sourceIndex],
        sampler: gltf.samplers[samplerIndex]
    });
};
