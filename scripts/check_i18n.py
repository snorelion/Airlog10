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
    """사전은 언제나 L로 받는다 — 그 규칙과, 스코프 밖 참조를 본다.

    L로 통일한 이유: 파일에 따라 t가 이미 다른 뜻으로 쓰인다
    (통계의 기종 항목, 설정의 테마, 문자열 다듬기의 const t = v.trim()).
    사전 이름을 t로 두면 새 화면을 만들 때마다 충돌을 확인해야 한다.
    """
    for p in screens():
        src = p.read_text(encoding='utf-8')
        if re.search(r'const\s+t\s*=\s*useT\(', src):
            problems.append(
                f'{p.relative_to(ROOT)}: 사전을 t로 받았다 — L로 받을 것 '
                f'(t는 지역 변수와 부딪힌다)'
            )
        # 사전을 L로 통일했으므로, 사전 키를 t로 꺼내는 잔재가 남으면 안 된다
        if '@/lib/i18n' in src:
            for m in re.finditer(r'\bt\[(\w+)', strip_comments(src.split('\n'))):
                problems.append(
                    f'{p.relative_to(ROOT)}: t[{m.group(1)}...] — 사전은 L로 꺼낼 것'
                )
        lines = src.split('\n')
        starts = [
            i for i, ln in enumerate(lines)
            if re.match(r'^(export default function|export function|function)\s+\w+', ln)
        ]
        starts.append(len(lines))
        for a, b in zip(starts, starts[1:]):
            block = lines[a:b]
            name = re.match(r'^(?:export default |export )?function\s+(\w+)', lines[a]).group(1)
            body = '\n'.join(block)
            # 점 접근 L.key 와 대괄호 접근 L[key] 를 모두 본다 —
            # 점만 보다가 t[e.key] 3곳을 놓쳐 배포가 깨질 뻔했다(2026-07-26)
            if re.search(r'\bL[.\[]', strip_comments(block)) and not re.search(r'const\s+L\s*=\s*useT\(', body):
                problems.append(
                    f'{p.relative_to(ROOT)}: {name}() 안에서 L 을 쓰는데 '
                    f'그 컴포넌트에 const L = useT(...) 가 없다'
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
        used = set(re.findall(r'\bL\.(\w+)', strip_comments(src.split('\n'))))
        missing = sorted(used - en_keys)
        if missing:
            # 사전을 L로만 받으므로 이건 진짜 누락이다 (지역 변수 t와 섞이지 않는다)
            problems_note = f'{p.relative_to(ROOT)}: 사전({name})에 없는 키 사용 {missing}'
            warnings.append(problems_note)


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
    # 법적 문서는 사전을 쓰지 않고 문서 단위로 en/ko 판을 나란히 둔다
    # (문단이 길고 언어마다 문장 나누기가 달라, 통째로 검토해야 유지보수가 된다)
    skip = {'app/privacy/page.tsx', 'app/terms/page.tsx'}

    rows = []
    for p in screens():
        if str(p.relative_to(ROOT)) in skip:
            continue
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
