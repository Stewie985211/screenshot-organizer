"""Independent BMP pixel oracles produced/read by Pillow, without application code."""
from pathlib import Path
import json
import struct
from PIL import Image

root = Path(__file__).resolve().parents[1]
out = root / 'data' / 'supervision' / 'bmp-oracles'
out.mkdir(parents=True, exist_ok=True)
colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255), (0, 0, 0), (0, 255, 255)]
image = Image.new('RGB', (3, 2))
image.putdata(colors)
files = []
for mode in ['1', 'P', 'RGB', 'RGBA']:
    converted = image.convert(mode)
    file = out / f'pillow-{mode}.bmp'
    converted.save(file)
    files.append(file)
    data = bytearray(file.read_bytes())
    offset = struct.unpack_from('<I', data, 10)[0]
    bits = struct.unpack_from('<H', data, 28)[0]
    stride = ((3 * bits + 31) // 32) * 4
    data[offset:offset + stride * 2] = data[offset + stride:offset + stride * 2] + data[offset:offset + stride]
    struct.pack_into('<i', data, 22, -2)
    top = out / f'pillow-{mode}-top-down.bmp'
    top.write_bytes(data)
    files.append(top)

# Pixel values are subsequently decoded by Pillow to form the oracle.
for bits, compression in [(4, 0), (16, 0), (16, 3)]:
    palette = b''.join(bytes((b, g, r, 0)) for r, g, b in colors + [(0, 0, 0)] * 10) if bits == 4 else b''
    masks = struct.pack('<III', 0xf800, 0x07e0, 0x001f) if compression == 3 else b''
    stride = ((3 * bits + 31) // 32) * 4
    rows = []
    for row in [colors[3:], colors[:3]]:
        if bits == 4:
            indices = [colors.index(c) for c in row]
            pixels = bytes([(indices[0] << 4) | indices[1], indices[2] << 4])
        else:
            values = [((r >> 3) << (11 if compression == 3 else 10)) | ((g >> (2 if compression == 3 else 3)) << 5) | (b >> 3) for r, g, b in row]
            pixels = struct.pack('<HHH', *values)
        rows.append(pixels + b'\0' * (stride - len(pixels)))
    pixels = b''.join(rows)
    offset = 54 + len(palette) + len(masks)
    header = struct.pack('<2sIHHI', b'BM', offset + len(pixels), 0, 0, offset)
    dib = struct.pack('<IiiHHIIiiII', 40, 3, 2, 1, bits, compression, len(pixels), 0, 0, 16 if bits == 4 else 0, 0)
    file = out / f'handmade-{bits}-compression-{compression}.bmp'
    file.write_bytes(header + dib + masks + palette + pixels)
    files.append(file)

oracle = []
for file in files:
    expected = Image.open(file).convert('RGB')
    oracle.append({'file': str(file.relative_to(root)), 'width': expected.width, 'height': expected.height, 'rgb': list(expected.tobytes())})
(out / 'oracle.json').write_text(json.dumps(oracle, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'BMP independent pixel oracles: {len(oracle)}')
