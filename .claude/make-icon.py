"""Writes the app icon from one description: an Icon Composer document (src-tauri/icons/Textflow.icon,
a folder of layers and icon.json, which says how they lie over each other) and, drawn from it by
Icon Composer, the pictures Tauri bundles (the ones tauri.conf.json lists in src-tauri/icons). Run
it after changing anything below:

    python3 .claude/make-icon.py

It needs Xcode (for Icon Composer's ictool) and the project's node_modules (for `tauri icon`).

The drawing: a page, tilted a little, on a light grey plate (in dark mode the system's dark one). On the page three
blocks, stepping in like an outline: at the top a near-black one with a big white T and two short
bars (in dark mode it turns light, with a dark T, so that it stands out from the dark page), in the
middle the editor's dragged block (the strongest blue, lifted and turned, with the drag handle of
2 by 3 dots and the drop line with a ring where it will land), and at the bottom the lightest blue
one. The blues are lensray's three. Coordinates are in a square of 100 by 100."""
import json, os, shutil, subprocess, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = f'{ROOT}/src-tauri/icons'
DOC = f'{ICONS}/Textflow.icon'
ICTOOL = '/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool'

BLUES = ['#0066FF', '#4D94FF', '#99C2FF']
INK, INK_DARK = '#1B1E24', '#F2F4F7'     # the T block, the handle; the T block in dark mode
NAVY = '#0B2D6B'                          # the bars on the lightest block
PAGE, PAGE_DARK = '#FFFFFF', '#2A2D33'
PLATE = '#E6EAF0'                         # Icon Composer makes a gradient of it
TILT = -5                                 # the page's turn in degrees, about the middle

PAGE_BOX = (14, 8, 72, 84, 7)             # x, y, width, height, corner
TOP, DRAGGED, BOTTOM = (20, 15, 50, 22), (28, 44, 50, 16), (36, 67, 44, 16)
LIFT = 'translate(5,-2.5) rotate(-5 53 52)'   # the dragged block, moved up and right and turned about its middle
BARS = {DRAGGED: (0.77, 0.577), BOTTOM: (0.893, 0.592)}   # the lengths of a block's two bars, as shares of its width

# SF Pro's heaviest T, 22 units high, its baseline's left end at 0,0
T = 'M4.85 0.00V-12.51H0.50V-15.50H12.88V-12.51H8.53V0.00Z'

def rrect(x, y, w, h, r):
    return (f'M{x + r:.2f},{y:.2f} H{x + w - r:.2f} A{r},{r} 0 0,1 {x + w:.2f},{y + r:.2f} V{y + h - r:.2f} '
            f'A{r},{r} 0 0,1 {x + w - r:.2f},{y + h:.2f} H{x + r:.2f} A{r},{r} 0 0,1 {x:.2f},{y + h - r:.2f} '
            f'V{y + r:.2f} A{r},{r} 0 0,1 {x + r:.2f},{y:.2f} Z')

def circ(cx, cy, r, sweep=0):
    return f'M{cx - r:.2f},{cy:.2f} a{r:.2f},{r:.2f} 0 1,{sweep} {2 * r:.2f},0 a{r:.2f},{r:.2f} 0 1,{sweep} {-2 * r:.2f},0 Z'

def bars(block):
    x, y, w, h = block
    return [rrect(x + 4, y + 4 + i * 5, (w - 8) * f, 2.6, 1.3) for i, f in enumerate(BARS[block])]

def top_block():
    """The big T at the left of the top block, its middle at the block's, and two bars beside it"""
    x, y, w, h = TOP
    base = y + h / 2 + 0.71 * h / 2
    t = f'<path transform="translate({x + 4:g},{base:.2f})" d="{T}"/>'
    bx = x + 4 + h * 0.68 + 3
    room = x + w - 4 - bx
    return t, [rrect(bx, y + h / 2 - 4.2, room * 0.9, 2.6, 1.3), rrect(bx, y + h / 2 + 1.6, room * 0.55, 2.6, 1.3)]

def srgb(color):
    r, g, b = (int(color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return f'srgb:{r:.5f},{g:.5f},{b:.5f},1.00000'

layers = {}

def layer(name, shapes, color, dark=None, transform=''):
    """A layer of one colour; it keeps that colour in dark mode unless it is given another, since
    Icon Composer otherwise dims it there"""
    t = f' transform="{transform}"' if transform else ''
    body = ''.join(s if s.startswith('<') else f'<path d="{s}"/>' for s in shapes)
    layers[name] = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1024" height="1024">'
                    f'<g transform="rotate({TILT} 50 50)"><g fill="{color}"{t}>{body}</g></g></svg>\n')
    return {'image-name': f'{name}.svg', 'name': name,
            'fill-specializations': [{'appearance': 'dark', 'value': {'solid': srgb(dark or color)}}]}

def group(members, shadow='neutral'):
    return {'layers': members, 'shadow': {'kind': shadow, 'opacity': 0.5}, 'translucency': {'enabled': False, 'value': 0.45}}

x, y, w, h = DRAGGED
t, t_bars = top_block()
document = {
    'fill': {'automatic-gradient': srgb(PLATE)},
    # The groups from the front to the back: the dragged block casts its own shadow over the page
    'groups': [
        group([
            layer('handle', [circ(x - 4.2 + i * 2, y + 5.5 + j * 2, 0.75) for i in range(2) for j in range(3)], INK, INK_DARK, LIFT),
            layer('dragged-bars', bars(DRAGGED), '#FFFFFF', transform=LIFT),
            layer('dragged', [rrect(x, y, w, h, 3)], BLUES[0], transform=LIFT),
        ]),
        group([
            layer('t', [t], '#FFFFFF', INK),
            layer('top-bars', t_bars, BLUES[2], BLUES[0]),
            layer('top', [rrect(*TOP, 3.4)], INK, INK_DARK),
            layer('bottom-bars', bars(BOTTOM), NAVY),
            layer('bottom', [rrect(*BOTTOM, 3)], BLUES[2]),
            # The drop line where the dragged block will land, starting with a ring
            layer('drop', [circ(x + 1.7, y + 1.2, 1.7) + ' ' + circ(x + 1.7, y + 1.2, 1.0, sweep=1), rrect(x + 3.4, y + 0.85, w - 3.4, 0.75, 0.37)], BLUES[0]),
        ], shadow='none'),
        group([layer('page', [rrect(*PAGE_BOX)], PAGE, PAGE_DARK)]),
    ],
    'supported-platforms': {'squares': 'shared'},
}

shutil.rmtree(DOC, ignore_errors=True)
os.makedirs(f'{DOC}/Assets')
for name, svg in layers.items():
    open(f'{DOC}/Assets/{name}.svg', 'w').write(svg)
json.dump(document, open(f'{DOC}/icon.json', 'w'), indent=2)
open(f'{DOC}/icon.json', 'a').write('\n')

# The pictures: Icon Composer draws the icon edge to edge, so it is shrunk to the 824 pixels of
# macOS's grid in the middle of 1024 before Tauri makes its sizes of it
S = tempfile.mkdtemp()
subprocess.run([ICTOOL, DOC, '--export-image', '--output-file', f'{S}/full.png', '--platform', 'macOS', '--rendition', 'Default',
                '--width', '1024', '--height', '1024', '--scale', '1'], check=True, capture_output=True)
subprocess.run(['sips', '-Z', '824', f'{S}/full.png', '--out', f'{S}/body.png'], check=True, capture_output=True)
subprocess.run(['sips', '-p', '1024', '1024', f'{S}/body.png', '--out', f'{S}/icon.png'], check=True, capture_output=True)
subprocess.run(['npx', 'tauri', 'icon', f'{S}/icon.png', '--output', f'{S}/out'], check=True, capture_output=True, cwd=ROOT)
for listed in json.load(open(f'{ROOT}/src-tauri/tauri.conf.json'))['bundle']['icon']:
    shutil.copy(f'{S}/out/{os.path.basename(listed)}', f'{ROOT}/src-tauri/{listed}')

# Assets.car: the icon compiled from the document, with the dark, clear and tinted versions that a
# picture cannot have; tauri.conf.json puts it into the bundle and Info.plist names the icon in it.
# It is compiled here and not by `tauri build`, whose actool runs without stdin: that leaves actool's
# daemon (ibtoold) broken, and every compile after fails with "Bad file descriptor" until it is gone
shutil.copytree(DOC, f'{S}/Icon.icon')
def compile_car():
    shutil.rmtree(f'{S}/car', ignore_errors=True)
    os.makedirs(f'{S}/car')
    subprocess.run(['xcrun', 'actool', f'{S}/Icon.icon', '--compile', f'{S}/car', '--output-partial-info-plist', f'{S}/car/partial.plist',
                    '--app-icon', 'Icon', '--include-all-app-icons', '--enable-on-demand-resources', 'NO', '--development-region', 'en',
                    '--target-device', 'mac', '--minimum-deployment-target', '26.0', '--platform', 'macosx'],
                   stdin=subprocess.DEVNULL, capture_output=True)
    return os.path.exists(f'{S}/car/Assets.car')
if not compile_car():
    # a daemon broken as above is still running: stop it, and the next compile starts a sound one
    subprocess.run(['pkill', '-f', 'ibtoold --sending-client-environment'])
    if not compile_car():
        raise SystemExit('actool did not make Assets.car')
shutil.copy(f'{S}/car/Assets.car', f'{ICONS}/Assets.car')
shutil.rmtree(S)
