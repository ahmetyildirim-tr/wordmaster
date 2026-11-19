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
          if(timer){clearTimeout(timer);timer=null;const snapshot=JSON.parse(JSON.stringify(window.wordmasterCommunityDb()));await setDoc(personalRef(u),{data:snapshot,updatedAt:serverTimestamp()}).catch(e=>{lastError=e.code||e.message;});}
          await flush();if(lastError){say('Bulut kaydı tamamlanamadı: '+lastError+'. Oturum açık tutuldu.');return}await signOut(auth);go('community');
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
    function guestSpeak(){
      if(!guest||!('speechSynthesis' in window))return;
      const word=guest.list.words[guest.index];if(!word)return;
      speechSynthesis.cancel();
      const utterance=new SpeechSynthesisUtterance(word.en);
      utterance.lang=localStorage.getItem('wordmaster-accent')||'en-US';
      utterance.rate=.85;
      const voice=speechSynthesis.getVoices().find(v=>v.lang===utterance.lang);
      if(voice)utterance.voice=voice;
      speechSynthesis.speak(utterance);
    }
    function guestRate(known){
      if(!guest||!guest.shown)return;
      guest.correct+=Number(known);guest.index++;guest.shown=false;
      drawGuest();
    }
    function drawGuest(){
      if(!guest)return;
      const {list,index,correct,shown}=guest;
      if(index>=list.words.length){
        const percent=Math.round(correct/list.words.length*100);
        guestBox.innerHTML='<h2>🎉 Çalışma tamamlandı</h2><p>'+list.words.length+' kelime çalıştın. <strong>'+correct+' doğru</strong> · %'+percent+' başarı.</p><p class="muted">Misafir çalışma geçmişi kaydedilmedi.</p><div class="row"><button class="btn" id="guestAgain">Yeniden çalış</button><button class="btn alt" id="guestExit">Kapat</button></div>';
        guestBox.querySelector('#guestAgain').onclick=()=>studyPublic(list);
      }else{
        const w=list.words[index],enFirst=guest.direction==='mixed'?guest.enFirst:guest.direction==='en';
        const prompt=enFirst?w.en:w.tr,answer=enFirst?w.tr:w.en;
        guestBox.innerHTML='<div class="row between"><h2>'+esc(list.title)+'</h2><span class="muted">'+(index+1)+' / '+list.words.length+'</span></div><div class="progress" style="margin:12px 0"><div style="width:'+(100*index/list.words.length)+'%"></div></div><div class="row between"><span class="muted">'+(enFirst?'EN → TR':'TR → EN')+'</span><span class="muted">Misafir modu · kayıt tutulmaz</span></div><div class="card" id="guestCard" role="button" tabindex="0" style="margin-top:12px" aria-label="Kartı çevirmek için dokun"><span class="swipe-cue" id="guestCue"></span><span class="hint">'+(enFirst?'İngilizce kelime':'Türkçe anlam')+'</span><div class="word">'+esc(prompt)+'</div>'+(shown?'<div><strong style="font-size:23px">'+esc(answer)+'</strong><p class="muted">'+esc(w.example||'')+'</p><button class="btn alt small" id="guestSpeak">🔊 Dinle</button></div>':'<span class="tap-tip">Kartı çevirmek için dokun</span>')+'</div><p class="swipe-tip">'+(shown?'← Bilemedim　　Bildim →':'Cevabı görmek için karta dokun')+'</p><div class="row">'+(shown?'<button class="btn alt grow" id="guestNo">← Bilemedim</button><button class="btn good grow" id="guestYes">Bildim →</button>':'<button class="btn grow" id="guestShow">↻ Cevabı göster</button>')+'</div><button class="btn alt small" id="guestExit" style="margin-top:12px">Çalışmayı kapat</button>';
        const card=guestBox.querySelector('#guestCard');
        const reveal=()=>{if(!guest.shown){guest.shown=true;drawGuest()}else{guest.shown=false;drawGuest()}};
        card.onclick=reveal;
        card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();reveal()}};
        if(shown){
          guestBox.querySelector('#guestNo').onclick=()=>guestRate(false);
          guestBox.querySelector('#guestYes').onclick=()=>guestRate(true);
          guestBox.querySelector('#guestSpeak').onclick=e=>{e.stopPropagation();guestSpeak()};
        }else guestBox.querySelector('#guestShow').onclick=reveal;
        let touch=null;
        card.addEventListener('touchstart',e=>{if(e.touches.length===1)touch={x:e.touches[0].clientX,y:e.touches[0].clientY}},{passive:true});
        card.addEventListener('touchend',e=>{
          if(!touch)return;
          const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;
          if(Math.abs(dx)<65||Math.abs(dx)<Math.abs(dy)*1.3)return;
          e.preventDefault();
          card.onclick=null;
          if(!guest.shown){guest.shown=true;drawGuest();return}
          card.classList.add(dx>0?'swipe-right':'swipe-left');
          setTimeout(()=>guestRate(dx>0),170);
        },{passive:false});
      }
      guestBox.querySelector('#guestExit').onclick=()=>{guest=null;guestBox.classList.add('hidden')};
    }
    function studyPublic(x){
      if(!x.words.length)return say('Bu liste boş.');
      guest={list:{...x,words:[...x.words].sort(()=>Math.random()-.5)},index:0,correct:0,shown:false,direction:'en',enFirst:true};
      guestBox.classList.remove('hidden');drawGuest();guestBox.scrollIntoView({behavior:'smooth',block:'start'});
    }
    const render=()=>{const q=document.getElementById('communitySearch').value.trim().toLocaleLowerCase('tr-TR');const filtered=items.filter(x=>(x.title+' '+x.category+' '+x.words.map(w=>w.en+' '+w.tr).join(' ')).toLocaleLowerCase('tr-TR').includes(q));results.innerHTML=filtered.length?filtered.map(x=>'<div class="item"><strong>'+esc(x.title)+'</strong><div class="muted">'+esc(x.category)+' · '+x.words.length+' kelime · '+esc(x.authorName||'Topluluk üyesi')+'</div><div class="row" style="margin-top:10px"><button class="btn alt small" data-preview="'+esc(x.id)+'">Önizle</button><button class="btn alt small" data-study="'+esc(x.id)+'">Çalış</button><button class="btn small" data-copy="'+esc(x.id)+'">Listelerime ekle</button></div></div>').join(''):'<div class="empty">Eşleşen paylaşım bulunamadı.</div>';results.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>{const x=items.find(v=>v.id===b.dataset.preview);if(x)alert(x.words.map(w=>w.en+' — '+w.tr+(w.example?'\n'+w.example:'')).join('\n\n').slice(0,12000))});results.querySelectorAll('[data-study]').forEach(b=>b.onclick=()=>{const x=items.find(v=>v.id===b.dataset.study);if(x)window.vocaStartPublicStudy(x)});results.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{const x=items.find(v=>v.id===b.dataset.copy);if(!x)return;if(!current||!window.vocaReady){say('Listeyi kendine eklemek için giriş yapıp verilerinin yüklenmesini beklemelisin.');account.scrollIntoView({behavior:'smooth'});return}const db=window.wordmasterCommunityDb();const c={id:crypto.randomUUID(),name:x.category||'Topluluk'};const l={id:crypto.randomUUID(),categoryId:c.id,name:x.title};db.categories.push(c);db.lists.push(l);let added=0;for(const w of x.words){let existing=db.words.find(v=>v.en.trim().toLocaleLowerCase('en')===w.en.trim().toLocaleLowerCase('en')&&v.tr===w.tr&&v.example===w.example);if(existing){if(!existing.listIds.includes(l.id))existing.listIds.push(l.id)}else{db.words.push({id:crypto.randomUUID(),en:w.en,tr:w.tr,example:w.example||'',listIds:[l.id],srs:{reps:0,interval:0,ease:2.5,due:new Date().toLocaleDateString('en-CA'),misses:0}});added++}}window.wordmasterCommunitySave();window.wordmasterCommunityRefreshOwn?.();say('Liste kopyalandı: '+x.title+' · '+added+' yeni kelime. Kopyan bağımsızdır.');})};
    async function load(){say('Listeler yükleniyor...');try{const snap=await getDocs(query(publicCollection,limit(100)));items=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>Array.isArray(x.words));render();say(items.length+' topluluk listesi bulundu.')}catch(e){say('Listeler yüklenemedi: '+e.code)}}
    document.getElementById('communitySearch').addEventListener('input',render);
    document.getElementById('communityRefresh').onclick=load;
    document.getElementById('communityPublish').onclick=async()=>{if(!current||!window.vocaReady)return say('Liste yayımlamak için giriş yapıp verilerinin yüklenmesini bekle.');const db=window.wordmasterCommunityDb(),id=document.getElementById('communityOwnList').value,l=db.lists.find(x=>x.id===id);if(!l)return say('Önce yayımlanacak listeyi seç.');const words=db.words.filter(w=>w.listIds.includes(id)).map(w=>({en:w.en,tr:w.tr,example:w.example||''}));if(!words.length)return say('Boş liste yayımlanamaz.');if(words.length>500)return say('Bir paylaşım en fazla 500 kelime içerebilir.');if(!confirm(l.name+' listesindeki '+words.length+' kelime herkese açık yayımlansın mı?'))return;try{await addDoc(publicCollection,{ownerUid:current.uid,authorName:current.email.split('@')[0],title:l.name,category:db.categories.find(c=>c.id===l.categoryId)?.name||'Genel',words,createdAt:serverTimestamp()});say('Liste yayımlandı.');await load()}catch(e){say('Yayımlanamadı: '+e.code)}};
    window.wordmasterCommunityRefreshOwn=()=>{const db=window.wordmasterCommunityDb();document.getElementById('communityOwnList').innerHTML=db.lists.map(l=>'<option value="'+esc(l.id)+'">'+esc(db.categories.find(c=>c.id===l.categoryId)?.name||'')+' / '+esc(l.name)+'</option>').join('')};
    window.wordmasterCommunityRefreshOwn();load();
  }catch(e){say('Topluluk hizmeti başlatılamadı: '+e.message)}
}