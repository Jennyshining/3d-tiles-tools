'use strict';
var Cesium = require('cesium');
var fsExtra = require('fs-extra');
var path = require('path');
var Promise = require('bluebird');
var createB3dm = require('./createB3dm');
var createGltf = require('./createGltf');
var createTilesetJsonSingle = require('./createTilesetJsonSingle');
var Extensions = require('./Extensions');
var getBufferPadded = require('./getBufferPadded');
var Mesh = require('./Mesh');
var saveTile = require('./saveTile');
var saveTilesetJson = require('./saveTilesetJson');
var util = require('./utility');
var wgs84Transform = util.wgs84Transform;

// added
var fs = require('fs');
var xmlreader = require('xmlreader');

var defaultValue = Cesium.defaultValue;
var defined = Cesium.defined;
var Matrix4 = Cesium.Matrix4;

module.exports = createBatchTableHierarchy;

var sizeOfFloat = 4;
var sizeOfUint16 = 2;


/**
 * Create a tileset that uses a batch table hierarchy.
 *
 * @param {Object} options An object with the following properties:
 * @param {String} options.directory Directory in which to save the tileset.
 * @param {Boolean} [options.batchTableBinary=false] Create a batch table binary for the b3dm tile.
 * @param {Boolean} [options.noParents=false] Don't set any instance parents.
 * @param {Boolean} [options.multipleParents=false] Set multiple parents to some instances.
 * @param {Boolean} [options.legacy=false] Generate the batch table hierarchy as part of the base Batch Table, now deprecated.
 * @param {Matrix4] [options.transform=Matrix4.IDENTITY] The tile transform.
 * @param {Boolean} [options.optimizeForCesium=false] Optimize the glTF for Cesium by using the sun as a default light source.
 * @param {Boolean} [options.gzip=false] Gzip the saved tile.
 * @param {Boolean} [options.prettyJson=true] Whether to prettify the JSON.
 * @returns {Promise} A promise that resolves when the tileset is saved.
 */

async function createBatchTableHierarchy(options) {
    var useBatchTableBinary = defaultValue(options.batchTableBinary, false);
    // var noParents = defaultValue(options.noParents, false);
    // var multipleParents = defaultValue(options.multipleParents, false);
    var transform = defaultValue(options.transform, Matrix4.IDENTITY);

    var instances = createInstances();
    var batchTableJson = createBatchTableJson(instances,options);

    var batchTableBinary;
    if (useBatchTableBinary) {
        batchTableBinary = createBatchTableBinary(batchTableJson, options);  // Modifies the json in place
    }

    // Mesh urls listed in the same order as features in the classIds arrays
    var gltfs = await loadDataFromXml('./samples-generator/data/MyTestModel','config.xml');
    /*
    var urls = [];
    var modelRootPath = './samples-generator/data/MyTestModel/';
    var subDirectories = fs.readdirSync(modelRootPath);
    var gltfNames = [];
    var patternFileExtension = /\.gltf$/i;

    //TODO: getDataFromXml
    //loop the subDirectory to add gltf files into urls
    for (var i = 0; i < subDirectories.length; i++) {
        var subDirectory = path.join(modelRootPath, subDirectories[i]);
        var stat = fs.statSync(subDirectory); //to decide whether it is directory
        if (stat && stat.isDirectory()) {
            var files = fs.readdirSync(subDirectory);
            //only one gltf is added per subDirectory
            for (var j = 0; j < files.length; j++){
                if (patternFileExtension.test(files[j])) {
                    gltfNames.push(files[j].split('.')[0]);
                    urls.push(subDirectory + '\\' + files[j]);
                }
            }
        }
    }
    //TODO: getDataFromXml
    // Local transforms of the buildings within the tile
    // BEAR IN MIND: should keep the same sequence with the urls
    var buildingTransforms = [
        wgs84Transform(util.degreeToRadian(4.4889609), util.degreeToRadian(51.9072021), 0.0),
        wgs84Transform(util.degreeToRadian(4.4944118), util.degreeToRadian(51.9068529), 0.0),
    ];
    */
    var contentUri = 'tile.b3dm';
    var directory = options.directory;
    var tilePath = path.join(directory, contentUri);
    var tilesetJsonPath = path.join(directory, 'tileset.json');
    var buildingsLength = gltfs.length;
    var batchLength = buildingsLength;
    var geometricError = 100.0;

    var region = [4.45, 51.88, 4.50, 51.93]
        .map(function(num){ return util.degreeToRadian(num);});
    region = region.concat([0,100]); //[minHeight, maxHeight]

    var tilesetJson = createTilesetJsonSingle({
        contentUri : contentUri,
        geometricError : geometricError,
        region : region,
        transform : transform
    });

    if (!options.legacy) {
        Extensions.addExtensionsUsed(tilesetJson, '3DTILES_batch_table_hierarchy');
        Extensions.addExtensionsRequired(tilesetJson, '3DTILES_batch_table_hierarchy');
    }

    var featureTableJson = {
        BATCH_LENGTH : batchLength
    };

    //所有的gltf转换为一个b3dm后输出到output
    return Promise.map(gltfs, function(gltfSetting) {
        return fsExtra.readJson(gltfSetting.url)
            .then(function (gltf) {
                var meshes = [], batchId = gltfSetting.id;
                for (var mesh_index = 0; mesh_index < gltf.meshes.length; mesh_index++) {   //added to account for multiple meshes
                    for (var primitive_index = 0; primitive_index < gltf.meshes[Object.keys(gltf.meshes)[mesh_index]].primitives.length;primitive_index++){ //added to account for multiple primitives
                        var buildingTransform = wgs84Transform(util.degreeToRadian(gltfSetting.location[0]), util.degreeToRadian(gltfSetting.location[1]), gltfSetting.location[2]);
                        meshes.push(Mesh.fromGltf(gltf, mesh_index, primitive_index, batchId, buildingTransform));
                    }
                }
                return meshes;
            });
        }).then(function (meshes){
                var batchedMesh = Mesh.batch(meshes);
                return createGltf({
                    mesh : batchedMesh,
                    optimizeForCesium : options.optimizeForCesium,
                    useBatchIds: true
                });
            }).then(function(glb) {
                var b3dm = createB3dm({
                    glb : glb,
                    featureTableJson : featureTableJson,
                    batchTableJson : batchTableJson,
                    batchTableBinary : batchTableBinary
                });

                return Promise.all([
                    saveTilesetJson(tilesetJsonPath, tilesetJson, options.prettyJson),
                    saveTile(tilePath, b3dm, options.gzip)
                ]);
            });
}

function createFloatBuffer(values) {
    var buffer = Buffer.alloc(values.length * sizeOfFloat);
    var length = values.length;
    for (var i = 0; i < length; ++i) {
        buffer.writeFloatLE(values[i], i * sizeOfFloat);
    }
    return buffer;
}

function createUInt16Buffer(values) {
    var buffer = Buffer.alloc(values.length * sizeOfUint16);
    var length = values.length;
    for (var i = 0; i < length; ++i) {
        buffer.writeUInt16LE(values[i], i * sizeOfUint16);
    }
    return buffer;
}

function createBatchTableBinary(batchTable, options) {
    var byteOffset = 0;
    var buffers = [];

    function createBinaryProperty(values, componentType, type) {
        var buffer;
        if (componentType === 'FLOAT') {
            buffer = createFloatBuffer(values);
        } else if (componentType === 'UNSIGNED_SHORT') {
            buffer = createUInt16Buffer(values);
        }
        buffer = getBufferPadded(buffer);
        buffers.push(buffer);
        var binaryReference = {
            byteOffset : byteOffset,
            componentType : componentType,
            type : type
        };
        byteOffset += buffer.length;
        return binaryReference;
    }

    // Convert regular batch table properties to binary
    var propertyName;
    for (propertyName in batchTable) {
        if (batchTable.hasOwnProperty(propertyName)
        && propertyName !== 'HIERARCHY'
        && propertyName !== 'extensions'
        && propertyName !== 'extras') {
            if (typeof batchTable[propertyName][0] === 'number') {
                batchTable[propertyName] = createBinaryProperty(batchTable[propertyName], 'FLOAT', 'SCALAR');
            }
        }
    }

    // Convert instance properties to binary
    var hierarchy = options.legacy ? batchTable.HIERARCHY : batchTable.extensions['3DTILES_batch_table_hierarchy'];
    var classes = hierarchy.classes;
    var classesLength = classes.length;
    for (var i = 0; i < classesLength; ++i) {
        var instances = classes[i].instances;
        for (propertyName in instances) {
            if (instances.hasOwnProperty(propertyName)) {
                if (typeof instances[propertyName][0] === 'number') {
                    instances[propertyName] = createBinaryProperty(instances[propertyName], 'FLOAT', 'SCALAR');
                }
            }
        }
    }

    // Convert classIds to binary
    hierarchy.classIds = createBinaryProperty(hierarchy.classIds, 'UNSIGNED_SHORT');

    // Convert parentCounts to binary (if they exist)
    if (defined(hierarchy.parentCounts)) {
        hierarchy.parentCounts = createBinaryProperty(hierarchy.parentCounts, 'UNSIGNED_SHORT');
    }

    // Convert parentIds to binary (if they exist)
    if (defined(hierarchy.parentIds)) {
        hierarchy.parentIds = createBinaryProperty(hierarchy.parentIds, 'UNSIGNED_SHORT');
    }

    return Buffer.concat(buffers);
}

function createBatchTableJson(instances, options) {
    // Create batch table from the instances' regular properties
    var batchTable = {};
    var instancesLength = instances.length;
    for (var i = 0; i < instancesLength; ++i) {
        var instance = instances[i];
        var properties = instance.properties;
        if (defined(properties)) {
            for (var propertyName in properties) {
                if (properties.hasOwnProperty(propertyName)) {
                    if (!defined(batchTable[propertyName])) {
                        batchTable[propertyName] = [];
                    }
                    batchTable[propertyName].push(properties[propertyName]);
                }
            }
        }
    }

    var hierarchy = createHierarchy(instances);
    if (options.legacy) {
        // Add HIERARCHY object
        batchTable.HIERARCHY = hierarchy;
    } else {
        Extensions.addExtension(batchTable, '3DTILES_batch_table_hierarchy', hierarchy);
    }
    return batchTable;
}

function createHierarchy(instances) {
    var i;
    var j;
    var classes = [];
    var classIds = [];
    var parentCounts = [];
    var parentIds = [];
    var instancesLength = instances.length;
    var classId;
    var classData;

    for (i = 0; i < instancesLength; ++i) {
        var instance = instances[i].instance;
        var className = instance.className;
        var properties = instance.properties;
        var parents = defaultValue(instance.parents, []);
        var parentsLength = parents.length;

        // Get class id
        classId = undefined;
        classData = undefined;
        var classesLength = classes.length;
        for (j = 0; j < classesLength; ++j) {
            if (classes[j].name === className) {
                classId = j;
                classData = classes[j];
                break;
            }
        }

        // Create class if it doesn't already exist
        if (!defined(classId)) {
            classData = {
                name : className,
                length : 0,
                instances : {}
            };
            classId = classes.length;
            classes.push(classData);
            var propertyNames = Object.keys(properties);
            var propertyNamesLength = propertyNames.length;
            for (j = 0; j < propertyNamesLength; ++j) {
                classData.instances[propertyNames[j]] = [];
            }
        }

        // Add properties to class
        for (var propertyName in properties) {
            if (properties.hasOwnProperty(propertyName)) {
                if (defined(classData.instances[propertyName])) {
                    classData.instances[propertyName].push(properties[propertyName]);
                } else {
                    classData.instances[propertyName] = [];
                    classData.instances[propertyName].push(properties[propertyName]);
                }

            }
        }

        // Increment class instances length
        classData.length++;

        // Add to classIds
        classIds.push(classId);

        // Add to parentCounts
        parentCounts.push(parentsLength);

        // Add to parent ids
        for (j = 0; j < parentsLength; ++j) {
            var parent = parents[j];
            var parentId = instances.indexOf(parent);
            parentIds.push(parentId);
        }
    }

    // Check if any of the instances have multiple parents, or if none of the instances have parents
    var singleParents = true;
    var noParents = true;
    for (i = 0; i < instancesLength; ++i) {
        if (parentCounts[i] > 0) {
            noParents = false;
        }
        if (parentCounts[i] > 1) {
            singleParents = false;
        }
    }

    if (noParents) {
        // Unlink parentCounts and parentIds
        parentCounts = undefined;
        parentIds = undefined;
    } else if (singleParents) {
        // Unlink parentCounts and add missing parentIds that point to themselves
        for (i = 0; i < instancesLength; ++i) {
            if (parentCounts[i] === 0) {
                parentIds.splice(i, 0, i);
            }
        }
        parentCounts = undefined;
    }

    return {
        instancesLength : instancesLength,
        classes : classes,
        classIds : classIds,
        parentIds : parentIds,
        parentCounts : parentCounts
    };
}

function createInstances(){
    var building0 = {
        instance : {
            className : 'Building',
            properties : {
                building_name : 'building0',
            }
        },
        properties : {
            name: '{D25C4B18-E703-458E-8789-212E33DA60AC}',
            terrainHeight: 1.1,
            status: 1,
            height : 5.0,
            area : 10.0
        }
    };

    var building1 = {
        instance : {
            className : 'Building',
            properties : {
                building_name : 'building1',
            }
        },
        properties : {
            name: '{533046F0-C276-4850-80EF-D951262963DD}',
            terrainHeight: 3.04,
            status: 1,
            height : 5.0,
            area : 10.0
        }
    };
    return [building0, building1];
}

function getIndexFromInstances(instances, gltfName){
    for(var i=0; i<instances.length; i++){
        if(instances[i].properties.name === gltfName){
            return i;
        }
    }
    console.log(gltfName + ' is not found in the instances. It would be processed with the batchId 0 instead. Please check again!');
    return 0;
}

/**
 * read gltfs from xml file
 * @param {string} filePath
 * @returns {Array{object}} gltfs [{name, id, url, location, orientation.heading}]
 */
function loadDataFromXml(filePath, fileName) {
    var gltfs = [];
    try {
        var data = fs.readFileSync(path.join(filePath, fileName));
        var xml_string = data.toString();
        xmlreader.read(xml_string, function (err, res) {
            if (err) return console.log(err);
            console.log('Number of gltfs: ' + res.kml.Document.Placemark.count());
            res.kml.Document.Placemark.each(function (i, place) {
                let gltf = {};
                gltf.name = place.name.text();
                gltf.id = i; //i is saved as gltf id, later used as batchId
                gltf.location = [parseFloat(place.Model.Location.longitude.text()), parseFloat(place.Model.Location.latitude.text()), parseFloat(place.Model.Location.altitude.text())];
                gltf.orientation = { heading: parseFloat(place.Model.Orientation.heading.text()) }
                var gltfPath = place.Model.Link.href.text().split('.dae')[0] + '.gltf';
                gltf.url = path.join(filePath, gltfPath);
                gltfs.push(gltf);
            });
        });
    } catch (error) {
    console.error(error);
}
return gltfs;
}