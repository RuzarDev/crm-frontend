import re,sys,json,os,importlib.util
SP=os.path.dirname(os.path.abspath(__file__))
CYR=re.compile('[А-Яа-яЁё]')
ATTRS='text|header|label|placeholder|title|description|subtitle|kicker|tab|empty-hint|ok-text|cancel-text|content|tooltip|extra|help|addon-after|addon-before|suffix|not-found-content|empty-text|checked-children|un-checked-children'
TR={'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'}
def slug(s):
    s=s.lower().replace('гр.','gr'); w=[]
    for tok in re.findall(r'[a-zа-яё0-9]+',s):
        w.append(''.join(TR.get(ch,ch) for ch in tok))
        if len(w)>=4: break
    k=''.join(x.capitalize() if i else x for i,x in enumerate(w))
    if not k: k='str'
    if k[0].isdigit(): k='n'+k
    return k
def split_file(s):
    ti=s.find('<template>'); te=s.rfind('</template>')
    return s[:ti], s[ti:te], s[te:]
def literals(script):
    for m in re.finditer(r"(['`\"])((?:\\.|(?!\1).)*?)\1",script):
        v=m.group(2)
        if not CYR.search(v): continue
        line_start=script.rfind('\n',0,m.start())+1
        prefix=script[line_start:m.start()]
        if '//' in prefix or prefix.strip().startswith(('*','/*')): continue
        yield m,v
def extract(ns, files):
    keys={}; used=set(); items=[]
    def key_for(txt):
        if txt in keys: return keys[txt]
        k=slug(txt); base=k; n=2
        while k in used: k=f'{base}{n}'; n+=1
        used.add(k); keys[txt]=k; return k
    for f in files:
        s=open(f,encoding='utf-8').read(); head,tpl,script=split_file(s)
        for m in re.finditer(r'(?<![:@\w-])('+ATTRS+r')="([^"]*)"',tpl):
            if CYR.search(m.group(2)): items.append(('attr',f,m.group(2))); key_for(m.group(2))
        for m in re.finditer(r'>([^<>]*[А-Яа-яЁё][^<>]*)<',tpl):
            txt=m.group(1).strip()
            if '{{' in txt: items.append(('text-interp',f,txt))
            else: items.append(('text',f,txt)); key_for(txt)
        for m,v in literals(script):
            if m.group(1)=='`' and '${' in v: items.append(('tpl-literal',f,v))
            else: items.append(('script',f,v)); key_for(v)
    json.dump({'ns':ns,'keys':keys,'items':items},open(f'{SP}/{ns}_strings.json','w'),ensure_ascii=False,indent=0)
    print('unique',len(keys),'items',len(items),'manual:',sum(1 for i in items if i[0] in('text-interp','tpl-literal')))
    for txt,k in keys.items(): print(f'{k} | {txt}')
def apply(ns, files):
    data=json.load(open(f'{SP}/{ns}_strings.json')); keys=data['keys']
    spec=importlib.util.spec_from_file_location('tr',f'{SP}/{ns}_tr.py'); tr=importlib.util.module_from_spec(spec); spec.loader.exec_module(tr)
    SKIP=getattr(tr,'SKIP',set())
    manual=[]
    def key_for(txt):
        if txt in SKIP: return None
        k=keys.get(txt); return k if k and k in tr.T else None
    for f in files:
        s=open(f,encoding='utf-8').read(); head,tpl,script=split_file(s)
        def attr_sub(m):
            k=key_for(m.group(2))
            if not k:
                if CYR.search(m.group(2)) and m.group(2) not in SKIP: manual.append((f,'attr',m.group(0)))
                return m.group(0)
            return f''':{m.group(1)}="t('{ns}.{k}')"'''
        tpl=re.sub(r'(?<![:@\w-])('+ATTRS+r')="([^"]*)"',attr_sub,tpl)
        def text_sub(m):
            txt=m.group(1)
            if not CYR.search(txt): return m.group(0)
            if '{{' in txt: manual.append((f,'text-interp',txt.strip())); return m.group(0)
            k=key_for(txt.strip())
            if not k:
                if txt.strip() not in SKIP: manual.append((f,'text',txt.strip()))
                return m.group(0)
            lead=' ' if txt[:1].isspace() else ''; trail=' ' if txt[-1:].isspace() else ''
            return f">{lead}{{{{ t('{ns}.{k}') }}}}{trail}<"
        tpl=re.sub(r'>([^<>]*[А-Яа-яЁё][^<>]*)<',text_sub,tpl)
        def lit_sub(m):
            q,v=m.group(1),m.group(2)
            if not CYR.search(v): return m.group(0)
            line_start=script.rfind('\n',0,m.start())+1; prefix=script[line_start:m.start()]
            if '//' in prefix or prefix.strip().startswith(('*','/*')): return m.group(0)
            if q=='`' and '${' in v: manual.append((f,'tpl-literal',v)); return m.group(0)
            k=key_for(v)
            if not k:
                if v not in SKIP: manual.append((f,'script',v))
                return m.group(0)
            return f"t('{ns}.{k}')"
        script=re.sub(r"(['`\"])((?:\\.|(?!\1).)*?)\1",lit_sub,script)
        if "useI18n" not in script and f"t('{ns}." in (tpl+script):
            script=script.replace('<script setup lang="ts">\n','<script setup lang="ts">\nimport { useI18n } from \'vue-i18n\'\n',1)
            lines=script.split('\n')
            idx=max(i for i,l in enumerate(lines) if l.startswith('import '))
            while not (lines[idx].rstrip().endswith("'") or lines[idx].rstrip().endswith('"')): idx+=1
            lines.insert(idx+1,"\nconst { t } = useI18n()")
            script='\n'.join(lines)
        open(f,'w',encoding='utf-8').write(head+tpl+script)
    # locales
    ru={txt:k for txt,k in keys.items() if k in tr.T and txt not in SKIP}
    extra_ru=getattr(tr,'EXTRA_RU',{})
    def esc(v): return v.replace('\\','\\\\').replace("'","\\'")
    for l,idx in (('ru',None),('kk',0),('en',1)):
        p=f'src/i18n/locales/{l}.ts'; s=open(p,encoding='utf-8').read()
        block=f"  {ns}: {{\n"
        for txt,k in sorted(ru.items(),key=lambda x:x[1]):
            v=txt if idx is None else tr.T[k][idx]
            kq=f"'{k}'" if k[0].isdigit() else k
            block+=f"    {kq}: '{esc(v)}',\n"
        for k,v in sorted(extra_ru.items()):
            vv=v if idx is None else tr.T[k][idx]
            block+=f"    {k}: '{esc(vv)}',\n"
        block+="  },\n"
        if f"  {ns}: {{" in s:
            s=re.sub(r"  "+ns+r": \{\n(?:    .*\n)*?  \},\n", block, s, count=1)
        else:
            i=s.rfind('}'); s=s[:i]+block+s[i:]
        open(p,'w',encoding='utf-8').write(s)
    print('applied; locale keys:',len(ru)+len(extra_ru))
    print('MANUAL:'); [print(' ',m[0].split('/')[-1],m[1],'|',m[2][:130]) for m in manual]
if __name__=='__main__':
    cmd,ns,*files=sys.argv[1:]
    (extract if cmd=='extract' else apply)(ns,files)
