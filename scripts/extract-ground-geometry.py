"""Extract only retail/core vector fills, excluding PDF text and technical linework."""
import json
from pathlib import Path
import pymupdf

source = Path(r'C:\Users\User\Downloads\Ground Floor Plan- Grand View High Street.pdf')
doc = pymupdf.open(source)
groups = {'retail': [], 'core': []}
def xy(point):
    return f'{point.x:.2f} {point.y:.2f}'
for shape in doc[0].get_drawings():
    fill = shape.get('fill')
    if not fill:
        continue
    kind = 'retail' if abs(fill[0]-.667)<.01 else 'core' if abs(fill[0]-.98)<.01 else None
    if not kind:
        continue
    commands=[]
    last=None
    for item in shape['items']:
        if item[0]=='re':
            r=item[1]
            commands.append(f'M{r.x0:.2f} {r.y0:.2f}H{r.x1:.2f}V{r.y1:.2f}H{r.x0:.2f}Z')
            last=None
        elif item[0]=='qu':
            q=item[1]
            commands.append(f'M{xy(q.ul)}L{xy(q.ur)}L{xy(q.lr)}L{xy(q.ll)}Z')
            last=None
        elif item[0] in ('l','c'):
            if last!=item[1]:
                commands.append('M'+xy(item[1]))
            commands.append(('L'+xy(item[2])) if item[0]=='l' else 'C'+' '.join(xy(p) for p in item[2:]))
            last=item[-1]
    if shape.get('closePath'):
        commands.append('Z')
    if commands:
        groups[kind].append(''.join(commands))
target=Path('packages/domain/reference/ground-geometry.ts')
target.write_text('// Generated from PDF vector fills; no PDF image, text or annotations.\nexport const groundGeometry = '+json.dumps(groups)+' as const;\n',encoding='utf-8')
print({key:len(value) for key,value in groups.items()})
