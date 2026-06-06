'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type TradeItemSummary = {
  id?: string;
  user_id?: string;
  image_url?: string | null;
  pinned_until?: string | null;
  is_pinned?: boolean;
  status?: string;
  title?: string;
  give_details?: string;
  want_details?: string;
  users?: { display_name?: string | null } | null;
};

type MatchRoute = {
  itemA: TradeItemSummary;
  itemB: TradeItemSummary;
  itemC?: TradeItemSummary;
};

const PIN_OPTIONS = [
  { value: 0, label: '固定なし（1枚）', hours: 0, cost: 1 },
  { value: 24, label: '24時間置トップ（5枚）', hours: 24, cost: 5 },
  { value: 48, label: '48時間置トップ（8枚）', hours: 48, cost: 8 },
  { value: 72, label: '72時間置トップ（10枚）', hours: 72, cost: 10 },
];

const PIN_EXTENSION_OPTIONS = [
  { hours: 24, label: '24時間（5枚）', cost: 5 },
  { hours: 48, label: '48時間（8枚）', cost: 8 },
  { hours: 72, label: '72時間（10枚）', cost: 10 },
];

const getSupabaseStoragePath = (imageUrl: string | null | undefined) => {
  if (!imageUrl) return null;
  const marker = '/item-images/';
  const markerIndex = imageUrl.indexOf(marker);
  if (markerIndex === -1) return null;
  return decodeURIComponent(imageUrl.slice(markerIndex + marker.length).split('?')[0]);
};

const getDisplayName = (item: TradeItemSummary, fallback: string) => item.users?.display_name || fallback;

const getRouteLines = (route: MatchRoute | undefined) => {
  if (!route?.itemA || !route?.itemB) return [];
  const nameA = getDisplayName(route.itemA, 'ユーザー1');
  const nameB = getDisplayName(route.itemB, 'ユーザー2');

  if (!route.itemC) {
    return [
      `${nameA}さんの「${route.itemA.give_details}」→ ${nameB}さんへ`,
      `${nameB}さんの「${route.itemB.give_details}」→ ${nameA}さんへ`,
    ];
  }

  const nameC = getDisplayName(route.itemC, 'ユーザー3');
  return [
    `${nameA}さんの「${route.itemA.give_details}」→ ${nameB}さんへ`,
    `${nameB}さんの「${route.itemB.give_details}」→ ${nameC}さんへ`,
    `${nameC}さんの「${route.itemC.give_details}」→ ${nameA}さんへ`,
  ];
};

const getPinActionLabel = (item: TradeItemSummary) => (item.is_pinned || item.pinned_until ? '置トップ延長' : '置トップ');

export default function Home() {
  // ----------------------------------------------------
  // 1. ユーザー・ウォレット・プランステート
  // ----------------------------------------------------
  const [profile, setProfile] = useState<any>(null);
  const [userCoins, setUserCoins] = useState<number>(0);
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [dailyAds, setDailyAds] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [showWallet, setShowWallet] = useState<boolean>(false); 
  const [checkoutLoadingProduct, setCheckoutLoadingProduct] = useState<string | null>(null);

  // ----------------------------------------------------
  // 2. トレード登録フォームステート
  // ----------------------------------------------------
  const [title, setTitle] = useState('');
  const [giveDetails, setGiveDetails] = useState('');
  const [wantDetails, setWantDetails] = useState('');
  const [pinDuration, setPinDuration] = useState<number>(0); 
  const [submitting, setSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null); 

  // ----------------------------------------------------
  // 3. 検索・表示データ
  // ----------------------------------------------------
  const [searchTerm, setSearchTerm] = useState('');
  const [items, setItems] = useState<any[]>([]);

  // ----------------------------------------------------
  // 4. ユーザーフィードバック機能ステート
  // ----------------------------------------------------
  const [feedbackCategory, setFeedbackCategory] = useState('不具合報告');
  const [feedbackContent, setFeedbackContent] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);

  // ----------------------------------------------------
  // 5. リアルタイム匿名チャットルーム
  // ----------------------------------------------------
  const [activeChatRoom, setActiveChatRoom] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [chatImageSubmitting, setChatImageSubmitting] = useState(false);
  const [showReservationForm, setShowReservationForm] = useState(false);
  const [reservationScheduledAt, setReservationScheduledAt] = useState('');
  const [reservationLocation, setReservationLocation] = useState('');
  const [reservationMemo, setReservationMemo] = useState('');
  const [reservationSubmitting, setReservationSubmitting] = useState(false);

  // ----------------------------------------------------
  // 6. マッチング看板＆リアルタイムキャッシュ
  // ----------------------------------------------------
  const [twoWayMatches, setTwoWayMatches] = useState<any[]>([]);
  const [threeWayMatches, setThreeWayMatches] = useState<any[]>([]);
  const [roomExtraMap, setRoomExtraMap] = useState<Record<string, { lastTime: string; id: string }>>({});
  const [pinActionItem, setPinActionItem] = useState<(TradeItemSummary & { id: string }) | null>(null);

  // 相対時間計算ヘルパー
  const formatJapaneseTime = (dateString: string | null | undefined) => {
    if (!dateString) return 'なし';
    const past = new Date(dateString);
    const elapsed = Date.now() - past.getTime();
    if (elapsed < 60000) return 'たった今';
    if (elapsed < 3600000) return Math.round(elapsed / 60000) + '分前';   
    if (elapsed < 86400000) return Math.round(elapsed / 3600000) + '時間前';   
    return (past.getMonth() + 1) + '月' + past.getDate() + '日';
  };

  // LINE通知用ヘルパー関数
  const sendLineNotification = async (toUserId: string, text: string) => {
    try {
      await fetch('/api/line-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: toUserId, messageText: text }),
      });
    } catch (e) {
      console.error('LINE通知の送信に失敗しました:', e);
    }
  };

  const notifyMatchOnce = async (fingerprint: string, userIds: string[], matchType: 'two-way' | 'three-way') => {
    try {
      await fetch('/api/match-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint, userIds, matchType }),
      });
    } catch (error) {
      console.error('マッチ通知の送信に失敗しました:', error);
    }
  };

  // ----------------------------------------------------
  // 🎯 マッチング計算 ＆ LINE自動通知エンジン
  // ----------------------------------------------------
  const calculateAllMatches = async (activeItems: any[], shouldNotifyNewMatch = false, currentUserId = '') => {
    const list = activeItems.filter(i => i.status === 'matching');
    const computedTwoWay: any[] = [];
    const computedThreeWay: any[] = [];

    // ① 双方向（2方）マッチング計算
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const itemA = list[i];
        const itemB = list[j];
        
        const giveA = itemA.give_details.trim().toLowerCase();
        const wantA = itemA.want_details.trim().toLowerCase();
        const giveB = itemB.give_details.trim().toLowerCase();
        const wantB = itemB.want_details.trim().toLowerCase();

        if (giveA === wantB && wantA === giveB) {
          const fingerprint = `twoway_${[itemA.id, itemB.id].sort().join('_')}_${giveA}_${wantA}`;
          if (!computedTwoWay.some(m => m.fingerprint === fingerprint)) {
            const matchObj = {
              fingerprint,
              routeText: `${getDisplayName(itemA, 'ユーザー1')}さんの「${itemA.give_details}」→ ⇆ → ${getDisplayName(itemB, 'ユーザー2')}さんの「${itemB.give_details}」`,
              itemA,
              itemB,
              participants: Array.from(new Set([itemA.user_id, itemB.user_id]))
            };
            computedTwoWay.push(matchObj);

            if (shouldNotifyNewMatch) {
              notifyMatchOnce(fingerprint, [itemA.user_id, itemB.user_id], 'two-way');
            }
          }
        }
      }
    }

    // ② 三方向（3方）巡回マッチング計算（同圈不同序去重版）
    for (let i = 0; i < list.length; i++) {
      for (let j = 0; j < list.length; j++) {
        for (let k = 0; k < list.length; k++) {
          if (i === j || j === k || i === k) continue;

          const itemA = list[i]; 
          const itemB = list[j];
          const itemC = list[k];

          // 核心逻辑：只显示当前登录用户自身作为起点(A)的循环圈
          if (itemA.user_id !== currentUserId) continue;

          const giveA = itemA.give_details.trim().toLowerCase();
          const wantA = itemA.want_details.trim().toLowerCase();
          const giveB = itemB.give_details.trim().toLowerCase();
          const wantB = itemB.want_details.trim().toLowerCase();
          const giveC = itemC.give_details.trim().toLowerCase();
          const wantC = itemC.want_details.trim().toLowerCase();

          if (wantA === giveB && wantB === giveC && wantC === giveA) {
            // 对ID进行绝对排序去重，防止同圈不同序产生多条结果
            const uniqueCircleId = [itemA.id, itemB.id, itemC.id].sort().join('-');
            const fingerprint = `threeway_${uniqueCircleId}`;
            
            if (!computedThreeWay.some(m => m.fingerprint === fingerprint)) {
              computedThreeWay.push({
                fingerprint,
                routeText: `🔁 3方巡回マッチ成立: [${itemA.give_details}] ➔ [${itemB.give_details}] ➔ [${itemC.give_details}] ➔ 循環`,
                itemA,
                itemB,
                itemC,
                participants: Array.from(new Set([itemA.user_id, itemB.user_id, itemC.user_id]))
              });

              if (shouldNotifyNewMatch) {
                notifyMatchOnce(fingerprint, [itemA.user_id, itemB.user_id, itemC.user_id], 'three-way');
              }
            }
          }
        }
      }
    }

    setTwoWayMatches(computedTwoWay);
    setThreeWayMatches(computedThreeWay);

    // ③ 各チャットルームの最終メッセージ時間の同期
    const allFps = [...computedTwoWay, ...computedThreeWay].map(m => m.fingerprint);
    if (allFps.length > 0) {
      const { data: rooms } = await supabase
        .from('anonymous_chats')
        .select('id, room_fingerprint, last_message_at')
        .in('room_fingerprint', allFps);
      
      if (rooms) {
        const extraMap: Record<string, { lastTime: string; id: string }> = {};
        rooms.forEach(r => {
          if (r.room_fingerprint) {
            extraMap[r.room_fingerprint] = { lastTime: r.last_message_at, id: r.id };
          }
        });
        setRoomExtraMap(extraMap);
      }
    }
  };

  // 全データ読み込み＆同期
  const fetchItems = async (userIdCheck?: string, triggerNotification = false) => {
    supabase.rpc('delete_expired_trade_data').then(() => {});
    const targetUserId = userIdCheck || profile?.userId;

    if (targetUserId) {
      const { data: u } = await supabase.from('users').select('*').eq('line_id', targetUserId).single();
      if (u) {
        setUserCoins(u.coins ?? 3);
        setIsPremium(u.is_premium ?? false); 
        setDailyAds(u.daily_ads_count ?? 0);
      }
    }

    const { data } = await supabase
      .from('items')
      .select('*, users(display_name, avatar_url)')
      .order('created_at', { ascending: false });

    if (data) {
      const processed = data.map(item => {
        let isPinnedActive = item.is_pinned;
        if (item.pinned_until && new Date(item.pinned_until).getTime() < Date.now()) isPinnedActive = false;
        return { ...item, is_pinned: isPinnedActive };
      });

      const sorted = processed.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'matching' ? -1 : 1;
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setItems(sorted);
      await calculateAllMatches(sorted, triggerNotification, targetUserId);
    }
  };

  useEffect(() => {
    import('@line/liff').then((mod) => {
      const liff = mod.default;
      liff.init({ liffId: process.env.NEXT_PUBLIC_LINE_LIFF_ID || '' })
        .then(async () => {
          if (!liff.isLoggedIn()) { liff.login(); return; }
          const userProfile = await liff.getProfile();
          setProfile(userProfile);
          
          await supabase.from('users').upsert({ 
            line_id: userProfile.userId, 
            display_name: userProfile.displayName, 
            avatar_url: userProfile.pictureUrl 
          });
          
          await fetchItems(userProfile.userId, false);
          setLoading(false);
        }).catch(() => setLoading(false));
    });
  }, []);

  // リアルタイムチャット受信チャネル
  useEffect(() => {
    if (!activeChatRoom) return;
    const channel = supabase
      .channel(`room_${activeChatRoom.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'anonymous_chats', filter: `id=eq.${activeChatRoom.id}` }, (payload: any) => {
        if (payload.new && payload.new.messages) {
          setChatMessages(payload.new.messages);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeChatRoom]);

  // ----------------------------------------------------
  // チャットアクション
  // ----------------------------------------------------
  const handleOpenChat = async (targetItem: any, fingerprint: string, participants: string[], currentRoute?: MatchRoute) => {
    let { data: room } = await supabase
      .from('anonymous_chats')
      .select('*')
      .eq('room_fingerprint', fingerprint)
      .maybeSingle();

    if (!room) {
      const { data: newRoom } = await supabase
        .from('anonymous_chats')
        .insert({ 
          item_id: targetItem.id, 
          match_type: fingerprint.startsWith('twoway') ? 'two-way' : 'three-way', 
          user_ids: participants, 
          messages: [], 
          room_fingerprint: fingerprint,
          last_message_at: new Date().toISOString()
        })
        .select().single();
      room = newRoom;
    }

    if (room) {
      const { data: reservation } = await supabase
        .from('exchange_reservations')
        .select('*')
        .eq('chat_room_id', room.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setActiveChatRoom({ ...room, currentTargetItem: targetItem, currentRoute, reservation });
      setChatMessages(room.messages || []);
      setShowReservationForm(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessageText.trim()) return;
    const newMsg = {
      sender_id: profile.userId,
      sender_name: profile.displayName,
      avatar_url: profile.pictureUrl,
      text: newMessageText,
      image_url: '',
      time: new Date().toISOString()
    };
    const updatedMessages = [...chatMessages, newMsg];
    const nowStr = new Date().toISOString();

    await supabase.from('anonymous_chats')
      .update({ messages: updatedMessages, last_message_at: nowStr })
      .eq('id', activeChatRoom.id);

    setRoomExtraMap(prev => ({
      ...prev,
      [activeChatRoom.room_fingerprint]: { lastTime: nowStr, id: activeChatRoom.id }
    }));

    const partnerId = activeChatRoom.user_ids?.find((id: string) => id !== profile.userId);
    if (partnerId) {
      sendLineNotification(partnerId, `【トレマチ】💬 新着メッセージ通知\n匿名チャットルームで「${profile.displayName}」さんから新着メッセージが届きました。`);
    }

    setNewMessageText('');
  };

  const handleSendChatImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChatRoom) return;

    setChatImageSubmitting(true);
    try {
      const fileName = `chat-${activeChatRoom.id}-${Date.now()}.png`;
      await supabase.storage.from('item-images').upload(fileName, file);
      const { data: { publicUrl } } = supabase.storage.from('item-images').getPublicUrl(fileName);

      const newMsg = {
        sender_id: profile.userId,
        sender_name: profile.displayName,
        avatar_url: profile.pictureUrl,
        text: '📷 [画像メッセージ]',
        image_url: publicUrl,
        time: new Date().toISOString()
      };
      
      const updatedMessages = [...chatMessages, newMsg];
      const nowStr = new Date().toISOString();

      await supabase.from('anonymous_chats')
        .update({ messages: updatedMessages, last_message_at: nowStr })
        .eq('id', activeChatRoom.id);

      setRoomExtraMap(prev => ({
        ...prev,
        [activeChatRoom.room_fingerprint]: { lastTime: nowStr, id: activeChatRoom.id }
      }));

      const partnerId = activeChatRoom.user_ids?.find((id: string) => id !== profile.userId);
      if (partnerId) {
        sendLineNotification(partnerId, `【トレマチ】📷 画像メッセージ通知\n匿名チャットルームに新しい画像が届きました。`);
      }
    } catch {
      alert('画像のアップロードに失敗しました。');
    } finally {
      setChatImageSubmitting(false);
    }
  };


  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChatRoom?.id) return;
    if (!reservationScheduledAt || !reservationLocation.trim()) {
      alert('予定日時と場所 / 方法を入力してください。');
      return;
    }

    setReservationSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('exchange_reservations')
        .insert({
          chat_room_id: activeChatRoom.id,
          item_id: activeChatRoom.item_id || activeChatRoom.currentTargetItem?.id || null,
          created_by: profile.userId,
          participant_ids: activeChatRoom.user_ids || [],
          scheduled_at: new Date(reservationScheduledAt).toISOString(),
          location: reservationLocation.trim(),
          memo: reservationMemo.trim(),
        })
        .select()
        .single();

      if (error) {
        alert('交換予約の作成に失敗しました。入力内容を確認して再度お試しください。');
        return;
      }

      setActiveChatRoom({ ...activeChatRoom, reservation: data });
      setShowReservationForm(false);
      setReservationScheduledAt('');
      setReservationLocation('');
      setReservationMemo('');
      alert('交換予約を作成しました。');
    } catch {
      alert('交換予約の作成中にエラーが発生しました。時間をおいて再度お試しください。');
    } finally {
      setReservationSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // 各種ボタンアクション（日本語化）
  // ----------------------------------------------------
  const handleMarkCompleted = async (itemId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'completed' ? 'matching' : 'completed';
    await supabase.from('items').update({ status: nextStatus }).eq('id', itemId);
    fetchItems(profile.userId, false);
  };

  const handleDeleteItem = async (item: TradeItemSummary & { id: string }) => {
    if (!window.confirm('このトレード情報を削除してもよろしいですか？')) return;

    const storagePath = getSupabaseStoragePath(item.image_url);
    if (storagePath) {
      const { error: imageDeleteError } = await supabase.storage.from('item-images').remove([storagePath]);
      if (imageDeleteError) {
        alert('画像ファイルの削除に失敗しました。交換情報の削除は続行します。');
      }
    }

    const { error } = await supabase.from('items').delete().eq('id', item.id);
    if (error) {
      alert('トレード情報の削除に失敗しました。時間をおいて再度お試しください。');
      return;
    }

    alert('トレード情報を削除しました。');
    fetchItems(profile.userId, false);
  };

  const handleExtendPin = async (item: TradeItemSummary & { id: string }, hours: number, cost: number) => {
    if (!profile?.userId || item.user_id !== profile.userId) return;
    const actionLabel = getPinActionLabel(item);
    if (userCoins < cost) {
      alert(`コインが不足しています。${hours}時間延長には${cost}枚必要です。`);
      return;
    }

    if (!window.confirm(`${actionLabel}を${hours}時間で設定します。コイン${cost}枚を使用しますか？`)) return;

    const currentPinnedUntil = item.pinned_until ? new Date(item.pinned_until).getTime() : 0;
    const nowTime = new Date().getTime();
    const baseTime = currentPinnedUntil > nowTime ? currentPinnedUntil : nowTime;
    const nextPinnedUntil = new Date(baseTime + hours * 60 * 60 * 1000).toISOString();
    const nextCoins = userCoins - cost;

    const { error: userError } = await supabase.from('users').update({ coins: nextCoins }).eq('line_id', profile.userId);
    if (userError) {
      alert('コインの更新に失敗しました。時間をおいて再度お試しください。');
      return;
    }

    const { error: itemError } = await supabase
      .from('items')
      .update({ is_pinned: true, pinned_until: nextPinnedUntil })
      .eq('id', item.id);

    if (itemError) {
      await supabase.from('users').update({ coins: userCoins }).eq('line_id', profile.userId);
      alert(`${actionLabel}に失敗しました。コイン消費を取り消しました。`);
      return;
    }

    setUserCoins(nextCoins);
    setPinActionItem(null);
    alert(`${actionLabel}を${hours}時間で設定しました。`);
    fetchItems(profile.userId, false);
  };

  const handleWatchAd = () => {
    if (dailyAds >= 3) return;
    alert('動画広告を再生します（デモ：5秒間お待ちください）');
    setTimeout(async () => {
      const nextAds = dailyAds + 1; const nextCoins = userCoins + 1;
      await supabase.from('users').update({ coins: nextCoins, daily_ads_count: nextAds }).eq('line_id', profile.userId);
      setDailyAds(nextAds); setUserCoins(nextCoins);
      alert('広告の視聴が完了しました！コインを1枚獲得しました。');
    }, 5000);
  };

  type CheckoutProduct = 'premium' | 'coin10' | 'coin35' | 'coin60';

  const startStripeCheckout = async (product: CheckoutProduct, confirmMessage: string) => {
    if (!profile?.userId) {
      alert('LINEログイン情報を取得できませんでした。再読み込みしてください。');
      return;
    }

    if (!window.confirm(confirmMessage)) return;

    setCheckoutLoadingProduct(product);
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, userId: profile.userId }),
      });
      const data = await response.json();

      if (!response.ok || !data.url) {
        throw new Error(data.error || 'Stripe Checkoutの開始に失敗しました。');
      }

      window.location.href = data.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Stripe Checkoutの開始に失敗しました。';
      alert(message);
      setCheckoutLoadingProduct(null);
    }
  };

  const handleChargeCoins = async (product: Exclude<CheckoutProduct, 'premium'>, coinsGranted: number) => {
    await startStripeCheckout(product, `【決済確認】コイン${coinsGranted}枚をStripe決済で購入しますか？`);
  };

  const handleBuyPremium = async () => {
    const details = `トレマチ プレミアム（月額680円）\n\n推し活グッズ交換をもっと便利に。\n\n✅ AI 3方巡回マッチング無制限\n✅ 3人専用チャットルーム利用\n✅ 交換予約\n✅ 条件自動追跡通知\n✅ LINE通知\n\nさらに初回登録時にコイン50枚プレゼント。\n\nいつでも解約可能。\n\nStripe決済で登録しますか？`;
    await startStripeCheckout('premium', details);
  };

  const handleSubmitPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !giveDetails.trim() || !wantDetails.trim()) {
      alert('すべての項目を入力してください。');
      return;
    }
    const selectedPinOption = PIN_OPTIONS.find((option) => option.value === pinDuration) || PIN_OPTIONS[0];
    const requiredCoins = selectedPinOption.cost;
    
    if (userCoins < requiredCoins) {
      alert('コインが不足しています。');
      return;
    }

    setSubmitting(true);
    let uploadedImageUrl = '';
    if (imageFile) {
      try {
        const fileName = `${profile.userId}-${Date.now()}.png`;
        await supabase.storage.from('item-images').upload(fileName, imageFile);
        const { data: { publicUrl } } = supabase.storage.from('item-images').getPublicUrl(fileName);
        uploadedImageUrl = publicUrl;
      } catch {
        alert('画像のアップロードに失敗しました。');
      }
    }

    await supabase.from('users').update({ coins: userCoins - requiredCoins }).eq('line_id', profile.userId);
    const pinnedUntilDate = selectedPinOption.hours > 0 ? new Date(Date.now() + selectedPinOption.hours * 60 * 60 * 1000).toISOString() : null;

    await supabase.from('items').insert({
      user_id: profile.userId, title, give_details: giveDetails, want_details: wantDetails,
      image_url: uploadedImageUrl, status: 'matching', is_pinned: pinDuration > 0, pinned_until: pinnedUntilDate
    });

    setSubmitting(false); setTitle(''); setGiveDetails(''); setWantDetails(''); setImageFile(null); setImagePreview(''); setPinDuration(0);
    fetchItems(profile.userId, true);
    alert('トレード情報を登録しました！自動マッチングと通知配信を実行しました。');
  };

  const handleSendFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackContent.trim()) {
      alert('フィードバック内容を入力してください。');
      return;
    }
    setFeedbackSubmitting(true);
    try {
      const { error } = await supabase.from('feedbacks').insert({
        user_id: profile?.userId || 'anonymous',
        category: feedbackCategory,
        content: feedbackContent,
        created_at: new Date().toISOString()
      });

      if (error) {
        alert('フィードバックの送信に失敗しました。通信状況を確認して再度お試しください。');
        return;
      }

      const createdAt = new Date().toISOString();
      const notifyResponse = await fetch('/api/line-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: feedbackCategory,
          content: feedbackContent,
          senderName: profile?.displayName,
          senderLineId: profile?.userId,
          createdAt,
        }),
      });

      if (!notifyResponse.ok) {
        alert('フィードバックは保存されましたが、管理者へのLINE通知に失敗しました。');
      } else {
        alert('フィードバックを送信しました。ご協力ありがとうございました！');
      }
      setFeedbackContent('');
    } catch {
      alert('フィードバックの送信中にエラーが発生しました。時間をおいて再度お試しください。');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  // 🔍 検索フィルタ
  const filteredItems = items.filter(item => {
    const query = searchTerm.toLowerCase().trim();
    if (!query) return true;
    return (
      (item.title && item.title.toLowerCase().includes(query)) ||
      (item.give_details && item.give_details.toLowerCase().includes(query)) ||
      (item.want_details && item.want_details.toLowerCase().includes(query))
    );
  });

  if (loading) return <div className="flex h-screen items-center justify-center text-xs text-gray-400 bg-[#F7F9FA]">読み込み中...</div>;

  return (
    <main className="min-h-screen bg-[#F7F9FA] px-3 py-4 text-gray-800 pb-24 font-sans antialiased">
      
      {/* 全体画像拡大ビュー */}
      {zoomImageUrl && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setZoomImageUrl(null)}>
          <img src={zoomImageUrl} className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-xl" />
        </div>
      )}

      {pinActionItem && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-end justify-center" onClick={() => setPinActionItem(null)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl p-4 space-y-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-slate-900">{getPinActionLabel(pinActionItem)}</p>
                <p className="text-[11px] text-gray-500">延長時間を選択してください。長い時間ほどお得です。</p>
              </div>
              <button onClick={() => setPinActionItem(null)} className="text-gray-400 font-black px-2">✕</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PIN_EXTENSION_OPTIONS.map((option) => (
                <button key={option.hours} onClick={() => handleExtendPin(pinActionItem, option.hours, option.cost)} className="bg-amber-50 text-amber-800 border border-amber-100 rounded-2xl p-3 text-xs font-black">
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 🎬 匿名チャットルームモーダル */}
      {activeChatRoom && (
        <div className="fixed inset-0 bg-slate-900/70 z-40 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-3xl p-4 space-y-3 max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="font-black text-xs text-slate-900">🔒 リアルタイム匿名安全取引室</span>
              <button onClick={() => setActiveChatRoom(null)} className="text-gray-400 font-extrabold text-sm px-2">✕</button>
            </div>

            {/* 📌 固定条件 */}
            <div className="bg-slate-900 text-white p-3 rounded-2xl text-[11px] space-y-2 shadow-md border border-slate-700">
              <p className="font-extrabold text-amber-400 text-[10px]">📌 現在の交換ターゲット条件（常時上部に固定）</p>
              {activeChatRoom.currentRoute ? (
                <div className="bg-slate-800 p-2 rounded-xl space-y-1.5">
                  {getRouteLines(activeChatRoom.currentRoute).map((line, idx) => (
                    <p key={idx} className="break-words leading-relaxed">{line}</p>
                  ))}
                </div>
              ) : (
                <div className="bg-slate-800 p-2 rounded-xl space-y-1">
                  <p className="truncate"><span className="bg-red-500 text-white text-[8px] px-1.5 py-0.5 rounded mr-1.5 font-bold">譲</span> {activeChatRoom.currentTargetItem?.give_details}</p>
                  <p className="truncate"><span className="bg-blue-500 text-white text-[8px] px-1.5 py-0.5 rounded mr-1.5 font-bold">求</span> {activeChatRoom.currentTargetItem?.want_details}</p>
                </div>
              )}
            </div>

            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-black text-emerald-800">交換予約</p>
                  {activeChatRoom.reservation ? (
                    <p className="text-[10px] text-emerald-700 mt-1">
                      {activeChatRoom.reservation.scheduled_at ? new Date(activeChatRoom.reservation.scheduled_at).toLocaleString('ja-JP') : '日時未設定'} / {activeChatRoom.reservation.location || '場所未設定'}
                    </p>
                  ) : (
                    <p className="text-[10px] text-emerald-700 mt-1">予定日時・場所 / 方法を共有できます。</p>
                  )}
                </div>
                <button onClick={() => setShowReservationForm(!showReservationForm)} className="bg-emerald-600 text-white text-[10px] font-black px-3 py-1.5 rounded-xl">
                  交換予約を作成
                </button>
              </div>
              {activeChatRoom.reservation?.memo && <p className="text-[10px] text-emerald-700 bg-white/70 rounded-xl p-2">メモ：{activeChatRoom.reservation.memo}</p>}
              {showReservationForm && (
                <form onSubmit={handleCreateReservation} className="space-y-2 bg-white/80 p-2 rounded-2xl">
                  <input type="datetime-local" value={reservationScheduledAt} onChange={(e) => setReservationScheduledAt(e.target.value)} className="w-full text-base px-3 py-2 bg-white border border-emerald-100 rounded-xl" />
                  <input type="text" placeholder="場所 / 方法" value={reservationLocation} onChange={(e) => setReservationLocation(e.target.value)} className="w-full text-base px-3 py-2 bg-white border border-emerald-100 rounded-xl" />
                  <textarea rows={2} placeholder="メモ" value={reservationMemo} onChange={(e) => setReservationMemo(e.target.value)} className="w-full text-base px-3 py-2 bg-white border border-emerald-100 rounded-xl" />
                  <button type="submit" disabled={reservationSubmitting} className="w-full bg-emerald-700 text-white text-xs font-black py-2 rounded-xl disabled:opacity-60">
                    {reservationSubmitting ? '作成中...' : '予約を保存する'}
                  </button>
                </form>
              )}
            </div>

            {/* メッセージ履歴 */}
            <div className="flex-1 overflow-y-auto space-y-3 py-2 bg-gray-50 p-2 rounded-2xl min-h-[200px]">
              {chatMessages.map((msg, mIdx) => (
                <div key={mIdx} className={`flex items-start gap-2 ${msg.sender_id === profile.userId ? 'flex-row-reverse' : ''}`}>
                  <img src={msg.avatar_url} className="w-5 h-5 rounded-full shrink-0 border" />
                  <div className={`max-w-[75%] p-2 rounded-xl text-[12px] ${msg.sender_id === profile.userId ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-white border rounded-tl-none'}`}>
                    {msg.text && <p className="break-all whitespace-pre-wrap">{msg.text}</p>}
                    {msg.image_url && (
                      <img src={msg.image_url} onClick={() => setZoomImageUrl(msg.image_url)} className="mt-2 max-w-[150px] rounded-lg border cursor-zoom-in" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* コントローラー */}
            <div className="flex items-center gap-2 pt-1 border-t">
              <label className="bg-gray-100 border w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer shrink-0">
                <span>{chatImageSubmitting ? '⏳' : '📷'}</span>
                <input type="file" accept="image/*" disabled={chatImageSubmitting} onChange={handleSendChatImage} className="hidden" />
              </label>
              <input type="text" placeholder="メッセージを入力..." value={newMessageText} onChange={(e) => setNewMessageText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} className="flex-1 text-base px-3 py-2 bg-gray-50 border rounded-xl" />
              <button onClick={handleSendMessage} className="bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-xl">送信</button>
            </div>
          </div>
        </div>
      )}

      {/* ユーザーヘッダー */}
      <div className="bg-white p-3 rounded-2xl shadow-sm mb-4 border border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={profile?.pictureUrl} className="h-6 w-6 rounded-full" />
          <div>
            <span className="text-xs font-bold block">{profile?.displayName || 'ユーザー'} さん</span>
            <span className="text-[9px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded mt-0.5 inline-block">
              {isPremium ? '💎 プレミアム会員' : '🔰 一般会員（2方表示限定）'}
            </span>
          </div>
        </div>
        <button onClick={() => setShowWallet(!showWallet)} className="text-[10px] bg-gray-50 border font-bold text-gray-700 px-3 py-1.5 rounded-xl">
          🪙 残高確認 / チャージ 💎
        </button>
      </div>

      {/* ウォレットセクション */}
      {showWallet && (
        <div className="bg-white p-4 rounded-2xl shadow-inner border border-gray-200 mb-4 space-y-3">
          <div className="flex justify-between items-center bg-amber-50/60 p-3 rounded-xl border border-amber-100">
            <div>
              <p className="text-[9px] text-amber-700 font-bold">保有コイン数</p>
              <p className="text-xl font-black text-amber-950">{userCoins} <span className="text-xs font-bold">枚</span></p>
            </div>
            {!isPremium && (
              <button onClick={handleBuyPremium} disabled={checkoutLoadingProduct !== null} className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[10px] font-black px-3 py-2 rounded-xl shadow-md disabled:opacity-60">
                {checkoutLoadingProduct === 'premium' ? 'Stripeへ移動中...' : '👑 月額680円でプレミアム登録'}
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => handleChargeCoins('coin10', 10)} disabled={checkoutLoadingProduct !== null} className="bg-white border rounded-xl p-2 text-center text-xs font-bold disabled:opacity-60">コイン10枚 / ¥100</button>
            <button onClick={() => handleChargeCoins('coin35', 35)} disabled={checkoutLoadingProduct !== null} className="bg-white border-2 border-teal-500 rounded-xl p-2 text-center text-xs font-bold text-teal-600 disabled:opacity-60">コイン35枚 / ¥300</button>
            <button onClick={() => handleChargeCoins('coin60', 60)} disabled={checkoutLoadingProduct !== null} className="bg-white border rounded-xl p-2 text-center text-xs font-bold disabled:opacity-60">コイン60枚 / ¥500</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl p-4 mb-4 border border-sky-100 shadow-sm">
        <button onClick={handleWatchAd} disabled={dailyAds >= 3} className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 text-white p-3 text-center rounded-2xl text-xs font-black shadow-sm disabled:from-gray-300 disabled:to-gray-300 disabled:text-gray-500">
          📺 動画広告視聴でコイン1枚無料獲得
          <span className="block text-[11px] mt-1">本日残り：{Math.max(0, 3 - dailyAds)}回</span>
        </button>
      </div>

      {/* ⚡ マッチングウィンドウ（双方向・三方向） */}
      <div className="space-y-3 mb-4">
        {twoWayMatches.length > 0 && (
          <div className="bg-gradient-to-r from-teal-800 to-cyan-900 rounded-2xl p-3.5 text-white shadow-md">
            <h2 className="text-[11px] font-extrabold text-teal-200 mb-2 flex items-center gap-1">🤝 双方自動マッチング成立 ({twoWayMatches.length}件)</h2>
            <div className="space-y-2">
              {twoWayMatches.map((m) => {
                const roomInfo = roomExtraMap[m.fingerprint];
                return (
                  <div key={m.fingerprint} className="bg-white/10 rounded-xl p-2.5 flex flex-col space-y-2 border border-white/5">
                    <p className="text-[11px] font-bold text-white break-all leading-relaxed">{m.routeText}</p>
                    <div className="flex justify-between items-center pt-1.5 border-t border-white/10">
                      <span className="text-[9px] text-teal-300 font-medium">
                        🕒 チャット更新: {formatJapaneseTime(roomInfo?.lastTime)}
                      </span>
                      <button onClick={() => handleOpenChat(m.itemA, m.fingerprint, m.participants, { itemA: m.itemA, itemB: m.itemB })} className="bg-teal-500 hover:bg-teal-600 text-white font-black text-[9px] px-3 py-1 rounded-md">
                        チャット室に入る 💬
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {threeWayMatches.length > 0 && (
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl p-3.5 text-white shadow-md border border-indigo-500/30">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-[11px] font-extrabold text-indigo-300 flex items-center gap-1">✨ AI 3方自動巡回マッチング成立 ({threeWayMatches.length}件)</h2>
              {!isPremium && <span className="text-[8px] bg-purple-600 text-white px-2 py-0.5 rounded font-black">プレミアム限定</span>}
            </div>
            
            {isPremium ? (
              <div className="space-y-2">
                {threeWayMatches.map((m) => {
                  const roomInfo = roomExtraMap[m.fingerprint];
                  return (
                    <div key={m.fingerprint} className="bg-white/10 rounded-xl p-2.5 flex flex-col space-y-2 border border-white/5">
                      <div className="text-[10px] text-amber-200 font-medium break-all leading-relaxed space-y-1">{getRouteLines({ itemA: m.itemA, itemB: m.itemB, itemC: m.itemC }).map((line) => <p key={line}>{line}</p>)}</div>
                      <div className="flex justify-between items-center pt-1.5 border-t border-white/10">
                        <span className="text-[9px] text-indigo-300 font-medium">
                          🕒 最終更新: {formatJapaneseTime(roomInfo?.lastTime)}
                        </span>
                        <button onClick={() => handleOpenChat(m.itemA, m.fingerprint, m.participants, { itemA: m.itemA, itemB: m.itemB, itemC: m.itemC })} className="bg-indigo-500 hover:bg-indigo-600 text-[9px] font-black px-3 py-1 rounded-lg">
                          3人部屋チャットに入る 💬
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-center">
                <p className="text-[11px] text-slate-300">現在、あなたの持ち物を含めた<b>三方巡回ルート</b>が {threeWayMatches.length} 件検出されています！</p>
                <p className="text-[9px] text-purple-300 font-bold mt-1.5">💡 プレミアム会員プランに登録すると、すべての三方マッチ結果とチャットルームが即時解放されます。</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* トレード情報登録フォーム */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-4">
        <form onSubmit={handleSubmitPost} className="space-y-3">
          <input type="text" placeholder="シリーズ名 / グッズ名（例: POP MART）" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full text-base px-3 py-2 bg-gray-50 border rounded-xl" />
          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="【譲】持っている種類" value={giveDetails} onChange={(e) => setGiveDetails(e.target.value)} className="w-full text-base px-3 py-2 bg-red-50/50 border border-red-100 rounded-xl" />
            <input type="text" placeholder="【求】探している種類" value={wantDetails} onChange={(e) => setWantDetails(e.target.value)} className="w-full text-base px-3 py-2 bg-blue-50/50 border border-blue-100 rounded-xl" />
          </div>
          <div className="flex items-center justify-between pt-1">
            <label className="w-9 h-9 bg-gray-50 border border-dashed rounded-xl flex items-center justify-center cursor-pointer text-gray-400 text-sm shrink-0">
              <span>📷</span>
              <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && (setImageFile(e.target.files[0]), setImagePreview(URL.createObjectURL(e.target.files[0])))} className="hidden" />
            </label>
            {imagePreview && <img src={imagePreview} className="w-9 h-9 object-cover rounded-xl border mr-auto ml-2" />}
            <div className="flex gap-2 items-center">
              <select value={pinDuration} onChange={(e) => setPinDuration(Number(e.target.value))} className="text-base bg-gray-50 border p-2 rounded-lg text-gray-600 max-w-[185px]">
                {PIN_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button type="submit" disabled={submitting} className="bg-slate-900 text-white font-bold text-[11px] px-4 py-2 rounded-xl">登録 🚀</button>
            </div>
          </div>
        </form>
      </div>

      {/* タイムライン */}
      <div className="space-y-3 mb-6">
        <input type="text" placeholder="キーワードでトレード情報を検索..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full text-base px-3 py-2 bg-white border border-gray-200 rounded-xl shadow-sm" />

        {filteredItems.map((item) => {
          const isOwner = profile && item.user_id === profile.userId;
          return (
            <div key={item.id} className={`bg-white rounded-3xl p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border transition-all ${item.status === 'completed' ? 'opacity-60 bg-gray-50' : item.is_pinned ? 'border-amber-300 ring-1 ring-amber-200 bg-gradient-to-br from-amber-50/70 to-white' : 'border-pink-50'}`}>
              <div className="flex items-start gap-3">
                {item.image_url ? (
                  <img src={item.image_url} onClick={() => setZoomImageUrl(item.image_url)} className="w-28 h-28 object-cover rounded-2xl cursor-zoom-in border border-gray-100 bg-gray-50 shrink-0" />
                ) : (
                  <div className="w-28 h-28 rounded-2xl border border-dashed border-pink-100 bg-pink-50/50 flex items-center justify-center text-2xl shrink-0">🎁</div>
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900 truncate">{item.title || 'グッズ'}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{item.users?.display_name || 'ユーザー'} • {formatJapaneseTime(item.created_at)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {item.is_pinned && item.status !== 'completed' && <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-2 py-0.5 rounded-full">置トップ</span>}
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-black ${item.status === 'completed' ? 'bg-gray-200 text-gray-500' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>{item.status === 'completed' ? '交換完了' : '交換待ち'}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-[13px] leading-relaxed">
                    <div className="bg-rose-50/80 border border-rose-100 rounded-2xl p-2 flex gap-2">
                      <span className="bg-rose-400 text-white text-[10px] font-black px-2 py-0.5 rounded-full h-fit">譲</span>
                      <p className="font-bold text-rose-950 break-all">{item.give_details}</p>
                    </div>
                    <div className="bg-sky-50/80 border border-sky-100 rounded-2xl p-2 flex gap-2">
                      <span className="bg-sky-400 text-white text-[10px] font-black px-2 py-0.5 rounded-full h-fit">求</span>
                      <p className="font-bold text-sky-950 break-all">{item.want_details}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-3 mt-3 border-t border-gray-100">
                {isOwner ? (
                  <>
                    <div className="flex justify-end">
                      <button onClick={() => setPinActionItem(item)} className="bg-amber-50 text-amber-700 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-amber-100">
                        {getPinActionLabel(item)}
                      </button>
                    </div>
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => handleMarkCompleted(item.id, item.status)} className="bg-white border border-gray-300 text-gray-700 text-[10px] font-bold px-3 py-1.5 rounded-lg">
                        {item.status === 'completed' ? '再受付' : '完了'}
                      </button>
                      <button onClick={() => handleDeleteItem(item)} className="bg-red-50 text-red-600 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-red-100">
                        削除
                      </button>
                    </div>
                  </>
                ) : (
                  item.status !== 'completed' && (
                    <div className="flex justify-end">
                      <button onClick={() => {
                        const fp = `twoway_${[profile.userId, item.user_id].sort().join('_')}_${item.give_details}_${item.want_details}`.toLowerCase().trim();
                        handleOpenChat(item, fp, [profile.userId, item.user_id]);
                      }} className="bg-[#06C755] text-white font-bold text-[10px] px-3 py-1.5 rounded-lg shadow-sm">
                        💬 匿名チャット
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 📬 フィードバック送信フォーム */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <h3 className="text-xs font-black text-gray-900 mb-2 flex items-center gap-1">📬 アプリへの要望・不具合報告</h3>
        <form onSubmit={handleSendFeedback} className="space-y-2">
          <div className="flex gap-2">
            {['不具合報告', '機能要望', 'その他'].map((cat) => (
              <button key={cat} type="button" onClick={() => setFeedbackCategory(cat)} className={`text-[10px] px-3 py-1 rounded-lg font-bold border transition-all ${feedbackCategory === cat ? 'bg-slate-950 text-white border-slate-950' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                {cat}
              </button>
            ))}
          </div>
          <textarea rows={3} placeholder="こちらに詳細をご記入ください。開発チームが確認いたします。" value={feedbackContent} onChange={(e) => setFeedbackContent(e.target.value)} className="w-full text-base p-2.5 bg-gray-50 border rounded-xl focus:outline-none placeholder:text-gray-400" />
          <button type="submit" disabled={feedbackSubmitting} className="w-full bg-slate-950 text-white font-bold text-xs p-2 rounded-xl transition-all disabled:opacity-60">
            {feedbackSubmitting ? '送信中...' : 'フィードバックを送信する ✉️'}
          </button>
        </form>
      </div>

    </main>
  );
}
