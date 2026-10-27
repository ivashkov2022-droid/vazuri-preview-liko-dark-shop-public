import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),workspace=path.resolve(here,'../..'),project=path.join(workspace,'projects/vazuri-main-integration');
const sha=b=>createHash('sha256').update(b).digest('hex'),read=async n=>JSON.parse(await fs.readFile(path.join(here,n))),need=(v,m)=>{if(!v)throw Error(m);};
const names=['candidate.json','baseline.json','APPROVED_LEGAL_RULES.css','source-files.json'];
const missing=[];for(const n of names)try{await fs.access(path.join(here,n));}catch{missing.push(n);}
if(!process.argv.includes('--run')){console.log(JSON.stringify({ready:missing.length===0,missing,mode:'local-plan-only',network:false,proof:'exact old style source + approved append; old compiled styles plus exact approved append, canonicalized by installed Vite CSS minifier'}));process.exit(0);}
need(!missing.length,'Missing final CSS review inputs: '+missing.join(', '));
const candidateBytes=await fs.readFile(path.join(here,'candidate.json')),c=JSON.parse(candidateBytes),b=await read('baseline.json'),source='styles/vazuri-legal.css';
const approvedBytes=await fs.readFile(path.join(here,'APPROVED_LEGAL_RULES.css')),approved=approvedBytes.toString().replaceAll('\r\n','\n');
const finalSourceBytes=await fs.readFile(path.join(project,source)),finalSource=finalSourceBytes.toString().replaceAll('\r\n','\n');
need(c.sourceParent==='d8562bf4e22dfe4587add990d5aa2516b50b634b'&&c.sourceSHA256[source]===sha(finalSourceBytes),'Legal CSS source identity differs');
need(approved.trim()&&finalSource.trim()===approved.trim(),'Legal CSS source differs from exact approved new file');
const oldSource='';
const vitePackage=fsSync.realpathSync(path.join(project,'node_modules/vite/package.json')),require=createRequire(vitePackage),postcss=require('postcss'),lightning=require('lightningcss');
const sources=['legal'],prefixes=['.vz-legal'],canonicalPrefixes=prefixes,approvedAST=postcss.parse(approved),selectors=[];
function splitSelectors(text){let quote=null,escape=false,depth=0,start=0,parts=[];for(let i=0;i<text.length;i++){const ch=text[i];if(escape){escape=false;continue;}if(ch==='\\'){escape=true;continue;}if(quote){if(ch===quote)quote=null;continue;}if(ch==='"'||ch==="'"){quote=ch;continue;}if(ch==='('||ch==='[')depth++;if(ch===')'||ch===']')depth--;if(ch===','&&depth===0){parts.push(text.slice(start,i).trim());start=i+1;}}parts.push(text.slice(start).trim());return parts;}
approvedAST.walkAtRules(rule=>need(['media','supports'].includes(rule.name),'Global/new at-rule outside legal scope'));
approvedAST.walkRules(rule=>{const parts=splitSelectors(rule.selector);need(parts.length&&parts.every(s=>s.startsWith('.vz-legal')),'Rule escapes approved legal classes');selectors.push(...parts);});
approvedAST.walkDecls(decl=>{let parent=decl.parent;while(parent&&parent.type!=='rule')parent=parent.parent;need(parent,'Unscoped root declaration');});need(selectors.length,'No legal CSS selectors');
const viteRoot=path.dirname(vitePackage),logger=await import(pathToFileURL(path.join(viteRoot,'dist/node/chunks/logger.js')).href),targets={};
const map={chrome:'chrome',edge:'edge',firefox:'firefox',safari:'safari',ios:'ios_saf'};need(Array.isArray(logger.T),'Installed Vite CSS target list unavailable');
for(const value of logger.T){const match=/^([a-z]+)(\d+)(?:\.(\d+))?$/.exec(value);need(match&&map[match[1]],'Unreviewed CSS target: '+value);targets[map[match[1]]]=(Number(match[2])<<16)|(Number(match[3]||0)<<8);}
const canonical=css=>lightning.transform({filename:'approved-main.css',code:Buffer.from(css),minify:true,targets}).code;
// Vite's two CSS minification passes may regroup comma-list selectors sharing
// identical declarations. Only list order inside new legal rules is immaterial;
// rule order, old selectors and every declaration remain strictly compared.
const equivalentLegalIsLists=[
 ['.vz-legal-links a.vz-legal-links__item:hover','.vz-legal-links a.vz-legal-links__item:focus-visible'],
 ['.vz-legal-links__item:focus-visible','.vz-legal-page__link:focus-visible'],
].map(parts=>[...parts].sort().join(','));
// Only these whole-list wrappers are equivalent: both arms in each approved
// pair have equal specificity, (0,3,1) and (0,2,0) respectively. Old selectors
// and all other :is() forms are left untouched.
function normalizeApprovedSelectorLists(bytes){
 const ast=postcss.parse(bytes.toString());let groups=0,isWrappers=0;
 ast.walkRules(rule=>{
  let parts=splitSelectors(rule.selector);
  if(rule.selector.startsWith(':is(')&&rule.selector.endsWith(')')){
   const inner=splitSelectors(rule.selector.slice(4,-1)),key=[...inner].sort().join(',');
   if(equivalentLegalIsLists.includes(key)){parts=inner;isWrappers++;}
  }
  if(parts.length>1&&parts.every(s=>canonicalPrefixes.some(prefix=>s.startsWith(prefix)))){rule.selector=[...parts].sort().join(',');groups++;}
 });
 return {bytes:Buffer.from(ast.toString()),groups,isWrappers};
}
const runtime=async name=>fs.readFile(path.join(here,Object.hasOwn(c.intendedDelta,name)?'candidate':'reference-code',name));
const oldHTML=(await fs.readFile(path.join(here,'reference-code/main/index.html'))).toString(),newHTML=(await runtime('main/index.html')).toString(),refs=html=>[...html.matchAll(/href="(\/_next\/static\/[^\"]+\.css)"/g)].map(m=>'main'+m[1]);
const oldRefs=refs(oldHTML),newRefs=refs(newHTML);need(oldRefs.length===newRefs.length,'Stylesheet link count changed');
const pairs=new Map(oldRefs.map((old,i)=>[old+'\0'+newRefs[i],{old,new:newRefs[i]}])),proofs=[];let approvedPairs=0;
for(const pair of pairs.values()){
 const oldBytes=await fs.readFile(path.join(here,'reference-code',pair.old)),newBytes=await runtime(pair.new);need(sha(oldBytes)===b.tree.files[pair.old].sha256,'Old compiled CSS bytes differ');need(sha(newBytes)===(c.intendedDelta[pair.new]||b.tree.files[pair.new]).sha256,'New compiled CSS bytes differ');
 if(oldBytes.equals(newBytes)){proofs.push({...pair,unchanged:true,sha256:sha(oldBytes)});continue;}
 const expectedRaw=canonical(Buffer.concat([oldBytes,Buffer.from('\n'+approved)])),actualRaw=canonical(newBytes),expected=normalizeApprovedSelectorLists(expectedRaw),actual=normalizeApprovedSelectorLists(actualRaw);need(expected.bytes.equals(actual.bytes),'Compiled stylesheet differs beyond exact approved append: '+pair.new);approvedPairs++;proofs.push({...pair,unchanged:false,oldSHA256:sha(oldBytes),newSHA256:sha(newBytes),canonicalBeforeSelectorListNormalizationExpectedSHA256:sha(expectedRaw),canonicalBeforeSelectorListNormalizationActualSHA256:sha(actualRaw),canonicalApprovedExpectedSHA256:sha(expected.bytes),canonicalActualSHA256:sha(actual.bytes),onlyNewLegalCommaListOrderAndTwoEqualSpecificityIsWrappersNormalized:true,equivalentLegalIsLists,normalizedExpectedGroups:expected.groups,normalizedActualGroups:actual.groups,normalizedExpectedIsWrappers:expected.isWrappers,normalizedActualIsWrappers:actual.isWrappers,allRuleOrderOldSelectorsAndDeclarationBytesStrictlyCompared:true});
}
need(approvedPairs===1,'Exactly one main stylesheet must contain the scoped addition');
need(sha(await fs.readFile(path.join(here,'candidate.json')))===sha(candidateBytes)&&sha(await fs.readFile(path.join(project,source)))===sha(finalSourceBytes),'Final inputs changed during review');
const report={valid:true,candidateSHA256:sha(candidateBytes),sourceParent:c.sourceParent,stylesheet:source,stylesheetSourceSHA256:sha(finalSourceBytes),oldSourceLFHash:sha(Buffer.from(oldSource)),approvedRulesSHA256:sha(approvedBytes),approvedPlatformSources:sources,approvedScopedSelectors:selectors,newScopedSourceFileExactApprovedRules:true,compiledOldCSSPlusExactApprovedAddition:true,permittedCanonicalization:'Sort only new legal comma-list selectors and unwrap only the two recorded whole-list :is wrappers whose arms have equal specificity; old selectors, all rule order and every declaration remain strictly compared.',installedVitePackageSHA256:sha(await fs.readFile(vitePackage)),targets,minifier:'installed Vite LightningCSS',compiledProofs:proofs,allOtherStylesheetsByteEqual:true,networkActions:false,productWrites:false};
await fs.writeFile(path.join(here,'CSS_SCOPE_REVIEW.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({valid:true,candidateSHA256:report.candidateSHA256,newScopedSourceFile:true,compiledOldPlusExactApprovedAppend:true,approvedSelectors:selectors.length,stylesheets:proofs.length}));
