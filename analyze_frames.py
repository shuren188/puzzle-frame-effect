from PIL import Image
import os, json

def analyze_frame(path, label):
    img = Image.open(path).convert('RGBA')
    pixels = img.load()
    w, h = img.size
    threshold = 40

    left_edges, right_edges = [], []
    for y in range(h):
        has_frame = False
        for x in range(0, w, 4):
            if pixels[x, y][3] > 200:
                has_frame = True
                break
        if not has_frame:
            continue
        found = -1
        for x in range(w // 2, -1, -1):
            if pixels[x, y][3] < threshold:
                found = x
            else:
                break
        if found > 10:
            left_edges.append(found)
        found = -1
        for x in range(w // 2, w):
            if pixels[x, y][3] < threshold:
                found = x
            else:
                break
        if found > 0 and found < w - 10:
            right_edges.append(found)

    top_edges, bottom_edges = [], []
    for x in range(w):
        has_frame = False
        for y in range(0, h, 4):
            if pixels[x, y][3] > 200:
                has_frame = True
                break
        if not has_frame:
            continue
        found = -1
        for y in range(h // 2, -1, -1):
            if pixels[x, y][3] < threshold:
                found = y
            else:
                break
        if found > 10:
            top_edges.append(found)
        found = -1
        for y in range(h // 2, h):
            if pixels[x, y][3] < threshold:
                found = y
            else:
                break
        if found > 0 and found < h - 10:
            bottom_edges.append(found)

    if len(left_edges) < 5 or len(right_edges) < 5 or len(top_edges) < 5 or len(bottom_edges) < 5:
        print(f"{label}: [FAIL] left={len(left_edges)} right={len(right_edges)} top={len(top_edges)} bottom={len(bottom_edges)}")
        return None

    left_edges.sort(); right_edges.sort(); top_edges.sort(); bottom_edges.sort()
    inner_left = left_edges[int(len(left_edges) * 0.85)]
    inner_right = right_edges[int(len(right_edges) * 0.15)]
    inner_top = top_edges[int(len(top_edges) * 0.85)]
    inner_bottom = bottom_edges[int(len(bottom_edges) * 0.15)]

    # Verify
    inner_trans = 0
    inner_pixels = 0
    for y in range(max(0, inner_top), min(h, inner_bottom)):
        for x in range(max(0, inner_left), min(w, inner_right)):
            inner_pixels += 1
            if pixels[x, y][3] < threshold:
                inner_trans += 1
    trans_pct = inner_trans / inner_pixels * 100 if inner_pixels > 0 else 0

    print(f"{label}:")
    print(f"  PNG: {w}x{h}")
    print(f"  内框: L={inner_left} T={inner_top} R={inner_right} B={inner_bottom}")
    print(f"  内框尺寸: {inner_right-inner_left}x{inner_bottom-inner_top}, 透明度: {trans_pct:.1f}%")
    print(f"  边框: left={inner_left} top={inner_top} right={w-inner_right} bottom={h-inner_bottom}")

    return {
        'frameWidth': w, 'frameHeight': h,
        'innerLeft': inner_left, 'innerTop': inner_top,
        'innerWidth': inner_right - inner_left, 'innerHeight': inner_bottom - inner_top,
    }

base = 'F:/Claude Code/拼图裁剪 - 添加相框效果图'
results = {}
sizes = ['35', '70', '120', '200', '300']
dirs = [('public/frames/h', 'h', '横版'), ('public/frames/v', 'v', '竖版')]

for folder, orientation, label in dirs:
    print("=" * 60)
    print(f"{label}相框")
    print("=" * 60)
    full_path = os.path.join(base, folder)
    for size in sizes:
        path = os.path.join(full_path, f'{size}.png')
        if os.path.exists(path):
            key = f'{size}_{orientation}'
            r = analyze_frame(path, f'{label} {size}片')
            if r:
                results[key] = r

print()
print("=" * 60)
print("FRAME_CONFIG")
print("=" * 60)
print()

keys_order = ['35_h', '35_v', '70_h', '70_v', '120_h', '120_v', '200_h', '200_v', '300_h', '300_v']
all_ok = all(k in results for k in keys_order)
print(f"// 状态: {'全部OK' if all_ok else '部分缺失'}")
print()

print("export const FRAME_CONFIG = {")
for key in keys_order:
    if key in results:
        r = results[key]
        print(f"  '{key}': {{")
        print(f"    frameWidth: {r['frameWidth']},")
        print(f"    frameHeight: {r['frameHeight']},")
        print(f"    innerLeft: {r['innerLeft']},")
        print(f"    innerTop: {r['innerTop']},")
        print(f"    innerWidth: {r['innerWidth']},")
        print(f"    innerHeight: {r['innerHeight']},")
        print(f"  }},")
    else:
        print(f"  // {key}: MISSING")
print("};")
