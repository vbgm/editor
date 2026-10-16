Local stand-in for the shared `foundation` repo (vbgm-org/foundation).
Components here are written to be moved into `submodules/foundation` later
and shared with Ordner; they must not import anything from `/src`.

- `dnd/`: the pointer-events drag engine (`index.js`), its displace mode
  (`displace.js`, lists) and target mode (`target.js`, trees).
- `icon/`: stroke icons on Ordner's 128 × 128 grid (`shapes.js`), drawn in the
  text colour (`index.vue`).
