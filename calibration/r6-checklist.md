# R6 Calibration Checklist — expected results

Hand-authored from the official template layout transcribed in `docs/roblox-technical-preflight.md` (Exact panel registry table), NOT from `src/domain/registry-data.ts`. If this checklist and the registry ever disagree, this checklist wins and the registry needs review.

Fixture legend:

- Every shirt/pants panel prints its panel ID, a grid line every 16 px, and an arrow pointing toward that panel's **atlas-top edge**.
- Edge number pills: **1** = atlas-top edge, **2** = atlas-right edge, **3** = atlas-bottom edge, **4** = atlas-left edge.
- Arrow direction column below states where the printed arrow must point **in the 3D view**; "up" always means toward the character's head.
- For every row, verify: panel ID readable, arrow direction as expected, all four edge numbers visible at the expected edges, the panel fills its body-part face with no stretching (16 px grid squares stay square), and the segment boundary sits at the physical cube edge.
- T-shirt fixture: 8 px magenta border, centered cyan cross, corner labels TL/TR/BL/BR, white up arrow, graduated 16 px/64 px grid with numbers along the top and left.

Mark each row's `Result` cell `PASS` or `FAIL` and record observations in `Notes`. Screenshots alone are not the checklist.

## Shirt

| Part | Visible 3D face | Expected panel | Expected arrow direction | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| Torso | front | `torso.front` | up | | |
| Torso | back | `torso.back` | up | | |
| Torso | left | `torso.left` | up | | |
| Torso | right | `torso.right` | up | | |
| Torso | up (top) | `torso.up` | toward the character's back | | |
| Torso | down (bottom) | `torso.down` | toward the character's front | | |
| Right Arm | front | `right-limb.front` | up | | |
| Right Arm | back | `right-limb.back` | up | | |
| Right Arm | left | `right-limb.left` | up | | |
| Right Arm | right | `right-limb.right` | up | | |
| Right Arm | up (top) | `right-limb.up` | toward the limb's back edge | | |
| Right Arm | down (bottom) | `right-limb.down` | toward the limb's front edge | | |
| Left Arm | front | `left-limb.front` | up | | |
| Left Arm | back | `left-limb.back` | up | | |
| Left Arm | left | `left-limb.left` | up | | |
| Left Arm | right | `left-limb.right` | up | | |
| Left Arm | up (top) | `left-limb.up` | toward the limb's back edge | | |
| Left Arm | down (bottom) | `left-limb.down` | toward the limb's front edge | | |

Limb face rule (authored from the official net; arms and legs identically): limb up-face arrow toward the limb's back edge; limb down-face arrow toward the limb's front edge; all four side faces arrow up.

## Pants

| Part | Visible 3D face | Expected panel | Expected arrow direction | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| Torso | front | `torso.front` | up | | |
| Torso | back | `torso.back` | up | | |
| Torso | left | `torso.left` | up | | |
| Torso | right | `torso.right` | up | | |
| Torso | up (top) | `torso.up` | toward the character's back | | |
| Torso | down (bottom) | `torso.down` | toward the character's front | | |
| Right Leg | front | `right-limb.front` | up | | |
| Right Leg | back | `right-limb.back` | up | | |
| Right Leg | left | `right-limb.left` | up | | |
| Right Leg | right | `right-limb.right` | up | | |
| Right Leg | up (top) | `right-limb.up` | toward the limb's back edge | | |
| Right Leg | down (bottom) | `right-limb.down` | toward the limb's front edge | | |
| Left Leg | front | `left-limb.front` | up | | |
| Left Leg | back | `left-limb.back` | up | | |
| Left Leg | left | `left-limb.left` | up | | |
| Left Leg | right | `left-limb.right` | up | | |
| Left Leg | up (top) | `left-limb.up` | toward the limb's back edge | | |
| Left Leg | down (bottom) | `left-limb.down` | toward the limb's front edge | | |

Limb face rule as for the shirt: limb up-face arrow toward the limb's back edge; limb down-face arrow toward the limb's front edge; all four side faces arrow up.

## T-shirt

| Garment | Visible 3D face | Expected appearance | Result | Notes |
| --- | --- | --- | --- | --- |
| T-shirt | front torso | Front-torso graphic: full front face edge-to-edge, upright (image-top toward the character's head), magenta border visible on all four edges, TL/TR/BL/BR corners at their named 3D corners. Pre-calibration expectation; record actual clipping/offset if different. | | |

## Seam continuity

At each physical 3D edge below, the two listed panel edges must meet with their 16 px grid lines aligned and the fixture edge numbers adjacent as listed (pill numbers shown in parentheses; 1 = top, 2 = right, 3 = bottom, 4 = left).

| # | Component | Panel edge A | Panel edge B | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | Torso | `torso.up` bottom (3) | `torso.front` top (1) | | |
| 2 | Torso | `torso.right` right (2) | `torso.front` left (4) | | |
| 3 | Torso | `torso.front` right (2) | `torso.left` left (4) | | |
| 4 | Torso | `torso.front` bottom (3) | `torso.down` top (1) | | |
| 5 | Torso | `torso.left` right (2) | `torso.back` left (4) | | |
| 6 | Right limb | `right-limb.up` bottom (3) | `right-limb.front` top (1) | | |
| 7 | Right limb | `right-limb.left` right (2) | `right-limb.back` left (4) | | |
| 8 | Right limb | `right-limb.back` right (2) | `right-limb.right` left (4) | | |
| 9 | Right limb | `right-limb.right` right (2) | `right-limb.front` left (4) | | |
| 10 | Right limb | `right-limb.front` bottom (3) | `right-limb.down` top (1) | | |
| 11 | Left limb | `left-limb.up` bottom (3) | `left-limb.front` top (1) | | |
| 12 | Left limb | `left-limb.front` right (2) | `left-limb.left` left (4) | | |
| 13 | Left limb | `left-limb.left` right (2) | `left-limb.back` left (4) | | |
| 14 | Left limb | `left-limb.back` right (2) | `left-limb.right` left (4) | | |
| 15 | Left limb | `left-limb.front` bottom (3) | `left-limb.down` top (1) | | |

Cut-seam note: every other physical cube edge joins different unfolded regions of the atlas; mismatched edge numbers there are EXPECTED. Mark such edges as cut in `Notes`, not as failures.

## Recording

- Studio version:
- Date:
- `Humanoid.RigType`:
- Reviewer:

RESULT: PENDING
