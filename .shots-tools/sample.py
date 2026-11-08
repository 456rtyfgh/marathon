import subprocess, sys

D = sys.argv[1]
SPECS = [
    ("bg", "frame_0037.jpg", 20, 20),
    ("bg2", "frame_0040.jpg", 340, 600),
    ("card", "frame_0040.jpg", 40, 200),
    ("tile", "frame_0037.jpg", 150, 200),
    ("btn", "frame_0040.jpg", 75, 420),
    ("hero", "frame_0003.jpg", 330, 110),
    ("white", "frame_0037.jpg", 70, 360),
    ("subtle", "frame_0040.jpg", 200, 352),
    ("hilite", "frame_0009.jpg", 150, 532),
]
for name, f, x, y in SPECS:
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", f"{D}/{f}", "-vf", f"crop=5:5:{x}:{y},scale=1:1:flags=area",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True, check=True).stdout
    print(name, "#" + raw[:3].hex())
