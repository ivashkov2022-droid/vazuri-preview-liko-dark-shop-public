"""Default local plan; explicit --run executes the pinned mail-disabled PHP CLI verifier."""
import argparse
import base64
import hashlib
import ipaddress
import json
import os
import pathlib
import shlex
import subprocess

A = pathlib.Path(__file__).resolve().parent
PROJECT = A.parents[1] / 'projects/vazuri-main-integration'
PIN = '514dcafcc774fafb1b2ba20a2df3de086532e539f5ee850bd004b0c33e0637e3'
PHP_SHA256 = '9f0946f175ba7e270179fa4ae9b4b4d2a1a051bcbd7f99cd551bd69abcefb77f'
PHP_SIZE = 5695
PDF_SHA256 = 'a397b8c2d952dcca4f52913c872dc46efc4154384c0c7200833a81e017adf2fe'
OLD = '/srv/www/vazuri.io/releases/20261026T190000Z-social-form-profiles-v24'
sha = lambda value: hashlib.sha256(value).hexdigest()
canonical = lambda value: json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf8')


def need(value, message):
    if not value:
        raise RuntimeError(message)


def save(name, value):
    with (A / name).open('xb') as handle:
        handle.write(json.dumps(value, ensure_ascii=False, indent=2).encode('utf8') + b'\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--bind-address')
    args = parser.parse_args()
    payload = (A / 'verify-php-cli-v3.py').read_bytes()
    need(sha(payload) == PIN, 'PHP CLI verifier pin differs')
    compile(payload, '<pinned-php-cli-verifier>', 'exec')
    source = (PROJECT / 'public/lead.php').read_bytes()
    need(len(source) == PHP_SIZE and sha(source) == PHP_SHA256, 'Candidate PHP bytes differ from reviewed hash')
    pdf = PROJECT / 'public/documents/personal-data-consent-2026-10-27.pdf'
    need(pdf.is_file() and sha(pdf.read_bytes()) == PDF_SHA256, 'Current consent PDF bytes differ from reviewed receipt hash')
    baseline = json.loads((A / 'baseline.json').read_bytes())
    need(baseline.get('valid') is True and baseline.get('source') == OLD and len(baseline['tree']['files']) == 3658 and len(baseline['mainManifest']) == 1527, 'Fresh baseline differs')
    need(baseline['tree']['files']['main/lead.php']['sha256'] == '9971e2dedaedb7c73bd4d794c85b5f58fa709c9c851c339f250f178b8cc87868', 'Baseline PHP identity differs')
    backend = json.loads((A / 'backend-probe-v2.json').read_bytes())
    need(backend.get('valid') is True and backend.get('expectedRelease') == OLD and backend['backend'].get('matchesFreshBaseline') is True, 'Sanitised backend v2 proof differs')
    if not args.run:
        print(json.dumps({'valid': True, 'action': 'local-plan', 'probeSHA256': PIN, 'candidatePHP': {'sha256': PHP_SHA256, 'size': PHP_SIZE}, 'consentPdfSHA256': PDF_SHA256, 'fixtures': 24, 'validSourceCoverage': 15, 'legacyEmptyAndOmittedVersion': 'rejected 422 consent_version', 'lint': 'stdin only', 'execution': 'php -n, namespaced mail/fopen stubs; global mail/file/network functions disabled; restrictive open_basedir', 'expectedCurrent': OLD, 'externalActions': False, 'HTTPRequests': False, 'actualMail': False, 'serverWrites': False}))
        return
    outputs = ['PHP_CLI_VERIFICATION_V3.json', 'PHP_CLI_TRANSPORT_V3.json']
    need(not any((A / name).exists() or (A / name).is_symlink() for name in outputs), 'CLI verifier output exists; inspect it before any new explicit attempt')
    bundle = canonical({'probeBase64': base64.b64encode(payload).decode('ascii'), 'phpBase64': base64.b64encode(source).decode('ascii')})
    bootstrap = "import sys,json,base64,hashlib;raw=sys.stdin.buffer.read(131073);assert len(raw)<=131072;v=json.loads(raw);assert set(v)=={'probeBase64','phpBase64'};p=base64.b64decode(v['probeBase64'],validate=True);s=base64.b64decode(v['phpBase64'],validate=True);assert hashlib.sha256(p).hexdigest()==" + repr(PIN) + ";assert len(s)==" + str(PHP_SIZE) + " and hashlib.sha256(s).hexdigest()==" + repr(PHP_SHA256) + ";print(json.dumps({'verifiedProbeSHA256':hashlib.sha256(p).hexdigest(),'candidatePHPSHA256':hashlib.sha256(s).hexdigest()}),flush=True);exec(compile(p,'<verified-mail-disabled-php-cli>','exec'),{'__name__':'__main__','PHP_BYTES':s})"
    command = ['ssh', '-4', '-i', str(pathlib.Path.home() / '.ssh/vazuri_uwin_ed25519'), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15', '-T']
    if args.bind_address:
        command += ['-b', str(ipaddress.IPv4Address(args.bind_address))]
    command += ['uwinadmin@80.78.254.132', 'sudo -n python3 -c ' + shlex.quote(bootstrap)]
    try:
        result = subprocess.run(command, input=bundle, capture_output=True, timeout=150, **({'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}))
    except subprocess.TimeoutExpired:
        save('PHP_CLI_TRANSPORT_V3.json', {'valid': False, 'status': 'transport-timeout', 'rawOutputSaved': False, 'automaticRetry': False})
        raise RuntimeError('PHP CLI verifier transport timed out; no automatic retry')
    save('PHP_CLI_TRANSPORT_V3.json', {'schema': 'vazuri/legal-php-cli-transport/v1', 'returncode': result.returncode, 'probeSHA256': PIN, 'candidatePHPSHA256': PHP_SHA256, 'baselineReportSHA256': baseline['reportSHA256'], 'backendProofSHA256': sha((A / 'backend-probe-v2.json').read_bytes()), 'stdoutBytes': len(result.stdout), 'stdoutSHA256': sha(result.stdout), 'stderrBytes': len(result.stderr), 'stderrSHA256': sha(result.stderr), 'rawOutputSaved': False, 'automaticRetry': False})
    need(len(result.stdout) <= 256 * 1024, 'PHP CLI response size exceeded bound')
    try:
        lines = [json.loads(line) for line in result.stdout.splitlines()]
    except (ValueError, UnicodeError):
        raise RuntimeError('PHP CLI returned non-JSON output; raw output was not saved') from None
    need(len(lines) == 2 and lines[0] == {'verifiedProbeSHA256': PIN, 'candidatePHPSHA256': PHP_SHA256}, 'PHP CLI bootstrap receipt differs')
    report = lines[1]
    need(isinstance(report, dict) and report.get('schema') == 'vazuri/legal-php-cli-verification/v1' and report.get('readOnly') is True and report.get('noHTTP') is True and report.get('noActualMail') is True and report.get('noServerWrites') is True, 'PHP CLI read-only report identity differs')
    if report.get('blocked') is True:
        allowed = {'schema', 'valid', 'blocked', 'reasonCode', 'readOnly', 'noHTTP', 'noActualMail', 'noServerWrites', 'rawOutputDisclosed'}
        need(set(report) <= allowed and isinstance(report.get('reasonCode'), str) and report['reasonCode'].replace('_', '').isalnum(), 'Blocked CLI report is not sanitised')
        save('PHP_CLI_VERIFICATION_V3.json', report)
        raise RuntimeError('PHP CLI verifier blocked: ' + report['reasonCode'])
    need(report.get('reportSHA256') == sha(canonical({name: value for name, value in report.items() if name != 'reportSHA256'})), 'PHP CLI report canonical hash differs')
    need(report.get('candidatePHP') == {'sha256': PHP_SHA256, 'size': PHP_SIZE} and report.get('consentPdfSHA256') == PDF_SHA256 and report.get('expectedRelease') == OLD, 'PHP CLI candidate binding differs')
    need(report.get('strictCurrentConsentVersionRequired') is True and report.get('legacyEmptyAndOmittedVersionRejected') is True and report.get('fixtureCount') == 24 and len(report.get('sourceCoverage', [])) == 15 and len(report.get('fixtures', [])) == 24, 'PHP CLI coverage differs')
    save('PHP_CLI_VERIFICATION_V3.json', report)
    need(result.returncode == 0 and report.get('valid') is True and report.get('checksFailed') == 0, 'PHP CLI fixture failed; inspect sanitised verification report')
    print(json.dumps({'valid': True, 'report': 'PHP_CLI_VERIFICATION_V3.json', 'reportSHA256': report['reportSHA256'], 'fixtures': report['fixtureCount'], 'checksPassed': report['checksPassed'], 'checksFailed': report['checksFailed'], 'actualMail': False, 'HTTPRequests': False, 'serverWrites': False, 'automaticRetry': False}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'valid': False, 'error': str(error) if isinstance(error, RuntimeError) else type(error).__name__, 'rawOutputSaved': False, 'automaticRetry': False}))
        raise SystemExit(1)
