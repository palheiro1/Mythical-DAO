# Expedition journal — complete art direction

## Current organic compositions (2026-10-02)

The current portal replaces framed prints with seven dedicated transparent watercolor scenes created using the built-in **imagegen** tool, with the official illustrations as visual references: Grootslang for Treasury, Haechi for Council, Wati-kutjara for Delegation, Tulpar for Departure, Sumangâ for Planning/Chronicle, Şahmaran for the guide, and Garuda for Camp. These are adaptations, not unmodified official artwork or new canonical roles.

The exact prompts and generated source files are recorded in [organic-art-prompts.json](organic-art-prompts.json). Optimized responsive files are saved in `public/journal/organic/` as 480 px and 960 px WebPs, with actual alpha transparency. The [asset manifest](journal-assets.json) records provenance, dimensions and hashes. No image contains interface text. HTML navigation, forms and amounts remain readable if images fail.

The following sections document the preceding official-print implementation and the retained map; framed prints are no longer the current page openings.


Prepared on 2026-10-02. The machine-readable local inventory is [journal-assets.json](journal-assets.json). It records source and output dimensions, SHA-256, transformations, variants and intended use. Official illustrations retain their colors, watercolor edges and original paper or transparency. No creature has been assigned a new canonical role or dialogue.

## Official material

Sources are the existing sibling `wallet/public/images` library and `/home/usuario/MEGA/Illustrations/LowResolution`, supplied by the user. Garuda accompanies Camp. Grootslang now accompanies Treasury; its appetite for gems and association with a guarded treasure are described in `wallet/src/data/monsters.json`. Haechi accompanies Governance and proposal detail, with its documented association with justice and integrity. Wati-kutjara accompanies Delegation, Tulpar the Departure, Sumangâ the Planning table, and Şahmaran the Field guide. These are editorial associations drawn from the existing catalogue, not new canonical DAO offices or dialogue. Chronicle uses the cartographic illustration. Bahana remains in the inventory and prior deployment as the Stage A selection. White wallet navigation symbols are copied unchanged and paired with explicit labels. Departure retains a functional exit icon because none of the selected official symbols clearly means exit.

Brand and token artwork in `public/brand` and the locally served Cinzel Decorative font are reused unchanged. The manifest also inventories these dependencies. USDC and USDC.e share their issuer's symbol but remain distinct named and addressed assets. Body text and numbers retain the wallet's system font family; no font is fetched from a third-party service.

The output paths are listed individually in the manifest under `public/journal/`, alongside the existing navigation symbols. The five additions have full (709 px) and mobile (320 px) variants. Original JPEG illustrations are displayed as framed prints: their white paper, signatures and composition have not been removed, recolored or regenerated. Together the ten additional WebPs contain approximately 563 kB. The previous artwork is retained for rollback. Existing ImageMagick was used only for resizing and WebP encoding. No dependencies were installed. Responsive images have explicit dimensions; art outside the opening is lazy-loaded. The same original colors are used in both themes; surrounding surfaces adapt to the selected theme.

## Supplementary map

The simplified watercolor camp map is a new illustration generated with the built-in imagegen tool. Garuda and the golden fronds were supplied as stylistic references, not as creatures to recreate. All names, numbers and navigation are HTML overlays. If the raster fails, the links and destination directory remain usable. The expanded map is a keyboard-accessible dialog.

Generated source retained locally:

`/home/usuario/.codex/generated_images/01a0e7b7-7914-7f71-932b-8dced34414fd/exec-d5c542b0-abaf-4736-b4ff-e359f2906c7c.png`

### Generation prompt

Use case: illustration-story. Create a NEW complementary asset: a compact Seeker expedition camp map for the Mythical DAO web portal, landscape 3:2 composition, 1536x1024. Reference image 1 (Garuda) and reference image 2 (golden plant motif) are STYLE REFERENCES ONLY: match their traditional watercolor pigments, bold hand-painted flat shapes, white paper gutters, irregular cut-paper edges and restrained violet/teal/ochre palette. Do not reproduce or invent any creatures. Draw a simple illustrated field-journal map, slightly elevated top-down: central campfire and six clearly separated locations linked by spare dotted footpaths. Central fire at 50% x47%; upper-right provisions tent and chest at 78% x29%; upper-left cluster of three explorers' tents at23% x30%; lower-left wooden planning table with scroll at23% x66%; lower-right archive tent with books at78% x67%; bottom-centre departing path at50% x87%. A few stylized fern fronds and trees around outer corners. Keep large quiet areas and simple silhouettes legible at420x280. Transparent background outside the irregular pale ivory watercolor ground wash and between edge foliage. Watercolor on textured paper, flatter and simpler than a rendered fantasy landscape; no gradients that imitate 3D, no realistic forest, no scenic mountains, no figures, no faces, no banners, no words, no numbers, no symbols of currency, no logos, no UI. The six numbered HTML links will be added separately. Show the whole composition with breathing room around every edge.

## References and historical artwork

- Official site: https://mythicalbeings.io/ — watercolor artwork, decorative chapter titles, ivory/violet/gold.
- Wallet: https://my.mythicalbeings.io/ — navy masthead, explicit labeled navigation, local icon family, lime primary controls and operational clarity.
- The preceding full-page day/night camp remains documented in [CAMP_ASSETS.md](CAMP_ASSETS.md) and recoverable in commit `306d825`. It is not the active Camp artwork.
- The narrative follows the user's approved Seekers/camp description. The unavailable full Medium article was not treated as a source of additional lore.
