#!/usr/bin/env node

var optimist = require("optimist");
var when = require("promised-io/promise").when;
var defer = require("promised-io/promise").defer;
var All = require("promised-io/promise").all;
var fs = require('fs-extra');
var request = require('request');
var Path = require("path");
var targz = require("tar.gz");
var gzip = require("zlib").createGzip();
var getIndex = require("./buildIndex").getIndex;
var buildNameIndex = require("./buildIndex").buildNameIndex;
var pkg = fs.readJsonSync(Path.join(__dirname,"package.json"));
var repl = require('repl');

var Query = require("rql/js-array").query;


global.flattenDescendants = flattenDescendants = function(item) {
	if (typeof item=="string"){
		item = global.ncbi_taxonomy_index.byId[item]; 
	}
	var c={};
	for (var prop in item){
		if (prop=="children"){
			c.direct_children_count=item[prop].length;
		}else if (prop=="parent") {
			c.parent_id = item.parent.parent_id;
		}else{
			c[prop]=item[prop];
		}
	}	

	var children=[c];

	if (item.children){
		item.children.forEach(function(child){
			var descendants = flattenDescendants(child);
			children = children.concat(descendants);
		});
	}

	return children;
}

global.query = function(q,opts){
	return when(Query(q,opts, global.ncbi_taxonomy_index.all), function(results){
		return results.map(function(item){
			var r={};
			for (var prop in item){
				if (prop=="children"){
					//r.children=item[prop].length;
					r.direct_descendants=item[prop].length;
					r.all_descendants = 0;
					item.children.forEach(function(child){
						 r.all_descendants += global.flattenDescendants(child).length;
					});
				}else if (prop=="parent") {
					r.parent_id = item.parent.parent_id;
				}else{
					r[prop]=item[prop];
				}
			}
			return r;
		});
	});
}

var argv = optimist
	.usage('NCBI Taxonomy Parser ' + pkg.version + "\n\n$0")
	.alias("h","help")
	.alias("f","file")
	.describe("f", "Path To taxdump.tar.gz")
	.demand("o")
	.alias("o","output")
	.describe("o","output index file")
	.default("o",__dirname + "/ncbi_index")
	.demand("d")
	.alias("d","dumpdir")
	.describe("d","Directory taxdump.tar.gz will be expanded into")
	.default("d","./dump")
	.describe("u", "Load Data from Dump Dir")
	.alias("u", "usedumpdir")
	.default("u", true)
//	.describe("C","Don't erase the expanded dump files on completion")
//	.alias("C", "nocleanup")
	.argv;

	if (argv.help) {
		optimist.showHelp();
		process.exit(0);
	}

	function go() {
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
			console.log("COMMANDS: \n\n");

			console.log("getChildren(TAXON_ID,MaxDepth) - returns tree heirarchy up to maxdepth")
			console.log("flattenDescendants(TAXON_ID) - returns all descendants as a flat array")
			console.log("query(RQL_QUERY) - Queries the entire tree and returns a flat array of resultant nodes")

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
	}

	if (argv.usedumpdir){
		go();
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
				console.log("Extract File: ", argv.file);	
				new targz().extract(argv.file, argv.dumpdir ,function(err){
					if (err) { throw new Error(err); return; }
					console.log("Extraction Complete.");
					go();
				});	
			});	
		});
	}
