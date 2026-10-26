import json, subprocess, sys, time

PANE, OUT = sys.argv[1], sys.argv[2]
H = 9  # rows above the prompt's bottom border
W = 71

def hk(*keys):
    for k in keys:
        subprocess.run(["herdr", "pane", "send-keys", PANE, k], check=True)
        time.sleep(0.35)

def snap():
    raw = subprocess.run(["herdr", "pane", "read", PANE, "--source", "visible", "--format", "ansi"],
                         capture_output=True, text=True).stdout
    lines = raw.replace("\r\n", "\n").split("\n")
    bottom = max(i for i, l in enumerate(lines) if "─" * 10 in l)
    return [l.replace("\u00a0", " ") for l in lines[bottom - H:bottom + 1]]

frames, t = [], 0.0
caption = ""

def emit(dt):
    global t
    cap = f"\x1b[1;38;2;255;176;85m  {caption}\x1b[0m"
    frames.append([round(t, 3), "o", "\x1b[?25l\x1b[2J\x1b[H" + "\r\n".join([cap, ""] + snap())])
    t += dt

def typ(s, dt=0.09):
    for ch in s:
        hk({" ": "space"}.get(ch, ch))
        emit(dt)

def key(k, dt=0.6):
    hk(k)
    emit(dt)

def scene(name):
    global caption
    hk("ctrl+c")
    time.sleep(2.5)  # let "Press Ctrl-C again" hint expire
    caption = name
    emit(0.8)

scene("Lists continue on Shift+Enter")
typ("Today:"); key("shift+enter")
typ("- write README"); key("shift+enter")
typ("record demo"); key("shift+enter")
typ("ship it"); key("shift+enter", 0.9)
key("shift+enter", 0.9)
typ("1. clone"); key("shift+enter")
typ("symlink"); key("shift+enter")
typ("restart Claude"); key("shift+enter", 0.9)
key("shift+enter", 2.0)

scene("Nested items + auto-indent")
typ("- fruits"); key("shift+enter")
key("backspace", 0.2); key("backspace", 0.2)
typ("    - apple"); key("shift+enter")
typ("pear"); key("shift+enter", 0.9)
key("shift+enter", 0.9)
typ("  plain indent"); key("shift+enter")
typ("keeps its margin"); emit(2.0)

scene("Auto-pair ( [ `  ·  closer steps over  ·  Backspace drops both")
typ("run `"); emit(0.5)
typ("npm test"); key("right", 0.5)
typ(" then print("); emit(0.6)
typ(")"); emit(0.8)
typ(" and list["); emit(0.6)
key("backspace", 0.8)
typ("[0"); key("right", 2.5)

hk("ctrl+c")
header = {"version": 2, "width": W, "height": H + 3}
with open(OUT, "w") as f:
    f.write(json.dumps(header) + "\n")
    for fr in frames:
        f.write(json.dumps(fr) + "\n")
print(len(frames), "frames", round(t, 1), "s")
