#!/usr/bin/env node

var argv = require("optimist");
var when = require("promised-io/promise").when;
var defer = require("promised-io/promise").defer;
var All = require("promised-io/promise").all;
var fs = require('fs-extra');
var request = require('request');
var Path = require("path");
var Tar = require("tar");
var gzip = require("zlib").createGzip();
var getIndex = require("./buildIndex").getIndex;
var buildNameIndex = require("./buildIndex").buildNameIndex;
var pkg = fs.readJsonSync(Path.join(__dirname,"package.json"));
var repl = require('repl');

var Query = require("rql/js-array").query;

global.query = function(q,opts){
	return Query(q,opts, global.ncbi_taxonomy_index.all);
}

var argv = require("optimist")
	.usage('NCBI Taxonomy Parser ' + pkg.version + "\n\n$0")
	.alias("f","file")
	.describe("f", "Path To taxdump.tar.gz")
	.demand("o")
	.alias("o","output")
	.describe("o","output index file")
	.default("o",__dirname + "/ncbi_index")
	.demand("d")
	.alias("d","dumpdir")
	.describe("d","Directory taxdump.tar.gz will be expanded into")
	.default("d",__dirname + "/dump")
	.describe("u", "Load Data from Dump Dir")
	.alias("u", "usedumpdir")
	.default("u", true)
	.describe("C","Don't erase the expanded dump files on completion")
	.alias("C", "nocleanup")
	.argv;



	if (argv.usedumpdir) {
		getIndex(argv.output, {dumpdir: argv.dumpdir,output: argv.output}).then(function(index){
			global.ncbi_taxonomy_index=index;

			global.getDescendantsFlat = function(id){
				return getDescFlat(id).map(function(t){
					return t.taxon_id;
				});
			}

			var getDescFlat = function(id){
				var descendants=[id];
				var tree = global.ncbi_taxonomy_index.byId[id];
				if (tree) {
					console.log("Get Children of: ", tree.taxon_id);
					if (tree.children){
						var children=[];
						tree.children.forEach(function(child){
							children = children.concat(getDescFlat(child));
						});

						descendants = descendants.concat(children);
					}
				}
				return descendants;			
			}

			var getChildren = global.getChildren = function(id, maxDepth) {
						
				var tree = (typeof id=="object")?id:global.ncbi_taxonomy_index.byId[id];
			
				if (tree) {
					var item = {}
					for (prop in tree) {
						if (tree[prop] && prop!="children" && prop!="parent") {
							item[prop]=tree[prop];
						}
					}
	
					var children;
					if (maxDepth>0) {
					//	console.log("MaxDepth: ", maxDepth);
					//	console.log("Get Children of: ", tree.taxon_id);
						if (tree.children){
							children=tree.children.map(function(child){
								return getChildren(child,maxDepth-1)
							});

						}
					}else {
						if (tree.children) {
							children=tree.children.length;	
						}else {
							children=0;
						}
						
					}
					item.children=children;
					return item;
				}else{
					console.log("Not Found");
					return false;
				}
			}

			console.log("getChildren(TAXON_ID,MaxDepth) - returns tree heirarchy up to maxdepth")
			if (argv["_"] && argv["_"][0]) { 
				console.log('argv["_"]: ', argv["_"]);	
				var cmd=argv["_"].shift();
				when(global[cmd].apply(this,argv["_"]), function(res){
					console.log("Results: \n", res);	
				});
			}else {
				repl.start("taxonomy />");
			}
		});
	}else{
		fs.exists(argv.file, function(exists) {
			if (! exists) { console.log("File does not exist at " + argv.file); process.exit(1) }
			fs.mkdirs(argv.dumpdir, function(mkdirErr){
				if (mkdirErr) { throw mkdirErr }
				var gzp=false;
				if (argv.file.match(/\.[t]gz/)){
					gzp = true;	
					console.log("GZipped");
				}
				var str= fs.createReadStream(argv.file)
				
				if (gzp){
					str = str.pipe(gzip).pipe(Tar.Extract({path: argv.dumpdir }))
				}else{
					str = str.pipe(Tar.Extract({path: argv.dumpdir }))
				}
	
				str.on("error", function (err) {
					console.error("Error Extracting Dump Files" + err)
					process.exit(1);
				})
				.on("end", function () {
					console.error("done extraction")
				})
			});	
		});
	}
