# Cosmetic catalog

This is a static Jekyll page at `/mechanics/cosmetics/preview/`. It needs no OreMine backend or login. The PNG skin selected by a visitor is processed locally and is not uploaded anywhere. Optional nickname lookup fetches the public PNG skin from `https://mc-heads.net/skin/{nickname}`; only the typed nickname is sent, without credentials or a referring-page URL.

Catalog source: the supplied OreCosmetic `skins.json`, `packs.json` and `config.json`. Models and equipment textures: the supplied Nexo item definitions and resource packs, including `pack/external_packs`. Credits embedded in the original JSON models are retained. Three.js is vendored with its MIT license at `assets/js/vendor/THREE-LICENSE.txt`.

The downloaded repository starts from commit `02ac880` (main). The previous working copy is left at `../oremineinc.github.io`.

To refresh assets, install `yaml` and `three@0.180.0` in a separate tools directory. Set `COSMETICS_TOOLS` to its package.json if it is not `../work/cosmetics-tools/package.json`. Extract resource-pack `assets/` trees to a temporary directory, including external packs, then run:

    node tools/import-cosmetics.mjs "path/to/OreCosmetic" "path/to/Nexo" "path/to/extracted-pack" ["path/to/archived-Nexo" ...]

The importer resolves parent models, texture references and Nexo equippable assets. It searches the extracted pack, current `pack/assets` and current `pack/external_packs/*/assets`, then optional archived Nexo folders. Archives only fill absent files; they never override present current-wipe assets or shop definitions. It normalizes legacy `.png` suffixes and uses the corresponding original armor layer texture when the equipment JSON names an absent file. Source server files are not modified.

`assets/cosmetics/import-report.json` lists unresolved source references and models recovered from archives. All 446 catalog entries currently have previews. Ten previously unresolved Forge models came from the current wipe's external pack; `plny_eternal_bones_set_axe` and `shadowsteel_axe` came from `Вайп10/Резерв/Nexo`. The wipe09 Nexo folder was also supplied as a lower-priority fallback. Original model geometry and textures are used; replacement geometry is not invented.

The default Minecraft player skin is copied from the extracted Minecraft assets reference:
https://github.com/InventivetalentDev/minecraft-assets/blob/1.21.8/assets/minecraft/textures/entity/player/wide/steve.png

Preview limitations: browser lighting and camera framing are illustrative. Base item, first-person, third-person and head display transforms are read from original models where supplied. Only the equipped static pose is shown; bow charging, combat animation and special in-game shader effects are not reproduced. Regular texture atlas animations are supported. Classic and slim player arms and legacy 64×32 skins are supported.

First-person rendering uses Minecraft's resting item offset `(±0.56, -0.52, -0.72)` blocks and a 70° vertical item FOV, with no added yaw or skin-arm mesh. The character/item-view Z reflection is undone before the original resource-pack display transform is applied in camera space. Large models can extend beyond the viewport, as in the game; they are not automatically shrunk to fit.

The hand view uses a 16:10 viewport even on narrow screens so the held item is not cropped out by a portrait canvas. Player and standalone-item views retain their taller inspection area.

Meshes use front-face rendering, matching the resource-pack's outer and inverted inner shells. Double-sided rendering would expose the inside of inflated shells and cover the Ender texture with solid pink surfaces. Winding is corrected for Z-reflected cuboid caps, mirrored player/armor limbs, and generated sprites. Texture colors are preserved.

Wearable helmets may have a separate `wearModel` from their inventory model. Dark Loyal's shop item is `dark_loyal_armor_helmet`, whose equipment atlas has a transparent base-head UV region and whose inventory model is flat. The importer resolves the same pack's `dark_loyal_helmet` HEAD-equippable 3D model for fitting instead. Shop IDs, prices, inventory thumbnails and source server configuration remain unchanged.

Texture-based helmets render both humanoid head UV regions: the base head at `(0, 0)` with an inflation of 1 pixel, and the outer hat at `(32, 0)` with an inflation of 1.5 pixels. Wither and Zero Armor 09/10 place most helmet details in the outer region. Transparent pixels remain transparent; no source textures are recolored or replaced.

Fitting controls: an occupied slot removes its item, while an empty slot filters the catalog to wearable armor for that body part or available hand-held items. Hand-held catalog cards open an accessible native dialog before equipping; cancelling leaves the loadout unchanged. Choosing a hand replaces only that hand's item. The clear button saves a memory-only snapshot and becomes a restore button, restoring all six slots exactly even if a new item has since been equipped. Refreshing the page clears that snapshot.

The Packs category shows shop packs as searchable, sortable and paginated cards, with a full-outfit thumbnail for armor packs and a representative item for weapon-only packs. Opening a card shows only that pack's skins and a back button. Both equip-pack buttons use the same default outfit: the first available wearable item for each armor slot, an available SWORD whose item ID contains `sword` (falling back to the first available SWORD) in the right hand and the first available shield in the left hand. Missing slots are emptied, never borrowed from another pack. Individual items can still be equipped or moved to either hand afterwards. Pack thumbnails use the default player skin, independently of a visitor's skin.

The production catalog includes three selectable layouts: **Витрина** (`gallery`), **Список** (`list`), and **Фокус** (`focus`). Gallery uses large pack cards, List compact pack rows, and Focus a persistent searchable pack list beside the catalog (above it on mobile). All layouts share one DOM and one fitting renderer. Switching does not reload models or reset equipment, skin, camera, catalog category, filters, pagination, or the clear/restore snapshot. Preference is stored locally under `oremine-cosmetic-layout` when storage is available. A validated `?layout=gallery|list|focus` URL takes priority over the saved preference. Keyboard left/right and Home/End work only while a layout button is focused. Without WebGL, the catalog and layout controls remain available.

Nickname lookup accepts Minecraft Java names (3–16 letters, digits or underscores), has a 20-second timeout, validates the PNG signature and supported dimensions, and preserves the previous skin on failure. File uploads and reset cancel pending lookups so late responses cannot overwrite a newer selection. The manual Alex checkbox remains available. A server-specific skin may differ from the public nickname skin; visitors can upload their PNG instead.
