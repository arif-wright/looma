#!/usr/bin/env python3
"""Original code-native plaza facades, adapted from the frozen vector proof.

Only two hash-pinned flat original materials are sampled in finite upper-plane clips; no building raster is read or transformed. All solid, decorative,
collision, and cutaway vertices use P(u,v,z) = (64(u-v), 32(u+v)-z).
The approved geometry is larger; human doors retain their original scale.
Run with Python 3 and the offline Inkscape CLI. Outputs are deterministic.
For example: python authoring/author-plaza-facades.py --checkout checkout
The --checkout and --manifest options also support a relocated scripts/art copy.
"""

from copy import deepcopy
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
from facade_surfaces import SurfacePainter, inputs as material_inputs, INVARIANTS_SHA256


AUTHORING = Path(__file__).resolve().parent
ROOT = AUTHORING.parent
STATIC = ROOT / 'checkout/static/games/arpg/town-plaza-v1'
TS = ROOT / 'checkout/src/lib/games/arpg/assets/townFacadeData.ts'
PROVENANCE = dict(
    script='memvoya-town-vector-proof-20261010/author-facades.py',
    sha256='b80aa0efd934379d2074e7043999df12986c5d6f09432a46e7a4593d40112c73')
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
PIXELS_PER_WORLD = 2
BASE_HEIGHT = 8
STROKE = 0.6
PADDING = 3
CONFIGS = [
    dict(id='rear', axis='u', length=4, depth=1, wall=96, ridge=24,
         contact=dict(x=1496, y=432)),
    dict(id='endcap', axis='v', length=4, depth=1, wall=72, ridge=16,
         contact=dict(x=1728, y=376)),
]


def project(v):
    u, w, z = v
    return dict(x=64 * (u - w), y=32 * (u + w) - z)


def fmt(n):
    return f'{n:.8f}'.rstrip('0').rstrip('.') if n else '0'


def element(tag, **attrs):
    return ET.Element(f'{{{NS}}}{tag}', {
        k.replace('_', '-'): str(v) for k, v in attrs.items()
    })


def hash_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def emit_svg(path, root):
    ET.indent(root, space='  ')
    ET.ElementTree(root).write(path, encoding='utf-8', xml_declaration=True)


def make_facade(cfg):
    ident, axis = cfg['id'], cfg['axis']
    length, depth, height, ridge = (cfg[k] for k in ('length', 'depth', 'wall', 'ridge'))
    groups = {key: element('g', id=f'{ident}-{key}') for key in ('foundation', 'upper')}
    polygons = []
    planes = []
    features = []
    surfaces = SurfacePainter(cfg, groups['upper'])

    def xyz(t, d=0, z=0):
        return [t, d, z] if axis == 'u' else [d, t, z]

    def poly(layer, name, verts, fill, outline=False, major=False, clip=None):
        points = [project(v) for v in verts]
        attrs = dict(id=f'{ident}-{name}',
                     points=' '.join(f'{fmt(p["x"])},{fmt(p["y"])}' for p in points),
                     fill=fill)
        if outline:
            attrs.update(stroke='#493e33', stroke_width=fmt(STROKE), stroke_linejoin='round')
        if clip:
            attrs['clip_path'] = f'url(#{clip})'
        groups[layer].append(element('polygon', **attrs))
        polygons.append(dict(id=name, layer=layer, grid=verts, projected=points,
                             strokeWidth=STROKE if outline else 0,
                             majorPlane=major))
        if clip:
            polygons[-1]['surfaceClip'] = clip
        if major:
            planes.append(dict(id=name, layer=layer, grid=verts, projected=points))
        return points

    def long(layer, name, t0, t1, z0, z1, fill, outline=False, major=False):
        return poly(layer, name, [xyz(t0, 0, z0), xyz(t1, 0, z0),
                                 xyz(t1, 0, z1), xyz(t0, 0, z1)], fill, outline, major)

    def short(layer, name, d0, d1, z0, z1, fill, outline=False, major=False):
        return poly(layer, name, [xyz(0, d0, z0), xyz(0, d1, z0),
                                 xyz(0, d1, z1), xyz(0, d0, z1)], fill, outline, major)

    # Only vertical stone courses, never a painted ground/footprint diamond.
    short('foundation', 'short-foundation-plane', -depth, 0, 0, BASE_HEIGHT,
          '#7e7b6d', True, True)
    long('foundation', 'long-foundation-plane', -length, 0, 0, BASE_HEIGHT,
         '#969080', True, True)
    for side in ('short', 'long'):
        span, count = (depth, 4) if side == 'short' else (length, 16)
        for row in range(2):
            for i in range(count):
                a, b = -span + i * span / count + 0.008, -span + (i + 1) * span / count - 0.008
                color = ['#8f8978', '#a59c85', '#969180', '#aaa18b'][(i + row * 2) % 4]
                draw = short if side == 'short' else long
                draw('foundation', f'{side}-stone-{row}-{i}', a, b,
                     row * 4 + 0.2, (row + 1) * 4 - 0.2, color)

    short('upper', 'short-wall-plane', -depth, 0, BASE_HEIGHT, height,
          '#8d8269', True, True)
    long('upper', 'long-wall-plane', -length, 0, BASE_HEIGHT, height,
         '#b7a17b' if ident == 'rear' else '#b1a081', True, True)

    # Material source coordinates are finite; the existing major planes and
    # their 1.25-world-pixel inset clips alone decide rendered placement.
    for name in ['short-wall-plane', 'long-wall-plane']:
        surfaces.paint(name, next(p['grid'] for p in planes if p['id'] == name))

    # Repeated full-size bays, rather than a stretched compact facade.
    for i in range(6):
        a = -length + i * 0.8 + (0.02 if i == 0 else -0.025 if i == 5 else -0.0125)
        long('upper', f'bay-post-{i}', a, min(0, a + 0.025), BASE_HEIGHT, height, '#493d31')
    for i, z in enumerate([9, height - 5] + ([52] if ident == 'rear' else [])):
        long('upper', f'long-timber-beam-{i}', -length, 0, z, z + 3, '#51402f')
    long('upper', 'inboard-eave-shade', -length+.02, -.02, height-6, height-5, '#594a36')
    for i in [1,3,5]:
        a = -length + i*.8 + (-.025 if i == 5 else -.0125)
        long('upper', f'post-inboard-wear-{i}', a+.004, a+.011, height-27, height-12, '#80694d')
    short('upper', 'short-upper-beam', -depth, 0, height - 5, height - 2, '#594936')
    short('upper', 'short-corner-post', -0.035, 0, BASE_HEIGHT, height, '#594936')
    short('upper', 'short-rear-post', -depth, -depth + 0.035, BASE_HEIGHT, height, '#594936')

    # 0.3125 grid units = 20 horizontal world pixels. The door is 44 high,
    # exactly the intended human scale; its threshold starts at z=0.
    door_mid = -0.4 if ident == 'rear' else -2.0
    door0, door1, door_height = door_mid - 0.15625, door_mid + 0.15625, 44
    full_door = [xyz(door0, 0, 0), xyz(door1, 0, 0),
                 xyz(door1, 0, door_height), xyz(door0, 0, door_height)]
    features.append(dict(id='closed-decorative-door', interactive=False, grid=full_door,
                         projected=[project(v) for v in full_door],
                         projectedHorizontalWidth=20, verticalHeight=door_height))
    for layer, z0, z1 in [('foundation', 0, BASE_HEIGHT), ('upper', BASE_HEIGHT, door_height)]:
        long(layer, f'{layer}-closed-door', door0, door1, z0, z1, '#574230' if layer == 'upper' else '#654b35')
        for i in range(1, 4):
            a = door0 + (door1 - door0) * i / 4
            long(layer, f'{layer}-door-plank-{i}', a, a + 0.006, z0, z1, '#3f342a')
        long(layer, f'{layer}-left-door-jamb', door0 - 0.025, door0, z0, z1, '#514333')
        long(layer, f'{layer}-right-door-jamb', door1, door1 + 0.025, z0, z1, '#514333')
    long('upper', 'door-top-jamb', door0 - 0.025, door1 + 0.025, door_height, door_height + 3, '#514333')
    for i, z in enumerate([11, door_height - 9]):
        long('upper', f'door-brace-{i}', door0, door1, z, z + 1.5, '#473b2e')
    long('upper', 'door-latch', door1 - 0.058, door1 - 0.018, 21, 23, '#b6a16b')

    # Sparse original wood-wear strokes stay within the existing door body.
    for i in range(4):
        a = door0 + .025 + i * .067
        long('upper', f'door-wear-{i}', a, a+.007, 15+i*2, 34+i, '#80694d')

    long('upper', 'door-jamb-inboard-wear', door0-.017, door0-.010, 16, 36, '#80694d')

    def window(name, middle, z0, window_height=19):
        a, b, z1 = middle - 0.19, middle + 0.19, z0 + window_height
        long('upper', name + '-frame', a, b, z0, z1, '#393b36')
        warm = (ident == 'rear' and name == 'upper-window-4') or (ident == 'endcap' and name == 'lower-window-1')
        long('upper', name + '-left', a + 0.023, middle - 0.01, z0 + 2, z1 - 2, '#44514c')
        long('upper', name + '-right', middle + 0.01, b - 0.023, z0 + 2, z1 - 2, '#97693c' if warm else '#56645b')
        long('upper', name + '-inset-top', a + .023, b - .023, z1 - 3, z1 - 2, '#303a33')
        long('upper', name + '-inset-side', a + .023, a + .033, z0 + 2, z1 - 2, '#303a33')
        long('upper', name + '-sill', a - 0.015, b + 0.015, z0 - 2, z0, '#635541')
        long('upper', name + '-sill-wear', a + .045, middle - .015, z0 - 1.2, z0 - .7, '#897157')
        for i, t in enumerate([a + 0.077, b - 0.083]):
            long('upper', name + f'-slat-{i}', t, t + 0.01, z0 + 3, z1 - 3, '#56695f')

    for bay in range(5):
        middle = -length + 0.4 + bay * 0.8
        if abs(middle - door_mid) > 0.1:
            window(f'lower-window-{bay}', middle, 24, 19)
        if ident == 'rear':
            window(f'upper-window-{bay}', middle, 65, 21)
        else:
            long('upper', f'upper-vent-{bay}', middle - 0.055, middle + 0.055, 56, 61, '#716b56')

    # The short end keeps a single human-scale shutter. It is projected through
    # the same xyz/project functions, not a hand-positioned screen-space decal.
    short('upper', 'short-window-frame', -0.73, -0.34, 28, 49, '#514938')
    short('upper', 'short-window-left', -0.70, -0.55, 30, 47, '#697468')
    short('upper', 'short-window-right', -0.53, -0.37, 30, 47, '#7b8271')

    poly('upper', 'near-gable-plane', [xyz(0, -depth, height), xyz(0, 0, height),
                                      xyz(0, -depth / 2, height + ridge)], '#897650', True, True)
    surfaces.paint('near-gable-plane', next(p['grid'] for p in planes if p['id'] == 'near-gable-plane'))
    poly('upper', 'roof-far-plane', [xyz(-length, -depth, height), xyz(0, -depth, height),
                                    xyz(0, -depth / 2, height + ridge),
                                    xyz(-length, -depth / 2, height + ridge)], '#705342', True, True)

    def roof_z(d):
        return height + ridge * (1 - abs(d + depth / 2) / (depth / 2))

    def tiles(side, da, db):
        for row in range(2):
            d0, d1 = da + (db - da) * row / 2 + 0.004, da + (db - da) * (row + 1) / 2 - 0.004
            for i in range(16):
                a, b = -length + length * i / 16 + 0.006, -length + length * (i + 1) / 16 - 0.006
                colors = ['#684e3e'] if side == 'far' else ['#966243']
                poly('upper', f'roof-{side}-tile-{row}-{i}',
                     [xyz(a, d0, roof_z(d0)), xyz(b, d0, roof_z(d0)),
                      xyz(b, d1, roof_z(d1)), xyz(a, d1, roof_z(d1))], colors[0])

    def roof_surface(side, da, db):
        name = f'roof-{side}-plane'
        clip = surfaces.paint(name, next(p['grid'] for p in planes if p['id'] == name))
        # Four quieter clay courses, not the previous two-row checkerboard.
        # Small seams are original projected geometry, never image-generated
        # tile boundaries. Paint clips leave every silhouette pixel unchanged.
        for row in range(4):
            d0, d1 = da+(db-da)*row/4, da+(db-da)*(row+1)/4
            if row < 3:
                poly('upper', f'{side}-course-shadow-{row}',
                     [xyz(-length,d1-.008,roof_z(d1-.008)),xyz(0,d1-.008,roof_z(d1-.008)),
                      xyz(0,d1,roof_z(d1)),xyz(-length,d1,roof_z(d1))], '#604332', clip=clip)
                poly('upper', f'{side}-course-wear-{row}',
                     [xyz(-length,d1-.011,roof_z(d1-.011)),xyz(0,d1-.011,roof_z(d1-.011)),
                      xyz(0,d1-.008,roof_z(d1-.008)),xyz(-length,d1-.008,roof_z(d1-.008))], '#aa7854', clip=clip)
            for i in range(1,28):
                t = -length+(i+(row%2)*.5)*length/28
                jitter = (((i*7+row*3+(1 if ident=='rear' else 3))%5)-2)*.003
                a,b=t+jitter,t+jitter+.007
                poly('upper',f'{side}-tile-seam-{row}-{i}',
                     [xyz(a,d0+.012,roof_z(d0+.012)),xyz(b,d0+.012,roof_z(d0+.012)),
                      xyz(b+.004,d1-.014,roof_z(d1-.014)),xyz(a+.004,d1-.014,roof_z(d1-.014))], '#684836',clip=clip)

    tiles('far', -depth, -depth / 2)
    roof_surface('far', -depth, -depth / 2)
    poly('upper', 'roof-near-plane', [xyz(-length, -depth / 2, height + ridge),
                                     xyz(0, -depth / 2, height + ridge),
                                     xyz(0, 0, height), xyz(-length, 0, height)], '#986b4c', True, True)
    tiles('near', -depth / 2, 0)
    roof_surface('near', -depth / 2, 0)

    # Each shape contributes its own stroke radius. Integer-aligned padding is
    # deliberately chosen so 2 px/world needs no rounding or letterboxing.
    bounds = dict(
        minX=min(p['x'] - q['strokeWidth'] / 2 for q in polygons for p in q['projected']),
        minY=min(p['y'] - q['strokeWidth'] / 2 for q in polygons for p in q['projected']),
        maxX=max(p['x'] + q['strokeWidth'] / 2 for q in polygons for p in q['projected']),
        maxY=max(p['y'] + q['strokeWidth'] / 2 for q in polygons for p in q['projected']))
    vx, vy = math.floor(bounds['minX'] - PADDING), math.floor(bounds['minY'] - PADDING)
    vw = math.ceil(bounds['maxX'] + PADDING) - vx
    vh = math.ceil(bounds['maxY'] + PADDING) - vy
    width, png_height = vw * PIXELS_PER_WORLD, vh * PIXELS_PER_WORLD
    contact_px = dict(x=-vx * PIXELS_PER_WORLD, y=-vy * PIXELS_PER_WORLD)
    origin = dict(x=contact_px['x'] / width, y=contact_px['y'] / png_height)

    root = element('svg', version='1.1', role='img', viewBox=f'{vx} {vy} {vw} {vh}',
                   width=width, height=png_height, preserveAspectRatio='xMidYMid meet')
    title = element('title')
    title.text = f'Original town plaza {ident}: unfinished flat vector prototype'
    root.append(title)
    desc = element('desc')
    desc.text = ('Original geometric facade built from P(u,v,z)=(64(u-v),32(u+v)-z). '
                 'Decorative closed door, no interaction. Modest flat surfaces are unfinished '
                 'painterly art. No raster input, cast shadow, floor diamond, or overhang.')
    root.append(desc)
    svg_full = STATIC / f'town_plaza_{ident}_v1.svg'
    full = deepcopy(root)
    surfaces.decorate(full)
    for layer in ('foundation', 'upper'):
        full.append(deepcopy(groups[layer]))
    emit_svg(svg_full, full)

    layers = {}
    export_records = {}
    for layer in ('foundation', 'upper'):
        key = f'town_plaza_{ident}_{layer}_v1'
        svg, png = STATIC / f'{key}.svg', STATIC / f'{key}.png'
        split = deepcopy(root)
        if layer == 'upper':
            surfaces.decorate(split)
        split.append(deepcopy(groups[layer]))
        emit_svg(svg, split)
        env = dict(os.environ, INKSCAPE_PROFILE_DIR=str(AUTHORING / '.inkscape-profile'))
        subprocess.run(['inkscape', str(svg), '--export-type=png',
                        f'--export-filename={png}', '--export-area-page'],
                       check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
        layers[layer] = dict(key=key, url=f'/games/arpg/town-plaza-v1/{key}.png',
                             originX=origin['x'], originY=origin['y'], scale=1 / PIXELS_PER_WORLD,
                             width=width, height=png_height)
        export_records[layer] = dict(svg=svg.name, png=png.name,
                                     svgSha256=hash_file(svg), pngSha256=hash_file(png))

    # One source of truth: the same grid basis generates art, collider, pivot,
    # upper cutaway planes, world coordinates, and runtime TS descriptors.
    footprint_grid = ([xyz(-length), xyz(-length, -depth), xyz(0, -depth), xyz(0)] if axis == 'u'
                      else [xyz(0), xyz(-length), xyz(-length, -depth), xyz(0, -depth)])
    footprint = [project(p) for p in footprint_grid]
    descriptor = dict(id=ident, contact=cfg['contact'], footprint=footprint,
                      upperPolygons=[p['projected'] for p in planes if p['layer'] == 'upper'],
                      layers=layers, drawnBounds=bounds)
    contract = dict(**cfg, projectionBasis=dict(u=[64, 32], v=[-64, 32], z=[0, -1]),
                    foundationHeight=BASE_HEIGHT, footprintGrid=footprint_grid,
                    footprintRelativeWorld=footprint,
                    footprintWorld=[{k: p[k] + cfg['contact'][k] for k in ('x', 'y')} for p in footprint],
                    drawnBounds=bounds, viewBox=[vx, vy, vw, vh],
                    sourcePixelDimensions=[width, png_height], pixelsPerWorld=PIXELS_PER_WORLD,
                    uniformSvgScale=PIXELS_PER_WORLD, letterboxOffsetPixels=[0, 0],
                    contactInSvgWorld=[0, 0], contactPixels=contact_px, origin=origin,
                    fullSvg=svg_full.name, fullSvgSha256=hash_file(svg_full),
                    layers=export_records, features=features, majorPlanes=planes, polygons=polygons,
                    runtime=descriptor, surfaces=surfaces.records)
    return descriptor, contract


def main():
    global STATIC, TS
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkout', type=Path, default=ROOT / 'checkout',
                        help='Repository root receiving static/ and src/ outputs.')
    parser.add_argument('--manifest', type=Path, default=AUTHORING / 'facade-manifest.json',
                        help='Authoring manifest destination, outside runtime bundles.')
    args = parser.parse_args()
    checkout = args.checkout.resolve()
    STATIC = checkout / 'static/games/arpg/town-plaza-v1'
    TS = checkout / 'src/lib/games/arpg/assets/townFacadeData.ts'
    STATIC.mkdir(parents=True, exist_ok=True)
    TS.parent.mkdir(parents=True, exist_ok=True)
    materials = material_inputs(checkout)
    records = [make_facade(cfg) for cfg in CONFIGS]
    descriptors, contracts = zip(*records)
    TS.write_text(
        '// Generated by authoring/author-plaza-facades.py. Do not hand-edit geometry.\n'
        '// Original unfinished vector art; every vertex uses the exact 128 x 64 projection.\n'
        '// All points/bounds are world-relative to contact, PNG dimensions are source pixels.\n'
        '// Foundation and upper share an exact 2 px/world export frame and contact pivot.\n'
        'export const TOWN_FACADES = ' + json.dumps(descriptors, indent=2) + ' as const;\n',
        encoding='utf-8')
    manifest = dict(
        schemaVersion=2, status='Original material-treated exact-grid prototype; finish and hosted review remain separate',
        source='Code-native planes; two original pinned flat diffuse inputs; no building raster, repeat, or frozen-geometry edits',
        materialInputs=materials, surfaceContractSha256=hash_file(Path(__file__).with_name('facade_surfaces.py')), invariantsSha256=INVARIANTS_SHA256,
        adaptedFrom=PROVENANCE,
        authorScriptSha256=hash_file(Path(__file__)),
        renderer=subprocess.check_output(['inkscape', '--version'], text=True,
                   env=dict(os.environ, INKSCAPE_PROFILE_DIR=str(AUTHORING / '.inkscape-profile'))).strip(),
        generatedDataSha256=hash_file(TS), pixelsPerWorld=PIXELS_PER_WORLD, assets=contracts)
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, indent=2) + '\n')
    concise = dict(
        status='Original material-treated prototype; two pinned diffuse inputs, unchanged geometric import contract',
        authorScriptSha256=manifest['authorScriptSha256'],
        geometryManifestSha256=hash_file(args.manifest),
        runtimeDataSha256=manifest['generatedDataSha256'],
        pixelsPerWorld=PIXELS_PER_WORLD,
        assets=[dict(id=a['id'], sourcePixelDimensions=a['sourcePixelDimensions'],
                     contactPixels=a['contactPixels'], origin=a['origin'],
                     fullSvg=a['fullSvg'], fullSvgSha256=a['fullSvgSha256'],
                     layers=a['layers']) for a in contracts])
    args.manifest.with_name('facade-hashes.json').write_text(json.dumps(concise, indent=2) + '\n')
    for cfg, descriptor in zip(CONFIGS, descriptors):
        print(cfg['id'], json.dumps(descriptor['layers']), 'bounds', descriptor['drawnBounds'])


if __name__ == '__main__':
    main()
