export const ASSET_KEYS = {
  character: {
    player: "character-player",
  },

  environment: {
    grass: "env-grass",
    grass2: "env-grass-2",
    dirt: "env-dirt",
    treeSmall: "env-tree-small",

    childhoodTileset: "childhood-tileset",

    house: "childhood-house",
    fence: "childhood-fence",
    treeLarge: "childhood-tree",
    well: "childhood-well",
  },

  audio: {
    city: "ambience-city",
    room: "ambience-room",
    village: "ambience-village",
    childhoodBirds: "ambience-childhood-birds",

    crickets: "ambience-crickets",

    footsteps: "sfx-footsteps",
    childFootsteps: "sfx-child-footsteps",
    doorOpen: "sfx-door-open",
    sleep: "sfx-sleep",

    schoolBell: "sfx-school-bell",
  },
} as const;
