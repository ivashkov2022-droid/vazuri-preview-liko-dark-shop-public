"""Plan by default; --stage creates the bounded main + nine-case overlay locally."""
import argparse
import hashlib
import html
import json
import re
import urllib.parse
from pathlib import Path

A=Path(__file__).resolve().parent;W=A.parents[1];P=W/'projects/vazuri-main-integration';BUILD=P/'work/legal-copy-20261027'
sha=lambda body:hashlib.sha256(body).hexdigest()
pretty=lambda value:json.dumps(value,ensure_ascii=False,indent=2).encode('utf8')+b'\n'
ROUTES={'index.html':'/','en/index.html':'/en','contact/index.html':'/contact','en/contact/index.html':'/en/contact','privacy/index.html':'/privacy','en/privacy/index.html':'/en/privacy','consent/index.html':'/consent','en/consent/index.html':'/en/consent','company/index.html':'/company','en/company/index.html':'/en/company'}
PDFS={'documents/privacy-policy-2026-10-27-r2.pdf','documents/personal-data-consent-2026-10-27-r2.pdf','documents/torgservis-122-company-card.pdf'}
TAGS=re.compile(r'<link\b[^>]*>|<script\b[^>]*>[\s\S]*?</script>',re.I)
need=lambda value,message:None if value else (_ for _ in ()).throw(RuntimeError(message))


def asset(tag):return bool(re.search(r'(?:src|href)="/_next/static/[^\"]+"',tag))
def strip_assets(head):return TAGS.sub(lambda match:''if asset(match.group(0))else match.group(0),head)
def head(text):return re.search(r'<head>([\s\S]*?)</head>',text).group(1)


def remove_element(text,start):
    tag=re.match(r'<([a-zA-Z0-9]+)\b',text[start:]).group(1);depth=0
    for match in re.finditer(r'</?'+re.escape(tag)+r'\b[^>]*>',text[start:],re.I):
        depth+=-1 if match.group(0).startswith('</') else 1
        if depth==0:return text[:start]+text[start+match.end():]
    raise RuntimeError('Unbalanced approved SSR region')


def remove_class(text,classname):
    pattern=r'<[a-zA-Z0-9]+\b[^>]*class="[^\"]*(?<![\w-])'+re.escape(classname)+r'(?![\w-])[^\"]*"[^>]*>'
    count=0
    while True:
        match=re.search(pattern,text)
        if not match:return text,count
        text=remove_element(text,match.start());count+=1


def normalize_body(text,legal=False):
    value=re.search(r'<body\b[^>]*>([\s\S]*)</body>',text).group(1)
    value=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',value)
    value=re.sub(r'\s+(?:srcSet|srcset)="[^"]*"','',value)
    value,_=remove_class(value,'vz-legal-footer')
    value,_=remove_class(value,'vz-legal-links')
    value=value.replace('menu-data__text vz-legal-menu-caption','menu-data__text')
    value,_=remove_class(value,'vz-contact-page__card')
    # Remove only the old footer policy list item; other footer rows are retained.
    matches=list(re.finditer(r'<a\b[^>]*data-vz-privacy[^>]*>',value))
    for match in reversed(matches):
        start=value.rfind('<li',0,match.start());end=value.find('</li>',match.end())
        need(start>=0 and end>=0 and '<li'not in value[start+3:match.start()],'Old privacy link is not an isolated footer list item')
        value=value[:start]+value[end+5:]
    if legal:
        value,_=remove_class(value,'vz-policy-page')
        value,_=remove_class(value,'vz-legal-page')
        value=re.sub(r'(<a\b[^>]*class="vz-language-switch"[^>]*href=")[^"]*(")',r'\1<LEGAL_LANGUAGE_TARGET>\2',value)
    return value


def merge_head(old,new):
    oldhead,newhead=head(old),head(new)
    marker='document.addEventListener("click",function(event)'
    oldfallback=[m.group(0)for m in TAGS.finditer(oldhead)if marker in m.group(0)]
    newfallback=[m.group(0)for m in TAGS.finditer(newhead)if marker in m.group(0)]
    need(len(oldfallback)==len(newfallback)==1,'One exact static fallback is required')
    approved=oldfallback[0].replace('if(!anchor)return;','if(!anchor||anchor.hasAttribute("download")||anchor.target==="_blank")return;')
    need(newfallback[0]==approved,'Static fallback changed beyond native download/new-tab bypass')
    original=oldhead.replace(oldfallback[0],approved,1)
    assets=[m.group(0)for m in TAGS.finditer(newhead)if asset(m.group(0))];need(assets,'No new client assets')
    inserted=False
    def merge(match):
        nonlocal inserted
        if not asset(match.group(0)):return match.group(0)
        if inserted:return ''
        inserted=True;return ''.join(assets)
    result=TAGS.sub(merge,original)
    need(inserted and strip_assets(result)==strip_assets(original),'Old nonasset head differs beyond exact approved fallback')
    return new.replace('<head>'+newhead+'</head>','<head>'+result+'</head>',1)


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--stage',action='store_true');parser.add_argument('--check',action='store_true');args=parser.parse_args();need(not(args.stage and args.check),'Choose --check or --stage')
    required=['baseline.json','cases/overlay-manifest.json','cases/FINAL_READY.json','cases/overlay-verification.json','source-files.json','PHP_CLI_VERIFICATION.json','PDF_BUILD.json','PDF_RENDER_QA.json','COMPANY_CARD_PROOF.json','OPERATOR_FACTS.json']
    missing=[name for name in required if not(A/name).is_file()]
    if not(args.stage or args.check):
        print(json.dumps({'ready':not missing,'missing':missing,'mode':'local-plan','build':str(BUILD),'mainHTML':10,'caseProjects':9,'PHPAllowed':['main/lead.php'],'PDFAllowed':sorted('main/'+name for name in PDFS),'network':False,'productWrites':False}));return
    need(not missing,'Missing stage inputs: '+','.join(missing));need(not(A/'candidate.json').exists()and not(A/'candidate').exists(),'Preserve existing candidate before staging again')
    b=json.loads((A/'baseline.json').read_bytes());overlay=json.loads((A/'cases/overlay-manifest.json').read_bytes())
    need(b['valid']is True and len(b['tree']['files'])==3793 and len(b['mainManifest'])==1657,'Baseline namespace differs')
    need(overlay['valid']is True and overlay['previous']==b['source']and overlay['baselineReportSHA256']==b['reportSHA256']and len(overlay['cases'])==9,'Case overlay baseline differs')
    ready=json.loads((A/'cases/FINAL_READY.json').read_bytes());need(ready.get('valid')is True and ready['manifestSHA256']==sha((A/'cases/overlay-manifest.json').read_bytes())and ready['runtimeVerificationSHA256']==sha((A/'cases/overlay-verification.json').read_bytes()),'Final case review binding differs')
    legaldata=json.loads((P/'data/legal-documents.json').read_bytes())
    php=json.loads((A/'PHP_CLI_VERIFICATION.json').read_bytes());need(php.get('valid')is True and php.get('checksFailed')==0 and php.get('noActualMail')is True,'PHP isolation proof is not passing')
    facts=__import__('json').loads((A/'OPERATOR_FACTS.json').read_bytes())
    need(legaldata['operator']==facts['operator'] and facts.get('addressRole')=='correspondence' and facts.get('registeredAddressAssertion')is False,'Approved correspondence operator facts differ')
    card=__import__('json').loads((A/'COMPANY_CARD_PROOF.json').read_bytes())
    need(card.get('valid')is True and card.get('userAuthorizedOriginalBusinessCard')is True and card.get('privateContractExcluded')is True,'Original business card is not explicitly authorised')
    need(card['publicPath']=='/documents/torgservis-122-company-card.pdf' and card['publicSHA256']==card['sourceSHA256']=='0c965a6763d8bf0dad996e32b6051bdc47caf0aa54024493fd451c752ff68954' and card['inn']=='2225231152','Company card identity differs')
    need(sha((P/'public'/card['publicPath'].lstrip('/')).read_bytes())==card['publicSHA256'],'Company card source bytes differ')
    changes={};owners={};bodies={};guards=[];aliases=[]
    def add(name,data,owner):
        need(name not in changes and '\\'not in name and '..'not in Path(name).parts,'Duplicate or unsafe runtime path')
        prior=b['tree']['files'].get(name)
        if prior and sha(data)==prior['sha256']:return
        changes[name]={'sha256':sha(data),'size':len(data),'mode':oct(prior['mode']if prior else 0o444)};owners[name]=owner;bodies[name]=data
    for rel,url in ROUTES.items():
        new=(BUILD/rel).read_text(encoding='utf8');oldpath=A/'reference-code/main'/rel
        legal=rel in {'privacy/index.html','en/privacy/index.html','consent/index.html','en/consent/index.html'}
        if legal or rel in {'company/index.html','en/company/index.html'}:
            readable=html.unescape(re.sub(r'<[^>]*>','',new.split('</head>',1)[1]))
            for key in ['name','inn',* [key for key in legaldata['operator']if key.startswith('ogrn')]]:
                need(str(legaldata['operator'][key])in readable,'Built legal operator differs from current approved data')
        if oldpath.is_file():
            old=oldpath.read_text(encoding='utf8');new=merge_head(old,new)
            oldbody,newbody=normalize_body(old,legal),normalize_body(new,legal)
            if oldbody!=newbody:
                offset=next((i for i,(x,y)in enumerate(zip(oldbody,newbody))if x!=y),min(len(oldbody),len(newbody)))
                raise RuntimeError('Non-approved SSR differs: '+rel+' offset '+str(offset)+' '+repr(oldbody[max(0,offset-60):offset+120])+' -> '+repr(newbody[max(0,offset-60):offset+120]))
        else:
            need(rel in {'company/index.html','en/company/index.html'}and 'data-vz-company-page'in new and 'class="vz-legal-page"'in new,'Only new company pages are allowed')
            need('href="https://vazuri.io'+url+'"'in head(new),'New document canonical differs')
        new=re.sub(r'\s+(?:srcSet|srcset)="[^"]*"','',new)
        name='main/'+rel;add(name,new.encode('utf8'),'main');guards.append({'file':name,'url':'https://vazuri.io'+url,'language':'en'if rel.startswith('en/')else'ru','oldNonAssetHeadPreservedExceptExactDownloadBypass':oldpath.is_file(),'nonLegalBodyBytesPreserved':True,'legalBodyRewrite':legal or not oldpath.is_file()})
    for path in BUILD.rglob('*'):
        if not path.is_file():continue
        rel=path.relative_to(BUILD).as_posix();name='main/'+rel
        allowed=rel in {'.vite/manifest.json','vinext-client-entry-manifest.json','lead.php'}|PDFS or rel.startswith('_next/static/')and path.suffix in{'.js','.css','.mjs'}
        if not allowed:continue
        data=path.read_bytes()
        if rel=='lead.php':need({'sha256':sha(data),'size':len(data)}==php['candidatePHP']and data==(P/'public/lead.php').read_bytes(),'Built PHP differs from tested/current candidate')
        if rel in PDFS:need(data==(P/'public'/rel).read_bytes(),'Built dated PDF differs from approved source PDF')
        if path.suffix=='.css':
            def normalize_media(match):
                value=match.group(1).decode();url=urllib.parse.urlsplit(value)
                if not url.path.startswith('/_next/static/media/')or'main'+url.path in b['tree']['files']:return match.group(0)
                generated=BUILD/url.path.lstrip('/');need(generated.is_file()and not generated.is_symlink()and generated.resolve().is_relative_to(BUILD.resolve()),'Compiled media escaped build')
                digest=sha(generated.read_bytes());matches=sorted(n for n,i in b['tree']['files'].items()if n.startswith('main/_next/static/media/')and Path(n).suffix.lower()==generated.suffix.lower()and i['sha256']==digest);need(matches,'Unapproved new main media')
                chosen=matches[0];replacement=urllib.parse.urlunsplit(url._replace(path='/'+chosen.removeprefix('main/')));aliases.append({'css':name,'from':value,'to':replacement,'sameByteSHA256':digest,'publishedFile':chosen});return match.group(0).replace(match.group(1),replacement.encode(),1)
            data=re.sub(rb'''url\(\s*["']?([^\s)"']+)["']?\s*\)''',normalize_media,data)
        add(name,data,'main')
    need('main/lead.php'in changes and {name for name in changes if name.endswith('.pdf')}=={'main/'+rel for rel in PDFS},'Exact PHP/PDF scope differs')
    for case in overlay['cases']:
        key=case['key'];root=case['serverCase'];need(root in b['caseRoots'],'Unexpected case owner')
        for name,info in case['intendedDelta'].items():
            need(name.startswith(root+'/')and Path(name).suffix in{'.html','.js','.mjs','.css','.json'},'Case path escaped approved code scope')
            data=(A/'cases/candidate'/name).read_bytes();prior=b['tree']['files'].get(name)
            need(sha(data)==info['sha256']and len(data)==info['size']and info.get('beforeSha256')==(prior['sha256']if prior else None),'Case delta bytes or baseline differ')
            add(name,data,key)
        for row in case['mountedHTML']:
            if row['file']in changes:guards.append({'file':row['file'],'language':row['bodyLanguage'],'overlayLanguage':row['overlayLanguage'],'caseKey':key,'nonDockHTMLExact':row.get('nonDockHTMLExact',row.get('nonLegalBodyBytesPreserved',True))})
    if args.check:
        print(json.dumps({'valid':True,'mode':'local-validation','deltaFiles':len(changes),'addedFiles':sum(name not in b['tree']['files']for name in changes),'mainHTML':10,'caseProjects':9,'writes':False,'network':False}));return
    for name,data in bodies.items():
        destination=A/'candidate'/name;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(data)
    sources=json.loads((A/'source-files.json').read_bytes());sourceHashes={name:sha((P/name).read_bytes())for name in sources}
    report={'schema':'vazuri/staged-main-approved-forms/v1','valid':True,'baselineReportSHA256':b['reportSHA256'],'intendedDelta':dict(sorted(changes.items())),'owners':dict(sorted(owners.items())),'deletedFiles':[],'routes':guards,'sameByteMediaAliases':aliases,'buildSource':'projects/vazuri-main-integration/work/legal-copy-20261027','mainSourceSHA256':sourceHashes,'caseOverlaySHA256':sha((A/'cases/overlay-manifest.json').read_bytes()),'PHPCLIProofSHA256':sha((A/'PHP_CLI_VERIFICATION.json').read_bytes()),'PDFBuildProofSHA256':sha((A/'PDF_BUILD.json').read_bytes()),'PDFRenderProofSHA256':sha((A/'PDF_RENDER_QA.json').read_bytes()),'CompanyCardProofSHA256':sha((A/'COMPANY_CARD_PROOF.json').read_bytes()),'OperatorFactsProofSHA256':sha((A/'OPERATOR_FACTS.json').read_bytes()),'mainHTML':10,'caseProjects':9,'nginxChanged':False,'mediaAndBulkyUnchanged':True,'PHPPaths':['main/lead.php'],'PDFPaths':sorted('main/'+name for name in PDFS)}
    (A/'STAGED_MAIN.json').write_bytes(pretty(report));(A/'CSS_ASSET_ALIAS_REVIEW.json').write_bytes(pretty({'valid':True,'mediaFilesAddedOrChanged':0,'aliases':aliases}))
    print(json.dumps({'valid':True,'deltaFiles':len(changes),'addedFiles':sum(name not in b['tree']['files']for name in changes),'mainHTML':10,'caseProjects':9,'frozen':False,'network':False}))


if __name__=='__main__':main()
