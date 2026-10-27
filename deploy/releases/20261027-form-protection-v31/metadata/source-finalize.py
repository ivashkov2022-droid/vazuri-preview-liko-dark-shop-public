"""Ten bounded v31 source commits. Local plan by default; root alone uses --commit."""
import argparse,datetime,hashlib,importlib.util,json,os,pathlib,sys

A=pathlib.Path(__file__).resolve().parent
T=A.parent;R=T/'release';W=T.parents[1]
PRIOR=W/'audit/forms-notifications-20261027/release/source-publication.json'
PRIOR_SHA='45ba4695e5ecdaecb3aa140bc78f13776c3c097dbef92c6db0f6b4548424a89a'
COMMON=W/'audit/company-return-20261027/finalize-source.py'
COMMON_SHA='c37cf0ad86eb1ca72cdb02d61c4bdfE4ef1ade6a9444ba1b87abad08a830d653'.lower()
NAME='20261027T180000Z-form-protection-v31'
PACKAGE='deploy/releases/20261027-form-protection-v31'
REF='refs/heads/codex/form-protection-20261027'
IDS={'main','night','hotel','altera','slides','urban','revive','sky','sync','relief'}
CHANGED=set(IDS)
sha=lambda body:hashlib.sha256(body).hexdigest()
pretty=lambda value:json.dumps(value,ensure_ascii=False,indent=2).encode('utf8')+b'\n'
read=lambda path:json.loads(path.read_bytes())
def need(value,message):
 if not value:raise RuntimeError(message)
def library():
 need(sha(COMMON.read_bytes())==COMMON_SHA,'Shared checked Git guard changed')
 spec=importlib.util.spec_from_file_location('v29_scoped_git_guards',COMMON);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 m.A=A;m.W=W;m.PACKAGE=PACKAGE;m.REF=REF
 return m
def snapshots():
 raw=(T/'SOURCE_BEFORE.json').read_bytes();need(sha(raw)=='4da81f72cf7e8af988b89d9e915423498c02b8e98388d720c4710c92853e4e34','Source-before snapshot changed')
 value=json.loads(raw);need(value.get('valid')is True and set(value['projects'])==IDS,'Ten source-before projects required')
 return {key:{'HEAD':row['HEAD'],'branch':row['branch'],'project':row['project'],'rows':row['protected'],'tracked':{name for name,info in row['protected'].items()if info['status']!='??'},'untracked':{name for name,info in row['protected'].items()if info['status']=='??'}}for key,row in value['projects'].items()}
def expected_sources():
 roster=read(R/'source-roster.json');need(roster.get('valid')is True,'Source roster invalid')
 frontpath=T/'frontend/FRONTEND_FREEZE.json';front=read(frontpath);need(front['valid']is True and set(front['projects'])==IDS and sha(frontpath.read_bytes())==roster['frontendFreezeSHA256'],'Ten frontend freeze changed')
 backpath=T/roster['backendFreezePath'];need(backpath.resolve().is_relative_to(T.resolve())and not backpath.is_symlink(),'Backend freeze escaped audit')
 back=read(backpath);need(back.get('valid')is True and back.get('noSecretsIncluded')is True and back.get('productUIFieldsChanged')is False and sha(backpath.read_bytes())==roster['backendFreezeSHA256'],'Backend freeze changed')
 result={key:{name:info['sha256']for name,info in row['sourceFiles'].items()}for key,row in front['projects'].items()}
 for key,row in front['projects'].items():need(row['inverseRestoresEveryOriginalByte']is True and len(result[key])==1,'Unexpected frontend source scope')
 prefix='projects/vazuri-main-integration/'
 for name,info in back['files'].items():
  need(name.startswith(prefix),'Backend source outside main');relative=name.removeprefix(prefix)
  need(relative in {'public/lead.php','public/vazuri-form-security.php'}or relative.startswith('deploy/form-security/'),'Unexpected backend source roster entry')
  result['main'][relative]=info['sha256']
 need({'public/lead.php','public/vazuri-form-security.php'}<=set(result['main']),'Two protected PHP sources required')
 need({row['id']:row['sourceSHA256']for row in roster['projects']}==result,'Roster differs from independent source freezes')
 return result
def qa():
 path=R/'local-qa.json';q=read(path)
 need(q.get('valid')is True and q.get('localQAPassed')is True and q.get('mode')=='local'and q.get('candidateSHA256')==sha((R/'candidate.json').read_bytes()),'Bound final local QA incomplete')
 summary=q.get('summary',{});checks=q.get('checks',[])
 need(summary.get('approvedVariants')==30 and summary.get('nativeSkyScenarios',0)>=6 and checks and all(row.get('passed')is True for row in checks),'Thirty approved/six native variants or QA checks incomplete')
 proofs=q.get('proofSHA256',{});need(isinstance(proofs,dict)and proofs,'QA proof hashes required');result={'release/local-qa.json':sha(path.read_bytes())}
 for name,digest in proofs.items():
  relative=pathlib.PurePosixPath(name);need(relative.as_posix()==name and not relative.is_absolute()and '..'not in relative.parts and '\\'not in name and name!='release/local-qa.json','Unsafe/circular QA proof path')
  target=T/name;need(target.is_file()and not target.is_symlink()and target.resolve().is_relative_to(T.resolve())and sha(target.read_bytes())==digest,'QA proof changed: '+name);result[name]=digest
 return result
def inputs(m):
 need(sha(PRIOR.read_bytes())==PRIOR_SHA,'Verified v30 source ledger changed')
 prior=read(PRIOR);historic={row['id']:row for row in prior['projects']};need(set(historic)==IDS,'Ten prior source identities required')
 c=read(R/'candidate.json');roster=read(R/'source-roster.json')
 need(c['releaseName']==NAME and c['previous']=='/srv/www/vazuri.io/releases/20261027T160000Z-form-notifications-v30'and c['expectedRelease']=='/srv/www/vazuri.io/releases/'+NAME and not c.get('deletedFiles'),'Wrong fixed v31 candidate')
 need(c['sourceRosterSHA256']==sha((R/'source-roster.json').read_bytes())and c['stageProofSHA256']==sha((R/'STAGED_MAIN.json').read_bytes()),'Frozen candidate source/stage identity differs')
 source=expected_sources();snaps=snapshots();qa_hashes=qa();rows={row['id']:row for row in c['sourceProjects']};need(set(rows)==IDS and c['sourceProjects']==roster['projects'],'Ten source rows required')
 owners=c['runtimeOwners'];need(set(owners)==set(c['intendedDelta'])and set(owners.values())==CHANGED,'Ten projects must own the exact public-code delta')
 for key in sorted(CHANGED):
  item=rows[key];before=snaps[key]
  need(item['sourceParent']==before['HEAD']==historic[key]['commit']and item['project']==historic[key]['project']and item['origin']==historic[key]['origin']and item['remote']==historic[key]['remote']and item['ref']==REF,'Changed project identity differs: '+key)
  need(item['sourceSHA256']==source[key]and item['runtimePaths']==sorted(name for name,owner in owners.items()if owner==key),'Source/runtime ownership differs: '+key)
  need(m.git(item,'remote','get-url',item['remote']).decode().strip()==item['origin'],'Remote changed: '+key)
  for name,digest in source[key].items():
   body=m.path_in(m.project_root(item),name).read_bytes();need(sha(body)==digest and not m.policy().source_exclusion(name),'Frozen source changed/unsafe: '+name)
   m.policy().scan_bytes(name+'.txt'if pathlib.PurePosixPath(name).suffix in{'.py','.php','.service','.example'}else name,body)
  m.guard_protected(item,before)
 for name,info in c['intendedDelta'].items():
  body=m.path_in(R/'candidate',name).read_bytes();need(sha(body)==info['sha256']and len(body)==info['size'],'Frozen candidate runtime differs: '+name)
 binding={'candidateSHA256':sha((R/'candidate.json').read_bytes()),'sourceProjectsSHA256':sha(m.canon(c['sourceProjects'])),'qaProofSHA256':qa_hashes,'qaSHA256':sha(m.canon(qa_hashes)),'inheritedSourcePublicationSHA256':PRIOR_SHA}
 return c,rows,historic,snaps,binding
def package(m,item,c,binding):
 result={PACKAGE+'/runtime/'+name:m.path_in(R/'candidate',name).read_bytes()for name in item['runtimePaths']}
 roster=read(R/'source-roster.json')
 evidence={**{name:R/name for name in ['baseline.json','candidate.json','delta.json','STAGED_MAIN.json','source-roster.json']},**{name:T/name for name in binding['qaProofSHA256']},'SOURCE_BEFORE.json':T/'SOURCE_BEFORE.json','frontend/FRONTEND_FREEZE.json':T/'frontend/FRONTEND_FREEZE.json','frontend/SOURCE_MANIFEST.json':T/'frontend/SOURCE_MANIFEST.json','frontend/RUNTIME_OVERLAY_MANIFEST.json':T/'frontend/RUNTIME_OVERLAY_MANIFEST.json','DONOR_SOURCE_MANIFEST.json':T/'DONOR_SOURCE_MANIFEST.json','source-finalize.py':pathlib.Path(__file__),'backend-freeze.json':T/roster['backendFreezePath']}
 for name,path in evidence.items():result[PACKAGE+'/metadata/'+name]=path.read_bytes()
 result[PACKAGE+'/DEPLOY.json']=pretty({'schema':'vazuri/form-protection-deploy/v1','release':c['expectedRelease'],'projectId':item['id'],**binding,'privateEnvDBAndCredentialsIncluded':False,'privateFormSecurityStateIncluded':False,'formsAndFieldsPreserved':True,'donorAndBotConfigurationsUnchanged':True})
 for name,body in result.items():m.policy().scan_bytes(name+'.txt'if name.endswith(('.py','.php','.service','.example'))else name,body)
 return result
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--commit',action='store_true');p.add_argument('--resume',action='store_true');args=p.parse_args()
 required=[R/'candidate.json',R/'baseline.json',R/'delta.json',R/'local-qa.json'];missing=[str(path.relative_to(W))for path in required if not path.is_file()]
 if missing:
  need(not args.commit,'Final source inputs missing');print(json.dumps({'ready':False,'missing':missing,'GitMutations':False,'network':False}));return
 m=library();c,rows,historic,snaps,binding=inputs(m);items=[rows[key]for key in sorted(CHANGED)];packages={item['id']:package(m,item,c,binding)for item in items}
 checkpoint=R/'SOURCE_GIT_FINALIZATION.json';record=read(checkpoint)if checkpoint.exists()else None
 if record:need(all(record.get(key)==value for key,value in binding.items()),'Existing checkpoint belongs to different exact inputs')
 for item in items:
  before=snaps[item['id']];progress=record.get('projects',{}).get(item['id'],{})if record else{}
  need(m.git(item,'rev-parse','HEAD').decode().strip()==progress.get('commit',before['HEAD']),'Source HEAD changed: '+item['id'])
  allowed_branches={REF.removeprefix('refs/heads/')}if progress else{before['branch']}
  if progress.get('phase')=='branch-planned'and not progress.get('commit'):allowed_branches.add(before['branch'])
  need(m.git(item,'branch','--show-current').decode().strip()in allowed_branches,'Source branch differs')
  need(not m.git_names(item,'diff','--cached','--name-only','-z')or progress.get('phase')=='staged','Pre-existing staged work')
 if not args.commit:
  print(json.dumps({'ready':True,'projects':10,'inheritedProjects':0,'sourceFiles':sum(len(item['sourceSHA256'])for item in items),'runtimeFiles':len(c['intendedDelta']),'targetRef':REF,'binding':binding,'GitMutations':False,'network':False}));return
 need(not record or args.resume,'Existing Git phase requires inspection and explicit --resume');need(not(R/'source-publication.json').exists(),'Source publication exists; do not overwrite')
 # Read every baseline/ref before any local or remote write.
 for old in historic.values():need(m.remote_ref(old,old['ref'])==old['commit'],'Fresh baseline remote changed: '+old['id'])
 for item in items:
  progress=record.get('projects',{}).get(item['id'],{})if record else{}
  need(m.remote_ref(item,REF)in{None,progress.get('commit')},'New remote target already exists or moved')
  if not progress:
   need(not m.git(item,'branch','--list',REF.removeprefix('refs/heads/')).strip(),'New local branch exists without checkpoint')
   need(not(m.project_root(item)/PACKAGE).exists()and'.gitattributes'not in m.status(item),'Package/attributes not clean')
 if not record:record={'schema':'vazuri/v31-source-finalization/v1','valid':False,**binding,'projects':{},'phase':'preflight-complete'};checkpoint.write_bytes(pretty(record))
 proofs=[]
 for item in items:
  key=item['id'];root=m.project_root(item);before=snaps[key];owned=packages[key];progress=record['projects'].get(key)
  m.guard_protected(item,before)
  if not progress:
   attrs=(root/'.gitattributes').read_bytes()if(root/'.gitattributes').exists()else b''
   updated=attrs+(b''if not attrs or attrs.endswith(b'\n')else b'\n')+('/'+PACKAGE+'/** -text -filter\n').encode()
   progress={'phase':'branch-planned','attrsBeforeSHA256':sha(attrs),'attrsAfterSHA256':sha(updated)};record['projects'][key]=progress;checkpoint.write_bytes(pretty(record))
  if progress.get('phase')=='branch-planned':
   actual=m.git(item,'branch','--show-current').decode().strip()
   if actual==before['branch']:
    need(not m.git(item,'branch','--list',REF.removeprefix('refs/heads/')).strip(),'Unrecorded local target branch exists');m.git(item,'switch','-c',REF.removeprefix('refs/heads/'))
   else:need(actual==REF.removeprefix('refs/heads/'),'Interrupted branch transition differs')
   need(m.git(item,'rev-parse','HEAD').decode().strip()==before['HEAD'],'Branch transition changed source parent');progress['phase']='branch-created';checkpoint.write_bytes(pretty(record))
  if not progress.get('commit'):
   for name,body in owned.items():
    target=m.path_in(root,name)
    if target.exists():need(target.read_bytes()==body,'Partial package bytes differ')
    else:target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(body)
   attrs=root/'.gitattributes';current=attrs.read_bytes()if attrs.exists()else b''
   if sha(current)==progress['attrsBeforeSHA256']:
    updated=current+(b''if not current or current.endswith(b'\n')else b'\n')+('/'+PACKAGE+'/** -text -filter\n').encode();need(sha(updated)==progress['attrsAfterSHA256'],'Attributes binding differs');attrs.write_bytes(updated)
   else:need(sha(current)==progress['attrsAfterSHA256'],'Attributes changed outside task')
   m.git(item,'add','--',*item['sourceSHA256'],'.gitattributes',PACKAGE);m.git(item,'add','--renormalize','--',PACKAGE)
   need(m.git_names(item,'diff','--cached','--name-only','-z')==set(owned)|set(item['sourceSHA256'])|{'.gitattributes'},'Staged changes escaped bounded files')
   for name,body in owned.items():need(m.git(item,'show',':'+name)==body,'Staged runtime/evidence differs')
   progress['phase']='staged';checkpoint.write_bytes(pretty(record));m.git(item,'commit','-m','Protect form submissions with signed single-use markers');progress.update(phase='committed',commit=m.git(item,'rev-parse','HEAD').decode().strip());checkpoint.write_bytes(pretty(record))
  commit=progress['commit'];blobs=m.verify_commit(item,owned,commit,before);remote=m.remote_ref(item,REF);need(remote in{None,commit},'New remote ref changed')
  if remote is None:m.git(item,'push',item['remote'],commit+':'+REF,network=True)
  need(m.remote_ref(item,REF)==commit,'Published source ref differs')
  proofs.append({'valid':True,**{name:item[name]for name in ['id','project','sourceParent','ref','remote','origin','sourceSHA256','runtimePaths']},'commit':commit,'sourceGitBlobSHA256':blobs,'packagePath':PACKAGE,'candidateSHA256':binding['candidateSHA256'],'qaSHA256':binding['qaSHA256'],'remoteVerified':True,'runtimeDeltaGitBlobsVerified':True,'protectedWorkPreserved':True})
  progress['phase']='pushed-and-verified';checkpoint.write_bytes(pretty(record))
 for key in sorted(IDS-CHANGED):proofs.append(dict(historic[key],inheritedFromV30=True))
 for proof in proofs:need(m.remote_ref(proof,proof['ref'])==proof['commit'],'Final ten source refs differ')
 main_proof=next(proof for proof in proofs if proof['id']=='main')
 aggregate={'schema':'vazuri/form-protection-source-publication/v1','valid':True,**{key:main_proof[key]for key in ['project','commit','ref','remote','origin','sourceSHA256','packagePath']},**binding,'projects':proofs,'verifiedProjectCount':10,'newCommitCount':10,'inheritedProjectCount':0,'remoteVerified':True,'runtimeDeltaGitBlobsVerified':True,'ownedRuntimeUnion':sorted(name for item in items for name in item['runtimePaths']),'allProtectedWorkPreserved':True,'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 (R/'source-publication.json').write_bytes(pretty(aggregate));record.update(valid=True,phase='complete',sourcePublicationSHA256=sha((R/'source-publication.json').read_bytes()));checkpoint.write_bytes(pretty(record));print(json.dumps({'valid':True,'verifiedProjects':10,'newCommitCount':10,'inheritedProjectCount':0,'sourcePublicationSHA256':record['sourcePublicationSHA256']}))
if __name__=='__main__':
 try:main()
 except Exception as error:print(json.dumps({'valid':False,'error':str(error),'automaticRetry':False}));sys.exit(1)
