"""Credential-free full-core v25 archive with ten verified source snapshots. Plan by default."""
import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import shutil
import stat
import subprocess
import tarfile
import uuid
import zipfile

A = pathlib.Path(__file__).resolve().parent
W = A.parents[1]
MAIN = W / 'projects/vazuri-main-integration'
TARGET = MAIN / 'release/vazuri-legal-documents-v25-complete-current.zip'
NAME = '20261027T120000Z-legal-documents-v25'
BASE_BYTES = W / 'audit/site-revision-20261025/github-live-snapshot/published/vazuri-io'
sha = lambda value: hashlib.sha256(value).hexdigest()
pretty = lambda value: json.dumps(value, ensure_ascii=False, indent=2).encode('utf8') + b'\n'


def need(value, message):
    if not value:
        raise RuntimeError(message)


def read(name):
    return json.loads((A / name).read_bytes())


def finalizer():
    spec = importlib.util.spec_from_file_location('legal_ten_project_finalizer', A / 'finalize-source.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def mode(value):
    return int(value, 0) if isinstance(value, str) else value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', action='store_true')
    args = parser.parse_args()
    f = finalizer()
    if f.held():
        need(not args.package, 'Publication hold is active; archive proofs are superseded')
        print(json.dumps({'ready': False, 'publicationHoldActive': True, 'projects': 10, 'network': False, 'GitMutations': False}))
        return
    names = ['baseline.json', 'candidate.json', 'delta.json', 'source-publication.json', 'local-qa.json', 'live-verification.json', 'live-qa.json', 'release-ledger.json', 'SERVER_RELEASE_PEER_REVIEW.json', 'source-projects.json', 'PHP_CLI_VERIFICATION.json', 'PDF_BUILD.json', 'PDF_RENDER_QA.json']
    missing = [name for name in names if not (A / name).is_file()]
    if missing:
        need(not args.package, 'Final archive proofs missing')
        print(json.dumps({'ready': False, 'missing': missing, 'projects': 10, 'network': False, 'GitMutations': False}))
        return
    c, q, items, roster, snapshots = f.inputs()
    raw = {name: (A / name).read_bytes() for name in names}
    b, s, v, l, r, peer = [json.loads(raw[name]) for name in ['baseline.json', 'source-publication.json', 'live-verification.json', 'live-qa.json', 'release-ledger.json', 'SERVER_RELEASE_PEER_REVIEW.json']]
    candidate_sha = sha(raw['candidate.json'])
    need(s.get('schema') == 'vazuri/legal-ten-source-publication/v1' and s.get('valid') is True and s.get('verifiedProjectCount') == 10 and s.get('remoteVerified') is True and s.get('runtimeDeltaGitBlobsVerified') is True and s.get('allProtectedWorkPreserved') is True, 'Ten-project publication incomplete')
    need(s.get('candidateSHA256') == candidate_sha and s.get('qaSHA256') == sha(raw['local-qa.json']) and s.get('sourceProjectsSHA256') == sha(f.canon(items)) and s.get('sourceProjectsConfigSHA256') == sha(raw['source-projects.json']), 'Source publication/raw QA/config binding differs')
    need(v.get('valid') is True and v.get('server', {}).get('valid') is True and r.get('valid') is True and f.qa_passed(l), 'Live verification/QA incomplete')
    need(c['releaseName'] == NAME and c['expectedRelease'] == v.get('current') == r.get('current') and all(value.get('candidateSHA256') == candidate_sha for value in [q, l, v]), 'Published candidate binding differs')
    need(peer.get('valid') is True and peer.get('executionApproved') is True and peer.get('candidateSHA256') == candidate_sha and peer.get('sourcePublicationSHA256') == sha(raw['source-publication.json']), 'Final peer/source publication binding differs')
    need(r.get('nginxChanged') is False and r.get('nginxReloaded') is False and r.get('smmBefore') == r.get('smmAfter') and r.get('changedOrAdded') == sorted(c['intendedDelta']), 'Protected server scope differs')
    expected = {name: dict(info) for name, info in b['tree']['files'].items()}
    expected.update(c['intendedDelta'])
    actual = v['server']['roots']['core']['allFileHashes']
    need(set(actual) == set(expected) and len(expected) == c['expectedCoreFiles'] and sum(name.startswith('main/') for name in expected) == c['expectedMainFiles'], 'Full current namespace differs')
    need(all(actual[name]['sha256'] == info['sha256'] and actual[name]['size'] == info['size'] and mode(actual[name]['mode']) == mode(info['mode']) for name, info in expected.items()), 'Full current runtime bytes/modes differ')
    publications = s.get('projects')
    need(isinstance(publications, list) and len(publications) == 10 and {row['id'] for row in publications} == f.IDS, 'Ten project source proofs required')
    proofs = {row['id']: row for row in publications}
    union = [name for row in publications for name in row['runtimePaths']]
    need(len(union) == len(set(union)) and set(union) == set(c['intendedDelta']) and s.get('ownedRuntimeUnion') == sorted(union), 'Runtime Git ownership union differs')
    for item in items:
        proof = proofs[item['id']]
        need(all(proof.get(key) == item[key] for key in ['id', 'project', 'sourceParent', 'ref', 'remote', 'origin', 'sourceSHA256', 'runtimePaths']) and proof.get('valid') is True and proof.get('remoteVerified') is True and proof.get('runtimeDeltaGitBlobsVerified') is True, 'Per-project publication identity differs')
        need(proof.get('candidateSHA256') == candidate_sha and proof.get('qaSHA256') == sha(raw['local-qa.json']), 'Per-project candidate/QA binding differs')
        file = A / 'source-publications' / (item['id'] + '.json')
        need(json.loads(file.read_bytes()) == proof, 'Per-project raw publication differs')
        raw['source-publications/' + item['id'] + '.json'] = file.read_bytes()
        package = f.build_package(item, c, q, snapshots[item['id']])
        source_blobs = f.verify_commit(item, package, proof['commit'], snapshots[item['id']])
        need(source_blobs == proof.get('sourceGitBlobSHA256'), 'Source Git blob digest proof differs')
    target = TARGET.resolve()
    need(target.parent == (MAIN / 'release').resolve() and target.is_relative_to(MAIN.resolve()) and not TARGET.is_symlink(), 'Archive target escaped main project')
    if not args.package:
        print(json.dumps({'ready': True, 'runtimeFiles': len(expected), 'runtimeBytes': sum(info['size'] for info in expected.values()), 'sourceProjects': 10, 'target': str(TARGET), 'network': False, 'GitMutations': False, 'baselineByteRecovery': 'Exact SHA/size from local published baseline and immutable Git runtime packages; all entries checked before final promotion.'}))
        return
    need(not TARGET.exists() and not (A / 'published-archive.json').exists(), 'Final archive exists; never overwrite')
    f.need_not_held()
    need(shutil.disk_usage(MAIN).free > sum(info['size'] for info in expected.values()) * 3 + 256 * 1024 * 1024, 'Insufficient local disk space for bounded complete archive')
    TARGET.parent.mkdir(exist_ok=True)
    temp = A / ('.' + TARGET.name + '.' + uuid.uuid4().hex + '.tmp')
    need(temp.parent.resolve() == A and os.stat(A).st_dev == os.stat(TARGET.parent).st_dev, 'Temporary archive must remain in audit on the target volume')
    scanner = f.policy()
    entries, source_manifests, normalizations = {}, {}, {}
    pending = set(expected)

    def put(archive, name, body, file_mode=0o644):
        need(f.safe_relative(name) and name not in entries, 'Unsafe/duplicate ZIP entry')
        scanner.scan_bytes(name + '.txt' if name.endswith('.php') else name, body)
        info = zipfile.ZipInfo(name)
        info.create_system = 3
        info.external_attr = (stat.S_IFREG | file_mode) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, body, compresslevel=6)
        entries[name] = {'sha256': sha(body), 'size': len(body), 'mode': oct(file_mode)}

    def recover(archive, name, body):
        if name in pending:
            info = expected[name]
            if len(body) == info['size'] and sha(body) == info['sha256']:
                put(archive, 'runtime/' + name, body, mode(info['mode']))
                pending.remove(name)
                return True
        return False

    try:
        with zipfile.ZipFile(temp, 'x', allowZip64=True) as archive:
            for name in sorted(expected):
                if name in c['intendedDelta']:
                    body = f.path_in(A / 'candidate', name).read_bytes()
                    need(recover(archive, name, body), 'Frozen runtime candidate differs while packaging')
                    continue
                for root in [A / 'reference-code', BASE_BYTES]:
                    file = root / name
                    if file.is_file() and not file.is_symlink() and file.resolve().is_relative_to(root.resolve()):
                        if recover(archive, name, file.read_bytes()):
                            break
            for item in items:
                key, proof = item['id'], proofs[item['id']]
                listing = f.git(item, 'ls-tree', '-r', '-z', proof['commit'])
                catalog = {}
                for value in listing.split(b'\0'):
                    if not value:
                        continue
                    header, name_bytes = value.split(b'\t', 1)
                    entry_mode, kind, oid = header.decode().split()
                    name = name_bytes.decode('utf8')
                    need(f.safe_relative(name), 'Git source path escaped archive')
                    if scanner.source_exclusion(name):
                        continue
                    need(kind == 'blob' and entry_mode in {'100644', '100755'}, 'Unsupported source Git special entry')
                    catalog[name] = {'object': oid, 'mode': entry_mode}
                p = f.project_root(item)
                command = ['git', '--no-optional-locks', '-c', 'safe.directory=' + p.as_posix(), '-c', 'core.longpaths=true', '-c', 'protocol.allow=never', '-c', 'core.autocrlf=false', '-c', 'core.eol=lf', '-C', str(p), 'archive', '--format=tar', proof['commit']]
                process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env={**os.environ, 'GIT_NO_LAZY_FETCH': '1', 'GIT_OPTIONAL_LOCKS': '0', 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'Never'})
                manifest = {}
                with tarfile.open(fileobj=process.stdout, mode='r|') as source_tar:
                    for member in source_tar:
                        if not member.isfile():
                            continue
                        name = member.name
                        need(f.safe_relative(name), 'Unsafe source tar entry')
                        body = source_tar.extractfile(member).read()
                        if name.startswith('deploy/releases/') and '/runtime/' in name:
                            runtime_name = name.split('/runtime/', 1)[1]
                            if f.safe_relative(runtime_name):
                                recover(archive, runtime_name, body)
                        if scanner.source_exclusion(name):
                            continue
                        need(name in catalog and name not in manifest, 'Git source archive namespace differs')
                        expected_object = catalog[name]['object']
                        hasher = hashlib.sha1 if len(expected_object) == 40 else hashlib.sha256
                        object_id = hasher(b'blob ' + str(len(body)).encode() + b'\0' + body).hexdigest()
                        need(object_id == expected_object, 'Git archive altered source bytes through attributes: ' + key + '/' + name)
                        put(archive, 'source/' + key + '/' + name, body, 0o755 if catalog[name]['mode'] == '100755' else 0o644)
                        manifest[name] = {'sha256': sha(body), 'size': len(body), 'gitObject': object_id}
                _, stderr = process.communicate(timeout=180)
                need(process.returncode == 0, 'Local Git source archive failed; raw error withheld')
                need(set(manifest) == set(catalog), 'Git archive omitted allowed source files; review export-ignore rules')
                source_manifests[key] = manifest
                normalized = {}
                for name, working_sha in item['sourceSHA256'].items():
                    working = f.path_in(p, name).read_bytes()
                    need(sha(working) == working_sha, 'Working source changed during archive creation')
                    need(manifest.get(name, {}).get('sha256') == proof['sourceGitBlobSHA256'][name], 'Required source is absent/differs from committed Git blob')
                    normalized[name] = {'workingTreeSHA256': working_sha, 'GitBlobSHA256': manifest[name]['sha256'], 'normalization': 'CRLF to LF only for explicitly textual source; binary PDF bytes exact'}
                normalizations[key] = normalized
            need(not pending, 'Baseline runtime bytes unavailable locally: ' + ', '.join(sorted(pending)[:20]))
            for name, body in raw.items():
                put(archive, 'metadata/proofs/' + name, body)
            put(archive, 'metadata/FULL-RUNTIME-MANIFEST.json', pretty(expected))
            put(archive, 'metadata/SOURCE-MANIFESTS.json', pretty(source_manifests))
            put(archive, 'metadata/SOURCE-LINE-ENDINGS.json', pretty(normalizations))
            put(archive, 'metadata/COMPLETE-CURRENT.json', pretty({'schema': 'vazuri/legal-complete-current/v1', 'release': c['expectedRelease'], 'candidateSHA256': candidate_sha, 'sourcePublicationSHA256': sha(raw['source-publication.json']), 'runtimeFiles': len(expected), 'sourceProjects': [{'id': item['id'], 'project': item['project'], 'commit': proofs[item['id']]['commit'], 'ref': item['ref']} for item in items], 'credentialFree': True, 'originalPrivateContractIncluded': False, 'mainRoutes': [row['url'] for row in c['routes'] if row['file'].startswith('main/')], 'caseRoutes': [row for row in c['publicVerificationFiles'] if row.get('group') == 'case' and row['role'] == 'html'], 'allUnrelatedRuntimePreserved': True}))
        with zipfile.ZipFile(temp) as archive:
            need(archive.testzip() is None and len(archive.namelist()) == len(entries) and set(archive.namelist()) == set(entries), 'ZIP CRC/namespace differs')
            for name, info in entries.items():
                body = archive.read(name)
                need(sha(body) == info['sha256'] and len(body) == info['size'], 'ZIP entry bytes differ')
        need(all((A / name).read_bytes() == body for name, body in raw.items()), 'Proof changed during archive creation')
        for item in items:
            need(f.git(item, 'rev-parse', 'HEAD').decode().strip() == proofs[item['id']]['commit'], 'Source HEAD changed during archive creation')
            f.guard_protected(item, snapshots[item['id']])
        need(not TARGET.exists(), 'Archive target appeared during build')
        f.need_not_held()
        os.link(temp, TARGET)
        temp.unlink()
    except BaseException:
        if temp.exists():
            temp.unlink()
        raise
    record = {'schema': 'vazuri/legal-complete-current-archive/v1', 'valid': True, 'path': str(TARGET), 'sha256': sha(TARGET.read_bytes()), 'bytes': TARGET.stat().st_size, 'runtimeFiles': len(expected), 'sourceProjects': 10, 'sourceFiles': sum(len(manifest) for manifest in source_manifests.values()), 'sourceCommits': {key: value['commit'] for key, value in proofs.items()}, 'credentialFree': True, 'zipCRCAndAllEntrySHAVerified': True, 'allSourceGitObjectBytesVerified': True, 'publishedCandidateSHA256': candidate_sha, 'publicationProofSHA256': sha(raw['live-verification.json']), 'sourcePublicationSHA256': sha(raw['source-publication.json'])}
    with (A / 'published-archive.json').open('xb') as handle:
        handle.write(pretty(record))
    print(json.dumps(record))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'valid': False, 'error': str(error), 'automaticRetry': False}))
        raise SystemExit(1)
