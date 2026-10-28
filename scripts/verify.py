from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json

root = Path(__file__).resolve().parents[1] / 'docs'
errors = []
count = 0

class Links(HTMLParser):
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key not in ('href', 'src', 'poster', 'action') or not value:
                continue
            url = urlsplit(value)
            if url.scheme or url.netloc or not url.path:
                continue
            target = (root / unquote(url.path).lstrip('/')) if url.path.startswith('/') else page.parent / unquote(url.path)
            if url.path.startswith('/'):
                errors.append(f'{page.relative_to(root)}: root-absolute URL {value}')
            if not target.exists():
                errors.append(f'{page.relative_to(root)}: missing {value}')

for page in root.rglob('*.html'):
    Links(convert_charrefs=True).feed(page.read_text())
    count += 1
articles = json.loads((root / 'archive.json').read_text())
assert len(articles) == 1950
for article in articles:
    assert (root / 'articles' / (article['id'] + '.html')).is_file()
    assert (root / 'articles' / article['id'] / 'index.html').is_file()
assert not list(root.rglob('.git'))
assert not (root / '.openai').exists()
if errors:
    raise SystemExit('\n'.join(errors[:40]) + f'\nTotal errors: {len(errors)}')
print(f'PASS: {count} HTML pages, 1950 articles, all local links/assets exist; no root-absolute paths.')
