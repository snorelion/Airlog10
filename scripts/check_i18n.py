#!/usr/bin/env python3
"""다국어(i18n) 배포 전 점검.

이 Mac에는 Node가 없어 `next build`로 타입 검사를 미리 돌릴 수 없다.
그래서 배포에서 실제로 걸렸던 실수들을 여기서 먼저 잡는다.

  실행:  python3 scripts/check_i18n.py

검사 항목
  1) 스코프 밖 사전 참조 — 별도 컴포넌트 안에서 t/L을 쓰는데 그 안에
     useT() 선언이 없는 경우. (2026-07-26 배포 실패: DayNightDonut)
  2) 없는 사전 키 사용 — t.foo 인데 사전에 foo가 없는 경우.
  3) 헬퍼 import 누락 — fmt/relTime/LOCALE 등을 쓰는데 import가 없는 경우.
  4) 사전 짝 맞춤 — en에 있는데 ko에 없는 키(영어로 표시됨),
     en에 없는데 ko에만 있는 키(오타 가능성).
  5) 남은 한국어 UI 문자열 — 아직 사전으로 옮기지 않은 화면 목록.

종료 코드: 문제가 있으면 1, 없으면 0.
"""
import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
HELPERS = ['useT', 'useLang', 'fmt', 'relTime', 'LOCALE']


def screens():
    return sorted(
        list((ROOT / 'app').rglob('*.tsx')) + list((ROOT / 'components').rglob('*.tsx'))
    )


def strip_comments(lines):
    return '\n'.join(l for l in lines if not l.strip().startswith('//'))


def load_dicts():
    """사전 파일에서 {export이름: (en키집합, ko키집합)} 추출."""
    out = {}
    for p in sorted((ROOT / 'lib' / 'i18n').glob('*.ts')):
        src = p.read_text(encoding='utf-8')
        for m in re.finditer(
            r'export const (\w+) = \{\s*\n\s*en: \{(.*?)\n  \},(?:\s*\n\s*ko: \{(.*?)\n  \},)?',
            src, re.S,
        ):
            name, en, ko = m.group(1), m.group(2), m.group(3) or ''
            out[name] = (
                set(re.findall(r'^\s*(\w+):', en, re.M)),
                set(re.findall(r'^\s*(\w+):', ko, re.M)),
            )
    return out


def check_scope(problems):
    """별도 컴포넌트에서 선언 없이 t/L을 쓰는 곳."""
    for p in screens():
        lines = p.read_text(encoding='utf-8').split('\n')
        starts = [
            i for i, ln in enumerate(lines)
            if re.match(r'^(export default function|export function|function)\s+\w+', ln)
        ]
        starts.append(len(lines))
        for a, b in zip(starts, starts[1:]):
            block = lines[a:b]
            name = re.match(r'^(?:export default |export )?function\s+(\w+)', lines[a]).group(1)
            body = '\n'.join(block)
            uses = set(re.findall(r'\b([tL])\.\w+', strip_comments(block)))
            declared = set()
            if re.search(r'const\s+t\s*=\s*useT\(', body):
                declared.add('t')
            if re.search(r'const\s+L\s*=\s*useT\(', body):
                declared.add('L')
            # 지역 변수 t (const t = v.trim() 등)와 map 콜백의 t 도 선언으로 본다
            if re.search(r'\bconst\s+t\s*=\s*(?!useT)', body) or re.search(r'\.map\(\(\[?t[,)\s\]]', body):
                declared.add('t')
            for miss in sorted(uses - declared):
                problems.append(
                    f'{p.relative_to(ROOT)}: {name}() 안에서 {miss}.* 를 쓰는데 '
                    f'그 컴포넌트에 const {miss} = useT(...) 가 없다'
                )


def check_keys(dicts, warnings):
    """사전에 없는 키 사용 — 지역 변수의 속성일 수 있어 경고로만 낸다."""
    for p in screens():
        src = p.read_text(encoding='utf-8')
        imp = re.findall(r"import \{ (\w+) as dict \} from '@/lib/i18n(?:/\w+)?'", src)
        if not imp:
            continue
        name = imp[0]
        if name not in dicts:
            warnings.append(f'{p.relative_to(ROOT)}: 사전 {name} 을 찾지 못했다')
            continue
        en_keys = dicts[name][0]
        used = set(re.findall(r'\b[tL]\.(\w+)', strip_comments(src.split('\n'))))
        missing = sorted(used - en_keys)
        if missing:
            warnings.append(
                f'{p.relative_to(ROOT)}: 사전({name})에 없는 키 {missing} '
                f'— 지역 변수의 속성이면 무시해도 된다'
            )


def check_imports(problems):
    for p in screens():
        src = p.read_text(encoding='utf-8')
        if '@/lib/i18n' not in src:
            continue
        imp = re.search(r"import \{([^}]*)\} from '@/lib/i18n'", src)
        imported = set()
        if imp:
            for part in imp.group(1).split(','):
                part = part.strip()
                if ' as ' in part:
                    imported.add(part.split(' as ')[1].strip())
                elif part:
                    imported.add(part)
        body = '\n'.join(
            l for l in src.split('\n')
            if not l.strip().startswith('//') and 'import ' not in l
        )
        for h in HELPERS:
            if not re.search(r'\b' + h + r'\(', body) or h in imported:
                continue
            # 같은 이름을 prop이나 지역 변수로 받는 경우가 있다
            # (예: stats의 Delta({ cur, prev, fmt })) — 그건 import 대상이 아니다
            declared_locally = (
                re.search(r'\{[^}]*\b' + h + r'\b[^}]*\}\s*:', body)   # 구조분해 매개변수
                or re.search(r'\b(?:const|let)\s+' + h + r'\s*=', body)
            )
            if not declared_locally:
                problems.append(f'{p.relative_to(ROOT)}: {h}() 를 쓰는데 import에 없다')


def check_pairs(dicts, warnings):
    for name, (en, ko) in sorted(dicts.items()):
        for k in sorted(en - ko):
            warnings.append(f'사전 {name}: ko에 {k} 없음 → 그 문장은 영어로 나온다')
        for k in sorted(ko - en):
            warnings.append(f'사전 {name}: en에 없는 ko 키 {k} — 오타 가능성')


def check_korean(warnings):
    """아직 사전으로 안 옮긴 한국어 UI 문자열. 주석은 세지 않는다.

    여러 줄 주석은 시작 줄에만 표시가 있고 이어지는 줄은 평범한 텍스트라,
    블록 안인지를 따라가며 판단해야 한다.
    """
    rows = []
    for p in screens():
        n = 0
        in_block = False
        for line in p.read_text(encoding='utf-8').split('\n'):
            stripped = line.strip()
            opens = stripped.count('/*') + stripped.count('{/*')
            closes = stripped.count('*/')
            was_in_block = in_block
            if opens > closes:
                in_block = True
            elif closes and in_block:
                in_block = False
            if was_in_block or opens:
                continue
            if stripped.startswith('//') or '//' in line:
                continue
            if re.search(r'[가-힣]', line):
                n += 1
        if n:
            rows.append((n, str(p.relative_to(ROOT))))
    for n, f in sorted(rows, reverse=True):
        warnings.append(f'{f}: 한국어 문자열 {n}줄 — 아직 사전으로 안 옮김')


def main():
    dicts = load_dicts()
    problems, warnings = [], []
    check_scope(problems)
    check_imports(problems)
    check_keys(dicts, warnings)
    check_pairs(dicts, warnings)
    check_korean(warnings)

    print(f'사전 {len(dicts)}개: ' + ', '.join(f'{k}({len(v[0])})' for k, v in sorted(dicts.items())))
    print()

    if problems:
        print('❌ 고쳐야 함 (빌드가 깨진다)')
        for x in problems:
            print('   ' + x)
        print()
    if warnings:
        print('· 참고 (사람이 판단)')
        for x in warnings:
            print('   ' + x)
        print()
    if not problems:
        print('✅ 빌드를 깨뜨릴 문제 없음')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
