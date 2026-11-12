// Read-only. Every component used on the three pages / template, all variants, full depth,
// plus the external module list (Smooth Scroll, Ticker, Animated Number Counter, ...).
// Result saved as docs/extraction/raw/05-components.json.gz. tree.changedNodeCount: 0
const { tree } = api
const ids = ["rJrFn94Y9","R2GwKZ_X8","wgE4xF2So","nh6yvBpJu","c6u4zLoAj","YHVFtKKGl","Uu9UKaNP4","CczggbDZK","ZMWq6ryX_","ubjPQnPS8","bFAdQEipB","QtnGPi4Hi","AGb8tzb9V","avDWc9G7y","WbNejK37I","nvfIJTuv1","CXG4KfCnd","XNap6uYIo"]
const out = {}
for (const id of ids) out[id] = await tree.serialize(id, { depth: 99 })
out.ext = await tree.serializeNodes(tree.getNodesOfTypes("ExternalModuleNode"), { depth: 0 })
return JSON.stringify(out)
