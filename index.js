#!/usr/bin/env node

var argv = require("optimist");
var when = require("promised-io/promise").when;
var defer = require("promised-io/promise").defer;
var All = require("promised-io/promise").all;
var fs = require('fs-extra');
var request = require('request');
ar Path = require("path");

var pkg = fs.readJsonSync(Path.join(__dirname,"package.json"));

var argv = require("optimist")
	.usage('Polyomic Runner ' + pkg.version + "\n\n$0")
	.demand("c")
	.alias("c","config")
	.default("c", "/etc/polyrun.conf")
	.describe("c", "Path to Polyrun Config")
	.alias("j","job")
	.describe("j", "Polyomic Job URL")
	.alias("f","file")
	.describe("f", "Polyomic Job JSON File")
	.describe("C","Skip Cleanup of Working Dir on Job Completion")
	.alias("C", "nocleanup")
	.check(function(a){
		if (!a.file && !a.job){ throw "ERROR: Missing Job id (-j) or Job JSON file (-f)\n" }
	})
	.argv;
