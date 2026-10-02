# Expedition journal — art direction pilot

Prepared on 2026-10-02. The machine-readable local inventory is [journal-assets.json](journal-assets.json). It records source and output dimensions, SHA-256, transformations, variants and intended use. Official illustrations retain their colors, watercolor edges and transparency. No creature has been assigned a new canonical role or dialogue.

## Official material

Sources are the existing sibling `wallet/public/images` library. Garuda accompanies Camp; Bahana accompanies Governance; the golden botanical motif from `criatures/fu.png` accompanies Treasury and the Council margin. Sumanga is prepared for a future Field guide revision, but is not used by these three pilots. White wallet navigation symbols are copied unchanged and paired with explicit labels. Departure retains a functional exit icon because none of the selected official symbols clearly means exit.

Brand and token artwork in `public/brand` and the locally served Cinzel Decorative font are reused unchanged. The manifest also inventories these dependencies. USDC and USDC.e share their issuer's symbol but remain distinct named and addressed assets. Body text and numbers retain the wallet's system font family; no font is fetched from a third-party service.

The output paths are `public/journal/{garuda,garuda-small,bahana,golden-fronds,sumanga,map,map-small}.webp` and `public/journal/nav/*.png`. Existing ImageMagick was used only for resizing and WebP encoding. No dependencies were installed. Responsive images have explicit dimensions; art outside the opening is lazy-loaded. The same original colors are used in both themes; surrounding surfaces adapt to the selected theme.

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
