from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
for name in ('key-art', 'portraits'):
    source = root / 'art-source' / f'{name}.png'
    target = root / 'assets' / f'{name}.webp'
    with Image.open(source) as image:
        image.convert('RGB').save(target, 'WEBP', quality=88, method=6)
        print(f'{name}: {image.size[0]}x{image.size[1]}, {target.stat().st_size} bytes')
