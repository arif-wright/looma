"""Finite, hash-pinned original diffuse fills inside unchanged facade planes.

No repeat, filters, displacement, building raster, or runtime texture requests.
The image affine is a texture-coordinate map, not a change to projected geometry.
"""
from pathlib import Path
import hashlib
import math
import re
import xml.etree.ElementTree as ET
from PIL import Image

NS = 'http://www.w3.org/2000/svg'
INSET = 1.25
PERIOD_WORLD = 256
INVARIANTS_SHA256 = 'e954a64b82e2d0f5c269f885f6f450b44a7bbc1605e9798f1f153485dbd55ad6'
MATERIALS = {
    'roof': {'path': 'art-source/arpg/town-surface-v1/roof-clay-diffuse-v1.png', 'sha256': 'c97f3741cf4df20975011a999be57c55d6f640ec6f96b4e786d7255739795da4'},
    'plaster': {'path': 'art-source/arpg/town-surface-v1/plaster-limewash-diffuse-v1.png', 'sha256': '72b2fc6432342ab01c916471e16dcb87225fdb96de5966fb2fd4936890971516'},
}

def fmt(v):
    return f'{v:.8f}'.rstrip('0').rstrip('.') if v else '0'

def el(tag, **attrs):
    return ET.Element(f'{{{NS}}}{tag}', {k.replace('_', '-'): str(v) for k, v in attrs.items()})

def project(v):
    u, d, z = v
    return {'x': 64 * (u-d), 'y': 32 * (u+d)-z}

def inputs(checkout):
    records = []
    for ident, expected in MATERIALS.items():
        path = checkout / expected['path']
        assert not path.is_symlink() and path.resolve() == checkout.resolve() / expected['path']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == expected['sha256'], ('unapproved material bytes', ident)
        with Image.open(path) as image:
            assert image.size == (1254,1254) and image.mode == 'RGB', ('unapproved material dimensions/mode', ident)
        records.append(dict(id=ident, **expected, width=1254, height=1254, mode='RGB', addressing='finite-no-wrap', worldSpan=PERIOD_WORLD))
    return records

def inset(points, amount=INSET):
    area=sum(a['x']*b['y']-b['x']*a['y'] for a,b in zip(points,points[1:]+points[:1]))
    sign=1 if area>0 else -1
    lines=[]
    for a,b in zip(points,points[1:]+points[:1]):
        dx,dy=b['x']-a['x'],b['y']-a['y'];length=math.hypot(dx,dy)
        nx,ny=-dy/length*sign,dx/length*sign
        lines.append((nx,ny,nx*a['x']+ny*a['y']+amount))
    result=[]
    for a,b in zip(lines[-1:]+lines[:-1],lines):
        det=a[0]*b[1]-b[0]*a[1]
        assert abs(det)>1e-9
        result.append({'x':(a[2]*b[1]-b[2]*a[1])/det,'y':(a[0]*b[2]-b[0]*a[2])/det})
    return result

def mapping(cfg, plane):
    """Map native source pixels to the existing grid plane, once, without wrap."""
    ident, axis, height, ridge = (cfg[k] for k in ('id','axis','wall','ridge'))
    roof = plane.startswith('roof-')
    material = 'roof' if roof else 'plaster'
    size=1254
    def xyz(t,d,z):return [t,d,z] if axis=='u' else [d,t,z]
    if roof:
        far=plane=='roof-far-plane';da=-1 if far else -.5
        crop=(32 if far else 96) if ident=='rear' else (80 if far else 144)
        d0=da-crop/64
        slope=2*ridge if far else -2*ridge
        intercept=height+2*ridge if far else height
        grid=lambda u,v: xyz(-4+4*u/size,d0+4*v/size,intercept+slope*(d0+4*v/size))
        tint,opacity=('#263139',.24) if far else ('#493b30',.06)
    else:
        long=plane=='long-wall-plane'
        ztop=height+(40 if ident=='rear' else 112)
        d0=-1.75 if ident=='rear' else -2.8
        grid=(lambda u,v: xyz(-4+4*u/size,0,ztop-256*v/size)) if long else (lambda u,v: xyz(0,d0+4*u/size,ztop-256*v/size))
        tint,opacity=('#263139',.04) if long else ('#263139',.24)
    p0,pu,pv=[project(grid(u,v)) for u,v in [(0,0),(size,0),(0,size)]]
    matrix=[(pu['x']-p0['x'])/size,(pu['y']-p0['y'])/size,(pv['x']-p0['x'])/size,(pv['y']-p0['y'])/size,p0['x'],p0['y']]
    return dict(plane=plane,material=material,matrix=matrix,tint=tint,tintOpacity=opacity,sourceCornersGrid=[grid(0,0),grid(size,0),grid(0,size)])

def texture_coordinates(matrix,p):
    a,b,c,d,e,f=matrix;det=a*d-b*c
    return ((d*(p['x']-e)-c*(p['y']-f))/det,(-b*(p['x']-e)+a*(p['y']-f))/det)

class SurfacePainter:
    def __init__(self,cfg,upper):
        self.cfg,self.upper=cfg,upper
        self.defs=el('defs');self.records=[]
    def paint(self,plane,grid):
        record=mapping(self.cfg,plane)
        clip=inset([project(v) for v in grid])
        assert all(0<=n<=1254 for p in clip for n in texture_coordinates(record['matrix'],p)), ('interior material wrap',plane)
        ident=f"{self.cfg['id']}-surface-{plane}";clip_id=ident+'-clip'
        polygon=' '.join(f"{fmt(p['x'])},{fmt(p['y'])}" for p in clip)
        clip_element=el('clipPath',id=clip_id,clipPathUnits='userSpaceOnUse');clip_element.append(el('polygon',points=polygon));self.defs.append(clip_element)
        group=el('g',id=ident,clip_path=f'url(#{clip_id})')
        image_attrs=dict(x='0',y='0',width='1254',height='1254',preserveAspectRatio='none',href='../../../../'+MATERIALS[record['material']]['path'],transform='matrix('+ ' '.join(fmt(v) for v in record['matrix'])+')')
        group.append(el('image',**image_attrs))
        group.append(el('polygon',points=polygon,fill=record['tint'],fill_opacity=fmt(record['tintOpacity'])))
        self.upper.append(group)
        self.records.append(dict(**record,id=ident,clipId=clip_id,clipInsetWorld=INSET,clip=clip,imageAttributes=image_attrs))
        return clip_id
    def decorate(self,root):
        root.insert(2,self.defs)
        root.find(f'{{{NS}}}title').text=f"Original town plaza {self.cfg['id']}: material-treated exact-grid prototype"
        root.find(f'{{{NS}}}desc').text='Two original flat diffuse materials are mapped once inside unchanged upper-plane clips. No raster building input, repeat, geometry change or interactive door. Intermediate finish; hosted review remains separate.'


def verify_svg(root, asset, layers):
    """Exact local-image/hash/affine/clip allowlist, including the full source SVG."""
    ns='{'+NS+'}'
    tags={'svg','title','desc','defs','g','polygon','clipPath','image'}
    for node in root.iter():
        assert node.tag.startswith(ns) and node.tag[len(ns):] in tags, ('unapproved SVG element',node.tag)
        assert not any(k.startswith('on') or k=='style' for k in node.attrib), 'unapproved SVG executable/style attribute'
    # No inherited paint/filter/opacity may bypass the exact material groups.
    # Root and native groups are deliberately attribute-free except this fixed
    # import contract. Native paints are literal RGB colors, never URL values.
    expected_root = dict(version='1.1', role='img', viewBox=' '.join(fmt(v) for v in asset['viewBox']),
                         width=str(asset['sourcePixelDimensions'][0]), height=str(asset['sourcePixelDimensions'][1]),
                         preserveAspectRatio='xMidYMid meet')
    assert root.attrib == expected_root, 'unapproved SVG root attribute'
    assert [n.tag for n in root] == [ns+'title',ns+'desc'] + ([ns+'defs'] if 'upper' in layers else []) + [ns+'g']*len(layers), 'unapproved SVG root structure'
    for tag in ['title','desc']:
        nodes=root.findall(ns+tag)
        assert len(nodes)==1 and nodes[0].attrib=={} and len(nodes[0])==0, 'unapproved SVG metadata structure'
    for layer,group in zip(layers,root.findall(ns+'g')):
        assert group.attrib == {'id':f"{asset['id']}-{layer}"}, 'unapproved native group attribute'
        surface_groups=group.findall(ns+'g')
        expected_surface_ids={r['id'] for r in asset['surfaces']} if layer=='upper' else set()
        assert len(surface_groups)==len(expected_surface_ids) and {g.attrib.get('id') for g in surface_groups}==expected_surface_ids, 'material outside its native upper layer'
        polygons=[p for p in asset['polygons'] if p['layer']==layer]
        nodes=group.findall(ns+'polygon')
        assert len(nodes)==len(polygons), 'unexpected native polygon count'
        assert all(n.tag in [ns+'polygon',ns+'g'] for n in group), 'unexpected native child'
        for node,record in zip(nodes,polygons):
            attrs={'id':f"{asset['id']}-{record['id']}", 'points':' '.join(f"{fmt(p['x'])},{fmt(p['y'])}" for p in record['projected']), 'fill':node.attrib.get('fill','')}
            assert re.fullmatch(r'#[0-9a-fA-F]{6}',attrs['fill']), 'unapproved native paint'
            if record['strokeWidth']:
                attrs.update(stroke='#493e33', **{'stroke-width':fmt(record['strokeWidth']),'stroke-linejoin':'round'})
            if record.get('surfaceClip'):attrs['clip-path']=f"url(#{record['surfaceClip']})"
            assert node.attrib==attrs and len(node)==0, 'unapproved native polygon attribute/child'
    upper='upper' in layers
    painter=SurfacePainter(asset,el('g'))
    if upper:
        for plane in asset['majorPlanes']:
            if plane['layer']=='upper':painter.paint(plane['id'],plane['grid'])
        assert asset['surfaces']==painter.records, 'unapproved material placement/contract'
    expected_ids={f"{asset['id']}-{layer}" for layer in layers}|{r['id'] for r in painter.records}
    groups=root.findall('.//'+ns+'g')
    assert len(groups)==len(expected_ids) and {g.attrib.get('id') for g in groups}==expected_ids, 'unexpected SVG group'
    images=root.findall('.//'+ns+'image')
    assert len(images)==len(painter.records), 'unexpected raster source'
    defs=root.findall(ns+'defs')
    assert len(defs)==(1 if upper else 0), 'unexpected material definitions'
    def same(a,b):
        assert a.tag==b.tag and a.attrib==b.attrib, ('unapproved source/affine/clip attribute',a.attrib,b.attrib)
        assert len(a)==len(b),'unexpected surface child'
        for x,y in zip(a,b):same(x,y)
    if upper:same(defs[0],painter.defs)
    for expected in painter.upper:
        actual=[g for g in groups if g.attrib.get('id')==expected.attrib['id']]
        assert len(actual)==1
        same(actual[0],expected)
    image_ids={id(node) for node in images}
    assert all('transform' not in n.attrib or id(n) in image_ids for n in root.iter()), 'transformed non-material geometry'
    native_count=sum(p['layer'] in layers for p in asset['polygons'])
    assert len(root.findall('.//'+ns+'polygon'))==native_count+2*len(painter.records), 'unexpected drawable/clip polygon'
