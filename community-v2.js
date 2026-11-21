// WordMaster 3.0 Community Library. Firebase config is supplied separately.
const status=document.getElementById('communityStatus');
const results=document.getElementById('communityResults');
const account=document.getElementById('communityAccount');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cfg=window.WORDMASTER_FIREBASE_CONFIG;
if(!cfg?.apiKey||!cfg?.projectId){
  status.textContent='Topluluk hizmeti henüz etkin değil. Firebase projesi yapılandırılınca burada paylaşılan listeler görünecek.';
}else{
  try{
    const [{initializeApp},{getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut},{getFirestore,collection,addDoc,getDocs,query,where,limit,startAfter,serverTimestamp,doc,getDoc,setDoc,deleteDoc}]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js')
    ]);
    const app=initializeApp(cfg),auth=getAuth(app),store=getFirestore(app);
    let current=null,items=[],lastPublicDoc=null,morePublic=true,publicLoading=false;window.vocaUser=null;window.vocaReady=false;let generation=0;let pending=Promise.resolve();let timer=null;let lastError='';
    const say=s=>{status.textContent=s};
    const empty=()=>({categories:[],lists:[],words:[],reviews:[]});
    const personalRef=u=>doc(store,'users',u.uid,'private','vocabulary');
    function flush(){if(timer){clearTimeout(timer);timer=null}return pending}
    window.vocaCloudSave=(snapshot)=>{
      if(!current||!window.vocaReady)return;
      const u=current,token=generation;
      if(timer)clearTimeout(timer);
      timer=setTimeout(()=>{
        timer=null;
        pending=pending.catch(()=>{}).then(async()=>{
          if(token!==generation||auth.currentUser?.uid!==u.uid)return;
          await setDoc(personalRef(u),{data:snapshot,updatedAt:serverTimestamp()});
          lastError='';
          status.textContent='Kişisel veriler buluta kaydedildi.';
        }).catch(e=>{lastError=e.code||e.message;status.textContent='Bulut kaydı başarısız: '+lastError+'. Verileri kaybetmemek için oturumu kapatma.'});
      },600);
    };
    onAuthStateChanged(auth,async u=>{
      const token=++generation;
      current=u;window.vocaUser=u;window.vocaReady=false;
      window.vocaDataLoad(empty());
      if(u){
        account.innerHTML='<span class="muted">Giriş: '+esc(u.email)+'</span> <button class="btn alt small" id="communityLogout">Çıkış</button><p class="muted" id="cloudState">Kişisel veriler yükleniyor...</p>';
        document.getElementById('communityLogout').onclick=async()=>{
          if(lastError){say('Kaydedilemeyen değişiklikler var. Önce bağlantını kontrol et.');return}
          if(timer){clearTimeout(timer);timer=null;const snapshot=JSON.parse(JSON.stringify(window.wordmasterCommunityDb()));await setDoc(personalRef(u),{data:snapshot,updatedAt:serverTimestamp()}).catch(e=>{lastError=e.code||e.message;});}
          await flush();if(lastError){say('Bulut kaydı tamamlanamadı: '+lastError+'. Oturum açık tutuldu.');return}await signOut(auth);go('community');
        };
        try{
          const snap=await getDoc(personalRef(u));
          if(token!==generation)return;
          const cloudData=snap.exists()?snap.data().data:empty();
          let recovery=null;
          try{
            const local=JSON.parse(localStorage.getItem('vocalist-clean-v1')||'null');
            if(local&&Array.isArray(local.categories)&&Array.isArray(local.lists)&&Array.isArray(local.words)&&Array.isArray(local.reviews)){
              const cloudListIds=new Set((cloudData?.lists||[]).map(l=>l.id));
              const missing=local.lists.filter(l=>!cloudListIds.has(l.id));
              if(missing.length)recovery={local,missing};
            }
          }catch(e){}
          window.vocaDataLoad(cloudData);
          if(recovery){
            const msg='Bu cihazda bulutta bulunmayan '+recovery.missing.length+' liste tespit edildi. Bunları mevcut bulut verilerini silmeden kurtarmak ister misin?';
            if(confirm(msg)){
              const merged=JSON.parse(JSON.stringify(cloudData));
              const categoryIds=new Set(merged.categories.map(c=>c.id));
              const listIds=new Set(merged.lists.map(l=>l.id));
              const wordIds=new Set(merged.words.map(w=>w.id));
              const reviewIds=new Set(merged.reviews.map(r=>r.id).filter(Boolean));
              for(const c of recovery.local.categories)if(!categoryIds.has(c.id)){merged.categories.push(c);categoryIds.add(c.id)}
              for(const l of recovery.local.lists)if(!listIds.has(l.id)){merged.lists.push(l);listIds.add(l.id)}
              for(const w of recovery.local.words){
                const existing=merged.words.find(x=>x.id===w.id)||merged.words.find(x=>x.en.trim().toLowerCase()===w.en.trim().toLowerCase());
                if(existing){existing.listIds=[...new Set([...(existing.listIds||[]),...(w.listIds||[])].filter(id=>listIds.has(id)))]}
                else if(!wordIds.has(w.id)){merged.words.push(w);wordIds.add(w.id)}
              }
              for(const r of recovery.local.reviews)if(r.id&&!reviewIds.has(r.id)){merged.reviews.push(r);reviewIds.add(r.id)}
              window.vocaDataLoad(merged);
              await setDoc(personalRef(u),{data:merged,updatedAt:serverTimestamp()});
              say('Yerel listeler kurtarıldı ve buluta kaydedildi.');
              localStorage.removeItem('vocalist-clean-v1');
            }
          }
          window.vocaReady=true;
          document.getElementById('cloudState').textContent='Kişisel listelerin ve çalışma geçmişin bulutta saklanır.';
          say('Hesap verileri yüklendi.');window.vocaRefreshSharing?.();
        }catch(e){if(token!==generation)return;say('Hesap verileri yüklenemedi: '+(e.code||e.message)+'. Düzenleme kapalı.');}
      }else{
        window.vocaRefreshSharing?.();
        account.innerHTML='<label class="field"><span>E-posta</span><input id="communityEmail" type="email" autocomplete="email"></label><label class="field"><span>Şifre</span><input id="communityPassword" type="password" autocomplete="current-password"></label><div class="row"><button class="btn small" id="communityLogin">Giriş yap</button><button class="btn alt small" id="communitySignup">Hesap oluştur</button></div>';
        const credentials=()=>[document.getElementById('communityEmail').value.trim(),document.getElementById('communityPassword').value];
        document.getElementById('communityLogin').onclick=async()=>{try{await signInWithEmailAndPassword(auth,...credentials())}catch(e){say('Giriş başarısız: '+e.code)}};
        document.getElementById('communitySignup').onclick=async()=>{try{await createUserWithEmailAndPassword(auth,...credentials())}catch(e){say('Kayıt başarısız: '+e.code)}};
      }
    });
    const publicCollection=collection(store,'publicLists');
    const render=()=>{const q=document.getElementById('communitySearch').value.trim().toLocaleLowerCase('tr-TR');const filtered=items.filter(x=>(x.title+' '+x.category+' '+x.words.map(w=>w.en+' '+w.tr).join(' ')).toLocaleLowerCase('tr-TR').includes(q));results.innerHTML=filtered.length?filtered.map(x=>'<div class="item"><strong>'+esc(x.title)+'</strong><div class="muted">'+esc(x.category)+' · '+x.words.length+' kelime · '+esc(x.authorName||'Topluluk üyesi')+'</div><div class="row" style="margin-top:10px"><button class="btn alt small" data-preview="'+esc(x.id)+'">Önizle</button><button class="btn alt small" data-study="'+esc(x.id)+'">Çalış</button><button class="btn small" data-copy="'+esc(x.id)+'">Listelerime ekle</button></div></div>').join(''):'<div class="empty">Eşleşen paylaşım bulunamadı.</div>';results.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>{const x=items.find(v=>v.id===b.dataset.preview);if(x)window.vocaOpenPublicDetail(x)});results.querySelectorAll('[data-study]').forEach(b=>b.onclick=()=>{const x=items.find(v=>v.id===b.dataset.study);if(x)window.vocaStartPublicStudy(x)});results.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{const x=items.find(v=>v.id===b.dataset.copy);if(!x)return;if(!current||!window.vocaReady){say('Listeyi kendine eklemek için giriş yapıp verilerinin yüklenmesini beklemelisin.');account.scrollIntoView({behavior:'smooth'});return}const db=window.wordmasterCommunityDb();const c={id:crypto.randomUUID(),name:x.category||'Topluluk'};const l={id:crypto.randomUUID(),categoryId:c.id,name:x.title};db.categories.push(c);db.lists.push(l);let added=0;for(const w of x.words){let existing=db.words.find(v=>v.en.trim().toLocaleLowerCase('en')===w.en.trim().toLocaleLowerCase('en')&&v.tr===w.tr&&v.example===w.example);if(existing){if(!existing.listIds.includes(l.id))existing.listIds.push(l.id)}else{db.words.push({id:crypto.randomUUID(),en:w.en,tr:w.tr,example:w.example||'',listIds:[l.id],srs:{reps:0,interval:0,ease:2.5,due:new Date().toLocaleDateString('en-CA'),misses:0}});added++}}window.wordmasterCommunitySave();window.wordmasterCommunityRefreshOwn?.();say('Liste kopyalandı: '+x.title+' · '+added+' yeni kelime. Kopyan bağımsızdır.');})};
    const moreBtn=document.createElement('button');moreBtn.className='btn alt';moreBtn.textContent='Daha fazla liste yükle';moreBtn.style.cssText='display:block;margin:16px auto 22px';results.insertAdjacentElement('afterend',moreBtn);
    async function load(next=false){if(publicLoading)return;publicLoading=true;moreBtn.disabled=true;say(next?'Yeni listeler yükleniyor...':'Listeler yükleniyor...');try{const snap=await getDocs(next&&lastPublicDoc?query(publicCollection,startAfter(lastPublicDoc),limit(100)):query(publicCollection,limit(100)));if(!next)items=[];if(snap.docs.length)lastPublicDoc=snap.docs[snap.docs.length-1];morePublic=snap.docs.length===100;const existing=new Set(items.map(x=>x.id));for(const d of snap.docs){const item={id:d.id,...d.data()};if(Array.isArray(item.words)&&!existing.has(item.id)){items.push(item);existing.add(item.id)}}render();window.vocaRefreshSharing?.();say(items.length+' topluluk listesi yüklendi'+(morePublic?' · Daha fazla liste olabilir.':'.'));moreBtn.style.display=morePublic?'block':'none'}catch(e){say('Listeler yüklenemedi: '+(e.code||e.message));moreBtn.style.display='block'}finally{publicLoading=false;moreBtn.disabled=false}}
    moreBtn.onclick=()=>load(true);
    document.getElementById('communitySearch').addEventListener('input',render);
    document.getElementById('communityRefresh').onclick=load;
    document.getElementById('communityPublish').onclick=async()=>{if(!current||!window.vocaReady)return say('Liste yayımlamak için giriş yapıp verilerinin yüklenmesini bekle.');const db=window.wordmasterCommunityDb(),id=document.getElementById('communityOwnList').value,l=db.lists.find(x=>x.id===id);if(!l)return say('Önce yayımlanacak listeyi seç.');const words=db.words.filter(w=>w.listIds.includes(id)).map(w=>({en:w.en,tr:w.tr,example:w.example||''}));if(!words.length)return say('Boş liste yayımlanamaz.');if(words.length>500)return say('Bir paylaşım en fazla 500 kelime içerebilir.');if(!confirm(l.name+' listesindeki '+words.length+' kelime herkese açık yayımlansın mı?'))return;try{await addDoc(publicCollection,{ownerUid:current.uid,authorName:current.email.split('@')[0],title:l.name,category:db.categories.find(c=>c.id===l.categoryId)?.name||'Genel',words,createdAt:serverTimestamp()});say('Liste yayımlandı.');await load()}catch(e){say('Yayımlanamadı: '+e.code)}};
    const ownedPublications=()=>items.filter(x=>current&&x.ownerUid===current.uid);
    let bulkSharingBusy=false;
    async function bulkSharing(action){
      if(bulkSharingBusy||!current||!window.vocaReady)return;
      const db=window.wordmasterCommunityDb();
      const owned=ownedPublications();
      const candidates=action==='share'?db.lists.filter(l=>!owned.some(p=>p.localListId===l.id)):owned;
      if(!candidates.length){say('Değiştirilecek liste bulunamadı.');return}
      const message=action==='share'?candidates.length+' liste paylaşılacak. Boş veya 500 kelimeyi aşan listeler atlanacak. Devam edilsin mi?':candidates.length+' paylaşım topluluktan kaldırılacak. Kişisel listelerin korunacak. Devam edilsin mi?';
      if(!confirm(message))return;
      bulkSharingBusy=true;
      let ok=0,skipped=0,errors=0;
      const buttons=document.querySelectorAll('[data-bulk-sharing]');
      buttons.forEach(b=>b.disabled=true);
      try{
        for(const entry of candidates){
          if(!current||!window.vocaReady)break;
          try{
            if(action==='share'){
              const words=db.words.filter(w=>w.listIds.includes(entry.id)).map(w=>({en:w.en,tr:w.tr,example:w.example||''}));
              if(!words.length||words.length>500){skipped++;continue}
              const c=db.categories.find(v=>v.id===entry.categoryId);
              await addDoc(publicCollection,{ownerUid:current.uid,localListId:entry.id,authorName:current.email.split('@')[0],title:entry.name,category:c?.name||'Genel',words,createdAt:serverTimestamp()});
            }else{
              await deleteDoc(doc(store,'publicLists',entry.id));
            }
            ok++;
          }catch(e){errors++;say('İşlem devam ediyor: '+ok+' başarılı, '+errors+' hatalı. Son hata: '+(e.code||e.message))}
          const progress=document.getElementById('sharingBulkStatus');
          if(progress)progress.textContent=(ok+skipped+errors)+' / '+candidates.length+' işlendi';
        }
        await load();
        say((action==='share'?'Paylaşım':'Paylaşımı kaldırma')+' tamamlandı: '+ok+' başarılı, '+skipped+' atlandı, '+errors+' hata.');
      }finally{
        bulkSharingBusy=false;
        buttons.forEach(b=>b.disabled=false);
      }
    }
    document.getElementById('shareAllLists')?.addEventListener('click',()=>bulkSharing('share'));
    document.getElementById('unshareAllLists')?.addEventListener('click',()=>bulkSharing('unshare'));
    window.vocaRefreshSharing=()=>{
      const db=window.wordmasterCommunityDb(),box=document.getElementById('sharingListControls');
      if(!box)return;
      box.replaceChildren();
      if(!current||!window.vocaReady){box.textContent='Tek tek paylaşım kutularını görmek için giriş yapıp listelerinin yüklenmesini bekle.';return}
      if(!db.lists.length){box.textContent='Henüz kişisel listen yok.';return}
      for(const l of db.lists){
        const c=db.categories.find(v=>v.id===l.categoryId);
        const match=ownedPublications().find(x=>x.localListId===l.id);
        const row=document.createElement('label');row.className='item row between';row.style.display='flex';row.style.alignItems='center';row.style.margin='10px 0';
        const label=document.createElement('span');label.textContent=(c?.name||'Genel')+' / '+l.name;
        const check=document.createElement('input');check.type='checkbox';check.checked=!!match;check.style.width='24px';check.style.height='24px';check.style.flexShrink='0';
        check.onchange=async()=>{
          check.disabled=true;
          try{
            if(check.checked){
              const words=db.words.filter(w=>w.listIds.includes(l.id)).map(w=>({en:w.en,tr:w.tr,example:w.example||''}));
              if(!words.length||words.length>500)throw Error(words.length?'Bir liste en fazla 500 kelime içerebilir.':'Boş liste paylaşılamaz.');
              if(!confirm(l.name+' listesini toplulukla paylaşmak istiyor musun?')){check.checked=false;return}
              await addDoc(publicCollection,{ownerUid:current.uid,localListId:l.id,authorName:current.email.split('@')[0],title:l.name,category:c?.name||'Genel',words,createdAt:serverTimestamp()});
              say('Liste toplulukta yayımlandı.');
            }else{
              if(!match){check.checked=false;return}
              if(!confirm(l.name+' listesini topluluktan kaldırmak istiyor musun? Kişisel listen korunacak.')){check.checked=true;return}
              await deleteDoc(doc(store,'publicLists',match.id));
              say('Liste topluluktan kaldırıldı.');
            }
            await load();
          }catch(e){check.checked=!check.checked;say('Paylaşım değiştirilemedi: '+(e.code||e.message))}
          finally{check.disabled=false}
        };
        row.append(label,check);box.append(row);
      }
      const legacy=ownedPublications().filter(x=>!x.localListId||!db.lists.some(l=>l.id===x.localListId));
      if(legacy.length){
        const title=document.createElement('p');title.className='muted';title.textContent='Önceden yayımlanan listeler (kaldırılabilir):';box.append(title);
        for(const x of legacy){
          const row=document.createElement('div');row.className='item row between';row.style.margin='8px 0';
          const name=document.createElement('span');name.textContent=x.title+' · '+x.words.length+' kelime';
          const button=document.createElement('button');button.className='btn danger small';button.textContent='Yayından kaldır';
          button.onclick=async()=>{if(!confirm(x.title+' topluluktan kaldırılsın mı?'))return;button.disabled=true;try{await deleteDoc(doc(store,'publicLists',x.id));await load()}catch(e){say('Kaldırılamadı: '+(e.code||e.message));button.disabled=false}};
          row.append(name,button);box.append(row);
        }
      }
    };
    window.wordmasterCommunityRefreshOwn=()=>{const db=window.wordmasterCommunityDb();document.getElementById('communityOwnList').innerHTML=db.lists.map(l=>'<option value="'+esc(l.id)+'">'+esc(db.categories.find(c=>c.id===l.categoryId)?.name||'')+' / '+esc(l.name)+'</option>').join('')};
    window.wordmasterCommunityRefreshOwn();load();
  }catch(e){say('Topluluk hizmeti başlatılamadı: '+e.message)}
}