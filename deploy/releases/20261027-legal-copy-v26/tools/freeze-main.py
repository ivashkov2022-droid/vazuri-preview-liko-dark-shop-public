"""Plan by default; --freeze pins the exact reviewed ten-project legal overlay once."""
import argparse
import base64
import hashlib
import io
import json
import pathlib
import tarfile

A=pathlib.Path(__file__).resolve().parent;W=A.parents[1];NAME='20261027T150000Z-legal-copy-v26'
sha=lambda body:hashlib.sha256(body).hexdigest()
pretty=lambda value:json.dumps(value,ensure_ascii=False,indent=2).encode('utf8')+b'\n'
canonical=lambda value:json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf8')
need=lambda value,message:None if value else (_ for _ in ()).throw(RuntimeError(message))


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--freeze',action='store_true');args=parser.parse_args()
    required=['baseline.json','STAGED_MAIN.json','source-projects.json','PUBLICATION_HOLD.json','server-main-release.py','run-phase.py','verify-live.py','cases/FINAL_READY.json','cases/overlay-verification.json','COMPANY_CARD_PROOF.json','OPERATOR_FACTS.json']
    missing=[name for name in required if not(A/name).is_file()];hold=json.loads((A/'PUBLICATION_HOLD.json').read_bytes())if(A/'PUBLICATION_HOLD.json').is_file()else{'active':True}
    if not args.freeze:
        print(json.dumps({'ready':not missing and not hold.get('active',True),'missing':missing,'publicationHoldActive':hold.get('active',True),'mode':'local-plan','target':NAME,'network':False,'GitWrites':False}));return
    need(not missing,'Missing freeze inputs');need(hold.get('active')is False,'Publication hold remains active; operator and dependent proofs must be final')
    need(not(A/'candidate.json').exists()and not(A/'delta.json').exists()and not(A/(NAME+'.tar')).exists(),'Frozen output exists; preserve it before another candidate')
    b=json.loads((A/'baseline.json').read_bytes());stage=json.loads((A/'STAGED_MAIN.json').read_bytes());roster=json.loads((A/'source-projects.json').read_bytes());delta=stage['intendedDelta'];owners=stage['owners']
    need(stage['valid']is True and stage['baselineReportSHA256']==b['reportSHA256']and set(delta)==set(owners),'Stage scope differs')
    need(len(roster)==10 and {r['id']for r in roster}==set(owners.values()),'Exactly ten source owners required')
    need({p for p in delta if p.endswith('.php')}=={'main/lead.php'}and{p for p in delta if p.endswith('.pdf')}==set(stage['PDFPaths']),'Exact PHP/PDF scope differs')
    need(stage['caseOverlaySHA256']==sha((A/'cases/overlay-manifest.json').read_bytes()),'Case overlay changed after stage')
    ready=json.loads((A/'cases/FINAL_READY.json').read_bytes());need(ready.get('valid')is True and ready['manifestSHA256']==stage['caseOverlaySHA256']and ready['runtimeVerificationSHA256']==sha((A/'cases/overlay-verification.json').read_bytes()),'Final case graph receipt differs')
    for key,name in [('PHPCLIProofSHA256','PHP_CLI_VERIFICATION.json'),('PDFBuildProofSHA256','PDF_BUILD.json'),('PDFRenderProofSHA256','PDF_RENDER_QA.json'),('CompanyCardProofSHA256','COMPANY_CARD_PROOF.json'),('OperatorFactsProofSHA256','OPERATOR_FACTS.json')]:need(stage[key]==sha((A/name).read_bytes()),'Dependent PHP/PDF proof changed after stage')
    projects=[]
    for item in roster:
        root=W/item['project'];sources={}
        for name in item['sourceFiles']:
            rel=pathlib.PurePosixPath(name);need(not rel.is_absolute()and'..'not in rel.parts and'\\'not in name,'Source escaped project');file=root/name;need(file.is_file()and not file.is_symlink()and file.resolve().is_relative_to(root.resolve()),'Source is not canonical');sources[name]=sha(file.read_bytes())
        paths=sorted(p for p in delta if owners[p]==item['id']);need(paths and all(p.startswith(item['runtimeRoot']+'/')for p in paths),'Runtime owner escaped project')
        projects.append({k:item[k]for k in ['id','project','sourceParent','ref','origin','remote']}|{'sourceSHA256':sources,'runtimePaths':paths})
    main=next(item for item in projects if item['id']=='main');need(main['sourceSHA256']==stage['mainSourceSHA256'],'Main source changed after build/stage')
    overlay=json.loads((A/'cases/overlay-manifest.json').read_bytes())
    for item in projects:
        if item['id']=='main':continue
        case=next(row for row in overlay['cases']if row['key']==item['id']);need(item['sourceSHA256']==case['sourceSHA256']and item['sourceParent']==case['sourceParent'],'Case source changed after overlay')
    rows=[];mainroutes={row['file']:row for row in stage['routes']if row['file'].startswith('main/')};serveronly={p:'internal-build-manifest'for p in delta if'/.vite/'in p};serveronly['main/lead.php']='server-executable-backend-no-HTTP-probe';serveronly['scroll-slides-kinetic-x8q4m7v2/index.html']='physical-root-canonically-redirected-to-EN; exact bytes verified on server'
    case_routes=[]
    for item in overlay['cases']:
        old=json.loads((W/'audit/form-submit-arrow-20261026/cases'/(item['key']+'.json')).read_bytes())
        case_routes.extend(dict(row,caseKey=item['key'])for row in old['routes'])
    for name,info in sorted(delta.items()):
        body=(A/'candidate'/name).read_bytes();need(sha(body)==info['sha256']and len(body)==info['size'],'Staged runtime bytes changed')
        if name in serveronly:continue
        if name in mainroutes:
            row=mainroutes[name];rows.append({'file':name,'url':row['url'],'group':'main','role':'html','language':row['language']});continue
        matches=[row for row in case_routes if row['runtimeFile']==name]
        if matches:
            rows.extend({'file':name,'url':row['url'],'group':'case','role':'html','language':row['bodyLanguage'],'caseKey':row['caseKey']}for row in matches);continue
        path='/'+name.removeprefix('main/');role={'.pdf':'pdf','.css':'css','.html':'html','.json':'json'}.get(pathlib.PurePosixPath(name).suffix,'js')
        if role=='html':path=path.removesuffix('index.html')
        rows.append({'file':name,'url':'https://vazuri.io'+path,'group':'main'if owners[name]=='main'else'case','role':role,**({'caseKey':owners[name]}if owners[name]!='main'else{})})
    slides_target='scroll-slides-kinetic-x8q4m7v2/en/index.html'
    if 'scroll-slides-kinetic-x8q4m7v2/index.html'in delta:
        need(slides_target in delta,'Canonical Slides EN target must be in the same verified overlay')
        rows.append({'file':slides_target,'url':'https://vazuri.io/scroll-slides-kinetic-x8q4m7v2/','group':'case','role':'html','language':'en','caseKey':'slides','canonicalRedirectSourceFile':'scroll-slides-kinetic-x8q4m7v2/index.html','canonicalRedirectTo':'https://vazuri.io/scroll-slides-kinetic-x8q4m7v2/en/'})
    buff=io.BytesIO()
    with tarfile.open(fileobj=buff,mode='w:',format=tarfile.PAX_FORMAT)as archive:
        for name,info in sorted(delta.items()):
            body=(A/'candidate'/name).read_bytes();member=tarfile.TarInfo(name);member.size=len(body);member.mode=int(info['mode'],0);member.mtime=0;archive.addfile(member,io.BytesIO(body))
    body=buff.getvalue();d={'schema':'vazuri/main-approved-forms-delta/v1','previous':b['source'],'releaseName':NAME,'expected':{p:i['sha256']for p,i in delta.items()},'before':{p:b['tree']['files'].get(p,{}).get('sha256')for p in delta},'archivePath':'/home/uwinadmin/vazuri-incoming/'+NAME+'.tar','archiveSHA256':sha(body)}
    scope={'expected':d['expected'],'before':d['before'],'owners':owners,'archivePath':d['archivePath'],'archiveSHA256':d['archiveSHA256'],'PHPPaths':['main/lead.php'],'PDFPaths':stage['PDFPaths'],'serverOnly':serveronly}
    c={'schema':'vazuri/main-approved-forms-candidate/v1','previous':b['source'],'expectedRelease':'/srv/www/vazuri.io/releases/'+NAME,'releaseName':NAME,'sourceProject':main['project'],'sourceParent':main['sourceParent'],'sourceSHA256':main['sourceSHA256'],'sourceProjects':projects,'sourceProjectsConfigSHA256':sha((A/'source-projects.json').read_bytes()),'runtimeOwners':owners,'intendedDelta':delta,'deletedFiles':[],'archiveSHA256':d['archiveSHA256'],'baselineReportSHA256':b['reportSHA256'],'publicVerificationFiles':rows,'serverOnly':serveronly,'routes':stage['routes'],'externalRouteLinks':{name:info['target']for name,info in b['tree'].get('symlinks',{}).items()},'protectedCases':9,'nineCaseLegalOverlaysOnly':True,'mediaAndBulkyAndNginxUnchanged':True,'expectedCoreFiles':len(set(b['tree']['files'])|set(delta)),'expectedMainFiles':len(set(b['mainManifest'])|{p for p in delta if p.startswith('main/')}),'expectedRootFiles':{root:len({p for p in set(b['tree']['files'])|set(delta)if p.startswith(root+'/')})for root in ['main',*b['caseRoots']]},'frozenScopeSHA256':sha(canonical(scope)),'stageProofSHA256':sha((A/'STAGED_MAIN.json').read_bytes()),'PHPCLIProofSHA256':stage['PHPCLIProofSHA256'],'PDFBuildProofSHA256':stage['PDFBuildProofSHA256'],'PDFRenderProofSHA256':stage['PDFRenderProofSHA256'],'CompanyCardProofSHA256':stage['CompanyCardProofSHA256'],'OperatorFactsProofSHA256':stage['OperatorFactsProofSHA256']}
    added=sum(p not in b['tree']['files']for p in delta)
    for helper in ['server-main-release.py','run-phase.py','verify-live.py']:
        path=A/helper;text=path.read_text(encoding='utf8');need('__DELTA_FILES__'in text and'__ADDED_FILES__'in text,'Helper already frozen');path.write_text(text.replace('__DELTA_FILES__',str(len(delta))).replace('__ADDED_FILES__',str(added)),encoding='utf8',newline='\n')
    path=A/'server-main-release.py';text=path.read_text(encoding='utf8');need("SCOPE_B64 = '__FINAL_SCOPE_B64__'"in text,'Server scope already frozen');path.write_text(text.replace("SCOPE_B64 = '__FINAL_SCOPE_B64__'","SCOPE_B64 = '"+base64.b64encode(canonical(scope)).decode()+"'"),encoding='utf8',newline='\n')
    path=A/'run-phase.py';text=path.read_text(encoding='utf8');need("PIN='__FINAL_TEMPLATE_SHA256__'"in text,'Runner already pinned');path.write_text(text.replace("PIN='__FINAL_TEMPLATE_SHA256__'","PIN='"+sha((A/'server-main-release.py').read_bytes())+"'"),encoding='utf8',newline='\n')
    for name,value in [(NAME+'.tar',body),('delta.json',pretty(d)),('candidate.json',pretty(c)),('FROZEN_SCOPE.json',pretty(scope))]:
        with(A/name).open('xb')as handle:handle.write(value)
    print(json.dumps({'valid':True,'deltaFiles':len(delta),'addedFiles':added,'sourceProjects':10,'sourceFiles':sum(len(row['sourceSHA256'])for row in projects),'expectedCoreFiles':c['expectedCoreFiles'],'expectedMainFiles':c['expectedMainFiles'],'candidateSHA256':sha(pretty(c))}))


if __name__=='__main__':main()
