(() => {
  const PHOTO_BUCKET = 'meal-photos';
  const client = getSupabase();
  if (!client) return;

  let activeSession = null;
  let cloudBusy = false;
  const originalSave = save;

  function isPermanentSession(session) {
    return Boolean(session?.user?.email && !session.user.is_anonymous);
  }

  function readLocalRecords() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function localRecord(record) {
    return {
      id: String(record.id || crypto.randomUUID()),
      meal: ['早餐', '午餐', '晚餐', '加餐'].includes(record.meal) ? record.meal : '加餐',
      text: String(record.text || ''),
      kcal: Math.min(10000, Math.max(0, Math.round(+record.kcal || 0))),
      cost: Math.min(100000, Math.max(0, +record.cost || 0)),
      time: new Date(record.time || Date.now()).toISOString(),
      photo: typeof record.photo === 'string' ? record.photo : '',
    };
  }

  function saveLocalMirror() {
    try {
      const localOnly = records
        .filter(record => !record._cloudOnly)
        .map(record => {
          const clean = localRecord(record);
          if (clean.photo && !clean.photo.startsWith('data:image/')) clean.photo = '';
          return clean;
        });
      localStorage.setItem(KEY, JSON.stringify(localOnly));
    } catch (error) {
      console.error(error);
      toast('本机空间不足，请先导出数据备份');
    }
  }

  save = saveLocalMirror;

  function setProgress(message, isError = false) {
    const element = $('#syncProgress');
    if (!element) return;
    element.textContent = message;
    element.style.color = isError ? '#a64f3c' : '';
  }

  function setCloudBusy(busy) {
    cloudBusy = busy;
    ['#sendLoginLink', '#syncLocalData', '#refreshCloud', '#signOut'].forEach(selector => {
      const button = $(selector);
      if (button) button.disabled = busy;
    });
  }

  function updateAuthUi(session) {
    activeSession = session;
    const permanent = isPermanentSession(session);
    $('#emailLogin').hidden = permanent;
    $('#syncLocalData').hidden = !permanent;
    $('#refreshCloud').hidden = !permanent;
    $('#signOut').hidden = !permanent;
    $('#cloudTitle').textContent = permanent
      ? `已登录：${session.user.email}`
      : '登录后可在不同设备查看记录';
    $('#cloudMessage').textContent = permanent
      ? '本机数据不会被删除。点击同步可把旧记录和照片复制到你的云端账户。'
      : '使用同一个邮箱登录，即可把本机已有记录安全复制到 Supabase。迁移成功后，本机副本仍会保留。';
    $('#storageStatus').textContent = permanent ? '☁ 已登录 · 本机与云端同步' : '◉ 本机保存 · 登录后可云同步';
  }

  function safePhotoName(clientId) {
    return String(clientId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180) || crypto.randomUUID();
  }

  async function uploadLocalPhoto(record, userId) {
    if (!record.photo?.startsWith('data:image/')) return record.photoPath || null;
    const blob = await fetch(record.photo).then(response => response.blob());
    const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${userId}/${safePhotoName(record.id)}.${extension}`;
    const { error } = await client.storage.from(PHOTO_BUCKET).upload(path, blob, {
      upsert: true,
      contentType: blob.type || 'image/jpeg',
      cacheControl: '3600',
    });
    if (error) throw error;
    return path;
  }

  function mealPayload(record, userId, photoPath) {
    const clean = localRecord(record);
    return {
      user_id: userId,
      client_id: clean.id,
      meal_type: clean.meal,
      description: clean.text,
      estimated_kcal: clean.kcal,
      cost: clean.cost,
      eaten_at: clean.time,
      photo_path: photoPath || null,
      updated_at: new Date().toISOString(),
    };
  }

  async function upsertCloudRecord(record, session, existingPhotoPath = null) {
    const photoPath = existingPhotoPath || await uploadLocalPhoto(record, session.user.id);
    const payload = mealPayload(record, session.user.id, photoPath);
    const { error } = await client
      .from('meals')
      .upsert(payload, { onConflict: 'user_id,client_id' });
    if (error) throw error;
    record.photoPath = photoPath;
    record._synced = true;
    return photoPath;
  }

  async function signedPhotoUrl(path) {
    if (!path) return '';
    const { data, error } = await client.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
    if (error) {
      console.error(error);
      return '';
    }
    return data?.signedUrl || '';
  }

  async function fetchCloudRecords(session) {
    const { data, error } = await client
      .from('meals')
      .select('client_id,meal_type,description,estimated_kcal,cost,eaten_at,photo_path')
      .eq('user_id', session.user.id)
      .order('eaten_at', { ascending: false });
    if (error) throw error;
    return Promise.all((data || []).map(async row => ({
      id: row.client_id,
      meal: row.meal_type,
      text: row.description,
      kcal: row.estimated_kcal,
      cost: +row.cost || 0,
      time: row.eaten_at,
      photo: await signedPhotoUrl(row.photo_path),
      photoPath: row.photo_path,
      _cloudOnly: true,
      _synced: true,
    })));
  }

  function mergeLocalAndCloud(localRows, cloudRows) {
    const merged = new Map(localRows.map(item => [String(item.id), { ...localRecord(item), _cloudOnly: false }]));
    cloudRows.forEach(cloud => {
      const local = merged.get(String(cloud.id));
      merged.set(String(cloud.id), local
        ? {
            ...cloud,
            ...local,
            photo: local.photo || cloud.photo,
            photoPath: cloud.photoPath,
            _cloudOnly: false,
            _synced: true,
          }
        : cloud);
    });
    return [...merged.values()];
  }

  async function refreshCloudRecords(showMessage = true) {
    if (!isPermanentSession(activeSession)) return;
    try {
      setCloudBusy(true);
      const cloudRows = await fetchCloudRecords(activeSession);
      records = mergeLocalAndCloud(readLocalRecords(), cloudRows);
      render();
      if (showMessage) setProgress(`已读取 ${cloudRows.length} 条云端记录`);
    } catch (error) {
      console.error(error);
      setProgress('读取云端失败，请稍后重试', true);
    } finally {
      setCloudBusy(false);
    }
  }

  async function syncAllLocalRecords() {
    if (cloudBusy || !isPermanentSession(activeSession)) return;
    const localRows = readLocalRecords().map(localRecord);
    if (!localRows.length) {
      setProgress('本机暂时没有需要同步的记录');
      return;
    }
    try {
      setCloudBusy(true);
      setProgress(`准备同步 ${localRows.length} 条本机记录…`);
      const { data: existing, error: existingError } = await client
        .from('meals')
        .select('client_id,photo_path')
        .eq('user_id', activeSession.user.id);
      if (existingError) throw existingError;
      const existingPhotos = new Map((existing || []).map(row => [String(row.client_id), row.photo_path]));
      let completed = 0;
      const failures = [];
      for (const record of localRows) {
        try {
          await upsertCloudRecord(record, activeSession, existingPhotos.get(String(record.id)) || null);
          completed += 1;
          setProgress(`正在同步：${completed}/${localRows.length}`);
        } catch (error) {
          console.error('Sync failed for record', record.id, error);
          failures.push(record.id);
        }
      }
      await refreshCloudRecords(false);
      if (failures.length) {
        setProgress(`已同步 ${completed} 条，${failures.length} 条失败；本机数据仍完整保留`, true);
      } else {
        setProgress(`同步完成：${completed} 条记录已保存到云端，本机副本仍保留`);
        toast('本机记录已安全复制到云端 ✓');
      }
    } catch (error) {
      console.error(error);
      setProgress('同步失败，本机数据没有被删除，请稍后重试', true);
    } finally {
      setCloudBusy(false);
    }
  }

  async function sendLoginLink() {
    const email = $('#emailInput').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setProgress('请输入正确的邮箱地址', true);
      return;
    }
    try {
      setCloudBusy(true);
      if (activeSession?.user?.is_anonymous) await client.auth.signOut();
      const redirectTo = `${location.origin}${location.pathname}`;
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
      });
      if (error) throw error;
      setProgress('登录邮件已发送。请在同一台设备打开邮件中的链接，然后返回网站。');
    } catch (error) {
      console.error(error);
      setProgress('登录邮件发送失败，请检查邮箱或稍后重试', true);
    } finally {
      setCloudBusy(false);
    }
  }

  async function deleteRecordFromCloud(record) {
    if (!isPermanentSession(activeSession)) return;
    const { error } = await client
      .from('meals')
      .delete()
      .eq('user_id', activeSession.user.id)
      .eq('client_id', String(record.id));
    if (error) throw error;
    if (record.photoPath) {
      const { error: photoError } = await client.storage.from(PHOTO_BUCKET).remove([record.photoPath]);
      if (photoError) console.error(photoError);
    }
  }

  $('#sendLoginLink').onclick = sendLoginLink;
  $('#syncLocalData').onclick = syncAllLocalRecords;
  $('#refreshCloud').onclick = () => refreshCloudRecords(true);
  $('#signOut').onclick = async () => {
    if (cloudBusy) return;
    await client.auth.signOut();
    records = readLocalRecords().map(item => ({ ...localRecord(item), _cloudOnly: false }));
    render();
    setProgress('已退出。当前仍显示保存在本机的记录。');
  };

  $('#saveMeal').onclick = async () => {
    const text = $('#mealText').value.trim();
    const time = $('#mealTime').value;
    if (!text && !photoData) return toast('请写下食物或上传一张照片');
    if (!time) return toast('请选择日期与时间');
    if ($('#kcalInput').value === '') return toast('请先使用文字 AI 估算或手动填写热量');
    const record = {
      id: crypto.randomUUID(),
      meal,
      text,
      kcal: Math.max(0, +$('#kcalInput').value || 0),
      cost: Math.max(0, +$('#costInput').value || 0),
      time: new Date(time).toISOString(),
      photo: photoData,
      _cloudOnly: false,
    };
    records.push(record);
    save();
    $('#mealText').value = '';
    $('#kcalInput').value = '';
    $('#costInput').value = '';
    clearAiResult();
    photoData = '';
    $('#photoInput').value = '';
    $('#photoPreview').style.display = 'none';
    setNow();
    updateEstimate();
    render();
    if (isPermanentSession(activeSession)) {
      try {
        await upsertCloudRecord(record, activeSession);
        setProgress('新记录已保存到本机和云端');
        toast('这一餐已保存到本机和云端 ✓');
      } catch (error) {
        console.error(error);
        setProgress('云端暂时保存失败；本机记录已保留，可稍后点击同步', true);
        toast('已保存在本机，稍后可重试云同步');
      }
    } else {
      toast('这一餐已保存在本机 ✓');
    }
  };

  document.addEventListener('click', async event => {
    const button = event.target.closest?.('[data-delete]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = button.dataset.delete;
    const record = records.find(item => String(item.id) === String(id));
    if (!record || !confirm('删除这条饮食记录？登录状态下也会从云端删除。')) return;
    records = records.filter(item => String(item.id) !== String(id));
    save();
    render();
    try {
      await deleteRecordFromCloud(record);
      toast('记录已删除');
    } catch (error) {
      console.error(error);
      setProgress('本机已删除，但云端删除失败；请刷新后重试', true);
      toast('云端删除失败，请稍后重试');
    }
  }, true);

  client.auth.onAuthStateChange((_event, session) => {
    setTimeout(async () => {
      updateAuthUi(session);
      if (isPermanentSession(session)) await refreshCloudRecords(false);
    }, 0);
  });

  client.auth.getSession().then(({ data }) => {
    updateAuthUi(data.session);
    if (isPermanentSession(data.session)) refreshCloudRecords(false);
  });
})();
