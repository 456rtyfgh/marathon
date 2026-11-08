def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def cr(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


P = {
    "light": dict(bg="#f4f2ec", surface="#fbfaf7", sunken="#ebe8df", line="#dcd8cc", ink="#1a1915",
                  ink2="#4a463e", ink3="#625d53", accent="#d97757", on_accent="#141413", accent_ink="#a8492a"),
    "dark": dict(bg="#141413", surface="#1d1c1a", sunken="#262521", line="#302e29", ink="#f0eee6",
                 ink2="#b9b5aa", ink3="#9b978c", accent="#d97757", on_accent="#141413", accent_ink="#e5906f"),
}
for mode, p in P.items():
    print(mode)
    for t in ("ink", "ink2", "ink3"):
        print(" ", t, *(f"{b}={cr(p[t], p[b]):.2f}" for b in ("bg", "surface", "sunken")))
    print("  on_accent/accent", f"{cr(p['on_accent'], p['accent']):.2f}")
    print("  accent_ink", *(f"{b}={cr(p['accent_ink'], p[b]):.2f}" for b in ("bg", "surface")))
    print("  (ref) accent", *(f"{b}={cr(p['accent'], p[b]):.2f}" for b in ("bg", "surface")), f"line/bg={cr(p['line'], p['bg']):.2f}")
