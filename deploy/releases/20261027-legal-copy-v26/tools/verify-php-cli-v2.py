"""Run the pinned candidate PHP only in isolated CLI namespace fixtures, never HTTP."""
import base64
import datetime
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess
import sys

OLD = pathlib.Path('/srv/www/vazuri.io/releases/20261027T120000Z-legal-documents-v25')
POINTER = pathlib.Path('/srv/www/vazuri.io/current')
DEPLOYED_PHP_SHA256 = '9f0946f175ba7e270179fa4ae9b4b4d2a1a051bcbd7f99cd551bd69abcefb77f'
DEPLOYED_PHP_SIZE = 5695
CANDIDATE_PHP_SHA256 = '20087f2e7de3a2bf1c7523482ce4e485576f36ef6a8730eb8eae354f7e53d56c'
CANDIDATE_PHP_SIZE = 6089
CONSENT_VERSION = '2026-10-27-r2'
LEGACY_VERSION = '2026-10-27'
CONSENT_PDF_URL = 'https://vazuri.io/documents/personal-data-consent-2026-10-27-r2.pdf'
CONSENT_PDF_SHA256 = 'a1a6e83ca75ed51167d6977f4237a32c585312472ef20b9f3f27261d7627e238'
LEGACY_PDF_URL = 'https://vazuri.io/documents/personal-data-consent-2026-10-27.pdf'
LEGACY_PDF_SHA256 = 'a397b8c2d952dcca4f52913c872dc46efc4154384c0c7200833a81e017adf2fe'
SOURCES = ['github', 'behance', 'dribbble', 'figma', 'codepen', 'contact', 'all-projects', 'nightshift', 'case-vazuri-hotel', 'case-altera', 'case-urban-pulse', 'case-revive-cosmetics', 'case-skyvilla', 'case-scrollsync', 'case-relief-motion']
DISABLED = 'mail,fopen,file_get_contents,file_put_contents,fwrite,ftruncate,fflush,flock,unlink,rename,mkdir,rmdir,chmod,chown,touch,copy,move_uploaded_file,tempnam,tmpfile,exec,shell_exec,system,passthru,proc_open,popen,pcntl_exec,curl_exec,curl_multi_exec,fsockopen,pfsockopen,stream_socket_client,socket_create,socket_connect,ftp_connect,ftp_ssl_connect,ftp_put'
sha = lambda value: hashlib.sha256(value).hexdigest()
canonical = lambda value: json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf8')


def need(value, message):
    if not value:
        raise RuntimeError(message)


def b64_json(value):
    return base64.b64encode(canonical(value)).decode('ascii')


def fixtures():
    base = {'language': 'ru', 'name': 'Verifier Fixture', 'contact': 'fixture@example.invalid', 'company': '', 'message': 'Synthetic CLI fixture; no delivery.', 'website': '', 'consent': 'yes', 'consent_version': CONSENT_VERSION}
    output = [{'id': 'source-' + source, 'data': dict(base, source=source), 'status': 200, 'code': 'accepted', 'receipt': 'current'} for source in SOURCES]
    for name, changes, status, code in [
        ('unknown-source', {'source': 'not-a-source'}, 422, 'validation'),
        ('unchecked-consent', {'consent': ''}, 422, 'validation'),
        ('missing-name', {'name': ''}, 422, 'validation'),
        ('missing-contact', {'contact': ''}, 422, 'validation'),
        ('honeypot', {'website': 'filled'}, 400, 'invalid_request'),
        ('bad-consent-version', {'consent_version': '2026-10-26'}, 422, 'consent_version')
    ]:
        output.append({'id': name, 'data': dict(base, source='contact', **changes) if 'source' not in changes else dict(base, **changes), 'status': status, 'code': code, 'receipt': 'none'})
    output.append({'id': 'legacy-empty-version', 'data': dict(base, source='nightshift', consent_version=''), 'status': 422, 'code': 'consent_version', 'receipt': 'none'})
    absent = dict(base, source='case-altera')
    absent.pop('consent_version')
    output.append({'id': 'legacy-omitted-version', 'data': absent, 'status': 422, 'code': 'consent_version', 'receipt': 'none'})
    output.append({'id': 'mock-delivery-failure', 'data': dict(base, source='contact'), 'status': 503, 'code': 'delivery', 'receipt': 'current', 'mockMailResult': False})
    output.append({'id':'published-v25-version','data':dict(base,source='contact',consent_version=LEGACY_VERSION),'status':200,'code':'accepted','receipt':'current'})
    return output


def harness(source, fixture):
    """Namespace stubs plus disabled global APIs; no candidate text interpolation."""
    expected_version=fixture['data'].get('consent_version',CONSENT_VERSION)
    expected_url=LEGACY_PDF_URL if expected_version==LEGACY_VERSION else CONSENT_PDF_URL
    expected_sha=LEGACY_PDF_SHA256 if expected_version==LEGACY_VERSION else CONSENT_PDF_SHA256
    markers = {'yes': '\u0421\u043e\u0433\u043b\u0430\u0441\u0438\u0435 \u043d\u0430 \u043e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0443 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b\u044c\u043d\u044b\u0445 \u0434\u0430\u043d\u043d\u044b\u0445: \u0434\u0430', 'version': '\u0412\u0435\u0440\u0441\u0438\u044f \u0441\u043e\u0433\u043b\u0430\u0441\u0438\u044f: ' + expected_version, 'legacy': '\u0412\u0435\u0440\u0441\u0438\u044f \u0441\u043e\u0433\u043b\u0430\u0441\u0438\u044f: \u043d\u0435 \u043f\u0435\u0440\u0435\u0434\u0430\u043d\u0430 \u043f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0435\u0439 \u0444\u043e\u0440\u043c\u043e\u0439', 'utc': '\u041f\u043e\u043b\u0443\u0447\u0435\u043d\u043e (UTC): ', 'source': '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a: ', 'pdfUrl': expected_url, 'pdfSHA256': expected_sha}
    code = r'''declare(strict_types=1);
namespace VazuriLegalVerifier;
error_reporting(0);
$source = base64_decode('__SOURCE__', true);
if (!is_string($source) || strlen($source) !== __SIZE__ || hash('sha256', $source) !== '__SHA__') { exit(91); }
$fixture = json_decode(base64_decode('__FIXTURE__', true), true);
$GLOBALS['vazuriMarkers'] = json_decode(base64_decode('__MARKERS__', true), true);
$GLOBALS['vazuriMailResult'] = $fixture['mockMailResult'] ?? true;
$GLOBALS['vazuriMailCalls'] = 0;
$GLOBALS['vazuriRateOpenCalls'] = 0;
$GLOBALS['vazuriBodyFlags'] = null;
function fopen(...$arguments) {
    $GLOBALS['vazuriRateOpenCalls']++;
    return false;
}
function mail($to, $subject, $message, $headers = null, $additional = null): bool {
    $GLOBALS['vazuriMailCalls']++;
    $m = $GLOBALS['vazuriMarkers'];
    $utcMatch = [];
    $hasUtc = preg_match('/'.preg_quote($m['utc'], '/').'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/u', $message, $utcMatch) === 1;
    $GLOBALS['vazuriBodyFlags'] = [
        'consentYes' => str_contains($message, $m['yes']),
        'expectedVersion' => str_contains($message, $m['version']),
        'expectedPdfUrl' => str_contains($message, $m['pdfUrl']),
        'expectedPdfSHA256' => str_contains($message, $m['pdfSHA256']),
        'legacyVersionMarker' => str_contains($message, $m['legacy']),
        'utcTimestamp' => $hasUtc,
        'utcNearExecution' => $hasUtc && abs(time() - strtotime($utcMatch[1])) <= 120,
        'expectedSource' => str_starts_with($message, $m['source'] . $_POST['source'] . "\n")
    ];
    return $GLOBALS['vazuriMailResult'];
}
$_POST = $fixture['data'];
$_GET = [];
$_COOKIE = [];
$_FILES = [];
$_SERVER = ['REQUEST_METHOD' => 'POST', 'CONTENT_TYPE' => 'application/x-www-form-urlencoded', 'HTTP_ACCEPT' => 'application/json', 'HTTP_ORIGIN' => 'https://vazuri.io', 'REMOTE_ADDR' => '192.0.2.1'];
ob_start();
register_shutdown_function(static function (): void {
    $raw = ob_get_clean();
    $response = json_decode(is_string($raw) ? $raw : '', true);
    $allowed = ['accepted', 'validation', 'invalid_request', 'delivery', 'rate', 'duplicate', 'method_not_allowed', 'consent_version'];
    $status = http_response_code();
    echo json_encode([
        'httpStatus' => is_int($status) ? $status : 0,
        'responseCode' => is_array($response) && in_array($response['code'] ?? null, $allowed, true) ? $response['code'] : 'unexpected',
        'responseOK' => is_array($response) && is_bool($response['ok'] ?? null) ? $response['ok'] : null,
        'mailCalls' => $GLOBALS['vazuriMailCalls'],
        'rateOpenStubCalls' => $GLOBALS['vazuriRateOpenCalls'],
        'globalMailDisabled' => !function_exists('mail'),
        'globalFopenDisabled' => !function_exists('fopen'),
        'namespaceMailStubPresent' => function_exists(__NAMESPACE__ . '\mail'),
        'namespaceFopenStubPresent' => function_exists(__NAMESPACE__ . '\fopen'),
        'bodyFlags' => $GLOBALS['vazuriBodyFlags'],
        'fatalErrorType' => (($error = error_get_last()) && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) ? $error['type'] : null
    ], JSON_UNESCAPED_SLASHES);
});
$body = preg_replace('/\A<\?php\s*declare\(strict_types=1\);/', '', $source, 1, $removed);
if ($removed !== 1 || !is_string($body)) { exit(92); }
eval('namespace ' . __NAMESPACE__ . ';' . $body);
'''
    replacements = {'__SOURCE__': base64.b64encode(source).decode('ascii'), '__SIZE__': str(CANDIDATE_PHP_SIZE), '__SHA__': CANDIDATE_PHP_SHA256, '__FIXTURE__': b64_json(fixture), '__MARKERS__': b64_json(markers)}
    for key, value in replacements.items():
        code = code.replace(key, value)
    return code


def php_options(binary):
    return [binary, '-n', '-d', 'disable_functions=' + DISABLED, '-d', 'open_basedir=/nonexistent-vazuri-cli-verifier', '-d', 'allow_url_fopen=0', '-d', 'allow_url_include=0', '-d', 'display_errors=0', '-d', 'log_errors=0', '-d', 'opcache.enable_cli=0', '-d', 'memory_limit=32M', '-d', 'max_execution_time=3']


def check_fixture(fixture, result, process):
    checks = {
        'cliExitZero': process.returncode == 0,
        'globalMailDisabled': result.get('globalMailDisabled') is True,
        'globalFopenDisabled': result.get('globalFopenDisabled') is True,
        'namespaceStubsPresent': result.get('namespaceMailStubPresent') is True and result.get('namespaceFopenStubPresent') is True,
        'expectedStatus': result.get('httpStatus') == fixture['status'],
        'expectedCode': result.get('responseCode') == fixture['code'],
        'expectedOK': result.get('responseOK') is (200 <= fixture['status'] < 300),
        'noFatalError': result.get('fatalErrorType') is None
    }
    receipt = fixture['receipt']
    if receipt == 'none':
        checks['noMailAttempt'] = result.get('mailCalls') == 0
        checks['noRateIOAttempt'] = result.get('rateOpenStubCalls') == 0
        checks['noReceipt'] = result.get('bodyFlags') is None
    else:
        flags = result.get('bodyFlags') or {}
        checks['oneStubMailOnly'] = result.get('mailCalls') == 1
        checks['rateIOIntercepted'] = result.get('rateOpenStubCalls') == 1
        checks['receiptConsentSourceAndUTC'] = all(flags.get(key) is True for key in ['consentYes', 'utcTimestamp', 'utcNearExecution', 'expectedSource'])
        if receipt == 'current':
            checks['exactReceiptVersionPdfAndSHA'] = all(flags.get(key) is True for key in ['expectedVersion', 'expectedPdfUrl', 'expectedPdfSHA256']) and flags.get('legacyVersionMarker') is False
        else:
            checks['legacyReceiptDoesNotClaimNewVersionOrPDF'] = flags.get('legacyVersionMarker') is True and all(flags.get(key) is False for key in ['expectedVersion', 'expectedPdfUrl', 'expectedPdfSHA256'])
    return {'id': fixture['id'], 'valid': all(checks.values()), 'checks': checks, 'result': result, 'stderrBytes': len(process.stderr), 'stderrSHA256': sha(process.stderr)}


def main():
    need(sys.platform.startswith('linux') and os.geteuid() == 0, 'expected_linux_root')
    need(POINTER.is_symlink() and POINTER.resolve(strict=True) == OLD and OLD.resolve(strict=True) == OLD, 'current_release_changed')
    source = globals().get('PHP_BYTES')
    need(isinstance(source, bytes) and len(source) == CANDIDATE_PHP_SIZE and sha(source) == CANDIDATE_PHP_SHA256, 'candidate_php_bytes_differ')
    deployed = OLD / 'main/lead.php'
    need(deployed.resolve(strict=True) == deployed and stat.S_ISREG(deployed.lstat().st_mode), 'deployed_php_path_changed')
    with deployed.open('rb') as handle:
        deployed_body = handle.read(128 * 1024)
    need(len(deployed_body) == DEPLOYED_PHP_SIZE and sha(deployed_body) == DEPLOYED_PHP_SHA256, 'deployed_php_differs_from_baseline')
    binary = pathlib.Path('/usr/bin/php').resolve(strict=True)
    need(str(binary).startswith('/usr/bin/') and re.fullmatch(r'php(?:[0-9.]+)?', binary.name) is not None, 'unexpected_php_cli_binary')
    command = php_options(str(binary))
    lint = subprocess.run(command + ['-l'], input=source, capture_output=True, timeout=10)
    need(lint.returncode == 0, 'candidate_php_lint_failed_sanitised')
    output = []
    for fixture in fixtures():
        process = subprocess.run(command + ['-r', harness(source, fixture)], input=b'', capture_output=True, timeout=10)
        need(len(process.stdout) <= 16384 and len(process.stderr) <= 16384, 'cli_fixture_output_limit')
        try:
            result = json.loads(process.stdout)
        except (ValueError, UnicodeError):
            raise RuntimeError('cli_fixture_nonjson_response_sanitised') from None
        allowed = {'httpStatus', 'responseCode', 'responseOK', 'mailCalls', 'rateOpenStubCalls', 'globalMailDisabled', 'globalFopenDisabled', 'namespaceMailStubPresent', 'namespaceFopenStubPresent', 'bodyFlags', 'fatalErrorType'}
        need(isinstance(result, dict) and set(result) == allowed, 'cli_fixture_result_fields_differ')
        need(result['responseCode'] in {'accepted', 'validation', 'invalid_request', 'delivery', 'rate', 'duplicate', 'method_not_allowed', 'consent_version', 'unexpected'}, 'cli_fixture_response_code_not_allowlisted')
        need(all(isinstance(result[key], bool) for key in ['globalMailDisabled', 'globalFopenDisabled', 'namespaceMailStubPresent', 'namespaceFopenStubPresent']), 'cli_fixture_guard_flags_not_boolean')
        need(all(isinstance(result[key], int) and 0 <= result[key] <= 1000 for key in ['httpStatus', 'mailCalls', 'rateOpenStubCalls']), 'cli_fixture_counters_out_of_range')
        flags = result['bodyFlags']
        need(flags is None or isinstance(flags, dict) and set(flags) == {'consentYes', 'expectedVersion', 'expectedPdfUrl', 'expectedPdfSHA256', 'legacyVersionMarker', 'utcTimestamp', 'utcNearExecution', 'expectedSource'} and all(isinstance(value, bool) for value in flags.values()), 'cli_fixture_receipt_not_sanitised_booleans')
        output.append(check_fixture(fixture, result, process))
    need(POINTER.resolve(strict=True) == OLD, 'current_release_changed_during_cli_verifier')
    report = {'schema': 'vazuri/legal-php-cli-verification/v1', 'valid': all(item['valid'] for item in output), 'readOnly': True, 'candidatePHP': {'sha256': sha(source), 'size': len(source)}, 'deployedBaselinePHP': {'sha256': sha(deployed_body), 'size': len(deployed_body), 'matchesBaseline': True}, 'expectedRelease': str(OLD), 'lint': {'valid': lint.returncode == 0, 'stdinOnly': True, 'stdoutSHA256': sha(lint.stdout), 'stderrSHA256': sha(lint.stderr)}, 'fixtures': output, 'fixtureCount': len(output), 'checksPassed': sum(sum(item['checks'].values()) for item in output), 'checksFailed': sum(sum(not value for value in item['checks'].values()) for item in output), 'sourceCoverage': SOURCES, 'consentVersion': CONSENT_VERSION, 'consentPdfSHA256': CONSENT_PDF_SHA256, 'globalMailDisabled': True, 'globalFileAndNetworkFunctionsDisabled': True, 'namespacedMailAndFopenStubbed': True, 'phpIniDisabled': True, 'noHTTP': True, 'noActualMail': True, 'noServerWrites': True, 'noRateFilesReadOrWritten': True, 'publishedConsentVersionsRequired':True,'acceptedConsentVersions':[LEGACY_VERSION,CONSENT_VERSION],'legacyConsentPdfSHA256':LEGACY_PDF_SHA256,'legacyEmptyAndOmittedVersionRejected':True,'rawMailBodyOrRecipientDisclosed': False, 'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    report['reportSHA256'] = sha(canonical(report))
    print(json.dumps(report, ensure_ascii=False, separators=(',', ':')))
    if not report['valid']:
        raise SystemExit(3)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'schema': 'vazuri/legal-php-cli-verification/v1', 'valid': False, 'blocked': True, 'reasonCode': str(error) if isinstance(error, RuntimeError) else type(error).__name__, 'readOnly': True, 'noHTTP': True, 'noActualMail': True, 'noServerWrites': True, 'rawOutputDisclosed': False}))
        raise SystemExit(2)
