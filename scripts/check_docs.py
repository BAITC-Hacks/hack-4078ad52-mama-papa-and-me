#!/usr/bin/env python3
"""Read-only documentation, source-secret-pattern and ignore checks; not application tests."""
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
MODULES = 'app ui backend engine ai storage data contracts config mocks'.split()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def exact_path(path):
    """Check spelling even on a case-insensitive filesystem."""
    require(path.is_relative_to(ROOT), f'Link escapes repository: {path}')
    current = ROOT
    for part in path.relative_to(ROOT).parts:
        require(part in {p.name for p in current.iterdir()}, f'Missing/case-mismatched link: {path}')
        current /= part


def main():
    names = {p.name for p in ROOT.iterdir()}
    require({n for n in names if n.lower() == 'agents.md'} == {'AGENTS.md'},
            'Expected exactly one root instruction named AGENTS.md')
    required = ['README.md', 'AGENTS.md', 'plans.md', '.env.example', '.gitignore',
                'docs/team-roles.md', 'docs/architecture/README.md',
                'docs/data/dataset-source.md', 'docs/data/README.md', 'docs/research/README.md',
                'docs/superpowers/specs/2026-09-23-openai-astra-integration-design.md',
                'scripts/check_docs.py', 'scripts/verify_dataset.py', 'scripts/README.md',
                'tests/README.md', 'tests/integration/README.md', 'tests/e2e/README.md']
    required += [f'src/{module}/README.md' for module in MODULES]
    required += [f'src/ui/{part}/README.md' for part in ['components', 'features', 'styles']]
    for name in required:
        exact_path(ROOT / name)
    for module in MODULES:
        body = (ROOT / f'src/{module}/README.md').read_text()
        for heading in ['Ответственность', 'Внутренняя структура', 'Публичный интерфейс',
                        'Зависимости', 'Проверки при реализации']:
            require(f'## {heading}' in body, f'{module}: missing {heading}')

    markdown = [ROOT / name for name in ['README.md', 'AGENTS.md', 'plans.md']]
    for directory in ['docs', 'src', 'tests', 'scripts']:
        markdown.extend(sorted((ROOT / directory).rglob('*.md')))
    checked_links = 0
    for path in markdown:
        # Fenced examples are not rendered links.
        body = re.sub(r'^```.*?^```[^\n]*$', '', path.read_text(), flags=re.M | re.S)
        for target in re.findall(r'\[[^\]\n]+\]\(([^)\n]+)\)', body):
            target = target.strip().strip('<>')
            parsed = urlsplit(target)
            if parsed.scheme or target.startswith('#'):
                continue
            exact_path((path.parent / unquote(parsed.path)).resolve())
            checked_links += 1

    env = dict(line.split('=', 1) for line in (ROOT / '.env.example').read_text().splitlines()
               if line and not line.startswith('#'))
    require(env == {'OPENAI_API_KEY': '', 'OPENAI_MODEL': 'gpt-6-astra',
                    'SQLITE_PATH': './var/akim.sqlite', 'DEPLOY_TARGET': 'local',
                    'DATABASE_URL': '', 'APP_ORIGIN': '', 'WORKER_SECRET': '',
                    'AI_DAILY_ANALYSIS_LIMIT': '50'}, 'Unexpected environment template')
    ignored = ['.netlify/state.json', '.netlify/functions-internal/example.js', '.env', '.env.local', '.env.production', 'var/akim.sqlite',
               'example.sqlite', 'example.sqlite-wal', 'example.sqlite-shm',
               'example.sqlite3', 'example.sqlite3-journal', 'example.db', 'example.db-wal']
    result = subprocess.run(['git', 'check-ignore', '--no-index', '--stdin'], cwd=ROOT,
                            input=('\n'.join(ignored) + '\n').encode(), capture_output=True)
    require(result.returncode == 0 and set(result.stdout.decode().splitlines()) == set(ignored),
            'Secrets or SQLite artifacts are not ignored')
    result = subprocess.run(['git', 'check-ignore', '--no-index', '-q', '.env.example'], cwd=ROOT)
    require(result.returncode == 1, '.env.example must remain versionable')

    # Scan public source and documentation, never local .env or generated bundles.
    candidates = markdown + sorted((ROOT / 'scripts').glob('*.py')) + [ROOT / '.env.example']
    for directory in ['src', 'tests']:
        candidates.extend(p for p in (ROOT / directory).rglob('*') if p.suffix in {'.ts', '.tsx', '.css'})
    candidates.extend(p for p in ROOT.iterdir() if p.is_file() and p.suffix in {'.ts', '.mjs', '.json'})
    patterns = [r'\bsk-[A-Za-z0-9_-]{20,}', r'\bgh[pousr]_[A-Za-z0-9]{20,}',
                r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----']
    for path in candidates:
        require(not any(re.search(pattern, path.read_text()) for pattern in patterns),
                f'Possible credential in {path.relative_to(ROOT)} (value suppressed)')
    print(f'PASS: {len(MODULES)} module READMEs, {len(markdown)} Markdown files, '
          f'{checked_links} local links, AGENTS.md case, env template and Git exclusions.')
    print('PASS: no known credential patterns in source/docs/scripts/config/template.')
    print('LIMITS: external URLs, prose truth and runtime behavior require separate review; '
          'pattern matching cannot prove absence of every secret.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError) as error:
        print(f'FAIL: {error}', file=sys.stderr)
        sys.exit(1)
