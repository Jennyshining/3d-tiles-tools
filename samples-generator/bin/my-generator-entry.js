#!/usr/bin/env node
'use strict';
var generate = require('../lib/myGenerator');
// var util = require('../lib/utility');
// var wgs84Transform = util.wgs84Transform;

generate({
    directory : './samples-generator/output/MyTestTileset',
    // transform : wgs84Transform(util.degreeToRadian(4.4889609), util.degreeToRadian(51.9072021), 0.0),
    gzip : false
});