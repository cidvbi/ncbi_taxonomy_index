## ncbi-taxonomy-index

This script reads in NCBI's taxdmp.tar.gz files and generates an queryable index to the data.

### Installation

npm install ncbi-taxonomy-index  (local install)

or
 
npm install ncbi-taxonomy-index -g  (global install)

### Use

- download taxdump.tar.gz from NCBI 
- run ncbi_taxonomy (or ./node_modules/.bin/ncbi_taxonomy for a local install)

Options:
  -f, --file        Path To taxdump.tar
  -o, --output      output index file                               [required]  [default: "/Users/dmachi/work/p/ncbi_taxonomy_index/ncbi_index"]
  -d, --dumpdir     Directory taxdump.tar.gz will be expanded into  [required]  [default: "./dump"]
  -u, --usedumpdir  Load Data from Dump Dir                         [default: true]
 

Once the index has been generated, the -d and -u options will automatically load the generated index instead of re-parsing.  

After the index has been generated or loaded, you will be at a REPL prompt, where standard javascript can be used to inspect the index.  The following functions are available to help:

getChildren(TAXON_ID,MaxDepth) - returns tree heirarchy up to maxdepth
flattenDescendants(TAXON_ID) - returns all descendants as a flat array
query(RQL_QUERY) - Queries the entire tree and returns a flat array of resultant nodes

