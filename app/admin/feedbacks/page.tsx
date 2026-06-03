'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export default function AdminFeedbacks() {
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentAdminId, setCurrentAdminId] = useState('');

  // 这里的管理员白名单 LINE ID 记得替换为您自己的 LINE ID
  const ADMIN_LINE_ID = 'Uad36ad4a3e27f8cf5b4a194b8ac4a71c'; 

  useEffect(() => {
    // 初始化 LINE LIFF 获取当前登录用户的 ID
    import('@line/liff').then((mod) => {
      const liff = mod.default;
      liff.init({ liffId: process.env.NEXT_PUBLIC_LINE_LIFF_ID || '' })
        .then(async () => {
          if (!liff.isLoggedIn()) {
            liff.login();
            return;
          }
          const profile = await liff.getProfile();
          setCurrentAdminId(profile.userId);

          // 权限校验：如果当前用户不是白名单管理员，则拒绝加载数据
          if (profile.userId !== ADMIN_LINE_ID) {
            setLoading(false);
            return;
          }

          setIsAdmin(true);
          fetchFeedbacks();
        })
        .catch((err) => {
          console.error('LIFF Initialization failed', err);
          setLoading(false);
        });
    });
  }, []);

  // 获取所有用户提交的反馈数据
  const fetchFeedbacks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('feedbacks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      alert('データの取得に失敗しました。RLS設定を確認してください。');
    } else if (data) {
      setFeedbacks(data);
    }
    setLoading(false);
  };

  // 删除某条反馈处理记录
  const handleDeleteFeedback = async (id: string) => {
    if (!window.confirm('このフィードバックを削除してもよろしいですか？')) return;

    const { error } = await supabase
      .from('feedbacks')
      .delete()
      .eq('id', id);

    if (error) {
      alert('削除に失敗しました。');
    } else {
      alert('削除しました。');
      fetchFeedbacks(); // 刷新列表
    }
  };

  // 格式化时间显示
  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // 1. 加载中状态
  if (loading) {
    return <div className="flex h-screen items-center justify-center text-xs text-gray-400 bg-[#F7F9FA]">管理者認証中...</div>;
  }

  // 2. 非管理员鉴权失败拦截
  if (!isAdmin) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#F7F9FA] px-6 text-center">
        <p className="text-sm font-bold text-red-600">⚠️ 閲覧権限がありません</p>
        <p className="text-xs text-gray-400 mt-2">このページはシステム管理者専用です。</p>
        <p className="text-[10px] text-gray-300 mt-1 break-all">Your ID: {currentAdminId}</p>
      </div>
    );
  }

  // 3. 管理员合法的全日语后台看板界面
  return (
    <main className="min-h-screen bg-[#F7F9FA] px-4 py-6 text-gray-800 pb-20 font-sans antialiased">
      <div className="max-w-md mx-auto space-y-4">
        
        {/* 后台头部 */}
        <div className="flex items-center justify-between bg-slate-900 text-white p-4 rounded-2xl shadow-sm">
          <div>
            <h1 className="text-sm font-black tracking-wide">📊 管理者ダッシュボード</h1>
            <p className="text-[10px] text-slate-400 mt-0.5">ユーザーフィードバック管理</p>
          </div>
          <button 
            onClick={fetchFeedbacks} 
            className="bg-slate-800 hover:bg-slate-700 text-[10px] font-bold px-3 py-1.5 rounded-xl border border-slate-700 transition-all"
          >
            同期 🔄
          </button>
        </div>

        {/* 统计卡片 */}
        <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-center px-4">
          <span className="text-xs font-bold text-gray-500">受信トレイ総数</span>
          <span className="text-lg font-black text-slate-900">{feedbacks.length} <span className="text-xs font-medium text-gray-400">件</span></span>
        </div>

        {/* 反馈列表 */}
        <div className="space-y-3">
          {feedbacks.length === 0 ? (
            <div className="text-center py-10 text-xs text-gray-400">現在、届いているフィードバックはありません。</div>
          ) : (
            feedbacks.map((fb) => (
              <div key={fb.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3 transition-all hover:border-gray-300">
                
                {/* 标签与时间 */}
                <div className="flex justify-between items-center">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-md ${
                    fb.category === '不具合報告' ? 'bg-red-50 text-red-600 border border-red-100' :
                    fb.category === '機能要望' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                    'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}>
                    {fb.category}
                  </span>
                  <span className="text-[9px] text-gray-400 font-medium">
                    {formatTime(fb.created_at)}
                  </span>
                </div>

                {/* 反馈核心正文 */}
                <div className="bg-gray-50 rounded-xl p-3 text-xs leading-relaxed text-gray-700 whitespace-pre-wrap break-all">
                  {fb.content}
                </div>

                {/* 用户凭证与操作 */}
                <div className="flex items-center justify-between pt-1 border-t border-gray-50">
                  <p className="text-[8px] text-gray-300 truncate max-w-[200px]" title={fb.user_id}>
                    UID: {fb.user_id}
                  </p>
                  <button
                    onClick={() => handleDeleteFeedback(fb.id)}
                    className="bg-red-50 hover:bg-red-100 text-red-600 text-[9px] font-bold px-2.5 py-1 rounded-lg border border-red-100 transition-all"
                  >
                    対応済として削除
                  </button>
                </div>

              </div>
            ))
          )}
        </div>

      </div>
    </main>
  );
}