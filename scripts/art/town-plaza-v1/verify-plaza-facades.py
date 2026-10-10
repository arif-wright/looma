#!/usr/bin/env python3
"""Verify code-native facade geometry, pivots, split PNGs, and determinism.

Reads only the generated assets, authoring manifest/script, and frozen Python
source hash. It never opens architecture source rasters or launches a browser.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

from PIL import Image


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
STATIC = ROOT / 'checkout/static/games/arpg/town-plaza-v1'
TS = ROOT / 'checkout/src/lib/games/arpg/assets/townFacadeData.ts'
MANIFEST = HERE / 'facade-manifest.json'
NS = '{http://www.w3.org/2000/svg}'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def near(a, b):
    assert math.isclose(a, b, rel_tol=0, abs_tol=1e-8), (a, b)


def projected(point):
    u, v, z = point
    return {'x': 64 * u - 64 * v, 'y': 32 * u + 32 * v - z}


def verify(args):
    global STATIC, TS, MANIFEST
    checkout = args.checkout.resolve()
    STATIC = checkout / 'static/games/arpg/town-plaza-v1'
    TS = checkout / 'src/lib/games/arpg/assets/townFacadeData.ts'
    MANIFEST = args.manifest.resolve()
    m = json.loads(MANIFEST.read_text())
    assert len(m['assets']) == 2
    assert [a['id'] for a in m['assets']] == ['rear', 'endcap']
    assert digest(args.author_script) == m['authorScriptSha256']
    if args.original_proof_source:
        assert digest(args.original_proof_source) == m['adaptedFrom']['sha256']
    assert digest(TS) == m['generatedDataSha256']
    ts_value = TS.read_text().split('export const TOWN_FACADES = ', 1)[1].rsplit(' as const;', 1)[0]
    assert json.loads(ts_value) == [a['runtime'] for a in m['assets']]
    summary = []
    hashes = MANIFEST.with_name('facade-hashes.json')
    concise = json.loads(hashes.read_text())
    assert concise['geometryManifestSha256'] == digest(MANIFEST)
    assert concise['runtimeDataSha256'] == digest(TS)
    assert concise['authorScriptSha256'] == digest(args.author_script)
    generated_files = [MANIFEST, hashes, TS]
    for asset in m['assets']:
        assert asset['axis'] == ('u' if asset['id'] == 'rear' else 'v')
        assert asset['length'] == 4 and asset['depth'] == 1
        assert asset['foundationHeight'] == 8
        assert (asset['wall'], asset['ridge']) == ((96, 24) if asset['id'] == 'rear' else (72, 16))
        assert asset['contact'] == ({'x': 1496, 'y': 432} if asset['id'] == 'rear' else {'x': 1728, 'y': 376})
        assert asset['projectionBasis'] == {'u': [64, 32], 'v': [-64, 32], 'z': [0, -1]}
        assert asset['pixelsPerWorld'] == asset['uniformSvgScale'] == 2
        assert asset['letterboxOffsetPixels'] == [0, 0]
        assert asset['contactInSvgWorld'] == [0, 0]
        vx, vy, vw, vh = asset['viewBox']
        width, height = asset['sourcePixelDimensions']
        assert width == vw * 2 and height == vh * 2
        assert all(isinstance(value, int) for value in [vx, vy, vw, vh, width, height])
        assert asset['contactPixels'] == {'x': -vx * 2, 'y': -vy * 2}
        near(asset['origin']['x'], -vx / vw)
        near(asset['origin']['y'], -vy / vh)
        assert asset['runtime']['footprint'] == asset['footprintRelativeWorld']
        assert asset['footprintRelativeWorld'] == [projected(p) for p in asset['footprintGrid']]
        for world, rel in zip(asset['footprintWorld'], asset['footprintRelativeWorld']):
            assert world == {key: rel[key] + asset['contact'][key] for key in ['x', 'y']}
        # Verify the base is a 4 x 1 grid rectangle, independently of axis order.
        td = [(p[0], p[1]) if asset['axis'] == 'u' else (p[1], p[0]) for p in asset['footprintGrid']]
        assert set(td) == {(-4, -1), (-4, 0), (0, -1), (0, 0)}
        assert all(p[2] == 0 for p in asset['footprintGrid'])
        assert len(asset['runtime']['upperPolygons']) == 5
        assert asset['runtime']['upperPolygons'] == [p['projected'] for p in asset['majorPlanes'] if p['layer'] == 'upper']
        axis_edges = {'u': 0, 'v': 0, 'vertical': 0}
        for polygon in asset['polygons']:
            assert polygon['projected'] == [projected(p) for p in polygon['grid']]
            for p in polygon['grid']:
                assert all(math.isfinite(c) for c in p)
                t, d = (p[0], p[1]) if asset['axis'] == 'u' else (p[1], p[0])
                assert -4 <= t <= 0 and -1 <= d <= 0
                if polygon['layer'] == 'foundation':
                    assert 0 <= p[2] <= 8
                else:
                    assert 8 <= p[2] <= asset['wall'] + asset['ridge']
            vertices = polygon['grid']
            for a, b in zip(vertices, vertices[1:] + vertices[:1]):
                du, dv, dz = [b[i] - a[i] for i in range(3)]
                pa, pb = projected(a), projected(b)
                dx, dy = pb['x'] - pa['x'], pb['y'] - pa['y']
                if dv == 0 and dz == 0 and du != 0:
                    near(dy / dx, 0.5)
                    axis_edges['u'] += 1
                if du == 0 and dz == 0 and dv != 0:
                    near(dy / dx, -0.5)
                    axis_edges['v'] += 1
                if du == 0 and dv == 0 and dz != 0:
                    near(dx, 0)
                    near(dy, -dz)
                    axis_edges['vertical'] += 1
        assert all(axis_edges.values())
        bounds = {
            'minX': min(p['x'] - q['strokeWidth'] / 2 for q in asset['polygons'] for p in q['projected']),
            'minY': min(p['y'] - q['strokeWidth'] / 2 for q in asset['polygons'] for p in q['projected']),
            'maxX': max(p['x'] + q['strokeWidth'] / 2 for q in asset['polygons'] for p in q['projected']),
            'maxY': max(p['y'] + q['strokeWidth'] / 2 for q in asset['polygons'] for p in q['projected']),
        }
        assert bounds == asset['drawnBounds'] == asset['runtime']['drawnBounds']
        assert all(math.isfinite(x) for x in bounds.values())
        assert vx < bounds['minX'] < bounds['maxX'] < vx + vw
        assert vy < bounds['minY'] < bounds['maxY'] < vy + vh
        door, = asset['features']
        assert door['interactive'] is False
        assert door['verticalHeight'] == 44 and door['projectedHorizontalWidth'] == 20
        near(abs(door['projected'][1]['x'] - door['projected'][0]['x']), 20)
        near(door['projected'][1]['y'] - door['projected'][2]['y'], 44)
        full_svg = STATIC / asset['fullSvg']
        assert digest(full_svg) == asset['fullSvgSha256']
        generated_files.append(full_svg)
        alpha_bounds = {}
        for layer in ('foundation', 'upper'):
            record = asset['layers'][layer]
            svg, png = STATIC / record['svg'], STATIC / record['png']
            generated_files.extend([svg, png])
            assert digest(svg) == record['svgSha256']
            assert digest(png) == record['pngSha256']
            tree = ET.parse(svg)
            root = tree.getroot()
            assert [float(v) for v in root.attrib['viewBox'].split()] == asset['viewBox']
            assert (int(root.attrib['width']), int(root.attrib['height'])) == (width, height)
            assert root.attrib['preserveAspectRatio'] == 'xMidYMid meet'
            assert not root.findall('.//' + NS + 'image')
            assert not root.findall('.//' + NS + 'filter')
            assert not root.findall('.//' + NS + 'use')
            assert all('transform' not in p.attrib for p in root.iter())
            expected_polygons = [p for p in asset['polygons'] if p['layer'] == layer]
            actual_polygons = root.findall('.//' + NS + 'polygon')
            assert len(actual_polygons) == len(expected_polygons)
            for expected, actual in zip(expected_polygons, actual_polygons):
                assert actual.attrib['id'] == f"{asset['id']}-{expected['id']}"
                points = [dict(zip(('x', 'y'), map(float, p.split(',')))) for p in actual.attrib['points'].split()]
                for a, b in zip(points, expected['projected']):
                    near(a['x'], b['x'])
                    near(a['y'], b['y'])
                assert 'opacity' not in actual.attrib and 'fill-opacity' not in actual.attrib
            descriptor = asset['runtime']['layers'][layer]
            assert descriptor['width'] == width and descriptor['height'] == height
            assert descriptor['key'] == f"town_plaza_{asset['id']}_{layer}_v1"
            assert descriptor['url'] == f"/games/arpg/town-plaza-v1/{descriptor['key']}.png"
            assert descriptor['scale'] == 0.5
            for p in asset['footprintRelativeWorld']:
                # Inverse Phaser texture transform must recover every source
                # contact-relative footprint point without a residual offset.
                near(((p['x'] - vx) * 2 - width * descriptor['originX']) * descriptor['scale'], p['x'])
                near(((p['y'] - vy) * 2 - height * descriptor['originY']) * descriptor['scale'], p['y'])
            with Image.open(png) as im:
                assert im.size == (width, height) and im.mode == 'RGBA'
                alpha = im.getchannel('A')
                bbox = alpha.getbbox()
                assert bbox is not None and bbox[0] > 0 and bbox[1] > 0 and bbox[2] < width and bbox[3] < height
                assert alpha.getextrema() == (0, 255)
                alpha_bounds[layer] = list(bbox)
                if layer == 'foundation':
                    for plane in [p for p in asset['majorPlanes'] if p['layer'] == 'foundation']:
                        cx = sum(p['x'] for p in plane['projected']) / 4
                        cy = sum(p['y'] for p in plane['projected']) / 4
                        assert alpha.getpixel((round((cx - vx) * 2), round((cy - vy) * 2))) == 255
        summary.append(dict(id=asset['id'], footprintWorld=asset['footprintWorld'],
                            sourcePixelDimensions=asset['sourcePixelDimensions'],
                            contactPixels=asset['contactPixels'], scale=0.5,
                            exactAxisEdgesChecked=axis_edges, alphaBoundsPixels=alpha_bounds,
                            polygonCount=len(asset['polygons']), majorUpperPlanes=5,
                            closedDoorWorldSize=dict(horizontal=20, vertical=44)))

    def label(path):
        return str(path.relative_to(checkout)) if path.is_relative_to(checkout) else 'authoring/' + path.name

    before = {label(path): digest(path) for path in generated_files}
    if args.rebuild:
        subprocess.run([sys.executable, str(args.author_script), '--checkout', str(checkout),
                        '--manifest', str(MANIFEST)], check=True,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        after = {label(path): digest(path) for path in generated_files}
        assert before == after, 'Regeneration changed exported bytes'
    report = dict(status='PASS', deterministicRebuildChecked=args.rebuild,
                  originalFrozenProofHashChecked=bool(args.original_proof_source),
                  rasterInputsRead=0, browserProcessesLaunched=0,
                  renderedWith='Offline Inkscape CLI',
                  verified=['exact +/-0.5 ground axes and vertical z axis',
                            'all polygon vertices derive from the single projection basis',
                            'solid/footprint extent is exactly 4 x 1 grid units',
                            'foundation vertices in z=0..8, upper vertices in z=8..ridge',
                            'foundation interiors are fully opaque',
                            'same integer-sized 2 px/world viewBox and pixel pivot in each layer pair',
                            'finite actual-polygon bounds expanded by the actual stroke',
                            'major upper cutaway planes exactly match rendered geometry',
                            'closed 20 x 44 human-size decorative doors',
                            'no raster SVG inputs, filters, transformed decals, or clipping',
                            'frozen original Python proof script unchanged' if args.original_proof_source else 'original proof provenance hash retained',
                            'deterministic SVG, PNG, runtime data, and manifest bytes' if args.rebuild else 'existing output hashes'],
                  assets=summary, outputSha256=before)
    MANIFEST.with_name('facade-verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rebuild', action='store_true', help='Re-export and require byte-identical output.')
    parser.add_argument('--checkout', type=Path, default=ROOT / 'checkout')
    parser.add_argument('--manifest', type=Path, default=HERE / 'facade-manifest.json')
    parser.add_argument('--author-script', type=Path, default=HERE / 'author-plaza-facades.py')
    parser.add_argument('--original-proof-source', type=Path,
                        help='Optional frozen source, only for provenance hash verification.')
    verify(parser.parse_args())
