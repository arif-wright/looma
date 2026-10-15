#!/usr/bin/env python3
"""Offline allowlist/invariance negatives; never launches an engine/browser."""
import contextlib
from copy import deepcopy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import tempfile
from types import SimpleNamespace
import unittest
import xml.etree.ElementTree as ET
from PIL import Image
from facade_surfaces import inputs, verify_svg, texture_coordinates, MATERIALS
from facade_character import verify as verify_character

HERE=Path(__file__).resolve().parent
CHECKOUT=HERE.parents[2]
NS='{http://www.w3.org/2000/svg}'
MANIFEST=json.loads((HERE/'facade-manifest.json').read_text())
STATIC=CHECKOUT/'static/games/arpg/town-plaza-v1'

def image(root):return root.find('.//'+NS+'image')
def surface(root):return next(g for g in root.findall('.//'+NS+'g') if '-surface-' in g.attrib.get('id',''))
def svg(asset):return ET.parse(STATIC/asset['layers']['upper']['svg']).getroot()

def assert_rejected(mutate):
    asset=deepcopy(MANIFEST['assets'][0]);root=svg(asset);mutate(root,asset)
    with unittest.TestCase().assertRaises(AssertionError):verify_svg(root,asset,['upper'])

class SurfaceContract(unittest.TestCase):
    def test_approved_inputs_are_exact_original_bytes(self):self.assertEqual(inputs(CHECKOUT),MANIFEST['materialInputs'])
    def test_all_full_and_split_documents_obey_exact_contract(self):
        for asset in MANIFEST['assets']:
            verify_svg(ET.parse(STATIC/asset['fullSvg']).getroot(),asset,['foundation','upper'])
            for layer in ['foundation','upper']:verify_svg(ET.parse(STATIC/asset['layers'][layer]['svg']).getroot(),asset,[layer])
    def test_every_clip_uses_finite_in_bounds_texture_coordinates(self):
        for asset in MANIFEST['assets']:
            for s in asset['surfaces']:
                for p in s['clip']:
                    u,v=texture_coordinates(s['matrix'],p)
                    self.assertTrue(0<u<1254 and 0<v<1254)
    def test_extra_image(self):assert_rejected(lambda r,a:r.append(deepcopy(image(r))))
    def test_remote_source(self):assert_rejected(lambda r,a:image(r).set('href','https://invalid.example/unapproved.png'))
    def test_unapproved_local_source(self):assert_rejected(lambda r,a:image(r).set('href','../../../../art-source/unapproved.png'))
    def test_other_approved_material_in_wrong_plane(self):assert_rejected(lambda r,a:image(r).set('href','../../../../'+MATERIALS['roof']['path']))
    def test_image_dimension_change(self):assert_rejected(lambda r,a:image(r).set('width','1255'))
    def test_image_shift(self):assert_rejected(lambda r,a:image(r).set('x','1'))
    def test_image_affine_change(self):assert_rejected(lambda r,a:image(r).set('transform','matrix(1 0 0 1 0 0)'))
    def test_mirrored_image(self):assert_rejected(lambda r,a:image(r).set('transform',image(r).get('transform').replace('matrix(','matrix(-',1)))
    def test_image_opacity(self):assert_rejected(lambda r,a:image(r).set('opacity','.5'))
    def test_missing_clip(self):assert_rejected(lambda r,a:surface(r).attrib.pop('clip-path'))
    def test_clip_replaced_by_larger_area(self):assert_rejected(lambda r,a:r.find('.//'+NS+'clipPath/'+NS+'polygon').set('points','-999,-999 999,-999 999,999 -999,999'))
    def test_raster_outside_its_upper_group(self):
        def mutate(r,a):
            node=image(r);surface(r).remove(node);r.append(node)
        assert_rejected(mutate)
    def test_transformed_native_polygon(self):assert_rejected(lambda r,a:r.find(f"{NS}g[@id='rear-upper']/{NS}polygon").set('transform','translate(1 0)'))
    def test_filter(self):assert_rejected(lambda r,a:r.append(ET.Element(NS+'filter')))
    def test_script(self):assert_rejected(lambda r,a:r.append(ET.Element(NS+'script')))
    def test_event_attribute(self):assert_rejected(lambda r,a:r.set('onload','unapproved()'))
    def test_hidden_css(self):assert_rejected(lambda r,a:image(r).set('style','opacity:0'))
    def test_manifest_affine_not_trusted(self):assert_rejected(lambda r,a:a['surfaces'][0]['matrix'].__setitem__(4,100))
    def test_root_external_filter(self):assert_rejected(lambda r,a:r.set('filter','url(https://invalid.example/x.svg#paint)'))
    def test_root_zero_opacity(self):assert_rejected(lambda r,a:r.set('opacity','0'))
    def test_root_external_mask(self):assert_rejected(lambda r,a:r.set('mask','url(https://invalid.example/x.svg#mask)'))
    def test_root_unknown_attribute(self):assert_rejected(lambda r,a:r.set('color','red'))
    def test_group_external_filter(self):assert_rejected(lambda r,a:r.find(NS+'g').set('filter','url(https://invalid.example/x.svg#paint)'))
    def test_group_zero_opacity(self):assert_rejected(lambda r,a:r.find(NS+'g').set('opacity','0'))
    def test_group_external_mask(self):assert_rejected(lambda r,a:r.find(NS+'g').set('mask','url(https://invalid.example/x.svg#mask)'))
    def test_group_unknown_attribute(self):assert_rejected(lambda r,a:r.find(NS+'g').set('fill','red'))
    def test_polygon_external_paint(self):assert_rejected(lambda r,a:r.find(NS+'g/'+NS+'polygon').set('fill','url(https://invalid.example/p.svg#p)'))
    def test_polygon_invalid_paint(self):assert_rejected(lambda r,a:r.find(NS+'g/'+NS+'polygon').set('fill','none'))
    def test_polygon_external_stroke(self):assert_rejected(lambda r,a:r.find(NS+'g/'+NS+'polygon').set('stroke','url(https://invalid.example/p.svg#p)'))
    def test_polygon_external_mask(self):assert_rejected(lambda r,a:r.find(NS+'g/'+NS+'polygon').set('mask','url(https://invalid.example/p.svg#p)'))
    def test_polygon_external_filter(self):assert_rejected(lambda r,a:r.find(NS+'g/'+NS+'polygon').set('filter','url(https://invalid.example/p.svg#p)'))
    def test_polygon_zero_opacity(self):assert_rejected(lambda r,a:r.find(NS+'g/'+NS+'polygon').set('opacity','0'))
    def test_polygon_unknown_attribute(self):assert_rejected(lambda r,a:r.find(NS+'g/'+NS+'polygon').set('visibility','hidden'))
    def test_polygon_wrong_stroke_width(self):assert_rejected(lambda r,a:r.find(NS+'g/'+NS+'polygon').set('stroke-width','900'))
    def test_polygon_nested_child(self):assert_rejected(lambda r,a:r.find(NS+'g/'+NS+'polygon').append(ET.Element(NS+'desc')))
    def test_material_moved_to_foundation_in_full_source(self):
        asset=deepcopy(MANIFEST['assets'][0]);root=ET.parse(STATIC/asset['fullSvg']).getroot()
        node=surface(root);root.find(f"{NS}g[@id='rear-upper']").remove(node);root.find(f"{NS}g[@id='rear-foundation']").append(node)
        with self.assertRaises(AssertionError):verify_svg(root,asset,['foundation','upper'])
    def test_changed_input_bytes(self):
        with tempfile.TemporaryDirectory(prefix='facade-input-negative-') as d:
            target=Path(d)
            for item in MATERIALS.values():
                p=target/item['path'];p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(CHECKOUT/item['path'],p)
            p=target/MATERIALS['roof']['path'];raw=bytearray(p.read_bytes());raw[-1]^=1;p.write_bytes(raw)
            with self.assertRaisesRegex(AssertionError,'unapproved material bytes'):inputs(target)
    def test_symlinked_input(self):
        with tempfile.TemporaryDirectory(prefix='facade-link-negative-') as d:
            target=Path(d);p=target/MATERIALS['roof']['path'];p.parent.mkdir(parents=True,exist_ok=True);p.symlink_to(CHECKOUT/MATERIALS['roof']['path'])
            with self.assertRaises(AssertionError):inputs(target)
    def test_alpha_corruption_rejected_after_rehashing_output(self):self.assert_output_corruption('upper','alpha mask changed',alpha=True)
    def test_foundation_color_change_rejected(self):self.assert_output_corruption('foundation','foundation bytes changed',alpha=False)
    def assert_output_corruption(self,layer,message,alpha):
        with tempfile.TemporaryDirectory(prefix='facade-output-negative-') as d:
            target=Path(d)
            for directory in ['scripts/art/town-plaza-v1','static/games/arpg/town-plaza-v1','art-source/arpg/town-surface-v1']:
                shutil.copytree(CHECKOUT/directory,target/directory,ignore=shutil.ignore_patterns('__pycache__','.inkscape-profile'))
            ts=Path('src/lib/games/arpg/assets/townFacadeData.ts');(target/ts).parent.mkdir(parents=True);shutil.copy2(CHECKOUT/ts,target/ts)
            mp=target/'scripts/art/town-plaza-v1/facade-manifest.json';m=json.loads(mp.read_text());record=m['assets'][0]['layers'][layer]
            p=target/'static/games/arpg/town-plaza-v1'/record['png']
            with Image.open(p) as source:im=source.copy()
            at=next((x,y) for y in range(im.height) for x in range(im.width) if im.getpixel((x,y))[3]==255)
            rgba=list(im.getpixel(at));rgba[3 if alpha else 0]-=1;im.putpixel(at,tuple(rgba));im.save(p)
            record['pngSha256']=hashlib.sha256(p.read_bytes()).hexdigest();mp.write_text(json.dumps(m,indent=2)+'\n')
            hp=mp.with_name('facade-hashes.json');h=json.loads(hp.read_text());h['geometryManifestSha256']=hashlib.sha256(mp.read_bytes()).hexdigest();hp.write_text(json.dumps(h,indent=2)+'\n')
            spec=importlib.util.spec_from_file_location('strict_facade_verify',HERE/'verify-plaza-facades.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            args=SimpleNamespace(checkout=target,manifest=mp,author_script=HERE/'author-plaza-facades.py',original_proof_source=None,rebuild=False)
            with self.assertRaisesRegex(AssertionError,message),contextlib.redirect_stdout(io.StringIO()):module.verify(args)


    def test_character_details_obey_finite_wall_contract(self):
        for asset in MANIFEST['assets']:
            self.assertEqual(verify_character(asset),asset['characterDetails'])
    def test_character_unknown_detail_rejected(self):
        def mutate(r,a):a['characterDetails'].append(deepcopy(a['characterDetails'][0]))
        assert_rejected(mutate)
    def test_duplicate_character_polygon_rejected(self):
        def mutate(r,a):a['polygons'].append(deepcopy(next(p for p in a['polygons'] if p['id'].startswith('character-'))))
        assert_rejected(mutate)
    def test_character_contract_off_plane_rejected(self):
        def mutate(r,a):a['characterDetails'][0]['grid'][0][1]=.1
        assert_rejected(mutate)
    def test_character_polygon_off_plane_rejected(self):
        def mutate(r,a):next(p for p in a['polygons'] if p['id'].startswith('character-'))['grid'][0][1]=.1
        assert_rejected(mutate)
    def test_character_projected_vertex_outside_clip_rejected(self):
        def mutate(r,a):next(p for p in a['polygons'] if p['id'].startswith('character-'))['projected'][0]['x']=10000
        assert_rejected(mutate)
    def test_character_wrong_wall_clip_rejected(self):
        def mutate(r,a):next(p for p in a['polygons'] if p['id'].startswith('character-'))['surfaceClip']='rear-surface-roof-far-plane-clip'
        assert_rejected(mutate)
    def test_character_paint_rejected_even_if_literal_rgb(self):
        def mutate(r,a):r.find(".//"+NS+"polygon[@id='rear-character-knee-brace-0']").set('fill','#ffffff')
        assert_rejected(mutate)
    def test_character_foundation_layer_rejected(self):
        def mutate(r,a):next(p for p in a['polygons'] if p['id'].startswith('character-'))['layer']='foundation'
        assert_rejected(mutate)
    def test_character_stroke_rejected(self):
        def mutate(r,a):next(p for p in a['polygons'] if p['id'].startswith('character-'))['strokeWidth']=1
        assert_rejected(mutate)
    def test_character_full_source_paint_rejected(self):
        asset=deepcopy(MANIFEST['assets'][0]);root=ET.parse(STATIC/asset['fullSvg']).getroot()
        root.find(".//"+NS+"polygon[@id='rear-character-knee-brace-0']").set('fill','#ffffff')
        with self.assertRaisesRegex(AssertionError,'character paint changed'):verify_svg(root,asset,['foundation','upper'])
    def test_character_reserves_existing_door_and_window_apertures(self):
        for asset in MANIFEST['assets']:
            def rect(points):
                td=[(v[0],v[2]) if asset['axis']=='u' else (v[1],v[2]) for v in points]
                return min(t for t,z in td),max(t for t,z in td),min(z for t,z in td),max(z for t,z in td)
            door=rect(asset['features'][0]['grid'])
            windows={p['id']:rect(p['grid']) for p in asset['polygons'] if p['id'].endswith('-frame') and p['id'].startswith(('upper-window-','lower-window-'))}
            shutter_targets={'upper-bay-1':'upper-window-1-frame','lower-bay-3':'lower-window-3-frame'} if asset['id']=='rear' else {'lower-bay-4':'lower-window-4-frame'}
            for detail in asset['characterDetails']:
                if detail['plane']!='long-wall-plane':continue
                a,b,z0,z1=rect(detail['grid']);da,db,dz0,dz1=door
                self.assertTrue(b<=da or a>=db or z1<=dz0 or z0>=dz1,detail['id'])
                own=next((target for key,target in shutter_targets.items() if key in detail['id']),None)
                for name,(wa,wb,wz0,wz1) in windows.items():
                    if name==own:self.assertTrue(wa<a<b<wb and wz0<z0<z1<wz1)
                    else:self.assertTrue(b<=wa or a>=wb or z1<=wz0 or z0>=wz1,detail['id'])
                if 'apron-' in detail['id']:
                    self.assertTrue(b<da-.025 or a>db+.025)
                    self.assertGreaterEqual(min(abs(b-(da-.025)),abs(a-(db+.025)))*64,2)
    def test_single_plain_linen_panel_fits_existing_central_gap(self):
        rear,endcap=MANIFEST['assets'];linen=[d for d in rear['characterDetails'] if d['id'].startswith('character-linen-')]
        self.assertEqual(len(linen),6)
        self.assertFalse(any(d['id'].startswith('character-linen-') for d in endcap['characterDetails']))
        body=next(d for d in linen if d['id']=='character-linen-body');t=[v[0] for v in body['grid']];z=[v[2] for v in body['grid']]
        self.assertEqual((max(t)-min(t))*64,20);self.assertEqual(max(z)-min(z),32)
        self.assertTrue(all(-2.61<v[0]<-2.19 and 15<v[2]<52 and v[1]==0 for d in linen for v in d['grid']))

    def test_rear_braces_meet_existing_posts_and_middle_beam(self):
        rear=MANIFEST['assets'][0];polys={p['id']:p for p in rear['polygons']}
        for i,bay in enumerate([0,3]):
            brace=polys[f'character-knee-brace-{i}']['grid'];post=polys[f'bay-post-{bay}']['grid']
            x0=min(p[0] for p in post);x1=max(p[0] for p in post)
            self.assertTrue(all(x0<=p[0]<=x1 for p in brace[:2]))
            beam=polys['long-timber-beam-2']['grid'];z0=min(p[2] for p in beam);z1=max(p[2] for p in beam)
            self.assertTrue(any(z0<=p[2]<=z1 for p in brace[2:]))

    def test_character_budget_keeps_one_flush_sconce_and_existing_warm_panes(self):
        for asset in MANIFEST['assets']:
            records=asset['characterDetails'];body=[p for p in records if p['id']=='character-sconce-body']
            self.assertEqual(len(body),1)
            p=body[0];t=[v[0] if asset['axis']=='u' else v[1] for v in p['grid']];z=[v[2] for v in p['grid']]
            self.assertEqual((max(t)-min(t))*64,4);self.assertEqual(max(z)-min(z),8)
            root=svg(asset);name='upper-window-4-right' if asset['id']=='rear' else 'lower-window-1-right'
            self.assertEqual(root.find(f".//{NS}polygon[@id='{asset['id']}-{name}']").get('fill'),'#97693c')

if __name__=='__main__':unittest.main(verbosity=2)
