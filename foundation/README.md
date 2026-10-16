Local stand-in for the shared `foundation` repo (vbgm-org/foundation).
Components here are written to be moved into `submodules/foundation` later
and shared with Ordner; they must not import anything from `/src`.

- `dnd/`: the pointer-events drag engine (`index.js`) and its displace mode
  (`displace.js`); target mode for trees is still to come.
