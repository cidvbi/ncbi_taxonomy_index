var fs = require('fs-extra');
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var All= require("promised-io/promise").all;

var getIndex = exports.getIndex  = function(indexFile, options){
	var def = new defer();

	fs.exists(indexFile + ".tree.json", function(exists){
		if (exists) {
			when(getTreeIndex(indexFile,null,options), function(tree){
				when(setupTreeReferences(tree), function(index){
					def.resolve(index);
				});	
			});	
		}else {
			when(getNodeIndex(indexFile,options),function(nodeIndex){
				when(getTreeIndex(indexFile,nodeIndex,options),function(treeIndex){
					def.resolve({all:nodeIndex.rows,byId:nodeIndex, tree: treeIndex});
//						return {tree: treeIndex};
				});
			});
	
		}
	});

	return def.promise;
}

var setupTreeReferences = exports.setupTreeReferences = function(root,ref){
	var references = ref = {all: [], byId:{}, tree: root}

	function walk(tree,parentRef){
		ref.all.push(tree,ref);
		ref.byId[tree.taxon_id]=tree;
		if (parentRef) { tree['parent']=parentRef; }
		if (tree.children) {
			tree.children.forEach(function(child){
				walk(child,tree);
			});
		}			
	}

	walk(root);

	return references;
}
var getTreeIndex= exports.getTreeIndex= function(indexFile,nodeIndex,options) {
	var def = new defer();
	console.log("\tGet Tree Index " + indexFile + ".tree.json....");
	fs.exists(indexFile + ".tree.json", function(exists){
		if (exists){
			console.log("\tLoading Tree Index from existing file...");	
			fs.readJson(indexFile + ".tree.json", function(err, data){
				console.log("\t\tLoaded Tree Data From File");
				def.resolve(data);
			});
		}else{
			if (!nodeIndex) { console.log("Existing .node.json index needed to build tree.");def.reject(false);return; }
			console.log("\tNo existing tree index file.  Generate a new one.");
			when(buildTree(indexFile,nodeIndex), function(treeIndex){
				console.log("New Tree Generation Complete");
				def.resolve(treeIndex);
			});			

		}
	});
	return def.promise;
}



var getNodeIndex= exports.getNodeIndex= function(indexFile, options) {
	var def = new defer();
	console.log("\tLooking for Array Index in " + indexFile + ".array.json ....");
	fs.exists(indexFile + ".array.json", function(exists){
		if (exists){
			console.log("\t\tRead Array Index from Disk: ", indexFile + ".array.json");
			fs.readJson(indexFile + ".array.json", function(err, data){
				var nodeIdx = {rows: data};
				data.forEach(function(row){
					nodeIdx[row.taxon_id]=row;
				});
				console.log("\t\t\tArray Index Loaded from disk");
				def.resolve(nodeIdx);
			});
		}else{
			console.log("\tBuild Node Index");
			buildNodeIndex(options.dumpdir,options.output).then(function(nodeIdx){
				console.log("\t\tNode Index Loaded: ", typeof nodeIdx);
				buildNameIndex(options.dumpdir,options.output, nodeIdx).then(function(nameIdx){
					console.log("\t\t\tNew Node Index Build Completed");
					def.resolve(nodeIdx);	
				});
			});
		}
	});
	return def.promise;
}

var buildTree = exports.buildTree = function(indexFile, nodeIndex){
	var def = new defer();
	var treeIndex = {}
	var retry=[]
	if (!nodeIndex) { throw new Error("NodeIndex required to build tree index"); }
	nodeIndex.rows.forEach(function(row){
		if (row && row.parent_id){
			if (nodeIndex[row.parent_id]) {
				if (!nodeIndex[row.parent_id].children){
					nodeIndex[row.parent_id].children=[row]
				}else{
				
					if (nodeIndex[row.parent_id].children.some(function(child){
						return child===row;
					})){
						return;
					}else{
						nodeIndex[row.parent_id].children.push(row);
					}
				}
			}
		}
	});

	treeIndex = nodeIndex["2"];
	console.log("\t\t\tWrite Reference Tree Index to disk: ", indexFile + ".tree.json");
	
	fs.writeJson(indexFile + ".tree.json",treeIndex, function(err) {
		console.log("\t\t\tTree Write Complete");
		def.resolve(treeIndex);
	});

	return def.promise;
}



var buildNameIndex = exports.buildNameIndex = function(path,indexFile,nodeIndex) {
	var def = new defer();
	console.log("\t\tLooking For Names Index: ", indexFile + ".names.json");
	fs.exists(indexFile + ".names.json", function(exists){
		if (exists) {
			console.log("\t\tReading Existing names index from disk.");
			fs.readJson(indexFile + ".names.json", function(err,data){
				if (nodeIndex) {
				data.forEach(function(rowObj) {
				//	console.log("rowObj.taxon_id:", rowObj.taxon_id, nodeIndex[rowObj.taxon_id]);	
					if (nodeIndex && nodeIndex[rowObj.taxon_id]){
						Object.keys(rowObj).filter(function(key){ return key!="taxon_id" }).forEach(function(key){
							if (rowObj[key]) {
//								console.log("tid: ", rowObj.taxon_id, "rowObj[key]:", rowObj[key]);
//								console.log("Indexed: ", nodeIndex[rowObj.taxon_id]);
//								console.log("key: ", key);
								nodeIndex[rowObj.taxon_id][key]=rowObj[key];
							}
						});
					}
				});

					console.log("\twriteArrayIndex: ", indexFile + ".array.json");
					fs.writeJson(indexFile + ".array.json",nodeIndex.rows, function(err) {
						console.log("\t\tBuild Tree");
						def.resolve(nodeIndex);
					});
				}else{
					return def.resolve(data);
				}
			});
		}else{
		console.log("Read file: ", path + "/names.dmp");
		var stream = readFile(path + "/names.dmp");
		var wstream = fs.createWriteStream(indexFile + ".names.json", {flags:'w'});
		wstream.write("[");
		var index = []; 
		var byId={};
		var bufferedRows=[];
		var rows = 0;
		var maxRows = 10;
		var buf = ''
		var row = [];
		var rowObj={}
		var fieldBuf= ''
		var leftover;
		var writtenRows=0;
		var keepColumns = ["taxon_id","nameText","uniqueName", "nameClass"]
		columns=["taxon_id","nameText","uniqueName","nameClass"];
		var start = new Date().valueOf();;
		var lastTime;	
		stream.addListener('data', function (data) {
			stream.pause();
			var idx=0;
			for (var idx=0;idx<data.length;idx++){
				var char = data.charAt(idx);
				if (idx>2 && (char == '\n') || (char == '\t')){
//					console.log("char: ", char, " char-1: ", data[idx-1], " char-2: ",data[idx-2]);
					if ((char == '\t')&&(data.charAt([idx-1])=="|")&&(data.charAt([idx-2])=="\t")){
//						console.log("Field: ",row.length, fieldBuf);
						row.push(fieldBuf);fieldBuf='';
					}else if((char == '\n')&&(data[idx-1]=="|") && (data[idx-2]=="\t") ){
						//console.log(rows++);
						
						if (!(rows % 10000)){
						var cur = new Date().valueOf();
						var avgRead = (cur-start)/writtenRows;
						console.log("Read 10000 Rows. Current: " + rows, "Avg Read Per Record: ", avgRead); 
					}
					rows++;		
					row.forEach(function(val,i){ if (keepColumns.indexOf(columns[i])!=-1){rowObj[columns[i]]=val;} });
					//console.log(rowObj);
//					byId[rowObj.taxon_id]=rowObj;
					index.push(rowObj);
					if (nodeIndex && nodeIndex[rowObj.taxon_id]){
						Object.keys(rowObj).forEach(function(key){

							if (rowObj[key]) {
								nodeIndex[rowObj.taxon_id][key]=rowObj[key];
							}
						});
					}
					bufferedRows.push(rowObj);
					row=[];rowObj={};
					fieldBuf="";

					if (bufferedRows.length>7500) {
							
						wstream.write(((writtenRows>0)?",":"") +bufferedRows.map(function(o){return JSON.stringify(o)}).join(","));
						writtenRows += bufferedRows.length;
						var cur = new Date().valueOf();
						var avgWrite = (cur-start)/writtenRows;
						console.log("Wrote: " + bufferedRows.length + " Total: " + writtenRows, "avg write per record: ", avgWrite);
						
						bufferedRows=[];
					}
					}
	
				}else if (char == "|"){
					if (data.charAt([idx-1])!="\t"){
						fieldBuf+=char;	
					}
				}else{
					fieldBuf+=char;
				}
			}

			stream.resume();

		});

		stream.on('end', function(){
			if (bufferedRows.length>0) {                                                
				wstream.write(((writtenRows>0)?",":"")+bufferedRows.map(function(o){
					return JSON.stringify(o)
				}).join(",") + "]");
				writtenRows += bufferedRows.length;
			}	
	
			wstream.end();
			console.log("Loaded ", rows, " rows");
			if(nodeIndex) {
				fs.writeJson(indexFile + ".array.json",nodeIndex.rows, function(err) {
					console.log("Finished");	
					def.resolve(nodeIndex);
				});
			}else{
				def.resolve(index);
			}
		});
		}
	});			
	return def.promise;
}



var buildNodeIndex = exports.buildNodeIndex = function(path,indexFile) {
	var def = new defer();
	var index = {
		rows:[]
	} 
	
	fs.exists(indexFile + ".nodes.json", function(exists){
		if (exists) {
			fs.readJson(indexFile + ".nodes.json", function(error, data){
				index.rows=data;

				index.rows.forEach(function(row,i){
					index[row.taxon_id]=row;
				});

				def.resolve(index);
			});
		}else{

	var stream = readFile(path + "/nodes.dmp");
	var wstream = fs.createWriteStream(indexFile + ".nodes.json", {flags:'w'});
	wstream.write("[");
	var byId={};
	var bufferedRows=[];
	var rows = 0;
	var maxRows = 10;
	var buf = ''
	var row = [];
	var rowObj={}
	var fieldBuf= ''
	var leftover;
	var writtenRows=0;
	var keepColumns = ["taxon_id","parent_id","rank","genticCodeId"];
	columns=["taxon_id","parent_id","rank","emblCode","divisionCode","inheritedDiv","geneticCodeId","inheritedGC","mitochondrialGeneticCodeId","inheritedMGC","genbankHidden","hiddenSubtree","comments"];
	var start = new Date().valueOf();;
	var lastTime;	
	stream.addListener('data', function (data) {
		stream.pause();
		var idx=0;
		for (var idx=0;idx<data.length;idx++){
			var char = data.charAt(idx);
			if (idx>2 && (char == '\n') || (char == '\t')){
//				console.log("char: ", char, " char-1: ", data[idx-1], " char-2: ",data[idx-2]);
				if ((char == '\t')&&(data.charAt([idx-1])=="|")&&(data.charAt([idx-2])=="\t")){
//					console.log("Field: ",row.length, fieldBuf);
					row.push(fieldBuf);fieldBuf='';
				}else if((char == '\n')&&(data[idx-1]=="|") && (data[idx-2]=="\t") ){
					//console.log(rows++);
				
					if (!(rows % 10000)){
						var cur = new Date().valueOf();
						var avgRead = (cur-start)/writtenRows;
						console.log("Read 10000 Rows. Current: " + rows, "Avg Read Per Record: ", avgRead); 
					}
					rows++;		
					row.forEach(function(val,i){ if (keepColumns.indexOf(columns[i])!=-1){rowObj[columns[i]]=val;} });
					//console.log(rowObj);
//					byId[rowObj.taxon_id]=rowObj;
					index[rowObj.taxon_id]=rowObj;
					index.rows.push(rowObj);
					bufferedRows.push(rowObj);
					row=[];rowObj={};
					fieldBuf="";

					if (bufferedRows.length>7500) {
							
						wstream.write(((writtenRows>0)?",":"") +bufferedRows.map(function(o){return JSON.stringify(o)}).join(","));
						writtenRows += bufferedRows.length;
						var cur = new Date().valueOf();
						var avgWrite = (cur-start)/writtenRows;
						console.log("Wrote: " + bufferedRows.length + " Total: " + writtenRows, "avg write per record: ", avgWrite);
						
						bufferedRows=[];
					}
				}

			}else if (char == "|"){
				if (data.charAt([idx-1])!="\t"){
					fieldBuf+=char;	
				}
			}else{
				fieldBuf+=char;
			}
		}

		stream.resume();

	});

	stream.on('end', function(){
		if (bufferedRows.length>0) {                                                
			wstream.write(((writtenRows>0)?",":"")+bufferedRows.map(function(o){
				return JSON.stringify(o)
			}).join(",") + "]");
			writtenRows += bufferedRows.length;
		}	

		wstream.end();
		console.log("Loaded ", rows, " rows");
		def.resolve(index);
	});
	}
	});
			
	return def.promise;
}

//get the filesystem module

var readFile = function(path) {
	console.log("Create Read Stream: ", path);
	return fs.createReadStream(path, {
		flags: 'r',
		encoding: 'utf-8',
		fd: null,
		bufferSize: 200000
	})
}

