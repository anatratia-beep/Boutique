# Applique l'icône et l'écran de démarrage Boutique au projet Android généré par Capacitor.
import os, shutil, sys
from PIL import Image
here = os.path.dirname(os.path.abspath(__file__))
res = os.path.join('android', 'app', 'src', 'main', 'res')
for d in os.listdir(os.path.join(here, 'res')):
    src = os.path.join(here, 'res', d); dst = os.path.join(res, d)
    os.makedirs(dst, exist_ok=True)
    for f in os.listdir(src): shutil.copy(os.path.join(src, f), os.path.join(dst, f))
icon = Image.open(os.path.join('public', 'icons', 'icon-512.png')).convert('RGBA')
for root, _, files in os.walk(res):
    for f in files:
        if f == 'splash.png':
            p = os.path.join(root, f); w, h = Image.open(p).size
            bg = Image.new('RGB', (w, h), (239, 235, 248)); s = int(min(w, h) * 0.28)
            ic = icon.resize((s, s), Image.LANCZOS); bg.paste(ic, ((w - s) // 2, (h - s) // 2), ic); bg.save(p)
print('icônes et écran de démarrage appliqués')
