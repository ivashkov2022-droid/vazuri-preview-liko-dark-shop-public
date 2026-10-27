"""Local source and frozen-byte scope review; no server, Git or browser mutations."""
import pathlib,json,hashlib,subprocess,os,re,tarfile,io,ast,argparse
A=pathlib.Path(__file__).resolve().parent;W=A.parents[1];P=W/'projects/vazuri-main-integration'
sha=lambda b:hashlib.sha256(b).hexdigest()
canon=lambda v:json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf8')
def need(v,m):
 if not v:raise RuntimeError(m)
def read(n):return json.loads((A/n).read_bytes())
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--run',action='store_true');args=parser.parse_args()
 missing=[n for n in ['candidate.json','baseline.json','delta.json','FROZEN_SCOPE.json','STAGED_MAIN.json']if not(A/n).exists()]
 if not args.run:print(json.dumps({'ready':not missing,'missing':missing,'mode':'local-plan','network':False}));return
 need(not missing,'Freeze inputs missing');c=read('candidate.json');b=read('baseline.json');d=read('delta.json');scope=read('FROZEN_SCOPE.json')
 need(c['intendedDelta']==read('STAGED_MAIN.json')['intendedDelta']and set(d['expected'])==set(c['intendedDelta'])and scope['expected']==d['expected']and scope['before']==d['before'],'Frozen unions differ')
 need(c['frozenScopeSHA256']==sha(canon(scope)),'Frozen scope differs')
 git=['git','--no-optional-locks','-c','safe.directory='+P.as_posix(),'-c','core.longpaths=true','-c','protocol.allow=never','-C',str(P)]
 def old(name):return subprocess.run(git+['show',c['sourceParent']+':'+name],check=True,capture_output=True,env={**os.environ,'GIT_NO_LAZY_FETCH':'1','GIT_OPTIONAL_LOCKS':'0'}).stdout.decode('utf8').replace('\r\n','\n')
 css=(P/'styles/vazuri-legal.css').read_text(encoding='utf8').replace('\r\n','\n');oldcss=old('styles/vazuri-legal.css')
 additions=['.vz-legal-footer .vz-legal-links {\n  gap: 6px 20px;\n  opacity: .7;\n  font-weight: 400;\n}\n\n','.vz-legal-footer .vz-legal-links__item {\n  display: inline;\n}\n\n']
 reverted=css
 for value in additions:need(reverted.count(value)==1,'Footer CSS append differs');reverted=reverted.replace(value,'',1)
 need(reverted==oldcss,'Non-footer CSS changed')
 current=(P/'components/common/LegalLinks.tsx').read_text(encoding='utf8').replace('\r\n','\n');before=old('components/common/LegalLinks.tsx')
 need(current.split('export default function')[0]==before.split('export default function')[0],'Approved arrow geometry changed')
 company_block='''      {!menu ? (
        <a className="vz-legal-links__item" href={`${prefix}/company`} data-vz-section-link>
          <span>{english ? "Company" : "Реквизиты"}</span>
        </a>
      ) : null}
'''
 need(current.count(company_block)==1,'Company link is not a single footer-only addition')
 inverse=current.replace(company_block,'').replace('  const menu = Component === "span";\n','').replace('<span>{english ? (menu ? "Privacy policy" : "Privacy") : (menu ? "Политика конфиденциальности" : "Конфиденциальность")}</span>','<span>{english ? "Privacy policy" : "Политика конфиденциальности"}</span>').replace('<span>{english ? (menu ? "Data processing consent" : "Consent") : (menu ? "Согласие на обработку данных" : "Согласие")}</span>','<span>{english ? "Data processing consent" : "Согласие на обработку данных"}</span>').replace('{menu ? <LegalArrow /> : null}','<LegalArrow />')
 need(inverse==before,'Link component changed beyond footer labels and footer icon removal')
 legal=json.loads((P/'data/legal-documents.json').read_bytes());prior=json.loads(old('data/legal-documents.json'))
 facts=read('OPERATOR_FACTS.json')
 need(legal['operator']==facts['operator'] and legal['version']=='2026-10-27-r2','Approved operator facts/current revision differ')
 need(all(legal['operator'][k]==prior['operator'][k]for k in ['name','shortName','inn','ogrn','phone','email']),'Operator identity or retained contacts changed')
 need(set(legal['operator'])=={'name','shortName','inn','ogrn','phone','email','addresses'} and len(legal['operator']['addresses'])==2 and facts.get('addressRole')=='correspondence' and facts.get('registeredAddressAssertion')is False,'Correspondence address model differs')
 card=read('COMPANY_CARD_PROOF.json')
 need(legal['company']['card']==card['publicPath']=='/documents/torgservis-122-company-card.pdf' and legal['company']['reporting']==card['reportingURL']=='https://bo.nalog.gov.ru/organizations-card/12285342','Company document/reporting links differ')
 type_file=(P/'components/contact/VazuriLegalPage.tsx').read_text(encoding='utf8').replace('\r\n','\n')
 inverse_type=type_file.replace('addresses: { ru: string; en: string }[];','legalAddress: string; postalAddress: string;')
 need(inverse_type==old('components/contact/VazuriLegalPage.tsx'),'Existing legal renderer changed beyond address model type')
 switch=(P/'components/headers/LanguageSwitcher.tsx').read_text(encoding='utf8').replace('\r\n','\n')
 need(switch.replace(' || legalPath === "/company"','')==old('components/headers/LanguageSwitcher.tsx'),'Language switch changed beyond company route preservation')
 for name in ['documents/privacy-policy-2026-10-27.pdf','documents/personal-data-consent-2026-10-27.pdf']:
  need(sha((P/'public'/name).read_bytes())==b['tree']['files']['main/'+name]['sha256'],'Published v25 PDF was rewritten')
 need({p for p in d['expected']if p.endswith('.php')}=={'main/lead.php'}and {p for p in d['expected']if p.endswith('.pdf')}=={'main/documents/privacy-policy-2026-10-27-r2.pdf','main/documents/personal-data-consent-2026-10-27-r2.pdf','main/documents/torgservis-122-company-card.pdf'},'Executable/PDF scope differs')
 for project in c['sourceProjects']:
  for name,h in project['sourceSHA256'].items():need(sha((W/project['project']/name).read_bytes())==h,'Frozen source changed')
 for name,h in d['expected'].items():need(sha((A/'candidate'/name).read_bytes())==h,'Frozen runtime changed')
 raw=(A/(d['releaseName']+'.tar')).read_bytes();need(sha(raw)==d['archiveSHA256'],'Tar digest differs')
 with tarfile.open(fileobj=io.BytesIO(raw),mode='r:')as tar:
  members=tar.getmembers();need(len(members)==len(d['expected'])and {m.name for m in members}==set(d['expected']),'Tar union differs')
  for m in members:need(m.isfile()and not m.issym()and not m.islnk()and sha(tar.extractfile(m).read())==d['expected'][m.name],'Tar entry differs')
 need(b['tree']['symlinks'].keys()=={'main/vipfish-audit-v6m9p4k2'}and c['externalRouteLinks']=={'main/vipfish-audit-v6m9p4k2':'/srv/previews/vipfish-audit-v6m9p4k2/current'},'External route literal differs')
 report={'schema':'vazuri/legal-copy-source-scope-review/v1','valid':True,'candidateSHA256':sha((A/'candidate.json').read_bytes()),'footerOnlyCSSAppend':True,'approvedArrowGeometryPreserved':True,'menuLinksUnchanged':True,'linkComponentExactInverse':True,'operatorIdentityUnchanged':True,'correspondenceAddressesUserAuthorized':True,'originalBusinessCardUserAuthorized':True,'footerOnlyCompanyLink':True,'companyLanguageSwitchPreserved':True,'oldPublishedPDFsUnchanged':True,'allFrozenSourceAndRuntimeSHAExact':True,'tarExact':True,'deltaFiles':len(d['expected']),'sourceProjects':len(c['sourceProjects']),'sourceFiles':sum(len(p['sourceSHA256'])for p in c['sourceProjects']),'externalRoutePayloadRead':False,'network':False}
 for name in ['CSS_SCOPE_REVIEW.json','FROZEN_HELPER_REVIEW.json']:(A/name).write_bytes(json.dumps(report,ensure_ascii=False,indent=2).encode('utf8')+b'\n')
 print(json.dumps(report))
if __name__=='__main__':main()
