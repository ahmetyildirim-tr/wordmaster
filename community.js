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
    const [{initializeApp},{getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut},{getFirestore,collection,addDoc,getDocs,query,where,limit,serverTimestamp,doc,getDoc,setDoc}]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js')
    ]);
    const app=initializeApp(cfg),auth=getAuth(app),store=getFirestore(app);
    let current=null,items=[];window.vocaUser=null;window.vocaReady=false;let generation=0;let pending=Promise.resolve();let timer=null;let lastError='';
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
          if(timer){clearTimeout(timer);timer=null;window.vocaCloudSave(window.wordmasterCommunityDb());}
          await flush();await signOut(auth);go('community');
        };
        try{
          const snap=await getDoc(personalRef(u));
          if(token!==generation)return;
          window.vocaDataLoad(snap.exists()?snap.data().data:empty());
          window.vocaReady=true;
          document.getElementById('cloudState').textContent='Kişisel listelerin ve çalışma geçmişin bulutta saklanır.';
          say('Hesap verileri yüklendi.');
        }catch(e){if(token!==generation)return;say('Hesap verileri yüklenemedi: '+(e.code||e.message)+'. Düzenleme kapalı.');}
      }else{
        account.innerHTML='<label class="field"><span>E-posta</span><input id="communityEmail" type="email" autocomplete="email"></label><label class="field"><span>Şifre</span><input id="communityPassword" type="password" autocomplete="current-password"></label><div class="row"><button class="btn small" id="communityLogin">Giriş yap</button><button class="btn alt small" id="communitySignup">Hesap oluştur</button></div>';
        const credentials=()=>[document.getElementById('communityEmail').value.trim(),document.getElementById('communityPassword').value];
        document.getElementById('communityLogin').onclick=async()=>{try{await signInWithEmailAndPassword(auth,...credentials())}catch(e){say('Giriş başarısız: '+e.code)}};
        document.getElementById('communitySignup').onclick=async()=>{try{await createUserWithEmailAndPassword(auth,...credentials())}catch(e){say('Kayıt başarısız: '+e.code)}};
      }
    });
    const publicCollection=collection(store,'publicLists');
    let guest=null;
    const guestBox=document.getElementById('communityGuestStudy');
    function drawGuest(){
      if(!guest)return;
      const {list,index,correct,shown}=guest;
      if(index>=list.words.length){
        guestBox.innerHTML='<h2>Çalışma tamamlandı</h2><p>'+correct+' / '+list.words.length+' doğru cevap</p><button class="btn alt" id="guestExit">Kapat</button>';
      }else{
        const w=list.words[index];
        guestBox.innerHTML='<h2>'+esc(list.title)+' · '+(index+1)+'/'+list.words.length+'</h2><p class="muted">Misafir çalışması kaydedilmez.</p><div class="card" id="guestCard"><div class="word">'+esc(w.en)+'</div>'+(shown?'<strong>'+esc(w.tr)+'</strong><p>'+esc(w.example||'')+'</p>':'<span class="muted">Cevabı görmek için dokun</span>')+'</div><div class="row" style="margin-top:10px">'+(shown?'<button class="btn alt grow" id="guestNo">Bilemedim</button><button class="btn good grow" id="guestYes">Bildim</button>':'<button class="btn grow" id="guestShow">Cevabı göster</button>')+'</div><button class="btn alt small" id="guestExit" style="margin-top:10px">Kapat</button>';
        if(!shown){const reveal=()=>{guest.shown=true;drawGuest()};guestBox.querySelector('#guestCard').onclick=reveal;guestBox.querySelector('#guestShow').onclick=reveal}
        else for(const [id,yes] of [['guestNo',false],['guestYes',true]])guestBox.querySelector('#'+id).onclick=()=>{guest.correct+=Number(yes);guest.index++;guest.shown=false;drawGuest()};
      }
      guestBox.querySelector('#guestExit').onclick=()=>{guest=null;guestBox.classList.add('hidden')};
    }
    function studyPublic(x){if(!x.words.length)return say('Bu liste boş.');guest={list:{...x,words:[...x.words].sort(()=>Math.random()-.5)},index:0,correct:0,shown:false};guestBox.classList.remove('hidden');drawGuest();guestBox.scrollIntoView({behavior:'smooth'})}
    const render=()=>{const q=document.getElementById('communitySearch').value.trim().toLocaleLowerCase('tr-TR');const filtered=items.filter(x=>(x.title+' '+x.category+' '+x.words.map(w=>w.en+' '+w.tr).join(' ')).toLocaleLowerCase('tr-TR').includes(q));results.innerHTML=filtered.length?filtered.map(x=>'<div class="item"><strong>'+esc(x.title)+'</strong><div class="muted">'+esc(x.category)+' · '+x.words.length+' kelime · '+esc(x.authorName||'Topluluk üyesi')+'</div><div class="row" style="margin-top:10px"><button class="btn alt small" data-preview="'+esc(x.id)+'">Önizle</button><button class="btn alt small" data-study="'+esc(x.id)+'">Çalış</button><button class="btn small" data-copy="'+esc(x.id)+'">Listelerime ekle</button></div></div>').join(''):'<div class="empty">Eşleşen paylaşım bulunamadı.</div>';results.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>{const x=items.find(v=>v.id===b.dataset.preview);if(x)alert(x.words.map(w=>w.en+' — '+w.tr+(w.example?'\n'+w.example:'')).join('\n\n').slice(0,12000))});results.querySelectorAll('[data-study]').forEach(b=>b.onclick=()=>{const x=items.find(v=>v.id===b.dataset.study);if(x)studyPublic(x)});results.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{const x=items.find(v=>v.id===b.dataset.copy);if(!x)return;if(!current||!window.vocaReady){say('Listeyi kendine eklemek için giriş yapıp verilerinin yüklenmesini beklemelisin.');account.scrollIntoView({behavior:'smooth'});return}const db=window.wordmasterCommunityDb();const c={id:crypto.randomUUID(),name:x.category||'Topluluk'};const l={id:crypto.randomUUID(),categoryId:c.id,name:x.title};db.categories.push(c);db.lists.push(l);let added=0;for(const w of x.words){let existing=db.words.find(v=>v.en.trim().toLocaleLowerCase('en')===w.en.trim().toLocaleLowerCase('en')&&v.tr===w.tr&&v.example===w.example);if(existing){if(!existing.listIds.includes(l.id))existing.listIds.push(l.id)}else{db.words.push({id:crypto.randomUUID(),en:w.en,tr:w.tr,example:w.example||'',listIds:[l.id],srs:{reps:0,interval:0,ease:2.5,due:new Date().toLocaleDateString('en-CA'),misses:0}});added++}}window.wordmasterCommunitySave();window.wordmasterCommunityRefreshOwn?.();say('Liste kopyalandı: '+x.title+' · '+added+' yeni kelime. Kopyan bağımsızdır.');})};
    async function load(){say('Listeler yükleniyor...');try{const snap=await getDocs(query(publicCollection,limit(100)));items=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>Array.isArray(x.words));render();say(items.length+' topluluk listesi bulundu.')}catch(e){say('Listeler yüklenemedi: '+e.code)}}
    document.getElementById('communitySearch').addEventListener('input',render);
    document.getElementById('communityRefresh').onclick=load;
    document.getElementById('communityPublish').onclick=async()=>{if(!current||!window.vocaReady)return say('Liste yayımlamak için giriş yapıp verilerinin yüklenmesini bekle.');const db=window.wordmasterCommunityDb(),id=document.getElementById('communityOwnList').value,l=db.lists.find(x=>x.id===id);if(!l)return say('Önce yayımlanacak listeyi seç.');const words=db.words.filter(w=>w.listIds.includes(id)).map(w=>({en:w.en,tr:w.tr,example:w.example||''}));if(!words.length)return say('Boş liste yayımlanamaz.');if(words.length>500)return say('Bir paylaşım en fazla 500 kelime içerebilir.');if(!confirm(l.name+' listesindeki '+words.length+' kelime herkese açık yayımlansın mı?'))return;try{await addDoc(publicCollection,{ownerUid:current.uid,authorName:current.email.split('@')[0],title:l.name,category:db.categories.find(c=>c.id===l.categoryId)?.name||'Genel',words,createdAt:serverTimestamp()});say('Liste yayımlandı.');await load()}catch(e){say('Yayımlanamadı: '+e.code)}};
    window.wordmasterCommunityRefreshOwn=()=>{const db=window.wordmasterCommunityDb();document.getElementById('communityOwnList').innerHTML=db.lists.map(l=>'<option value="'+esc(l.id)+'">'+esc(db.categories.find(c=>c.id===l.categoryId)?.name||'')+' / '+esc(l.name)+'</option>').join('')};
    window.wordmasterCommunityRefreshOwn();load();
  }catch(e){say('Topluluk hizmeti başlatılamadı: '+e.message)}
}