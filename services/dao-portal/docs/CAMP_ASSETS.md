# Camp artwork and typography

Created for the Mythical DAO portal redesign on 2026-10-02. These are original AI-generated illustrations, not historical depictions or official token artwork. The official brand and token symbols in ../public/brand remain unchanged.

## Illustrations

Generated using the built-in imagegen tool. The night image was an edit of the day composition, preserving the location of all six navigation targets. Text and interaction are HTML overlays in ../src/Camp.tsx, never baked into the images.

- day.webp and night.webp: 1536 × 1024, desktop/tablet.
- day-small.webp and night-small.webp: 768 × 512, mobile.
- Encoded from the generated source PNGs with existing ImageMagick; no runtime image or font service.
- The picture element selects the current theme and responsive size, with a reserved 3:2 layout. Navigation remains available when artwork fails.

Original generated files are retained locally:

- /home/usuario/.codex/generated_images/01a0e7b7-7914-7f71-932b-8dced34414fd/exec-662c98a8-4a9a-46d1-a61f-b94542ae5029.png
- /home/usuario/.codex/generated_images/01a0e7b7-7914-7f71-932b-8dced34414fd/exec-42c5b806-0244-41fc-aed9-cf0e39e042dc.png

### Day prompt

Use case: illustration-story. Asset type: original wide 2D illustrated interactive camp map for the Mythical DAO web portal, 1536x1024 landscape. A richly detailed hand-painted watercolor and fine ink expedition camp in a forest clearing, viewed from an elevated three-quarter overhead perspective, evocative of a collector's illustrated field journal about mythological creatures. Daytime, warm cream parchment ground, deep teal foliage, muted violet canvas tents, restrained golden ochre accents. Six DISTINCT locations with winding footpaths: CENTRAL at 50% x 48% a glowing campfire ring with benches (council); UPPER RIGHT at 77% x 30% a teal provision tent with wooden treasure chests (treasury); UPPER LEFT at 23% x 30% three small violet sleeping tents (seekers); LOWER LEFT at 23% x 64% a substantial outdoor mapmaking table with rolled parchment, compass and stools (planning); LOWER RIGHT at 77% x 65% a small canvas archive tent with books, scrolls and lantern (chronicle); BOTTOM CENTER at 50% x 86% a trail leading out of the clearing with a small blank wooden signpost (departure). Forest trees and ferns frame the outer edges, inviting sense of shared adventure, subtle mythical creature silhouettes hidden in the distant foliage, no people required. Refined European storybook/field-guide art, tactile paper, delicate linework, elegant and atmospheric, not a cartoon game HUD, not photorealistic or 3D. Full-bleed landscape map filling entire canvas, no outside parchment margin. Composition must have open ground near each location for HTML labels added separately. No text, letters, logos, numbers, labels, watermarks, UI, borders or typography.

### Night edit prompt

Use case: lighting-weather. Edit target: the supplied daytime camp illustration. Create its NIGHT variant for the identical interactive map. Preserve every tent, tree, rock, book, chest, path, signpost and their EXACT position, shape, scale, perspective and framing. Change ONLY lighting and color atmosphere: indigo and deep teal moonlit forest, dark violet canvas, warm golden campfire and lantern glow illuminating nearby cream ground, softly luminous lake and mythical silhouettes. Keep details visible with readable midtones; not blacked out. Preserve original delicate ink/watercolor illustration. No new objects, no moving/removing elements, no text, numbers, UI, labels or logos. Same 1536x1024 landscape canvas and exact layout.

## Font

Cinzel Decorative Bold (700), Natanael Gama, served locally from ../public/fonts/cinzel-decorative-700.ttf. License: ../public/fonts/CinzelDecorative-OFL.txt (SIL Open Font License).

Official distribution sources:

- https://fonts.gstatic.com/s/cinzeldecorative/v19/daaHSScvJGqLYhG8nNt8KPPswUAPniZoaelD.ttf
- https://raw.githubusercontent.com/google/fonts/main/ofl/cinzeldecorative/OFL.txt

Forms, figures and body text use the existing system font stack.

## SHA-256

```text
6f6fae46b84a95d0b8729488b51b923100c6ec2ff4f98d0f536966d93d149e3d  day-small.webp
31aff7d1f54e76549860e10a91d55cb7c7e080fa705c82abbc8b29d303b5552e  day.webp
eba01a69767725bc25e1f99cd23d8d410d5289b7203e0a97932b7cdfaaa6841e  night-small.webp
10d1865c2b31fe3a14b447122d944bc4c1729586a4108cebf13b65c5a634d998  night.webp
33af29b321940453ee21556c041452d4a84337568505780e0d3c08a6cd1f16fd  ../fonts/cinzel-decorative-700.ttf
```
