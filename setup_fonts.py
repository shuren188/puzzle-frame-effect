"""使用 fonttools 从系统字体创建子集化 Web 字体"""
import subprocess, os, glob

FONT_DIR = 'F:/Claude Code/拼图裁剪 - 添加相框效果图/public/fonts'
os.makedirs(FONT_DIR, exist_ok=True)

# 常用中文字符集：GB2312一级（3755字）+ 二级（3008字）+ 界面用字
# 覆盖 99%+ 日常使用
CJK = ''.join(chr(c) for c in range(0x4E00, 0x9FA5))  # 基本 CJK 统一汉字
EXTRA = '，。、；：？！…—·「」『』【】（）《》〈〉""\'‘’“”'
EXTRA += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
EXTRA += '0123456789'
EXTRA += '！＠＃＄％＾＆＊＋－＝～｜／＼'
EXTRA += '自由裁剪编辑高清放大照片拼图DIY效果图添加文字重置上传下载'
EXTRA += '拼图尺寸画质修复旋转角度填充颜色添加相框保持完整白边适配'
EXTRA += '点击上传或拖拽图片支持PNGJPGWebP等多种格式情侣照艺术照日常生活照'
EXTRA += '全家福集体照动漫宠物明星等均可自由定制双指捏合缩放缩放比例'
EXTRA += '左转右转原图高清超倍分辨率重置下载图片'

CHARSET = ''.join(dict.fromkeys(CJK + EXTRA))
print(f'字符集大小: {len(CHARSET)} 字符')

charset_file = os.path.join(FONT_DIR, 'charset.txt')
with open(charset_file, 'w', encoding='utf-8') as f:
    for c in CHARSET:
        f.write(c + '\n')

def subset_font(src_path, output_name, font_name):
    """使用 fonttools 子集化字体"""
    dst = os.path.join(FONT_DIR, output_name)
    charset_arg = os.path.join(FONT_DIR, 'charset.txt')

    cmd = [
        'pyftsubset', src_path,
        f'--text-file={charset_arg}',
        f'--output-file={dst}',
        '--flavor=woff2',
        '--with-zopfli',
        '--layout-features=*',
        '--drop-tables-=',
        '--notdef-outline',
        '--glyph-names',
        '--legacy-cmap',
    ]

    print(f'正在子集化 {font_name}...')
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        size_kb = os.path.getsize(dst) / 1024
        print(f'  ✅ {output_name}: {size_kb:.0f}KB')
        return True
    else:
        print(f'  ❌ 失败: {result.stderr}')
        return False

# 1. Noto Sans SC (思源黑体)
noto_path = 'C:/Windows/Fonts/NotoSansSC-VF.ttf'
if os.path.exists(noto_path):
    subset_font(noto_path, 'NotoSansSC.woff2', 'Noto Sans SC (思源黑体)')
else:
    print('❌ NotoSansSC-VF.ttf 未找到')

# 2. 思源黑体旧字形 Regular (思源变体)
siyuan_path = 'C:/Users/Administrator/AppData/Local/Microsoft/Windows/Fonts/思源黑体旧字形 Regular.TTF'
if os.path.exists(siyuan_path):
    subset_font(siyuan_path, 'SiYuanHei.woff2', '思源黑体旧字形')
else:
    print('❌ 思源黑体旧字形 未找到')

# 3. 清茶楷体 (楷体风格)
kaiti_path = 'C:/Users/Administrator/AppData/Local/Microsoft/Windows/Fonts/清茶楷体.ttf'
if os.path.exists(kaiti_path):
    subset_font(kaiti_path, 'QingChaKaiTi.woff2', '清茶楷体')
else:
    print('❌ 清茶楷体 未找到')

print('\n✅ 子集化完成！')
# 列出结果
for f in glob.glob(os.path.join(FONT_DIR, '*.woff2')):
    print(f'  {os.path.basename(f)}: {os.path.getsize(f)//1024}KB')
