"""Writes the fonts the PDF export embeds (src/app/functions/convert/fonts/), cut down from the
Google Fonts releases to what documents need. Run it after changing anything below:

    python3 .claude/make-fonts.py

It needs npm (the fonts come from the @expo-google-fonts packages, which carry the static TTFs)
and fontTools (`pip install fonttools`).

Inter (text) keeps Latin, Greek, Cyrillic and the common symbols. Source Code Pro (code) is copied
as it is: its licence reserves the name "Source", so a cut-down copy would need another name. Noto
Sans JP, SC and TC keep the characters of Japanese, Simplified and Traditional Chinese's standard
sets (Shift JIS, GB 2312, Big5), with kana and the CJK punctuation; which characters each holds
goes to cjk.js, so the export picks a font that has them."""
import base64, os, shutil, subprocess, tempfile
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = f'{ROOT}/src/app/functions/convert/fonts'

LATIN = ('U+0000-036F,U+0370-03FF,U+0400-052F,U+1E00-1FFF,U+2000-206F,U+2070-209F,U+20A0-20CF,'
         'U+2100-218F,U+2190-23FF,U+2460-24FF,U+2500-27BF,U+FB00-FB06,U+FFFD')

# the part of Unicode cjk.js describes: CJK radicals to the end of the fullwidth forms
CJK_FROM, CJK_TO = 0x2E80, 0xFFEF

# (package, its version, [(source style, our file)], charset codec, None for LATIN or 'unchanged')
FONTS = [
  ('inter', '0.4.2', 'Inter', [('400Regular', 'Inter-Regular'), ('700Bold', 'Inter-Bold'),
    ('400Regular_Italic', 'Inter-Italic'), ('700Bold_Italic', 'Inter-BoldItalic')], None),
  ('source-code-pro', '0.4.2', 'SourceCodePro', [('400Regular', 'SourceCodePro-Regular'), ('700Bold', 'SourceCodePro-Bold'),
    ('400Regular_Italic', 'SourceCodePro-Italic'), ('700Bold_Italic', 'SourceCodePro-BoldItalic')], 'unchanged'),
  ('noto-sans-jp', '0.4.4', 'NotoSansJP', [('400Regular', 'NotoSansJP-Regular'), ('700Bold', 'NotoSansJP-Bold')], 'cp932'),
  ('noto-sans-sc', '0.4.4', 'NotoSansSC', [('400Regular', 'NotoSansSC-Regular'), ('700Bold', 'NotoSansSC-Bold')], 'gb2312'),
  ('noto-sans-tc', '0.4.4', 'NotoSansTC', [('400Regular', 'NotoSansTC-Regular'), ('700Bold', 'NotoSansTC-Bold')], 'big5'),
]


def charset(codec):
  def encodes(c):
    try:
      chr(c).encode(codec)
      return True
    except UnicodeEncodeError:
      return False
  # all of kana and the CJK punctuation, whatever the set has
  return [c for c in range(CJK_FROM, CJK_TO + 1) if 0x3000 <= c <= 0x30FF or encodes(c)]


def bits(font_path):
  cmap = TTFont(font_path).getBestCmap()
  bytes_ = bytearray((CJK_TO - CJK_FROM) // 8 + 1)
  for c in cmap:
    if CJK_FROM <= c <= CJK_TO:
      bytes_[(c - CJK_FROM) // 8] |= 1 << ((c - CJK_FROM) % 8)
  return base64.b64encode(bytes(bytes_)).decode()


def main():
  os.makedirs(OUT, exist_ok=True)
  coverage = {}
  with tempfile.TemporaryDirectory() as temp:
    for package, version, name, styles, codec in FONTS:
      subprocess.run(['npm', 'pack', f'@expo-google-fonts/{package}@{version}', '--silent'], cwd=temp, check=True, stdout=subprocess.DEVNULL)
      folder = f'{temp}/{package}'
      os.makedirs(folder)
      subprocess.run(['tar', 'xzf', f'{temp}/expo-google-fonts-{package}-{version}.tgz', '-C', folder], check=True)
      unicodes = LATIN
      if codec == 'unchanged':
        for style, ours in styles:
          shutil.copyfile(f'{folder}/package/{style}/{name}_{style}.ttf', f'{OUT}/{ours}.ttf')
      elif codec:
        unicodes = f'{temp}/{package}.txt'
        with open(unicodes, 'w') as file:
          file.write(','.join(f'U+{c:04X}' for c in charset(codec)))
      for style, ours in styles if codec != 'unchanged' else []:
        target = f'{OUT}/{ours}.ttf'
        subprocess.run(['pyftsubset', f'{folder}/package/{style}/{name}_{style}.ttf',
          f'--unicodes-file={unicodes}' if codec else f'--unicodes={unicodes}',
          '--no-hinting', f'--output-file={target}'], check=True)
        if codec and style == '400Regular':
          coverage[package[-2:]] = bits(target)
      with open(f'{folder}/package/LICENSE_FONT') as source, open(f'{OUT}/{name}-OFL.txt', 'w') as licence:
        licence.write(source.read())

  with open(f'{OUT}/cjk.js', 'w') as file:
    file.write('// Written by .claude/make-fonts.py: which characters from U+2E80 to U+FFEF each bundled CJK\n')
    file.write('// font holds, one bit per character, base64.\n\n')
    file.write(f'export const from = 0x{CJK_FROM:X}\n\n')
    for region, value in coverage.items():
      file.write(f"export const {region} = '{value}'\n")


main()
