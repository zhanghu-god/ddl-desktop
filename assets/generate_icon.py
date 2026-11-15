"""重新生成 Tauri 图标源文件；需要 Pillow。"""

from pathlib import Path

from PIL import Image, ImageDraw

out = Path(__file__).with_name("icon.png")
image = Image.new("RGBA", (1024, 1024))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((64, 64, 960, 960), 220, fill="#3f6ad8")
draw.rounded_rectangle((248, 286, 776, 786), 54, outline="white", width=42)
draw.line((248, 430, 776, 430), fill="white", width=46)
draw.line((380, 230, 380, 346), fill="white", width=46)
draw.line((644, 230, 644, 346), fill="white", width=46)
draw.ellipse((436, 526, 588, 678), fill="#ffb65c")
image.save(out)
print(out)
