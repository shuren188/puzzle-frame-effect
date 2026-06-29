"""将相框PNG压缩为WebP格式（保留源文件）"""
from PIL import Image
import os

base = 'F:/Claude Code/拼图裁剪 - 添加相框效果图/public/frames'
sizes = ['35', '70', '120', '200', '300']

total_old = 0
total_new = 0

for orient in ['h', 'v']:
    folder = os.path.join(base, orient)
    for size in sizes:
        src = os.path.join(folder, f'{size}.png')
        dst = os.path.join(folder, f'{size}.webp')
        if not os.path.exists(src):
            # 可能已转换过，检查webp是否存在
            if os.path.exists(dst):
                old_sz = os.path.getsize(dst)  # approx
                print(f'{orient}/{size}.webp: 已存在 ({old_sz//1024}KB)')
            continue
        img = Image.open(src).convert('RGBA')
        old_size = os.path.getsize(src)
        # 尝试有损压缩（视觉无损，体积更小）
        for q in [90, 95, 100]:
            img.save(dst, 'WEBP', quality=q)
            new_size = os.path.getsize(dst)
            if new_size < old_size * 0.3 or q == 100:
                break
        ratio = (1 - new_size / old_size) * 100
        total_old += old_size
        total_new += new_size
        print(f'{orient}/{size}.png: {old_size//1024}KB -> {new_size//1024}KB (压缩{ratio:.0f}%)')

print(f'\n总计: {total_old//1024}KB -> {total_new//1024}KB (压缩{(1-total_new/total_old)*100:.0f}%)')
