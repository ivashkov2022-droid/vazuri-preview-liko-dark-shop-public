"""Ten-repository v25 source publication. Local plan by default; --commit is explicit."""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import subprocess

A = pathlib.Path(__file__).resolve().parent
W = A.parents[1]
NAME = '20261027T120000Z-legal-documents-v25'
PACKAGE = 'deploy/releases/20261027-legal-documents-v25'
REF = 'refs/heads/codex/legal-documents-20261027'
IDS = {'main', 'night', 'hotel', 'altera', 'slides', 'urban', 'revive', 'sky', 'sync', 'relief'}
POLICY = W / 'audit/case-banner-family-20261025/finalize-case.py'
POLICY_SHA = '5f2b6222024ceaf7826235fe9c39430ffb2f4815c21b54fcd39a383cb7e45cf4'
TEXT_SUFFIXES = {'.tsx', '.ts', '.css', '.json', '.py', '.mjs', '.js', '.html', '.md', '.txt'}
sha = lambda value: hashlib.sha256(value).hexdigest()
pretty = lambda value: json.dumps(value, ensure_ascii=False, indent=2).encode('utf8') + b'\n'
canon = lambda value: json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf8')


def need(value, message):
    if not value:
        raise RuntimeError(message)


def read(name):
    return json.loads((A / name).read_bytes())


def held():
    file = A / 'PUBLICATION_HOLD.json'
    if not file.exists():
        return False
    value = json.loads(file.read_bytes())
    need(isinstance(value, dict) and type(value.get('active')) is bool, 'Publication hold state is malformed')
    return value['active']


def need_not_held():
    need(not held(), 'Publication hold is active; operator-dependent proofs must be refreshed first')


def safe_relative(value):
    if not isinstance(value, str):
        return False
    p = pathlib.PurePosixPath(value)
    return p.as_posix() == value and not p.is_absolute() and '..' not in p.parts and '\\' not in value and ':' not in value and '\0' not in value and bool(p.parts)


def path_in(root, name):
    need(safe_relative(name), 'Unsafe relative path')
    value = root / name
    need(value.resolve().is_relative_to(root.resolve()) and not value.is_symlink(), 'Path escaped checkout: ' + name)
    parent = root
    for part in pathlib.PurePosixPath(name).parts:
        parent = parent / part
        need(not parent.is_symlink() and not (hasattr(parent, 'is_junction') and parent.is_junction()), 'Symlink/junction component in bounded path: ' + name)
    return value


def project_root(item):
    need(safe_relative(item['project']) and item['project'].startswith('projects/'), 'Unbounded project')
    p = path_in(W, item['project'])
    need(p.is_dir(), 'Project checkout missing: ' + item['id'])
    return p


def git(item, *arguments, network=False):
    p = project_root(item)
    command = ['git', '--no-optional-locks', '-c', 'safe.directory=' + p.as_posix(), '-c', 'core.longpaths=true', '-c', 'commit.gpgSign=false', '-c', 'core.hooksPath=' + (A / 'disabled-hooks').as_posix()]
    if not network:
        command += ['-c', 'protocol.allow=never']
    command += ['-C', str(p), *arguments]
    result = subprocess.run(command, capture_output=True, timeout=180, env={**os.environ, 'GIT_NO_LAZY_FETCH': '1', 'GIT_OPTIONAL_LOCKS': '0', 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'Never'})
    need(result.returncode == 0, 'Git operation failed for ' + item['id'] + ': ' + arguments[0] + '; raw output is not disclosed')
    return result.stdout


def git_names(item, *arguments):
    return {value.decode('utf8') for value in git(item, *arguments).split(b'\0') if value}


def status(item, longpaths=True):
    override = [] if longpaths else ['-c', 'core.longpaths=false']
    fields = git(item, *override, 'status', '--porcelain=v1', '-z', '--untracked-files=all').split(b'\0')
    output = {}
    index = 0
    while index < len(fields):
        value = fields[index]
        index += 1
        if not value:
            continue
        state, name = value[:2].decode(), value[3:].decode('utf8')
        need(safe_relative(name), 'Unsafe Git status path')
        row = {'status': state, 'path': name}
        if 'R' in state or 'C' in state:
            need(index < len(fields), 'Truncated rename status')
            row['originalPath'] = fields[index].decode('utf8')
            index += 1
        need(name not in output, 'Duplicate Git status path')
        output[name] = row
    return output


def snapshots():
    main = read('MAIN_SOURCE_BEFORE.json')
    cases = read('cases/before-git-snapshot.json')['cases']
    result = {'main': {'HEAD': main['HEAD'], 'branch': main['branch'], 'project': main['project'], 'rows': {name: {'path': name, 'sha256': info['sha256']} for name, info in {**main['protectedTracked'], **main['protectedUntracked']}.items()}, 'tracked': set(main['protectedTracked']), 'untracked': set(main['protectedUntracked'])}}
    for row in cases:
        result[row['key']] = {'HEAD': row['head'], 'branch': row['branch'], 'project': row['project'], 'rows': {value['path']: value for value in row['dirtyTracked'] + row['untracked']}, 'tracked': {value['path'] for value in row['dirtyTracked']}, 'untracked': {value['path'] for value in row['untracked']}}
    need(set(result) == IDS, 'Exactly ten before snapshots required')
    return result


def interpret_longpath_ghosts(item, before):
    """Retain every byte guard; correct only proven clean Windows false-D rows."""
    before['originalTrackedCount'] = len(before['tracked'])
    before['longpathCleanGhosts'] = {}
    if os.name != 'nt' or item['id'] != 'night':
        return
    current = status(item)
    candidates = [name for name, row in before['rows'].items() if row.get('status') == ' D' and name not in current]
    if not candidates:
        return
    short_path_status = status(item, longpaths=False)
    root = project_root(item)
    for name in candidates:
        row = before['rows'][name]
        file = path_in(root, name)
        need(name.startswith('deploy/releases/') and '/runtime/vazuri-preview-liko-dark-shop-public/_next/static/' in name, 'Unexpected clean deleted-row namespace')
        need(len(str(file.resolve())) > 260 and short_path_status.get(name, {}).get('status') == ' D', 'Deleted-row difference is not the proven Windows long-path case')
        need(file.is_file() and not file.is_symlink() and row.get('regularFile') is not False, 'Long-path deleted-row is not a regular existing file')
        body = file.read_bytes()
        head = git(item, 'show', 'HEAD:' + name)
        index = git(item, 'show', ':' + name)
        need(sha(body) == row.get('sha256') == sha(head) == sha(index) and len(body) == len(head) == len(index), 'Long-path snapshot/worktree/HEAD/index bytes differ')
        before['longpathCleanGhosts'][name] = {'snapshotSHA256': row['sha256'], 'currentHEADAndIndexSHA256': sha(body), 'absolutePathLength': len(str(file.resolve())), 'snapshotAndLongpathsFalseStatus': ' D', 'longpathsTrueStatus': 'clean'}
    # These rows remain in rows and every guard_protected byte comparison below.
    # They were never dirty changes; exclude only from the expected diff/status set.
    before['tracked'] = before['tracked'] - set(before['longpathCleanGhosts'])


def guard_protected(item, before):
    p = project_root(item)
    for name, info in before['rows'].items():
        if name in item['sourceSHA256']:
            continue
        file = p / name
        if info.get('absent'):
            need(not file.exists() and not file.is_symlink(), 'Pre-existing absent work appeared: ' + name)
        elif info.get('symlink'):
            need(file.is_symlink() and sha(os.readlink(file).encode()) == info['sha256'], 'Pre-existing symlink changed: ' + name)
        elif info.get('regularFile') is False:
            need(file.exists(), 'Pre-existing entry disappeared: ' + name)
        else:
            need(file.is_file() and not file.is_symlink() and sha(file.read_bytes()) == info['sha256'], 'Pre-existing work changed: ' + name)
    current = status(item)
    protected = {name: value for name, value in before['rows'].items() if name not in item['sourceSHA256']}
    for name, row in protected.items():
        if name in before.get('longpathCleanGhosts', {}):
            need(name not in current, 'Proven clean long-path entry acquired an actual Git change: ' + name)
            continue
        need(name in current, 'Pre-existing Git status disappeared: ' + name)
        if 'status' in row:
            need(current[name] == {key: row[key] for key in ['status', 'path', 'originalPath'] if key in row}, 'Pre-existing Git status changed: ' + name)
        else:
            need((current[name]['status'] == '??') == (name in before['untracked']), 'Protected tracked/untracked state changed: ' + name)
    allowed = set(item['sourceSHA256']) | set(protected) | {'.gitattributes'}
    unexpected = [name for name in current if name not in allowed and not name.startswith(PACKAGE + '/')]
    need(not unexpected, 'Unrelated new work/status outside snapshot: ' + item['id'])


def qa_passed(q):
    checks = q.get('checks', []) + [value for result in q.get('results', []) for value in result.get('checks', [])]
    return q.get('valid') is True and q.get('localQAPassed') is True and q.get('mode') == 'local' and q.get('summary', {}).get('failed') == 0 and bool(checks) and all(value.get('passed') is True for value in checks)


def inputs():
    c, q, roster = read('candidate.json'), read('local-qa.json'), read('source-projects.json')
    need(c.get('releaseName') == NAME and c.get('expectedRelease') == '/srv/www/vazuri.io/releases/' + NAME and not c.get('deletedFiles', []), 'Wrong fixed candidate')
    need(c.get('sourceProjectsConfigSHA256') == sha((A / 'source-projects.json').read_bytes()) and c.get('stageProofSHA256') == sha((A / 'STAGED_MAIN.json').read_bytes()), 'Frozen source roster/stage proof changed')
    for field, name in [('PHPCLIProofSHA256', 'PHP_CLI_VERIFICATION.json'), ('PDFBuildProofSHA256', 'PDF_BUILD.json'), ('PDFRenderProofSHA256', 'PDF_RENDER_QA.json')]:
        need(c.get(field) == sha((A / name).read_bytes()), 'Frozen operator-dependent proof changed: ' + name)
    baseline = read('baseline.json')
    need(baseline.get('valid') is True and baseline.get('readOnly') is True and c.get('previous') == baseline.get('source') == '/srv/www/vazuri.io/releases/20261026T190000Z-social-form-profiles-v24' and baseline.get('reportSHA256') == sha(canon({key: value for key, value in baseline.items() if key != 'reportSHA256'})) and c.get('baselineReportSHA256') == baseline['reportSHA256'], 'Fresh v24 baseline binding differs')
    need(qa_passed(q) and q.get('candidateSHA256') == sha((A / 'candidate.json').read_bytes()), 'Bound local QA incomplete')
    items = c.get('sourceProjects')
    need(isinstance(items, list) and len(items) == 10 and {item['id'] for item in items} == IDS, 'Exactly ten source projects required')
    need(isinstance(roster, list) and {row['id'] for row in roster} == IDS and len(roster) == 10, 'Source roster differs')
    rs = {row['id']: row for row in roster}
    snaps = snapshots()
    historic = json.loads((W / 'audit/form-submit-arrow-20261026/source-commits.json').read_bytes())['cases']
    case_overlay = read('cases/overlay-manifest.json')
    overlays = {row['key']: row for row in case_overlay['cases']}
    need(case_overlay.get('valid') is True and set(overlays) == IDS - {'main'}, 'Case overlay proof incomplete')
    owned = set()
    scanner = policy()
    for item in items:
        key = item['id']
        row, before = rs[key], snaps[key]
        need(safe_relative(row['beforeSnapshot']) and sha((A / row['beforeSnapshot']).read_bytes()) == row['beforeSnapshotSHA256'], 'Before snapshot config binding differs')
        need(set(item) == {'id', 'project', 'sourceParent', 'ref', 'origin', 'remote', 'sourceSHA256', 'runtimePaths'}, 'Source candidate fields differ')
        need(all(item[field] == row[field] for field in ['id', 'project', 'sourceParent', 'ref', 'origin', 'remote']), 'Source roster identity differs: ' + key)
        need(item['ref'] == REF and re.fullmatch('[0-9a-f]{40}', item['sourceParent']), 'Source branch/parent differs')
        need(item['project'] == before['project'] and item['sourceParent'] == before['HEAD'], 'Source before snapshot differs')
        need(re.fullmatch(r'https://github\.com/ivashkov2022-droid/[A-Za-z0-9._-]+\.git', item['origin']) is not None and item['remote'] in {'origin', 'github'}, 'Unapproved repository identity')
        need(set(item['sourceSHA256']) == set(row['sourceFiles']) and len(item['sourceSHA256']) == len(row['sourceFiles']), 'Exact source file roster differs')
        if key == 'main':
            need(item['sourceParent'] == 'd8562bf4e22dfe4587add990d5aa2516b50b634b' and len(item['sourceSHA256']) == 20 and set(item['sourceSHA256']) == set(read('source-files.json')) and c['sourceSHA256'] == item['sourceSHA256'] and c['sourceParent'] == item['sourceParent'], 'Main compatibility source binding differs')
        else:
            need(item['sourceParent'] == historic[key]['sourceCommit'] and historic[key]['remoteVerified'] is True and historic[key]['ref'] == 'refs/heads/main', 'Case parent differs from published v17')
            need(item['sourceSHA256'] == overlays[key]['sourceSHA256'] and set(item['runtimePaths']) == set(overlays[key]['intendedDelta']), 'Case approved source/runtime differs')
        paths = item['runtimePaths']
        need(paths == sorted(set(paths)) and paths and not owned.intersection(paths), 'Duplicate/empty runtime ownership')
        need(all(safe_relative(name) and name.startswith(row['runtimeRoot'] + '/') and name in c['intendedDelta'] for name in paths), 'Owned runtime escaped exact namespace')
        owned.update(paths)
        p = project_root(item)
        for name, digest in item['sourceSHA256'].items():
            file = path_in(p, name)
            need(file.is_file() and sha(file.read_bytes()) == digest, 'Frozen source bytes changed: ' + key + '/' + name)
            need(not scanner.source_exclusion(name), 'Private/generated path cannot be an approved source change')
            scanner.scan_bytes(name + '.txt' if name.endswith('.php') else name, file.read_bytes())
        need(git(item, 'remote', 'get-url', item['remote']).decode().strip() == item['origin'], 'Repository remote changed: ' + key)
        need(pathlib.Path(git(item, 'rev-parse', '--show-toplevel').decode().strip()).resolve() == p.resolve(), 'Unexpected nested Git checkout')
        need('.gitattributes' not in before['rows'], 'Pre-existing attributes are dirty; bounded append cannot preserve them')
        interpret_longpath_ghosts(item, before)
        guard_protected(item, before)
    need(owned == set(c['intendedDelta']), 'Ten project ownership union must equal exact runtime delta')
    need(len({item['project'] for item in items}) == 10 and len({item['origin'] for item in items}) == 10, 'Project/repository duplicated')
    main = next(item for item in items if item['id'] == 'main')
    need(q.get('sourceSHA256') == main['sourceSHA256'] and q.get('sourceProjectsSHA256') == sha(canon(items)), 'Exact local QA main/ten-project source binding differs')
    legal = json.loads(path_in(project_root(main), 'data/legal-documents.json').read_bytes())
    pdfs, render, php = read('PDF_BUILD.json'), read('PDF_RENDER_QA.json'), read('PHP_CLI_VERIFICATION.json')
    need(pdfs.get('valid') is True and render.get('valid') is True and pdfs.get('sourceSHA256') == main['sourceSHA256']['data/legal-documents.json'] and pdfs.get('version') == legal['version'], 'Current operator legal source/PDF derivation is stale')
    need(set(pdfs.get('documents', {})) == {'privacy', 'consent'} and set(render.get('documents', {})) == {'privacy', 'consent'}, 'Two current document PDF proofs required')
    for key, proof in pdfs['documents'].items():
        url = proof['downloadURL']
        need(isinstance(url, str) and url.startswith('https://vazuri.io/documents/') and '?' not in url and '#' not in url and url.endswith('.pdf'), 'Unbounded PDF public URL')
        relative = 'public/' + url.removeprefix('https://vazuri.io/')
        need(relative in main['sourceSHA256'] and main['sourceSHA256'][relative] == proof['sha256'] and render['documents'][key].get('sha256') == proof['sha256'] and render['documents'][key].get('unnecessaryContractFieldsAbsent') is True and proof.get('allRussianWebSectionsPresent') is True and proof.get('operatorFieldsPresent') is True and proof.get('fontsEmbedded') is True, 'Current public PDF source/render proof differs')
        need('main/' + relative.removeprefix('public/') in c['intendedDelta'] and c['intendedDelta']['main/' + relative.removeprefix('public/')]['sha256'] == proof['sha256'], 'PDF candidate bytes differ from approved current proof')
    need(php.get('schema') == 'vazuri/legal-php-cli-verification/v1' and php.get('valid') is True and php.get('checksFailed') == 0 and php.get('candidatePHP', {}).get('sha256') == main['sourceSHA256']['public/lead.php'] and php.get('consentPdfSHA256') == pdfs['documents']['consent']['sha256'] and php.get('consentVersion') == legal['version'], 'Current PHP/consent receipt fixture proof is stale')
    need(php.get('noHTTP') is True and php.get('noActualMail') is True and php.get('noServerWrites') is True and php.get('fixtures') and all(row.get('valid') is True and all(row.get('checks', {}).values()) for row in php['fixtures']), 'Isolated PHP fixture proof incomplete')
    return c, q, items, rs, snaps


def policy():
    need(sha(POLICY.read_bytes()) == POLICY_SHA, 'Credential exclusion policy changed')
    spec = importlib.util.spec_from_file_location('approved_v25_archive_policy', POLICY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build_package(item, c, q, before):
    out = {}
    for name in item['runtimePaths']:
        info = c['intendedDelta'][name]
        body = path_in(A / 'candidate', name).read_bytes()
        need(sha(body) == info['sha256'] and len(body) == info['size'], 'Owned candidate runtime changed: ' + name)
        out[PACKAGE + '/runtime/' + name] = body
    common = ['candidate.json', 'delta.json', 'local-qa.json', 'STAGED_MAIN.json', 'source-projects.json', 'source-files.json', 'qa-tools.json', 'CSS_ASSET_ALIAS_REVIEW.json', 'CSS_SCOPE_REVIEW.json', 'PHP_CLI_VERIFICATION.json', 'PDF_BUILD.json', 'PDF_RENDER_QA.json']
    case_proofs = ['overlay-manifest.json', 'source-verification.json', 'source-patch-report.json', 'after-preservation-verification.json']
    for name in common:
        out[PACKAGE + '/' + name] = (A / name).read_bytes()
    for name in case_proofs:
        out[PACKAGE + '/cases/' + name] = (A / 'cases' / name).read_bytes()
    qa_tools = read('qa-tools.json')
    need(isinstance(qa_tools, list) and qa_tools and len(set(qa_tools)) == len(qa_tools) and all(isinstance(name, str) and pathlib.Path(name).name == name and name.endswith('.mjs') for name in qa_tools), 'QA tool list escaped bounded basenames')
    php_tools = read('php-tools.json')
    need(isinstance(php_tools, list) and php_tools and len(set(php_tools)) == len(php_tools) and all(isinstance(name, str) and pathlib.Path(name).name == name and name.endswith('.py') for name in php_tools), 'PHP verifier tool list escaped bounded basenames')
    tools = ['stage-main.py', 'freeze-main.py', 'source-projects.json', 'source-files.json', 'qa-tools.json', 'php-tools.json', 'review-css-scope.mjs', 'finalize-source.py', 'package-main.py', *php_tools, *qa_tools]
    for name in tools:
        out[PACKAGE + '/tools/' + name] = (A / name).read_bytes()
    out[PACKAGE + '/PROVENANCE.json'] = pretty({'schema': 'vazuri/legal-project-source-package/v1', 'id': item['id'], 'project': item['project'], 'sourceParent': item['sourceParent'], 'ref': item['ref'], 'baselineRelease': c['previous'], 'expectedRelease': c['expectedRelease'], 'candidateSHA256': sha((A / 'candidate.json').read_bytes()), 'qaSHA256': sha((A / 'local-qa.json').read_bytes()), 'sourceSHA256': item['sourceSHA256'], 'ownedRuntimePaths': item['runtimePaths'], 'runtimeOwnership': 'Owned subset only; the ten disjoint subsets union to the shared candidate.', 'protectedTrackedCount': len(before['tracked']), 'originalSnapshotTrackedCount': before.get('originalTrackedCount', len(before['tracked'])), 'cleanWindowsLongpathRows': before.get('longpathCleanGhosts', {}), 'allOriginalRowsRetainByteGuards': True, 'protectedUntrackedCount': len(before['untracked']), 'privateOriginalContractIncluded': False})
    out[PACKAGE + '/README.md'] = b'# Legal documents v25\n\nThis package stores this repository\'s exact source changes and owned immutable runtime overlay. All ten repositories share candidate.json and local-qa.json. The union of their runtime subsets is the one atomic site release. Apply the reviewed candidate; do not rebuild during publication. Contract originals and private banking/passport material are excluded.\n'
    scanner = policy()
    for name, body in out.items():
        scanner.scan_bytes(name + '.txt' if name.endswith('.php') else name, body)
    return out


def source_blob_matches(name, working, blob):
    return blob == working or pathlib.PurePosixPath(name).suffix.lower() in TEXT_SUFFIXES and blob == working.replace(b'\r\n', b'\n')


def remote_ref(item, reference):
    output = git(item, 'ls-remote', '--heads', item['remote'], reference, network=True).decode().split()
    need(not output or len(output) == 2 and output[1] == reference and re.fullmatch('[0-9a-f]{40}', output[0]), 'Unexpected remote ref response')
    return output[0] if output else None


def verify_commit(item, package, commit, before):
    need(git(item, 'rev-parse', 'HEAD').decode().strip() == commit and git(item, 'rev-parse', commit + '^').decode().strip() == item['sourceParent'], 'Committed HEAD/parent differs')
    changed = git_names(item, 'diff-tree', '--no-commit-id', '--name-only', '-r', '-z', commit)
    need(changed == set(package) | set(item['sourceSHA256']) | {'.gitattributes'}, 'Commit changed unrelated files')
    for name, body in package.items():
        need(git(item, 'show', commit + ':' + name) == body, 'Committed immutable package bytes differ: ' + item['id'])
    old_attrs = git(item, 'show', item['sourceParent'] + ':.gitattributes') if git(item, 'ls-tree', '-z', item['sourceParent'], '--', '.gitattributes') else b''
    expected_attrs = old_attrs + (b'' if not old_attrs or old_attrs.endswith(b'\n') else b'\n') + ('/' + PACKAGE + '/** -text -filter\n').encode()
    need(git(item, 'show', commit + ':.gitattributes') == expected_attrs, 'Attributes commit differs beyond exact immutable-package rule')
    source_blobs = {}
    for name in item['sourceSHA256']:
        body = path_in(project_root(item), name).read_bytes()
        blob = git(item, 'show', commit + ':' + name)
        need(source_blob_matches(name, body, blob), 'Source Git blob differs beyond approved text line endings: ' + name)
        source_blobs[name] = sha(blob)
    guard_protected(item, before)
    need(not git_names(item, 'diff', '--cached', '--name-only', '-z'), 'Staged work remains after commit')
    expected_dirty = before['tracked'] - set(item['sourceSHA256'])
    need(git_names(item, 'diff', '--name-only', '-z') == expected_dirty, 'Unrelated tracked worktree state changed')
    return source_blobs


def write_record(record):
    (A / 'SOURCE_GIT_FINALIZATION.json').write_bytes(pretty(record))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--commit', action='store_true')
    parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    if held():
        need(not args.commit, 'Publication hold is active; no Git mutation is allowed')
        print(json.dumps({'ready': False, 'publicationHoldActive': True, 'projects': 10, 'network': False, 'GitMutations': False}))
        return
    required = ['candidate.json', 'local-qa.json', 'source-projects.json', 'STAGED_MAIN.json', 'CSS_SCOPE_REVIEW.json', 'qa-tools.json', 'php-tools.json']
    missing = [name for name in required if not (A / name).is_file()]
    if missing:
        need(not args.commit, 'Final source publication inputs missing')
        print(json.dumps({'ready': False, 'missing': missing, 'projects': 10, 'network': False, 'GitMutations': False}))
        return
    c, q, items, roster, snaps = inputs()
    packages = {item['id']: build_package(item, c, q, snaps[item['id']]) for item in items}
    record_path = A / 'SOURCE_GIT_FINALIZATION.json'
    record = read(record_path.name) if record_path.exists() else None
    binding = {'candidateSHA256': sha((A / 'candidate.json').read_bytes()), 'qaSHA256': sha((A / 'local-qa.json').read_bytes()), 'sourceProjectsSHA256': sha(canon(items)), 'sourceProjectsConfigSHA256': sha((A / 'source-projects.json').read_bytes())}
    if record:
        need(all(record.get(key) == value for key, value in binding.items()), 'Existing finalization checkpoint belongs to different inputs')
    for item in items:
        before = snaps[item['id']]
        progress = record.get('projects', {}).get(item['id'], {}) if record else {}
        expected = progress.get('commit', item['sourceParent'])
        need(git(item, 'rev-parse', 'HEAD').decode().strip() == expected, 'Source HEAD differs: ' + item['id'])
        branch = git(item, 'branch', '--show-current').decode().strip()
        need(branch == (REF.removeprefix('refs/heads/') if progress else before['branch']), 'Source branch differs: ' + item['id'])
        need(not git_names(item, 'diff', '--cached', '--name-only', '-z') or progress.get('phase') == 'staged', 'Unexpected staged changes')
        if not progress:
            need('.gitattributes' not in status(item), 'Attributes changed since the before snapshot')
    if not args.commit:
        print(json.dumps({'ready': True, 'projects': 10, 'sourceFiles': sum(len(item['sourceSHA256']) for item in items), 'ownedRuntimeFiles': sum(len(item['runtimePaths']) for item in items), 'targetRefs': REF, 'protectedTracked': sum(len(value['tracked']) for value in snaps.values()), 'protectedUntracked': sum(len(value['untracked']) for value in snaps.values()), 'network': False, 'GitMutations': False, 'checkpointExists': bool(record)}))
        return
    need(not record or args.resume, 'Existing Git phase requires inspection and explicit --resume')
    need(not (A / 'source-publication.json').exists(), 'Aggregate source publication exists; do not overwrite')
    # Verify all ten historical heads and target branches before the first write.
    for item in items:
        old_ref = roster[item['id']]['baselineRef']
        need(remote_ref(item, old_ref) == item['sourceParent'], 'Fresh published baseline ref differs: ' + item['id'])
        progress = record.get('projects', {}).get(item['id'], {}) if record else {}
        new_head = remote_ref(item, item['ref'])
        need(new_head is None or progress.get('commit') == new_head, 'New remote branch already exists or moved: ' + item['id'])
        if not progress:
            need(not git(item, 'branch', '--list', item['ref'].removeprefix('refs/heads/')).strip(), 'New local branch already exists')
            need(not (project_root(item) / PACKAGE).exists() and not (project_root(item) / PACKAGE).is_symlink(), 'Immutable package already exists without checkpoint')
    if not record:
        need_not_held()
        record = {'valid': False, 'schema': 'vazuri/legal-ten-source-finalization/v1', **binding, 'projects': {}, 'phase': 'preflight-complete', 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        with record_path.open('xb') as handle:
            handle.write(pretty(record))
    proofs = []
    proof_folder = A / 'source-publications'
    proof_folder.mkdir(exist_ok=True)
    for item in items:
        need_not_held()
        key, p = item['id'], project_root(item)
        before, package = snaps[key], packages[key]
        progress = record['projects'].get(key)
        need(remote_ref(item, roster[key]['baselineRef']) == item['sourceParent'], 'Baseline ref changed before repository write')
        guard_protected(item, before)
        if not progress:
            attrs = p / '.gitattributes'
            old = attrs.read_bytes() if attrs.exists() else b''
            rule = ('/' + PACKAGE + '/** -text -filter\n').encode()
            need(rule not in old, 'Attributes already contain this package rule')
            updated = old + (b'' if not old or old.endswith(b'\n') else b'\n') + rule
            progress = {'phase': 'branch-planned', 'attrsBeforeSHA256': sha(old), 'attrsAfterSHA256': sha(updated)}
            record['projects'][key] = progress
            write_record(record)
            need_not_held()
            git(item, 'switch', '-c', item['ref'].removeprefix('refs/heads/'))
            progress['phase'] = 'branch-created'
            write_record(record)
        if not progress.get('commit'):
            need_not_held()
            need(git(item, 'branch', '--show-current').decode().strip() == item['ref'].removeprefix('refs/heads/'), 'Resume branch is not the approved branch')
            for name, body in package.items():
                output = path_in(p, name)
                if output.exists():
                    need(output.is_file() and output.read_bytes() == body, 'Partial package bytes differ; no overwrite')
                else:
                    output.parent.mkdir(parents=True, exist_ok=True)
                    with output.open('xb') as handle:
                        handle.write(body)
            attrs = p / '.gitattributes'
            current = attrs.read_bytes() if attrs.exists() else b''
            if sha(current) == progress['attrsBeforeSHA256']:
                rule = ('/' + PACKAGE + '/** -text -filter\n').encode()
                updated = current + (b'' if not current or current.endswith(b'\n') else b'\n') + rule
                need(sha(updated) == progress['attrsAfterSHA256'], 'Resume attributes binding differs')
                attrs.write_bytes(updated)
            else:
                need(sha(current) == progress['attrsAfterSHA256'], 'Attributes changed outside task')
            git(item, 'add', '--', *item['sourceSHA256'], '.gitattributes', PACKAGE)
            git(item, 'add', '--renormalize', '--', PACKAGE)
            need(git_names(item, 'diff', '--cached', '--name-only', '-z') == set(package) | set(item['sourceSHA256']) | {'.gitattributes'}, 'Staged scope differs')
            for name, body in package.items():
                need(git(item, 'show', ':' + name) == body, 'Staged immutable package normalization differs')
            for name in item['sourceSHA256']:
                need(source_blob_matches(name, path_in(p, name).read_bytes(), git(item, 'show', ':' + name)), 'Staged source differs')
            progress['phase'] = 'staged'
            write_record(record)
            need_not_held()
            git(item, 'commit', '-m', 'Add legal documents and separate consent links')
            progress.update({'phase': 'committed', 'commit': git(item, 'rev-parse', 'HEAD').decode().strip()})
            write_record(record)
        commit = progress['commit']
        blobs = verify_commit(item, package, commit, before)
        remote_head = remote_ref(item, item['ref'])
        need(remote_head in {None, commit}, 'Target ref changed before push')
        if remote_head is None:
            need_not_held()
            git(item, 'push', item['remote'], commit + ':' + item['ref'], network=True)
        need(remote_ref(item, item['ref']) == commit, 'Remote source publication differs')
        proof = {'valid': True, 'id': key, 'project': item['project'], 'commit': commit, 'sourceParent': item['sourceParent'], 'ref': item['ref'], 'remote': item['remote'], 'origin': item['origin'], 'remoteVerified': True, 'runtimeDeltaGitBlobsVerified': True, 'candidateSHA256': binding['candidateSHA256'], 'qaSHA256': binding['qaSHA256'], 'sourceSHA256': item['sourceSHA256'], 'sourceGitBlobSHA256': blobs, 'runtimePaths': item['runtimePaths'], 'packagePath': PACKAGE, 'protectedWorkPreserved': True}
        proof_path = proof_folder / (key + '.json')
        body = pretty(proof)
        if proof_path.exists():
            need(proof_path.read_bytes() == body, 'Existing per-project publication differs')
        else:
            with proof_path.open('xb') as handle:
                handle.write(body)
        proofs.append(proof)
        progress.update({'phase': 'pushed-and-verified', 'proofSHA256': sha(body)})
        write_record(record)
    for item, proof in zip(items, proofs):
        need(remote_ref(item, item['ref']) == proof['commit'], 'Final ten-ref reverification differs')
        verify_commit(item, packages[item['id']], proof['commit'], snaps[item['id']])
    main_proof = next(value for value in proofs if value['id'] == 'main')
    need_not_held()
    aggregate = {'schema': 'vazuri/legal-ten-source-publication/v1', 'valid': True, **{key: main_proof[key] for key in ['project', 'commit', 'ref', 'remote', 'origin', 'sourceSHA256', 'packagePath']}, 'remoteVerified': True, 'runtimeDeltaGitBlobsVerified': True, **binding, 'projects': proofs, 'verifiedProjectCount': 10, 'ownedRuntimeUnion': sorted(name for item in proofs for name in item['runtimePaths']), 'allProtectedWorkPreserved': True, 'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    with (A / 'source-publication.json').open('xb') as handle:
        handle.write(pretty(aggregate))
    record.update({'valid': True, 'phase': 'complete', 'sourcePublicationSHA256': sha((A / 'source-publication.json').read_bytes())})
    write_record(record)
    print(json.dumps({'valid': True, 'verifiedProjects': 10, 'runtimeGitBlobUnionExact': True, 'sourcePublicationSHA256': record['sourcePublicationSHA256'], 'protectedWorkPreserved': True}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'valid': False, 'error': str(error), 'automaticRetry': False}))
        raise SystemExit(1)
