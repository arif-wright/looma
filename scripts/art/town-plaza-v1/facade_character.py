"""Bounded original wall details for the existing two exact-grid facades.

Literal-color polygons only, in the existing inset wall clips. No new material,
opening, protrusion, source alpha, foundation, footprint or runtime object.
"""

def details(cfg):
    ident, axis = cfg['id'], cfg['axis']
    assert ident in ('rear', 'endcap') and axis == ('u' if ident == 'rear' else 'v')
    result = []
    def add(name, points, fill, side='long'):
        grid = [[t, d, z] if axis == 'u' else [d, t, z] for t, d, z in points]
        result.append(dict(id='character-'+name, plane=side+'-wall-plane', grid=grid, fill=fill))
    def rect(name, a, b, z0, z1, fill, side='long'):
        points = [(a,0,z0),(b,0,z0),(b,0,z1),(a,0,z1)] if side=='long' else [(0,a,z0),(0,b,z0),(0,b,z1),(0,a,z1)]
        add(name, points, fill, side)
    def shutter(name, middle, z0, height, state):
        # Every board remains within the existing aperture's original pane box.
        a,b,z1=middle-.167,middle+.167,z0+height-2
        if state=='closed':
            leaves=[(a,middle-.01),(middle+.01,b)]
        elif state=='half':
            leaves=[(middle+.01,b)]
        else:
            assert state=='stowed'
            leaves=[(a,a+.05)]
        for i,(x0,x1) in enumerate(leaves):
            rect(f'{name}-leaf-{i}',x0,x1,z0+2,z1,'#665443')
            if x1-x0>.08:
                rect(f'{name}-plank-gap-{i}',(x0+x1)/2,(x0+x1)/2+.008,z0+2,z1,'#2c2824')
                rect(f'{name}-strap-{i}',x0+.01,x1-.01,z0+6,z0+7.5,'#43372d')
            rect(f'{name}-wear-{i}',x0+.008,x0+.016,z0+4,z1-2,'#81674b')
    if ident=='rear':
        # Two grouping accents in the blank inter-storey strip, below apertures.
        for i,(bay,beam_end) in enumerate([(0,-3.6),(3,-1.2)]):
            # Meet the exact existing post span while retaining the beam end.
            post=-4+bay*.8+(.02 if bay==0 else -.0125)
            a=(post+.004,0,62.5);b=(post+.023,0,63.7)
            c=(beam_end,0,55.7);d=(beam_end-.03,0,54.5)
            add(f'knee-brace-{i}',[a,b,c,d],'#43372d')
            mix=lambda p,q,t:tuple(x+(y-x)*t for x,y in zip(p,q))
            add(f'knee-brace-wear-{i}',[mix(a,b,.65),mix(a,b,.85),mix(d,c,.85),mix(d,c,.65)],'#81674b')
        shutter('upper-bay-1-closed',-2.8,65,21,'closed')
        shutter('lower-bay-3-half',-1.2,24,19,'half')
        # A single plain hanging linen panel in the existing central bay gap.
        # It is wall-bound decoration, with no text, emblem or interaction.
        a,b=-2.55625,-2.24375
        add('linen-body',[(a,0,17.2),(a+.07,0,16),(b-.04,0,17.5),(b,0,16.8),(b,0,48),(a,0,48)],'#cbb48f')
        add('linen-fold-light',[(a+.045,0,17),(a+.085,0,16.2),(a+.105,0,48),(a+.070,0,48)],'#dcc59d')
        add('linen-fold-shadow',[(b-.09,0,17.2),(b-.055,0,17.4),(b-.070,0,48),(b-.110,0,48)],'#9a8260')
        rect('linen-rail',a-.015625,b+.015625,49,51,'#43372d')
        for i,t in enumerate([a+.025,b-.045]):rect(f'linen-tab-{i}',t,t+.020,47.5,50,'#cbb48f')
    else:
        # Applied stone facing in the upper layer, leaving the old z0..8 split
        # and the existing door/jamb opening completely unchanged.
        for group,(a,b) in enumerate([(-3.96,-2.22),(-1.78,-.04)]):
            rect(f'apron-{group}-bed',a,b,10,20,'#474e4a')
            for i in range(7):
                x0=a+(b-a)*i/7+.007;x1=a+(b-a)*(i+1)/7-.007
                rect(f'apron-{group}-stone-{i}',x0,x1,10.5,19.5,'#76756a')
                if i%3==1:rect(f'apron-{group}-edge-{i}',x0+.025,x1-.03,18.5,19.2,'#aaa08a')
        rect('short-apron-bed',-.96,-.04,10,20,'#474e4a','short')
        for i in range(4):
            a=-.96+i*.23+.007;b=-.96+(i+1)*.23-.007
            rect(f'short-apron-stone-{i}',a,b,10.5,19.5,'#76756a','short')
        # Two compact surrounds, centered over existing apertures, not openings.
        for group,middle in enumerate([-3.6,-1.2]):
            rect(f'lintel-{group}-shadow',middle-.23,middle+.23,44.5,50.5,'#474e4a')
            for i in range(3):
                a=middle-.23+i*.46/3+.008;b=middle-.23+(i+1)*.46/3-.008
                rect(f'lintel-{group}-stone-{i}',a,b,45.2,50.0,'#76756a')
                rect(f'lintel-{group}-edge-{i}',a+.01,b-.01,49.1,49.7,'#aaa08a')
            rect(f'lintel-{group}-quoin',middle-.23,middle-.197,39,44,'#76756a')
        shutter('lower-bay-4-closed',-.4,24,19,'closed')
    # One flush painted iron/amber sconce beside each closed decorative door.
    # It has no wall/floor glow, alpha effect, runtime light or interaction.
    a=-.15 if ident=='rear' else -1.69
    rect('sconce-body',a,a+.0625,35,43,'#302d29')
    rect('sconce-amber',a+.010,a+.0525,36.1,41.7,'#d7a158')
    rect('sconce-core',a+.025,a+.038,37.0,40.8,'#efc77d')
    rect('sconce-top',a-.008,a+.0705,42.5,43.8,'#302d29')
    return result


def verify(asset):
    """Reject altered detail records and out-of-plane/interior-mask placements."""
    expected=details(asset)
    assert asset['characterDetails']==expected,'unapproved facade character contract'
    records=[p for p in asset['polygons'] if p['id'].startswith('character-')]
    by_id={p['id']:p for p in records}
    assert len(records)==len(by_id)==len(expected) and set(by_id)=={d['id'] for d in expected},'unapproved facade character count/identity'
    for item in expected:
        record=by_id[item['id']]
        assert record['projected']==[{'x':64*(u-v),'y':32*(u+v)-z} for u,v,z in item['grid']], 'character projection changed'
        assert record['grid']==item['grid'] and record['layer']=='upper' and record['strokeWidth']==0 and not record['majorPlane'],'altered character polygon'
        assert record.get('surfaceClip')==f"{asset['id']}-surface-{item['plane']}-clip",'wrong character wall clip'
        plane=next(s for s in asset['surfaces'] if s['plane']==item['plane'])
        poly=plane['clip']
        area=sum(a['x']*b['y']-b['x']*a['y'] for a,b in zip(poly,poly[1:]+poly[:1]))
        sign=1 if area>0 else -1
        for vertex,p in zip(record['grid'],record['projected']):
            t,d,z=vertex if asset['axis']=='u' else [vertex[1],vertex[0],vertex[2]]
            assert (d==0 if item['plane']=='long-wall-plane' else t==0),'character vertex off wall plane'
            assert 8<z<asset['wall'],'character changed foundation or roof'
            for a,b in zip(poly,poly[1:]+poly[:1]):
                cross=(b['x']-a['x'])*(p['y']-a['y'])-(b['y']-a['y'])*(p['x']-a['x'])
                assert sign*cross>=-1e-8,'character extends beyond inset wall clip'
    return expected
